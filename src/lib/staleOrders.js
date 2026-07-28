/** Yangi / jarayonda buyurtmalar — muddat o‘tgan ogohlantirish */

export const STALE_ORDER_DAYS = 12

const OPEN_STATUSES = new Set([
    'new',
    'yangi',
    'pending',
    'jarayonda',
])

export function isOpenOrderStatus(status) {
    const s = String(status || '')
        .trim()
        .toLowerCase()
    return OPEN_STATUSES.has(s)
}

export function daysSinceCreated(createdAt, now = new Date()) {
    const d = new Date(createdAt)
    if (Number.isNaN(d.getTime())) return 0
    const ms = now.getTime() - d.getTime()
    if (ms < 0) return 0
    return Math.floor(ms / (24 * 60 * 60 * 1000))
}

export function isStaleOpenOrder(order, now = new Date(), minDays = STALE_ORDER_DAYS) {
    if (!order || !isOpenOrderStatus(order.status)) return false
    return daysSinceCreated(order.created_at, now) >= minDays
}

export function filterStaleOpenOrders(orders, now = new Date(), minDays = STALE_ORDER_DAYS) {
    return (orders || [])
        .filter((o) => isStaleOpenOrder(o, now, minDays))
        .map((o) => ({
            ...o,
            staleDays: daysSinceCreated(o.created_at, now),
        }))
        .sort((a, b) => b.staleDays - a.staleDays)
}

export function buildStaleOrdersFallbackMessage(staleOrders) {
    const lines = (staleOrders || []).slice(0, 25).map((o, i) => {
        const name = o.customer_name || o.customers?.name || 'Nomaʼlum'
        const phone = o.customer_phone || o.customers?.phone || '—'
        const num = o.order_number || String(o.id || '').slice(0, 8)
        const total = o.total != null ? `$${Number(o.total).toLocaleString()}` : '—'
        return `${i + 1}. №${num} · ${name} · ${phone} · ${total} · ${o.staleDays} kun · ${o.status}`
    })
    const more =
        (staleOrders?.length || 0) > 25 ? `\n… va yana ${staleOrders.length - 25} ta` : ''
    return (
        `⚠️ <b>Eski buyurtmalar ogohlantirishi</b>\n` +
        `${STALE_ORDER_DAYS}+ kun oldin ochilgan, hali <b>Yangi</b> yoki <b>Jarayonda</b>:\n\n` +
        `${lines.join('\n')}${more}\n\n` +
        `Jami: <b>${staleOrders?.length || 0}</b> ta. Iltimos, tekshiring.`
    )
}

export function buildStaleOrdersAiPrompt(staleOrders) {
    const payload = (staleOrders || []).slice(0, 30).map((o) => ({
        order_number: o.order_number || null,
        id: String(o.id || '').slice(0, 8),
        customer: o.customer_name || o.customers?.name || null,
        phone: o.customer_phone || o.customers?.phone || null,
        total: o.total,
        status: o.status,
        days: o.staleDays,
        created_at: o.created_at,
    }))
    return (
        `Siz CRM yordamchisisiz. Quyidagi buyurtmalar ${STALE_ORDER_DAYS} kundan ortiq ochiq (status: Yangi yoki Jarayonda).\n` +
        `O‘zbek tilida qisqa, aniq Telegram xabari yozing (HTML: <b>...</b> mumkin). ` +
        `Barcha buyurtmalarni sanab o‘ting (№, mijoz, kun, summa). Oxirida nima qilish kerakligini 1 gap bilan yozing.\n` +
        `JSON maʼlumot:\n${JSON.stringify(payload, null, 0)}`
    )
}
