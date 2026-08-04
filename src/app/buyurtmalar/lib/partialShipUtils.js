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

/** Buyurtma bo‘yicha eng so‘nggi ombor chiqimi (sale) sanasi */
export async function fetchLatestOrderShipDate(orderId) {
    if (!orderId) return null
    const q = await supabase
        .from('stock_movements')
        .select('created_at')
        .eq('order_id', orderId)
        .eq('type', 'sale')
        .order('created_at', { ascending: false })
        .limit(1)
    if (q.error && /created_at|column|does not exist|42703/i.test(String(q.error.message || ''))) {
        return null
    }
    if (q.error) throw q.error
    return q.data?.[0]?.created_at || null
}

/** Bir nechta buyurtma uchun eng so‘nggi sale sanasi: Map<orderId, iso> */
export async function loadOrdersLatestShipDates(orderIds) {
    const result = new Map()
    const ids = [...new Set((orderIds || []).filter(Boolean))]
    if (!ids.length) return result
    const CHUNK = 80
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        let q = await supabase
            .from('stock_movements')
            .select('order_id, created_at')
            .in('order_id', chunk)
            .eq('type', 'sale')
        if (q.error && /created_at|column|does not exist|42703/i.test(String(q.error.message || ''))) {
            return result
        }
        if (q.error) throw q.error
        for (const r of q.data || []) {
            const oid = r.order_id
            const at = r.created_at
            if (!oid || !at) continue
            const prev = result.get(oid)
            if (!prev || new Date(at) > new Date(prev)) result.set(oid, at)
        }
    }
    return result
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

/**
 * Status «completed», lekin omborda hali qolgan bo‘lsa — qolganini chiqim qilib to‘ldirish.
 * (Tugallangan + Qisman chiqqan nomuvofiqligini tuzatadi)
 */
