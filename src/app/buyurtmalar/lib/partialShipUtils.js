import { supabase } from '@/lib/supabase'
import {
    normalizeOrderItemColorKey,
    parseOrderItemQty,
    displayProductName,
    dedupeOrderItemsKeepNewest,
} from '../utils'

export function orderItemShipKey(productId, colorRaw) {
    return `${String(productId)}::${normalizeOrderItemColorKey(colorRaw)}`
}

export async function loadOrderShippedMap(orderId) {
    const out = new Map()
    if (!orderId) return out
    let rows = null
    const main = await supabase
        .from('stock_movements')
        .select('product_id, color_key, change_amount, type')
        .eq('order_id', orderId)
        .in('type', ['sale', 'reversal'])
    if (!main.error) {
        rows = main.data || []
    } else {
        const m = String(main.error?.message || main.error?.code || '')
        if (/color_key|column|does not exist|42703/i.test(m)) {
            const fb = await supabase
                .from('stock_movements')
                .select('product_id, change_amount, type')
                .eq('order_id', orderId)
                .in('type', ['sale', 'reversal'])
            if (fb.error) throw fb.error
            rows = fb.data || []
        } else {
            throw main.error
        }
    }
    for (const r of rows || []) {
        const key = orderItemShipKey(r.product_id, r.color_key || '—')
        const prev = Number(out.get(key)) || 0
        const deltaAbs = Math.abs(Number(r.change_amount) || 0)
        if (String(r.type) === 'reversal') {
            out.set(key, Math.max(0, prev - deltaAbs))
        } else {
            out.set(key, prev + deltaAbs)
        }
    }
    return out
}

export async function getOutstandingItemsForDeduction(orderId, items) {
    const shippedMap = await loadOrderShippedMap(orderId)
    const agg = new Map()
    for (const oi of items || []) {
        if (!oi?.product_id) continue
        const key = orderItemShipKey(oi.product_id, oi.color || '—')
        const prev = Number(agg.get(key)?.quantity) || 0
        const q = parseOrderItemQty(oi.quantity || 0)
        agg.set(key, {
            product_id: oi.product_id,
            color: oi.color || null,
            quantity: prev + q,
        })
    }
    const out = []
    for (const [, item] of agg.entries()) {
        const key = orderItemShipKey(item.product_id, item.color || '—')
        const shipped = Number(shippedMap.get(key)) || 0
        const remaining = Math.max(0, Number(item.quantity || 0) - shipped)
        if (remaining > 0) out.push({ ...item, quantity: remaining })
    }
    return out
}

export function productAvailableForOrderItem(product, colorRaw) {
    const total = Number(product?.stock)
    const totalSafe = Number.isFinite(total) && total >= 0 ? total : 0
    const byColor = product?.stock_by_color
    if (!byColor || typeof byColor !== 'object' || Array.isArray(byColor)) return totalSafe
    const wanted = normalizeOrderItemColorKey(colorRaw || '—')
    for (const [k, v] of Object.entries(byColor)) {
        if (normalizeOrderItemColorKey(k) === wanted) {
            const n = Number(v)
            return Number.isFinite(n) && n >= 0 ? n : totalSafe
        }
    }
    return totalSafe
}

export function buildPartialShipRows(order, products, shippedMap) {
    const rawItems = dedupeOrderItemsKeepNewest(order.order_items || [], products)
    return rawItems
        .map((oi, idx) => {
            const ordered = parseOrderItemQty(oi.quantity || 0)
            const key = orderItemShipKey(oi.product_id, oi.color || '—')
            const shipped = Number(shippedMap.get(key)) || 0
            const remaining = Math.max(0, ordered - shipped)
            const prod = products.find((p) => String(p.id) === String(oi.product_id))
            const available = productAvailableForOrderItem(prod, oi.color || '—')
            return {
                key: `${key}-${idx}`,
                product_id: oi.product_id,
                product_name: oi.product_name || oi.products?.name || displayProductName(prod),
                size: oi.size || prod?.size || '',
                color: oi.color || null,
                ordered_qty: ordered,
                shipped_qty: shipped,
                remaining_qty: remaining,
                available_qty: available,
                ship_qty: remaining > 0 ? Math.min(remaining, available) : 0,
            }
        })
        .filter((r) => r.ordered_qty > 0)
}
