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

function applyMovementRowsToMap(out, rows) {
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

async function fetchStockMovementsForOrders(orderIds) {
    if (!orderIds?.length) return []
    const main = await supabase
        .from('stock_movements')
        .select('order_id, product_id, color_key, change_amount, type')
        .in('order_id', orderIds)
        .in('type', ['sale', 'reversal'])
    if (!main.error) return main.data || []
    const m = String(main.error?.message || main.error?.code || '')
    if (/color_key|column|does not exist|42703/i.test(m)) {
        const fb = await supabase
            .from('stock_movements')
            .select('order_id, product_id, change_amount, type')
            .in('order_id', orderIds)
            .in('type', ['sale', 'reversal'])
        if (fb.error) throw fb.error
        return fb.data || []
    }
    throw main.error
}

export async function loadOrderShippedMap(orderId) {
    const out = new Map()
    if (!orderId) return out
    const rows = await fetchStockMovementsForOrders([orderId])
    return applyMovementRowsToMap(out, rows)
}

/** Bir nechta buyurtma uchun jo‘natilgan miqdorlar: Map<orderId, Map<shipKey, qty>> */
export async function loadOrdersShippedMaps(orderIds) {
    const result = new Map()
    const ids = [...new Set((orderIds || []).filter(Boolean))]
    if (!ids.length) return result
    const CHUNK = 80
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const rows = await fetchStockMovementsForOrders(chunk)
        for (const r of rows || []) {
            const oid = r.order_id
            if (!oid) continue
            if (!result.has(oid)) result.set(oid, new Map())
            applyMovementRowsToMap(result.get(oid), [r])
        }
    }
    return result
}

/**
 * Buyurtma bo‘yicha chiqim holati: none | partial | full
 * partial = bir qismi ombordan olingan, hali qolgani bor.
 */
export function computeOrderFulfillment(order, shippedMap) {
    const items = dedupeOrderItemsKeepNewest(order?.order_items || [], [])
    const agg = new Map()
    for (const oi of items) {
        if (!oi?.product_id) continue
        const key = orderItemShipKey(oi.product_id, oi.color || '—')
        const q = parseOrderItemQty(oi.quantity || 0)
        if (q <= 0) continue
        agg.set(key, (Number(agg.get(key)) || 0) + q)
    }
    let ordered = 0
    let shipped = 0
    const map = shippedMap instanceof Map ? shippedMap : new Map()
    for (const [key, qty] of agg.entries()) {
        ordered += qty
        shipped += Math.min(qty, Number(map.get(key)) || 0)
    }
    const remaining = Math.max(0, ordered - shipped)
    const percent = ordered > 0 ? Math.min(100, Math.round((shipped / ordered) * 100)) : 0
    let state = 'none'
    if (ordered > 0 && shipped > 0 && remaining > 0) state = 'partial'
    else if (ordered > 0 && remaining === 0 && shipped > 0) state = 'full'
    return { ordered, shipped, remaining, percent, state }
}

export async function attachFulfillmentToOrders(ordersList) {
    const list = Array.isArray(ordersList) ? ordersList : []
    if (!list.length) return list
    try {
        const maps = await loadOrdersShippedMaps(list.map((o) => o.id))
        return list.map((o) => ({
            ...o,
            fulfillment: computeOrderFulfillment(o, maps.get(o.id) || new Map()),
        }))
    } catch (e) {
        console.warn('attachFulfillmentToOrders:', e)
        return list.map((o) => ({
            ...o,
            fulfillment: o.fulfillment || { ordered: 0, shipped: 0, remaining: 0, percent: 0, state: 'none' },
        }))
    }
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
            const imageUrl =
                (oi.image_url != null && String(oi.image_url).trim()) ||
                (oi.products?.image_url != null && String(oi.products.image_url).trim()) ||
                (prod?.image_url != null && String(prod.image_url).trim()) ||
                ''
            return {
                key: `${key}-${idx}`,
                product_id: oi.product_id,
                product_name: oi.product_name || oi.products?.name || displayProductName(prod),
                size: oi.size || prod?.size || '',
                color: oi.color || null,
                image_url: imageUrl || null,
                ordered_qty: ordered,
                shipped_qty: shipped,
                remaining_qty: remaining,
                available_qty: available,
                ship_qty: remaining > 0 ? Math.min(remaining, available) : 0,
            }
        })
        .filter((r) => r.ordered_qty > 0)
}
