/** Buyurtmalar sahifasi bilan mos: tugallangan statuslar */
export function isCompletedOrderStatus(status) {
    if (status == null || status === '') return false
    const s = String(status).toLowerCase().trim()
    if (s === 'completed' || s === 'tugallandi' || s === 'tugallangan') return true
    if (s.includes('tugallan')) return true
    if (s.includes('заверш') || s === 'done') return true
    return false
}

/** ISO / timestamp → foydalanuvchi brauzeridagi mahalliy sana (YYYY-MM-DD) */
export function dateKeyFromTimestampLocal(raw) {
    if (raw == null || raw === '') return ''
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) {
        const s = String(raw)
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
        return m ? m[1] : ''
    }
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${day}`
}

export function parseOrderItemQty(v) {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.floor(n)
}

function parseOrderItemPrice(v) {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/**
 * Hisobot sanasi: avvalo `updated_at` (tugallash / oxirgi o‘zgarish), aks holda `created_at`.
 * Mahalliy kun bilan solishtirish uchun `dateKeyFromTimestampLocal`.
 */
export function orderReportDateKey(order) {
    const raw = order?.updated_at || order?.created_at || ''
    return dateKeyFromTimestampLocal(raw)
}

/**
 * @param {Array<{ status: string, order_items?: unknown[], total?: unknown, updated_at?: string, created_at?: string }>} orders
 * @param {string} from YYYY-MM-DD
 * @param {string} to YYYY-MM-DD
 */
export function filterCompletedOrdersInDateRange(orders, from, to) {
    return (orders || []).filter((o) => {
        if (!isCompletedOrderStatus(o.status)) return false
        const d = orderReportDateKey(o)
        if (!d) return false
        return d >= from && d <= to
    })
}

/**
 * @returns {{ byProduct: Array<{ key: string, name: string, qty: number, revenue: number }>, totalQty: number, totalRevenue: number, orderCount: number }}
 */
export function aggregateCompletedOrderSales(completedOrders) {
    const map = new Map()
    let totalQty = 0
    let totalRevenue = 0

    for (const o of completedOrders || []) {
        const orderTotal = Number(o.total)
        const items = o.order_items || []
        let itemsSum = 0

        for (const it of items) {
            const q = parseOrderItemQty(it.quantity)
            if (q <= 0) continue
            const sub = Number(it.subtotal)
            const rev = Number.isFinite(sub) && sub > 0 ? sub : parseOrderItemPrice(it.price) * q
            const roundedRev = Math.round(rev * 100) / 100
            itemsSum += roundedRev

            const name =
                (it.product_name && String(it.product_name).trim()) ||
                (it.products && typeof it.products === 'object' && it.products.name
                    ? String(it.products.name).trim()
                    : '') ||
                '—'
            const key = it.product_id != null ? `id:${it.product_id}` : `name:${name}`

            const prev = map.get(key) || { key, name, qty: 0, revenue: 0 }
            prev.name = name
            prev.qty += q
            prev.revenue = Math.round((prev.revenue + roundedRev) * 100) / 100
            map.set(key, prev)
            totalQty += q
        }

        if (items.length === 0 && Number.isFinite(orderTotal) && orderTotal > 0) {
            totalRevenue += orderTotal
        } else {
            totalRevenue += itemsSum > 0 ? itemsSum : Number.isFinite(orderTotal) ? orderTotal : 0
        }
    }

    const byProduct = Array.from(map.values()).sort((a, b) => b.qty - a.qty)
    totalRevenue = Math.round(totalRevenue * 100) / 100

    return {
        byProduct,
        totalQty,
        totalRevenue,
        orderCount: (completedOrders || []).length,
    }
}
