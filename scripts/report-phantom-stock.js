/**
 * Hisobot: «qaytarish» (reversal) yo‘qdan yaratgan zaxirani topadi.
 *
 * Sabab (kodda tuzatilgan): zaxira 0 bo‘lganda chiqim `-300` deb yozilsa ham
 * `previous_stock → new_stock` 0 → 0 bo‘lib qoladi — hech narsa ayrilmaydi.
 * Eski `reverseStockForOrder` esa qaytarishda so‘ralgan miqdorni shartsiz
 * qo‘shar edi (0 → 300). Natijada omborda haqiqiy bo‘lmagan qoldiq paydo bo‘ldi.
 *
 * Skript faqat O‘QIYDI. Tuzatish uchun Ombor sahifasida ko‘rsatilgan
 * «to‘g‘ri qoldiq» qiymatini kiritish kerak (`product_inventory` ga yozish
 * anon kalit uchun yopiq).
 *
 * Run: node scripts/report-phantom-stock.js
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

async function fetchAll(s, table, cols, orderCol) {
    const out = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
        let q = s.from(table).select(cols).range(from, from + PAGE - 1)
        if (orderCol) q = q.order(orderCol, { ascending: true })
        const { data, error } = await q
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

    const products = await fetchAll(s, 'products', 'id, name')
    const nameById = new Map(products.map((p) => [String(p.id), p.name]))
    const moves = await fetchAll(
        s,
        'stock_movements',
        'order_id, product_id, change_amount, previous_stock, new_stock, type, reason, created_at',
        'created_at'
    )

    const perProduct = new Map()
    for (const m of moves) {
        const pid = String(m.product_id || '')
        if (!pid) continue
        if (!perProduct.has(pid)) {
            perProduct.set(pid, { realOut: 0, realIn: 0, lastNewStock: 0, orders: new Set() })
        }
        const rec = perProduct.get(pid)
        const prev = Number(m.previous_stock) || 0
        const next = Number(m.new_stock) || 0
        rec.lastNewStock = next
        if (m.type === 'sale') {
            rec.realOut += Math.max(0, prev - next)
        } else if (m.type === 'reversal') {
            const gained = Math.max(0, next - prev)
            rec.realIn += gained
            if (gained > 0 && m.order_id) rec.orders.add(String(m.order_id))
        }
    }

    const phantom = []
    for (const [pid, rec] of perProduct.entries()) {
        const excess = rec.realIn - rec.realOut
        if (excess > 0) {
            phantom.push({
                pid,
                name: nameById.get(pid) || pid,
                excess,
                current: rec.lastNewStock,
                correct: Math.max(0, rec.lastNewStock - excess),
                orders: [...rec.orders],
            })
        }
    }
    phantom.sort((a, b) => b.excess - a.excess)

    if (!phantom.length) {
        console.log('\nFantom zaxira topilmadi — ombor toza.')
        return
    }

    console.log(`\n=== YO‘QDAN PAYDO BO‘LGAN ZAXIRA ===`)
    console.log(`mahsulot: ${phantom.length} ta`)
    console.log(`jami fantom: ${phantom.reduce((n, p) => n + p.excess, 0)} dona\n`)
    console.log(
        `${'mahsulot'.padEnd(14)}${'hozir'.padStart(8)}${'fantom'.padStart(8)}${'to‘g‘ri qoldiq'.padStart(16)}`
    )
    console.log('-'.repeat(46))
    for (const p of phantom) {
        console.log(
            `${String(p.name).padEnd(14)}${String(p.current).padStart(8)}${String(p.excess).padStart(8)}${String(p.correct).padStart(16)}`
        )
    }

    const orderIds = [...new Set(phantom.flatMap((p) => p.orders))]
    if (orderIds.length) {
        const { data: ords } = await s
            .from('orders')
            .select('id, order_number, customer_name, status')
            .in('id', orderIds)
        console.log(`\nSabab bo‘lgan buyurtmalar (holati o‘zgarganda qaytarish yozilgan):`)
        for (const o of ords || []) {
            console.log(`   №${o.order_number} | ${o.customer_name} | ${o.status}`)
        }
    }

    console.log(
        `\nTuzatish: Ombor sahifasida yuqoridagi mahsulotlarga «to‘g‘ri qoldiq» ustunidagi\n` +
            `qiymatni kiriting (rangli mahsulotlarda ranglar bo‘yicha taqsimlab).\n` +
            `Kod tuzatilgan — bundan keyin qaytarish faqat haqiqatan ayrilgan miqdorni qaytaradi.`
    )
})().catch((e) => {
    console.error('XATO:', e.message || e)
    process.exit(1)
})