export async function syncOutstandingForCompletedOrders(ordersList) {
    const { normalizeStatusForSelect } = await import('../utils')
    const list = Array.isArray(ordersList) ? ordersList : []
    let fixed = 0
    for (const o of list) {
        if (normalizeStatusForSelect(o.status) !== 'completed') continue
        const remaining = Number(o.fulfillment?.remaining) || 0
        if (remaining <= 0) continue
        try {
            const outstanding = await getOutstandingItemsForDeduction(o.id, o.order_items || [])
            if (!outstanding.length) continue
            const { deductStockForCompletedOrder } = await import('@/services/inventoryService')
            const res = await deductStockForCompletedOrder(
                o.id,
                o.order_number || o.id,
                outstanding
            )
            if (res?.success) fixed += 1
            else console.warn('syncOutstandingForCompletedOrders:', o.id, res?.errors)
        } catch (e) {
            console.warn('syncOutstandingForCompletedOrders:', o.id, e)
        }
    }
    return fixed
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

/**
 * So‘ralgan chiqimni buyurtma qoldig‘iga qisqartiradi (ortiqcha chiqim yo‘q).
 * order_items dan buyurtma miqdorini olib, stock_movements bilan solishtiradi.
 */
export async function clampShipItemsToOutstanding(orderId, requestedItems) {
    if (!orderId || !requestedItems?.length) return []
    const shippedMap = await loadOrderShippedMap(orderId)

    let { data: orderItems, error } = await supabase
        .from('order_items')
        .select('product_id, color, quantity')
        .eq('order_id', orderId)
    if (error) {
        console.warn('clampShipItemsToOutstanding order_items:', error.message)
        orderItems = []
    }

    const orderedByKey = new Map()
    for (const oi of orderItems || []) {
        if (!oi?.product_id) continue
        const key = orderItemShipKey(oi.product_id, oi.color || '—')
        orderedByKey.set(key, (Number(orderedByKey.get(key)) || 0) + parseOrderItemQty(oi.quantity || 0))
    }

    // So‘rovni kalit bo‘yicha yig‘ish (bir xil mahsulot+rang bir necha marta kelishi mumkin)
    const wantByKey = new Map()
    for (const item of requestedItems) {
        if (!item?.product_id) continue
        const key = orderItemShipKey(item.product_id, item.color || '—')
        const prev = wantByKey.get(key) || {
            product_id: item.product_id,
            color: item.color || null,
            product_name: item.product_name,
            quantity: 0,
        }
        prev.quantity += parseOrderItemQty(item.quantity || 0)
        if (item.color != null && item.color !== '') prev.color = item.color
        if (item.product_name) prev.product_name = item.product_name
        wantByKey.set(key, prev)
    }

    const out = []
    for (const [key, item] of wantByKey.entries()) {
        const ordered = Number(orderedByKey.get(key)) || 0
        const shipped = Number(shippedMap.get(key)) || 0
        const remaining = Math.max(0, ordered - shipped)
        const qty = Math.min(Math.max(0, Number(item.quantity) || 0), remaining)
        if (qty > 0) out.push({ ...item, quantity: qty })
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

/**
 * Bir xil product+rang kaliti bo‘yicha chiqimni qatorlarga taqsimlaydi.
 * Har bir qator uchun chiqqan hech qachon buyurtma miqdoridan oshmaydi.
 */
export function allocateShippedAcrossRows(rowDefs, shippedMap) {
    const map = shippedMap instanceof Map ? shippedMap : new Map()
    const groups = new Map()
    rowDefs.forEach((row, index) => {
        const key = row.shipKey
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push({ row, index })
    })

    const allocated = new Array(rowDefs.length)
    for (const [shipKey, members] of groups.entries()) {
        const orderedTotal = members.reduce(
            (s, m) => s + (Number(m.row.ordered_qty) || 0),
            0
        )
        // Omborda ortiqcha chiqim bo‘lsa ham — faqat buyurtma chegarasigacha
        let left = Math.min(orderedTotal, Math.max(0, Number(map.get(shipKey)) || 0))
        for (const { row, index } of members) {
            const ordered = Math.max(0, Number(row.ordered_qty) || 0)
            const shipped = Math.min(ordered, left)
            left -= shipped
            allocated[index] = {
                ...row,
                shipped_qty: shipped,
                remaining_qty: Math.max(0, ordered - shipped),
            }
        }
    }
    return allocated
}

export function buildPartialShipRows(order, products, shippedMap) {
    const rawItems = dedupeOrderItemsKeepNewest(order.order_items || [], products)
    const rowDefs = rawItems
        .map((oi) => {
            const ordered = parseOrderItemQty(oi.quantity || 0)
            if (ordered <= 0) return null
            const shipKey = orderItemShipKey(oi.product_id, oi.color || '—')
            const prod = products.find((p) => String(p.id) === String(oi.product_id))
            const available = productAvailableForOrderItem(prod, oi.color || '—')
            const imageUrl =
                (oi.image_url != null && String(oi.image_url).trim()) ||
                (oi.products?.image_url != null && String(oi.products.image_url).trim()) ||
                (prod?.image_url != null && String(prod.image_url).trim()) ||
                ''
            return {
                shipKey,
                product_id: oi.product_id,
                product_name: oi.product_name || oi.products?.name || displayProductName(prod),
                size: oi.size || prod?.size || '',
                color: oi.color || null,
                image_url: imageUrl || null,
                ordered_qty: ordered,
                available_qty: available,
            }
        })
        .filter(Boolean)

    return allocateShippedAcrossRows(rowDefs, shippedMap).map((r, idx) => {
        const remaining = Number(r.remaining_qty) || 0
        return {
            key: `${r.shipKey}-${idx}`,
            product_id: r.product_id,
            product_name: r.product_name,
            size: r.size,
            color: r.color,
            image_url: r.image_url,
            ordered_qty: r.ordered_qty,
            shipped_qty: r.shipped_qty,
            remaining_qty: remaining,
            available_qty: r.available_qty,
            ship_qty: remaining > 0 ? Math.min(remaining, r.available_qty) : 0,
        }
    })
}

/**
 * Chop etish uchun faqat chiqqan miqdorlar (order_items formatida).
 * @returns {{ items: object[], shippedTotal: number, orderedTotal: number }}
 */
export function buildShippedPortionOrderItems(order, products, shippedMap) {
    const rawItems = dedupeOrderItemsKeepNewest(order?.order_items || [], products || [])
    const rowDefs = rawItems
        .map((oi) => {
            const ordered = parseOrderItemQty(oi.quantity || 0)
            if (ordered <= 0) return null
            return {
                shipKey: orderItemShipKey(oi.product_id, oi.color || '—'),
                ordered_qty: ordered,
                source: oi,
            }
        })
        .filter(Boolean)

    const allocated = allocateShippedAcrossRows(rowDefs, shippedMap)
    const items = []
    let shippedTotal = 0
    let orderedTotal = 0
    allocated.forEach((r) => {
        orderedTotal += Number(r.ordered_qty) || 0
        const shipped = Number(r.shipped_qty) || 0
        if (shipped <= 0) return
        shippedTotal += shipped
        const oi = r.source || {}
        items.push({
            ...oi,
            quantity: shipped,
            // Chop etishda «buyurtma» o‘rniga chiqqan miqdor ko‘rinsin
            _print_shipped_portion: true,
            _print_ordered_qty: r.ordered_qty,
        })
    })
    return { items, shippedTotal, orderedTotal }
}
