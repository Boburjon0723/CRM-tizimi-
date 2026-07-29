/**
 * Eski stock_movements (color_key null) ni order_items.color bilan to‘ldirish.
 * Dry-run (default):
 *   node scripts/repair-stock-movement-color-keys.js
 *   node scripts/repair-stock-movement-color-keys.js ORD-20260327-225902
 * Apply:
 *   node scripts/repair-stock-movement-color-keys.js --apply
 *   node scripts/repair-stock-movement-color-keys.js --apply ORD-20260327-225902
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local')
    if (!fs.existsSync(p)) return
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/)
        if (!m) continue
        const k = m[1].trim()
        let v = m[2].trim()
        if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
        ) {
            v = v.slice(1, -1)
        }
        if (!process.env[k]) process.env[k] = v
    }
}

function normalizeColor(c) {
    const raw = (c != null ? String(c) : '').trim() || '—'
    return raw === '—'
        ? '—'
        : raw
              .normalize('NFKC')
              .replace(/[\u2013\u2014\u2212]/g, '-')
              .replace(/\s+/g, ' ')
              .toLowerCase()
}

async function main() {
    loadEnvLocal()
    const args = process.argv.slice(2)
    const apply = args.includes('--apply')
    const orderArg = args.find((a) => a !== '--apply') || null

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) {
        console.error('Supabase env topilmadi')
        process.exit(1)
    }
    const supabase = createClient(url, key)

    let orderFilterIds = null
    if (orderArg) {
        const byNum = await supabase
            .from('orders')
            .select('id')
            .eq('order_number', orderArg)
            .maybeSingle()
        const id = byNum.data?.id
        if (!id) {
            const byId = await supabase.from('orders').select('id').eq('id', orderArg).maybeSingle()
            if (!byId.data?.id) {
                console.error('Buyurtma topilmadi:', orderArg)
                process.exit(1)
            }
            orderFilterIds = [byId.data.id]
        } else {
            orderFilterIds = [id]
        }
    }

    let q = supabase
        .from('stock_movements')
        .select('id, order_id, product_id, color_key, change_amount, type')
        .eq('type', 'sale')
        .not('order_id', 'is', null)
        .is('color_key', null)
        .limit(2000)
    if (orderFilterIds) q = q.in('order_id', orderFilterIds)

    const { data: moves, error } = await q
    if (error) {
        console.error(error.message)
        process.exit(1)
    }
    console.log(`Null color_key sale: ${(moves || []).length} (apply=${apply})`)

    const byOrder = new Map()
    for (const m of moves || []) {
        if (!byOrder.has(m.order_id)) byOrder.set(m.order_id, [])
        byOrder.get(m.order_id).push(m)
    }

    let updated = 0
    let skipped = 0

    for (const [orderId, orderMoves] of byOrder.entries()) {
        const { data: items, error: iErr } = await supabase
            .from('order_items')
            .select('product_id, color, quantity')
            .eq('order_id', orderId)
        if (iErr) {
            console.warn('order_items', orderId, iErr.message)
            skipped += orderMoves.length
            continue
        }

        const colorsByProduct = new Map()
        for (const oi of items || []) {
            const pid = String(oi.product_id)
            if (!colorsByProduct.has(pid)) colorsByProduct.set(pid, [])
            const col = (oi.color != null && String(oi.color).trim()) || '—'
            colorsByProduct.get(pid).push(col)
        }

        for (const m of orderMoves) {
            const list = colorsByProduct.get(String(m.product_id)) || []
            const uniq = [...new Set(list.map((c) => normalizeColor(c)))]
            let colorToSet = null
            if (uniq.length === 1) {
                // asl yozuvni saqlash
                colorToSet = list[0]
            } else if (uniq.length > 1) {
                // bir xil product bir necha rang — miqdorga yaqin birini tanlash qiyin; birinchisini olamiz
                colorToSet = list[0]
                console.warn(
                    `  ambiguous product ${m.product_id} on order ${orderId}: colors=${uniq.join(',')}`
                )
            } else {
                colorToSet = '—'
            }

            if (!apply) {
                console.log(`  would set ${m.id}: color_key=${colorToSet}`)
                updated += 1
                continue
            }

            const { error: uErr } = await supabase
                .from('stock_movements')
                .update({ color_key: colorToSet })
                .eq('id', m.id)
            if (uErr) {
                console.warn('update fail', m.id, uErr.message)
                skipped += 1
            } else {
                updated += 1
            }
        }
    }

    console.log(`Done. ${apply ? 'Updated' : 'Would update'}: ${updated}, skipped: ${skipped}`)
    if (!apply) console.log('Apply qilish uchun: node scripts/repair-stock-movement-color-keys.js --apply')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
