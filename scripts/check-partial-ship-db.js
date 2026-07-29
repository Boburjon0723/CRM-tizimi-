/**
 * Bazada stock_movements.color_key holatini tekshiradi (yozish/o‘qish).
 * Run (CRM-tizimi- ildizidan):
 *   node scripts/check-partial-ship-db.js
 *   node scripts/check-partial-ship-db.js ORD-20260327-225902
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

function resolveMovementColorKey(colorKeyResolved, itemColor) {
    const fromBucket = colorKeyResolved != null ? String(colorKeyResolved).trim() : ''
    if (fromBucket) return fromBucket
    const fromItem = itemColor != null ? String(itemColor).trim() : ''
    if (fromItem) return fromItem
    return '—'
}

async function main() {
    loadEnvLocal()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) {
        console.error('Supabase env topilmadi (.env.local)')
        process.exit(1)
    }
    const supabase = createClient(url, key)
    const orderArg = process.argv[2] || null

    console.log('1) stock_movements.color_key ustuni...')
    const probe = await supabase
        .from('stock_movements')
        .select('id, order_id, product_id, color_key, change_amount, type')
        .eq('type', 'sale')
        .limit(5)
    if (probe.error) {
        console.error('  FAIL:', probe.error.message)
        process.exit(1)
    }
    console.log(`  OK — so‘nggi sale sample: ${probe.data?.length || 0} qator`)
    const nullKeys = (probe.data || []).filter(
        (r) => r.color_key == null || String(r.color_key).trim() === ''
    )
    if (nullKeys.length) {
        console.warn(
            `  WARN: sample ichida color_key null/bo‘sh: ${nullKeys.length} (qisman chiqim ko‘rinmasligi mumkin)`
        )
    }

    let order = null
    if (orderArg) {
        const byNum = await supabase
            .from('orders')
            .select('id, order_number, status')
            .eq('order_number', orderArg)
            .maybeSingle()
        order = byNum.data
        if (!order) {
            const byId = await supabase
                .from('orders')
                .select('id, order_number, status')
                .eq('id', orderArg)
                .maybeSingle()
            order = byId.data
        }
    } else {
        const recent = await supabase
            .from('orders')
            .select('id, order_number, status')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        order = recent.data
    }

    if (!order) {
        console.log('2) Buyurtma topilmadi — faqat schema tekshiruvi.')
        process.exit(0)
    }

    console.log(`2) Buyurtma: ${order.order_number || order.id} (${order.status})`)
    const items = await supabase
        .from('order_items')
        .select('product_id, color, quantity')
        .eq('order_id', order.id)
    if (items.error) {
        console.error('  order_items:', items.error.message)
        process.exit(1)
    }
    const moves = await supabase
        .from('stock_movements')
        .select('product_id, color_key, change_amount, type, created_at')
        .eq('order_id', order.id)
        .in('type', ['sale', 'reversal'])
        .order('created_at', { ascending: false })

    if (moves.error) {
        console.error('  stock_movements:', moves.error.message)
        process.exit(1)
    }

    console.log(`  order_items: ${(items.data || []).length}`)
    console.log(`  stock_movements (sale/reversal): ${(moves.data || []).length}`)

    const bad = (moves.data || []).filter(
        (m) => m.type === 'sale' && (m.color_key == null || String(m.color_key).trim() === '')
    )
    if (bad.length) {
        console.warn(`  WARN: ${bad.length} sale qatorda color_key null — chiqqan hisobi adashadi`)
        console.warn(
            '  Masalan item.color bilan yozish kerak:',
            resolveMovementColorKey(null, (items.data || [])[0]?.color)
        )
    } else if ((moves.data || []).length) {
        console.log('  OK: sale qatorlarda color_key bor')
    } else {
        console.log('  INFO: bu buyurtmada hali stock_movements yo‘q (qisman chiqim qilinmagan)')
    }

    console.log('3) resolveMovementColorKey smoke:')
    console.log('  ', JSON.stringify({
        bucket: resolveMovementColorKey('Kulrang', 'kulrang'),
        fallback: resolveMovementColorKey(null, 'navot'),
        empty: resolveMovementColorKey(null, null),
    }))
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
