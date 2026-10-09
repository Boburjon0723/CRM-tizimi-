import { useMemo } from 'react'
import {
    orderCategoryLabels,
    normalizeSourceForForm,
    normalizeOrderItemsForList,
    dedupeOrderItemsKeepNewest,
    filterOrderItemsByCategoryLabel,
    sumOrderItemsQty,
} from '../utils'
import { partnerIdForOrder } from '../lib/partnerSaleFromOrder'

function isNewOrderStatus(st) {
    return st === 'new' || st === 'Yangi'
}

function isProgressOrderStatus(st) {
    return st === 'pending' || st === 'Jarayonda'
}

function isCompletedOrderStatus(st) {
    return st === 'completed' || st === 'Tugallandi' || st === 'Tugallangan'
}

function orderDayKey(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function orderMatchesSource(orderSource, filterSource) {
    if (!filterSource || filterSource === 'all') return true
    const s = normalizeSourceForForm(orderSource)
    if (filterSource === 'dokon') return s === 'dokon'
    if (filterSource === 'telefon') return s === 'telefon'
    if (filterSource === 'website') return s === 'website'
    if (filterSource === 'website_optom') return s === 'website_optom'
    if (filterSource === 'website_chakana') return s === 'website_chakana'
    return true
}

function orderMatchesListFilters(b, {
    q,
    filterStatus,
    filterCategory,
    filterSource,
    dateFrom,
    dateTo,
    unknownLabel,
    productsList = null,
}) {
    const customerName = b.customer_name || b.customers?.name || unknownLabel || "Noma'lum"
    const matchesSearch =
        !q ||
        customerName.toLowerCase().includes(q) ||
        String(b.customer_phone || b.customers?.phone || '')
            .toLowerCase()
            .includes(q) ||
        String(b.id || '')
            .toLowerCase()
            .includes(q) ||
        String(b.order_number || '')
            .toLowerCase()
            .includes(q) ||
        String(b.note || '')
            .toLowerCase()
            .includes(q)
    const st = b.status
    const labels = orderCategoryLabels(b, '—', productsList)
    const matchesCategory =
        filterCategory === 'all' ||
        labels.includes(filterCategory) ||
        labels.some((l) => l.toLowerCase() === String(filterCategory || '').toLowerCase())
    const matchesStatus =
        filterStatus === 'all' ||
        filterStatus === 'Hammasi' ||
        (filterStatus === 'new' && (st === 'new' || st === 'Yangi')) ||
        (filterStatus === 'pending' && (st === 'pending' || st === 'Jarayonda')) ||
        (filterStatus === 'completed' &&
            (st === 'completed' || st === 'Tugallandi' || st === 'Tugallangan')) ||
        (filterStatus === 'cancelled' &&
            (st === 'cancelled' || st === 'Bekor qilingan' || st === 'Bekor qilindi'))
    const matchesSource = orderMatchesSource(b.source, filterSource)
    const day = orderDayKey(b.created_at)
    const matchesDate =
        (!dateFrom || (day && day >= dateFrom)) && (!dateTo || (day && day <= dateTo))
    return matchesSearch && matchesStatus && matchesCategory && matchesSource && matchesDate
}

const sumOrderListTotals = (list) =>
    Math.round(list.reduce((s, b) => s + (Number(b.total) || 0), 0) * 100) / 100

export function useOrderListFilters({
    ordersForList,
    searchTerm,
    filterStatus,
    filterCategory,
    filterSource = 'all',
    dateFrom = '',
    dateTo = '',
    unknownLabel,
    productsList = null,
    filterPartnerId = '',
    partnerStatus = 'all',
    saleOutRefs = null,
}) {
    const matchedOrders = useMemo(() => {
        const q = searchTerm.trim().toLowerCase()
        return ordersForList.filter((b) =>
            orderMatchesListFilters(b, {
                q,
                filterStatus,
                filterCategory,
                filterSource,
                dateFrom,
                dateTo,
                unknownLabel,
                productsList,
            })
        )
    }, [
        ordersForList,
        searchTerm,
        filterStatus,
        filterCategory,
        filterSource,
        dateFrom,
        dateTo,
        unknownLabel,
        productsList,
    ])

    const partnerScoped = useMemo(() => {
        if (!filterPartnerId) return matchedOrders
        const want = String(filterPartnerId)
        return matchedOrders.filter((b) => partnerIdForOrder(b, saleOutRefs) === want)
    }, [matchedOrders, filterPartnerId, saleOutRefs])

    const partnerStatusStats = useMemo(() => {
        const fresh = partnerScoped.filter((b) => isNewOrderStatus(b.status))
        const progress = partnerScoped.filter((b) => isProgressOrderStatus(b.status))
        const completed = partnerScoped.filter((b) => isCompletedOrderStatus(b.status))
        return {
            fresh: { count: fresh.length, sum: sumOrderListTotals(fresh) },
            progress: { count: progress.length, sum: sumOrderListTotals(progress) },
            completed: { count: completed.length, sum: sumOrderListTotals(completed) },
        }
    }, [partnerScoped])

    const filteredOrders = useMemo(() => {
        if (!filterPartnerId || !partnerStatus || partnerStatus === 'all') return partnerScoped
        if (partnerStatus === 'new') return partnerScoped.filter((b) => isNewOrderStatus(b.status))
        if (partnerStatus === 'progress') return partnerScoped.filter((b) => isProgressOrderStatus(b.status))
        if (partnerStatus === 'completed') return partnerScoped.filter((b) => isCompletedOrderStatus(b.status))
        return partnerScoped
    }, [partnerScoped, filterPartnerId, partnerStatus])

    const totalSumma = useMemo(
        () => filteredOrders.reduce((sum, b) => sum + (Number(b.total) || 0), 0),
        [filteredOrders]
    )

    /** Ro‘yxatdagi barcha buyurtmalar miqdori (kategoriya filtri bo‘lsa — faqat shu kategoriya qatorlari) */
    const totalQty = useMemo(() => {
        const categoryActive = filterCategory && filterCategory !== 'all'
        let s = 0
        for (const o of filteredOrders) {
            const items = normalizeOrderItemsForList(dedupeOrderItemsKeepNewest(o.order_items || [], productsList))
            s += sumOrderItemsQty(
                categoryActive ? filterOrderItemsByCategoryLabel(items, filterCategory, '—', productsList) : items
            )
        }
        return Math.round(s * 1000) / 1000
    }, [filteredOrders, filterCategory, productsList])

    const statusStats = useMemo(() => {
        const statusPick = (pred) => {
            const list = filteredOrders.filter(pred)
            return { count: list.length, sum: sumOrderListTotals(list) }
        }
        return {
            new: statusPick((b) => b.status === 'Yangi' || b.status === 'new'),
            pending: statusPick((b) => b.status === 'Jarayonda' || b.status === 'pending'),
            completed: statusPick(
                (b) =>
                    b.status === 'Tugallandi' ||
                    b.status === 'completed' ||
                    b.status === 'Tugallangan'
            ),
            cancelled: statusPick(
                (b) =>
                    b.status === 'cancelled' ||
                    b.status === 'Bekor qilingan' ||
                    b.status === 'Bekor qilindi'
            ),
        }
    }, [filteredOrders])

    const orderCategoryOptions = useMemo(() => {
        const countByLabel = new Map()
        for (const o of ordersForList) {
            for (const label of orderCategoryLabels(o, '—', productsList)) {
                countByLabel.set(label, (countByLabel.get(label) || 0) + 1)
            }
        }
        return Array.from(countByLabel.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'uz'))
            .map(([label, count]) => ({ label, count }))
    }, [ordersForList, productsList])

    const hasExtraFilters = useMemo(() => {
        return (
            (filterSource && filterSource !== 'all') ||
            Boolean(dateFrom) ||
            Boolean(dateTo) ||
            (filterCategory && filterCategory !== 'all') ||
            (filterStatus && filterStatus !== 'all' && filterStatus !== 'Hammasi') ||
            Boolean(searchTerm.trim()) ||
            Boolean(filterPartnerId)
        )
    }, [filterSource, dateFrom, dateTo, filterCategory, filterStatus, searchTerm, filterPartnerId])

    return { filteredOrders, totalSumma, totalQty, statusStats, orderCategoryOptions, hasExtraFilters, partnerStatusStats }
}
