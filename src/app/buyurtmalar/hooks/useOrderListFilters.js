import { useMemo } from 'react'
import { orderCategoryLabels, normalizeSourceForForm } from '../utils'

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
    const labels = orderCategoryLabels(b, '—')
    const matchesCategory = filterCategory === 'all' || labels.includes(filterCategory)
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
}) {
    const filteredOrders = useMemo(() => {
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
    ])

    const totalSumma = useMemo(
        () => filteredOrders.reduce((sum, b) => sum + (Number(b.total) || 0), 0),
        [filteredOrders]
    )

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
            for (const label of orderCategoryLabels(o, '—')) {
                countByLabel.set(label, (countByLabel.get(label) || 0) + 1)
            }
        }
        return Array.from(countByLabel.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'uz'))
            .map(([label, count]) => ({ label, count }))
    }, [ordersForList])

    const hasExtraFilters = useMemo(() => {
        return (
            (filterSource && filterSource !== 'all') ||
            Boolean(dateFrom) ||
            Boolean(dateTo) ||
            (filterCategory && filterCategory !== 'all') ||
            Boolean(searchTerm.trim())
        )
    }, [filterSource, dateFrom, dateTo, filterCategory, searchTerm])

    return { filteredOrders, totalSumma, statusStats, orderCategoryOptions, hasExtraFilters }
}
