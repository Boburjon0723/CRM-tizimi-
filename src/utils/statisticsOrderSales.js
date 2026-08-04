/**
 * Statistika sahifasi: tugallangan + qisman chiqqan buyurtmalar hisobi.
 * Buyurtmalar / buyurtmalar2 dagi ombor chiqimi (stock_movements) bilan mos.
 */
import { isCompletedOrderStatus, dateKeyFromTimestampLocal } from '@/utils/completedOrderSales'
import {
    computeOrderFulfillment,
    buildShippedPortionOrderItems,
    loadOrdersShippedMaps,
    loadOrdersLatestShipDates,
} from '@/app/buyurtmalar/lib/partialShipUtils'

export function isCancelledOrderStatus(status) {
    const s = String(status || '')
        .toLowerCase()
        .trim()
    if (!s) return false
    return s === 'cancelled' || s.includes('bekor') || s.includes('cancel')
}

/** Tugallangan yoki ombordan hech bo‘lmasa 1 dona chiqqan (bekor emas) */
export function isSalesCountableOrder(order) {
    if (!order || isCancelledOrderStatus(order.status)) return false
    if (isCompletedOrderStatus(order.status)) return true
    return (Number(order?.fulfillment?.shipped) || 0) > 0
}

/**
 * Hisobot sanasi:
 * - tugallangan → completed_at → updated_at → created_at
 * - qisman → oxirgi ombor chiqimi → updated_at → created_at
 */
export function salesAnchorRaw(order) {
    if (isCompletedOrderStatus(order?.status)) {
        return order?.completed_at || order?.updated_at || order?.created_at || ''
    }
    return order?._latestShipAt || order?.updated_at || order?.created_at || ''
}

export function salesAnchorDate(order) {
    const raw = salesAnchorRaw(order)
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
}

export function salesAnchorDayKey(order) {
    return dateKeyFromTimestampLocal(salesAnchorRaw(order))
}

/**
 * Savdo uchun qatorlar: tugallangan — to‘liq; qisman — faqat chiqqan miqdor.
 */
export function effectiveSalesItems(order, products = []) {
    if (!order || isCancelledOrderStatus(order.status)) return []
    if (isCompletedOrderStatus(order.status)) {
        return Array.isArray(order.order_items) ? order.order_items : []
    }
    if ((Number(order?.fulfillment?.shipped) || 0) <= 0) return []
    const map = order._shippedMap instanceof Map ? order._shippedMap : new Map()
    return buildShippedPortionOrderItems(order, products, map).items || []
}

function parseQty(v) {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
}

/** Narx × dona; qator yo‘q va tugallangan bo‘lsa — order.total */
export function sumEffectiveSalesRevenue(order, products = []) {
    const items = effectiveSalesItems(order, products)
    let s = 0
    for (const item of items) {
        const q = parseQty(item.quantity)
        const lineQty = q > 0 ? q : 1
        const sub = Number(item.subtotal)
        if (Number.isFinite(sub) && sub > 0) {
            s += sub
        } else {
            s += (Number(item.price) || 0) * lineQty
        }
    }
    if (items.length === 0 && isCompletedOrderStatus(order?.status)) {
        const tot = Number(order?.total)
        return Number.isFinite(tot) && tot > 0 ? tot : 0
    }
    return Math.round(s * 100) / 100
}

/**
 * Buyurtmalarni fulfillment + oxirgi chiqim sanasi bilan boyitish.
 */
export async function enrichOrdersForStatistics(ordersList) {
    const list = Array.isArray(ordersList) ? ordersList : []
    if (!list.length) return []
    try {
        const ids = list.map((o) => o.id).filter(Boolean)
        const [maps, latestDates] = await Promise.all([
            loadOrdersShippedMaps(ids),
            loadOrdersLatestShipDates(ids),
        ])
        return list.map((o) => {
            const map = maps.get(o.id) || new Map()
            return {
                ...o,
                fulfillment: computeOrderFulfillment(o, map),
                _shippedMap: map,
                _latestShipAt: latestDates.get(o.id) || null,
            }
        })
    } catch (e) {
        console.warn('enrichOrdersForStatistics:', e)
        return list.map((o) => ({
            ...o,
            fulfillment: o.fulfillment || {
                ordered: 0,
                shipped: 0,
                remaining: 0,
                percent: 0,
                state: 'none',
            },
            _shippedMap: o._shippedMap instanceof Map ? o._shippedMap : new Map(),
            _latestShipAt: o._latestShipAt || null,
        }))
    }
}

export { isCompletedOrderStatus }
