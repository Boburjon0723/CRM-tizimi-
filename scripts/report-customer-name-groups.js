/**
 * Hisobot: buyurtmalardagi mijoz nomlarini o‘xshashligi bo‘yicha guruhlaydi va
 * qaysilarini bitta mijoz kartochkasiga birlashtirish mumkinligini taklif qiladi.
 *
 * Faqat O‘QIYDI — hech narsa o‘zgartirmaydi. Taklif tasdiqlangandan keyin
 * `link-orders-to-customers.js` bilan bog‘lash mumkin.
 *
 * Run: node scripts/report-customer-name-groups.js
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

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

/** Kirill → lotin (faqat guruhlash uchun, ko‘rsatishda asl nom qoladi) */
const CYR = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'j', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
    ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ы: 'i', э: 'e', ю: 'yu', я: 'ya',
    ъ: '', ь: '', ё: 'e',
}

function translit(s) {
    return String(s || '')
        .toLowerCase()
        .split('')
        .map((ch) => (CYR[ch] != null ? CYR[ch] : ch))
        .join('')
}

/** Guruhlash kaliti: «klent», «aka», qavs ichi, raqamlar olib tashlanadi */
function groupKey(name) {
    let s = translit(name)
    s = s.replace(/\([^)]*\)/g, ' ')
    s = s.replace(/\b(klent|klient|mijoz)\b/g, ' ')
    s = s.replace(/\b(aka|opa|akasi)\b/g, ' ')
    s = s.replace(/[^a-z0-9 ]/g, ' ')
    s = s.replace(/\d+/g, ' ')
    s = s.replace(/\s+/g, ' ').trim()
    // Faqat birinchi ma'noli so‘z — asosiy ism
    return s.split(' ')[0] || ''
}

function normName(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
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
        'id, order_number, customer_id, customer_name, total, deleted_at, archived_at'
    )
    const customers = await fetchAll(s, 'customers', 'id, name, phone')

    // Nom → buyurtmalar
    const byName = new Map()
    for (const o of orders) {
        const n = String(o.customer_name || '').trim()
        if (!n) continue
        if (!byName.has(n)) byName.set(n, [])
        byName.get(n).push(o)
    }

    // Guruh → nomlar
    const groups = new Map()
    for (const [name, list] of byName.entries()) {
        const k = groupKey(name) || '(aniqlanmadi)'
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k).push({ name, count: list.length, total: list.reduce((n, o) => n + (Number(o.total) || 0), 0) })
    }

    const cardByNorm = new Map()
    for (const c of customers) {
        const k = normName(c.name)
        if (!cardByNorm.has(k)) cardByNorm.set(k, [])
        cardByNorm.get(k).push(c)
    }

    console.log(`\n=== MIJOZ NOMLARI GURUHLARI ===`)
    console.log(`buyurtma: ${orders.length} | turli nom: ${byName.size} | mijoz kartochkasi: ${customers.length}`)

    const multi = [...groups.entries()]
        .filter(([, names]) => names.length > 1)
        .sort((a, b) => b[1].length - a[1].length)

    console.log(`\n--- BIR MIJOZ BO‘LISHI MUMKIN (${multi.length} guruh) ---`)
    console.log(`Har guruhda: nom | buyurtma soni | jami summa | kartochka bormi\n`)
    for (const [key, names] of multi) {
        const totalOrders = names.reduce((n, x) => n + x.count, 0)
        console.log(`▸ «${key}» — ${names.length} xil nom, ${totalOrders} buyurtma`)
        names
            .sort((a, b) => b.count - a.count)
            .forEach((x) => {
                const cards = cardByNorm.get(normName(x.name)) || []
                const cardInfo = cards.length
                    ? `kartochka: ${cards.length}${cards.length > 1 ? ' (DUBLIKAT!)' : ''}`
                    : 'kartochka YO‘Q'
                console.log(
                    `    ${String(x.count).padStart(3)} buyurtma  $${String(x.total.toFixed(0)).padStart(7)}  «${x.name}»  — ${cardInfo}`
                )
            })
        console.log('')
    }

    const single = [...groups.entries()].filter(([, names]) => names.length === 1)
    console.log(`--- YAKKA NOMLAR: ${single.length} ta (guruhlash kerak emas) ---`)

    // Dublikat kartochkalar
    const dupes = [...cardByNorm.entries()].filter(([, list]) => list.length > 1)
    if (dupes.length) {
        console.log(`\n--- DUBLIKAT MIJOZ KARTOCHKALARI: ${dupes.length} ---`)
        for (const [k, list] of dupes) {
            console.log(`   «${list[0].name}»`)
            list.forEach((c) => console.log(`      ${c.id} | tel: ${c.phone || '—'}`))
        }
    }

    console.log(`\n=== XULOSA ===`)
    console.log(`customer_id bo‘sh buyurtma: ${orders.filter((o) => !o.customer_id).length}`)
    console.log(`birlashtirishga nomzod guruh: ${multi.length}`)
    console.log(`dublikat kartochka: ${dupes.length}`)
})().catch((e) => {
    console.error('XATO:', e.message || e)
    process.exit(1)
})
