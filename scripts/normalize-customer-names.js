/**
 * Mijoz nomlarini xavfsiz tozalash:
 *   1) Ortiqcha bo‘shliqlar (ikkitalik bo‘shliq, boshi/oxiri) — «Klent  Rustam» → «Klent Rustam»
 *   2) Dublikat mijoz kartochkalari — buyurtmalar telefoni bor kartochkaga bog‘lanadi
 *
 * Nom MA’NOSI o‘zgartirilmaydi: «Boshkek» → «Bishkek» kabi imlo tuzatishlari va
 * «Klent Oyaz (...)» variantlarini birlashtirish bu skriptda YO‘Q — ular biznes
 * qaroriga bog‘liq (`report-customer-name-groups.js` ga qarang).
 *
 * Run: node scripts/normalize-customer-names.js            (faqat ko‘rsatadi)
 *      node scripts/normalize-customer-names.js --apply    (bazaga yozadi)
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const APPLY = process.argv.includes('--apply')

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local')
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/)
        if (!m) continue
        const k = m[1].trim()
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1)
        }
        if (!process.env[k]) process.env[k] = v
    }
}

/** Faqat bo‘shliqlar: ma’no o‘zgarmaydi */
function tidySpaces(s) {
    return String(s || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function phoneScore(phone) {
    const digits = String(phone || '').replace(/\D/g, '')
    return digits.length >= 9 ? 2 : digits.length > 1 ? 1 : 0
}

async function fetchAll(s, table, cols) {
    const out = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await s.from(table).select(cols).range(from, from + PAGE - 1)
        if (error) throw error
        out.push(...(data || []))
        if (!data || data.length < PAGE) break
    }
    return out
}

;(async () => {
    loadEnvLocal()
    const s = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const orders = await fetchAll(s, 'orders', 'id, order_number, customer_id, customer_name')
    const customers = await fetchAll(s, 'customers', 'id, name, phone')

    // --- 1) Bo‘shliqlar ---
    const orderFixes = orders
        .filter((o) => o.customer_name && tidySpaces(o.customer_name) !== o.customer_name)
        .map((o) => ({ id: o.id, num: o.order_number, from: o.customer_name, to: tidySpaces(o.customer_name) }))

    const customerFixes = customers
        .filter((c) => c.name && tidySpaces(c.name) !== c.name)
        .map((c) => ({ id: c.id, from: c.name, to: tidySpaces(c.name) }))

    console.log(`\n=== 1) ORTIQCHA BO‘SHLIQLAR ===`)
    console.log(`buyurtma: ${orderFixes.length} | mijoz kartochkasi: ${customerFixes.length}`)
    for (const f of orderFixes) console.log(`   №${f.num}: «${f.from}» → «${f.to}»`)
    for (const f of customerFixes) console.log(`   kartochka: «${f.from}» → «${f.to}»`)

    // --- 2) Dublikat kartochkalar ---
    const byNorm = new Map()
    for (const c of customers) {
        const k = tidySpaces(c.name).toLowerCase()
        if (!k) continue
        if (!byNorm.has(k)) byNorm.set(k, [])
        byNorm.get(k).push(c)
    }
    const dupeGroups = [...byNorm.values()].filter((list) => list.length > 1)

    const relinks = []
    const staleCards = []
    console.log(`\n=== 2) DUBLIKAT MIJOZ KARTOCHKALARI: ${dupeGroups.length} ===`)
    for (const group of dupeGroups) {
        const sorted = [...group].sort((a, b) => phoneScore(b.phone) - phoneScore(a.phone))
        const keep = sorted[0]
        const drop = sorted.slice(1)
        console.log(`   «${keep.name}»`)
        console.log(`      qoladi: ${keep.id} (tel: ${keep.phone || '—'})`)
        for (const d of drop) {
            const affected = orders.filter((o) => String(o.customer_id) === String(d.id))
            console.log(`      ko‘chiriladi: ${d.id} (tel: ${d.phone || '—'}) — ${affected.length} buyurtma`)
            affected.forEach((o) => relinks.push({ orderId: o.id, num: o.order_number, to: keep.id }))
            staleCards.push({ id: d.id, name: d.name, phone: d.phone })
        }
    }

    const total = orderFixes.length + customerFixes.length + relinks.length
    console.log(`\n=== REJA: ${total} o‘zgarish ===`)
    console.log(`nom tozalash (buyurtma): ${orderFixes.length}`)
    console.log(`nom tozalash (kartochka): ${customerFixes.length}`)
    console.log(`buyurtmani boshqa kartochkaga bog‘lash: ${relinks.length}`)
    if (staleCards.length) {
        console.log(
            `bo‘shab qolgan kartochka (o‘chirilmaydi, qo‘lda tekshiring): ${staleCards.map((c) => c.id.slice(0, 8)).join(', ')}`
        )
    }

    if (!total) {
        console.log('\nTozalash kerak emas.')
        return
    }
    if (!APPLY) {
        console.log('\n(--apply berilmadi: bazaga yozilmadi)')
        return
    }

    console.log('\n=== BAZAGA YOZISH ===')
    let ok = 0
    const failed = []

    for (const f of orderFixes) {
        const { error } = await s.from('orders').update({ customer_name: f.to }).eq('id', f.id)
        if (error) failed.push(`buyurtma №${f.num}: ${error.message}`)
        else ok += 1
    }
    for (const f of customerFixes) {
        const { error } = await s.from('customers').update({ name: f.to }).eq('id', f.id)
        if (error) failed.push(`kartochka ${f.id.slice(0, 8)}: ${error.message}`)
        else ok += 1
    }
    for (const r of relinks) {
        const { error } = await s.from('orders').update({ customer_id: r.to }).eq('id', r.orderId)
        if (error) failed.push(`bog‘lash №${r.num}: ${error.message}`)
        else ok += 1
    }

    console.log(`Bajarildi: ${ok} / ${total}`)
    if (failed.length) {
        console.log('Xatolar:')
        failed.slice(0, 15).forEach((m) => console.log(`   ${m}`))
    }
})().catch((e) => {
    console.error('XATO:', e.message || e)
    process.exit(1)
})
