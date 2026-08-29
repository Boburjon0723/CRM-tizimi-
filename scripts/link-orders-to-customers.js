/**
 * Buyurtmalarni mijoz kartochkasiga bog‘lash: `customer_id` bo‘sh bo‘lgan
 * buyurtmalarni `customer_name` bo‘yicha mavjud mijozga ulaydi.
 *
 * Nomlar normallashtiriladi (registr, ortiqcha bo‘shliq, lotin/kirill farqi
 * emas — faqat bo‘shliq va registr). Bir nechta mijoz bir xil nomga tushsa —
 * ulanmaydi, ro‘yxatga chiqariladi.
 *
 * Run: node scripts/link-orders-to-customers.js            (faqat ko‘rsatadi)
 *      node scripts/link-orders-to-customers.js --apply    (bazaga yozadi)
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

function normName(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
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

    const orders = await fetchAll(
        s,
        'orders',
        'id, order_number, customer_id, customer_name, total, workspace, deleted_at, archived_at'
    )
    const customers = await fetchAll(s, 'customers', 'id, name, phone, workspace')

    const byName = new Map()
    for (const c of customers) {
        const k = normName(c.name)
        if (!k) continue
        if (!byName.has(k)) byName.set(k, [])
        byName.get(k).push(c)
    }

    const orphans = orders.filter((o) => !o.customer_id)
    console.log(`\n=== MIJOZGA BOG‘LANMAGAN BUYURTMALAR ===`)
    console.log(`jami buyurtma: ${orders.length}`)
    console.log(`customer_id bo‘sh: ${orphans.length}`)

    const toLink = []
    const ambiguous = []
    const noMatch = new Map()

    for (const o of orphans) {
        const k = normName(o.customer_name)
        if (!k) {
            noMatch.set('(nom yo‘q)', (noMatch.get('(nom yo‘q)') || 0) + 1)
            continue
        }
        const hits = byName.get(k) || []
        if (hits.length === 1) {
            toLink.push({ order: o, customer: hits[0] })
        } else if (hits.length > 1) {
            ambiguous.push({ order: o, hits })
        } else {
            noMatch.set(o.customer_name, (noMatch.get(o.customer_name) || 0) + 1)
        }
    }

    console.log(`\nnomi bo‘yicha bitta mijozga mos keldi: ${toLink.length}`)
    console.log(`bir nechta mijozga mos keldi (qo‘lda hal qilinadi): ${ambiguous.length}`)
    console.log(`mos mijoz topilmadi: ${[...noMatch.values()].reduce((a, b) => a + b, 0)}`)

    if (ambiguous.length) {
        console.log(`\nBir xil nomdagi mijozlar (dublikat kartochkalar):`)
        const shown = new Set()
        for (const a of ambiguous) {
            const k = normName(a.order.customer_name)
            if (shown.has(k)) continue
            shown.add(k)
            console.log(
                `   «${a.order.customer_name}» → ${a.hits.length} kartochka: ${a.hits
                    .map((c) => `${String(c.id).slice(0, 8)}(${c.phone || 'tel yo‘q'})`)
                    .join(', ')}`
            )
        }
    }

    if (noMatch.size) {
        console.log(`\nMijoz kartochkasi yo‘q nomlar (top 20):`)
        ;[...noMatch.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .forEach(([name, n]) => console.log(`   ${String(n).padStart(4)} × «${name}»`))
    }

    if (!toLink.length) {
        console.log('\nBog‘lash uchun mos buyurtma yo‘q.')
        return
    }
    if (!APPLY) {
        console.log('\n(--apply berilmadi: bazaga yozilmadi)')
        return
    }

    console.log(`\n=== BAZAGA YOZISH: ${toLink.length} buyurtma ===`)
    let ok = 0
    const failed = []
    for (const { order, customer } of toLink) {
        const { error } = await s
            .from('orders')
            .update({ customer_id: customer.id })
            .eq('id', order.id)
        if (error) {
            failed.push({ num: order.order_number, msg: error.message })
            continue
        }
        ok += 1
    }
    console.log(`Bog‘landi: ${ok} / ${toLink.length}`)
    if (failed.length) {
        console.log(`Xatolar: ${failed.length}`)
        failed.slice(0, 10).forEach((f) => console.log(`   №${f.num}: ${f.msg}`))
    }

    const after = await fetchAll(s, 'orders', 'id, customer_id')
    console.log(`\nTekshiruv: customer_id bo‘sh qolgan buyurtma: ${after.filter((o) => !o.customer_id).length}`)
})().catch((e) => {
    console.error('XATO:', e.message || e)
    process.exit(1)
})
