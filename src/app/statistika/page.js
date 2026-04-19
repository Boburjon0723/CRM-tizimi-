'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import {
    TrendingUp,
    TrendingDown,
    ShoppingCart,
    Package,
    Calendar,
    RefreshCcw,
    Users,
    FileDown,
    Layers,
    FolderTree,
    Printer,
    AlertCircle,
    AlertTriangle,
} from 'lucide-react'
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { isDeletedAtMissingError } from '@/lib/orderTrash'
import CrmAiInsightsPanel from '@/components/CrmAiInsightsPanel'

const LS_MODE = 'crm_stat_date_mode'
const LS_DAYS = 'crm_stat_filter_days'
const LS_MONTH = 'crm_stat_month'
const LS_FROM = 'crm_stat_from'
const LS_TO = 'crm_stat_to'
const LS_STATUS = 'crm_stat_order_status'
const VALID_FILTER_RANGES = ['7', '30', '90', '365']
const TOP_N_BAR = 10

function isOrderCompletedStatus(status) {
    const s = String(status || '').toLowerCase()
    return s === 'completed' || s === 'tugallandi' || s === 'tugallangan'
}

function dateInPeriodBounds(d, start, end) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false
    return d >= start && d <= end
}

/** Tugallangan buyurtma uchun hisobot sanasi: `updated_at` (status o‘zgarganda), aks holda `created_at` */
function completionAnchorDate(o) {
    const raw =
        o.updated_at != null && o.updated_at !== ''
            ? o.updated_at
            : o.created_at
    return new Date(raw)
}

/** Savdo trendi: «hammasi» — yaratilgan kun; «tugallangan» — tugallangan (yangilangan) kun */
function orderTrendDayKey(o, orderStatusFilter) {
    if (orderStatusFilter === 'completed') {
        return completionAnchorDate(o).toLocaleDateString('en-CA')
    }
    return new Date(o.created_at).toLocaleDateString('en-CA')
}

function periodFileStamp(start, end) {
    return `${start.toLocaleDateString('en-CA')}_${end.toLocaleDateString('en-CA')}`
}

function csvEscape(cell) {
    const s = String(cell ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
}

function downloadBlob(filename, blob) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
}

function readLs(key, fallback) {
    if (typeof window === 'undefined') return fallback
    try {
        const v = localStorage.getItem(key)
        return v != null && v !== '' ? v : fallback
    } catch {
        return fallback
    }
}

function writeLs(key, value) {
    try {
        localStorage.setItem(key, value)
    } catch {
        /* ignore */
    }
}

const PRINT_CLONE_CLASS = 'crm-stat-print-clone-root'
const PRINT_STYLE_ID = 'crm-stat-print-styles'

/**
 * Chop etish: visibility:hidden butun sahifa balandligini saqlab, ko‘p bo‘sh sahifalar berardi.
 * DOM nusxasini body ga qo‘shib, @media print da faqat uni qoldiramiz.
 */
function printAnalyticsBlock(el) {
    if (typeof document === 'undefined' || !el) return

    const clone = el.cloneNode(true)
    clone.classList.add(PRINT_CLONE_CLASS)
    clone.querySelectorAll('button').forEach((b) => b.remove())

    let style = document.getElementById(PRINT_STYLE_ID)
    if (!style) {
        style = document.createElement('style')
        style.id = PRINT_STYLE_ID
        style.textContent = `
      @media print {
        body > *:not(.${PRINT_CLONE_CLASS}) {
          display: none !important;
        }
        html, body {
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .${PRINT_CLONE_CLASS} {
          display: block !important;
          position: static !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 12px !important;
          box-sizing: border-box !important;
          box-shadow: none !important;
        }
        .${PRINT_CLONE_CLASS} .stat-analytics-print-scroll {
          max-height: none !important;
          overflow: visible !important;
        }
        .${PRINT_CLONE_CLASS} thead {
          position: static !important;
        }
      }
    `
        document.head.appendChild(style)
    }

    document.querySelectorAll(`.${PRINT_CLONE_CLASS}`).forEach((n) => n.remove())

    document.body.appendChild(clone)

    const cleanup = () => {
        clone.remove()
        window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
    window.setTimeout(cleanup, 2500)
}

function startOfDay(d) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}

function endOfDay(d) {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
}

/** Joriy oy YYYY-MM */
function defaultMonthStr() {
    const n = new Date()
    const y = n.getFullYear()
    const m = String(n.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
}

function defaultRangeStrs() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)
    return {
        from: start.toLocaleDateString('en-CA'),
        to: end.toLocaleDateString('en-CA'),
    }
}

/** Buyurtmalar sahifasidagi `parseOrderItemQty` bilan mos: kg/kasr miqdorlar */
function parseItemQty(v) {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
}

/** Mahsulot qatorlari (narx × dona) — kategoriya/mahsulot/kartochka yig‘indilari bir xil asosda */
function sumOrderLineRevenue(order) {
    let s = 0
    for (const item of order?.order_items || []) {
        const q = parseItemQty(item.quantity)
        const lineQty = q > 0 ? q : 1
        s += (Number(item.price) || 0) * lineQty
    }
    return s
}

/** Buyurtmalar sahifasidagi `resolvedOrderItemSizeRaw` bilan mos: model kodi */
function resolvedOrderItemModelCode(oi, productsList) {
    const s = oi?.size != null ? String(oi.size).trim() : ''
    if (s) return s
    const emb = oi?.products
    if (emb && typeof emb === 'object' && emb.size != null && String(emb.size).trim() !== '') {
        return String(emb.size).trim()
    }
    const p =
        oi?.product_id && productsList?.length
            ? productsList.find((x) => String(x.id) === String(oi.product_id))
            : null
    if (p?.size != null && String(p.size).trim() !== '') return String(p.size).trim()
    const nm = (oi?.product_name || oi?.products?.name || '').trim()
    return nm || '—'
}

function formatUsd(amount) {
    const n = Number(amount)
    if (!Number.isFinite(n)) return '0'
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function getPeriodBounds(dateMode, filterRange, monthValue, dateFromStr, dateToStr) {
    const now = new Date()
    if (dateMode === 'month' && monthValue && /^\d{4}-\d{2}$/.test(monthValue)) {
        const [y, m] = monthValue.split('-').map(Number)
        const start = startOfDay(new Date(y, m - 1, 1))
        const end = endOfDay(new Date(y, m, 0))
        return { start, end }
    }
    if (dateMode === 'range' && dateFromStr && dateToStr) {
        let start = startOfDay(new Date(dateFromStr + 'T12:00:00'))
        let end = endOfDay(new Date(dateToStr + 'T12:00:00'))
        if (start > end) [start, end] = [end, start]
        return { start, end }
    }
    const days = VALID_FILTER_RANGES.includes(filterRange) ? parseInt(filterRange, 10) : 30
    const end = endOfDay(now)
    const start = startOfDay(now)
    start.setDate(start.getDate() - (days - 1))
    return { start, end }
}

function financeRowInBounds(f, start, end) {
    const raw = f.date
    if (raw == null || raw === '') return false
    const d = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())
        ? new Date(`${raw.trim()}T12:00:00`)
        : new Date(raw)
    return d >= start && d <= end
}

export default function StatistikaPage() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const [loading, setLoading] = useState(true)
    const [hydrated, setHydrated] = useState(false)
    const [data, setData] = useState({
        orders: [],
        finance: [],
        products: [],
    })
    const [loadError, setLoadError] = useState(null)
    const [partialWarning, setPartialWarning] = useState(null)

    const [dateMode, setDateMode] = useState('preset')
    const [filterRange, setFilterRange] = useState('30')
    const [monthValue, setMonthValue] = useState(defaultMonthStr)
    const [rangeFrom, setRangeFrom] = useState(defaultRangeStrs().from)
    const [rangeTo, setRangeTo] = useState(defaultRangeStrs().to)
    const [orderStatusFilter, setOrderStatusFilter] = useState('completed')

    useEffect(() => {
        const mode = readLs(LS_MODE, 'preset')
        if (['preset', 'month', 'range'].includes(mode)) setDateMode(mode)
        const d = readLs(LS_DAYS, '30')
        if (VALID_FILTER_RANGES.includes(d)) setFilterRange(d)
        const mo = readLs(LS_MONTH, defaultMonthStr())
        if (/^\d{4}-\d{2}$/.test(mo)) setMonthValue(mo)
        const df = readLs(LS_FROM, defaultRangeStrs().from)
        const dt = readLs(LS_TO, defaultRangeStrs().to)
        setRangeFrom(df)
        setRangeTo(dt)
        const st = readLs(LS_STATUS, 'completed')
        if (st === 'all' || st === 'completed') setOrderStatusFilter(st)
        setHydrated(true)
    }, [])

    const loadData = useCallback(async () => {
        try {
            setLoading(true)
            setLoadError(null)
            setPartialWarning(null)
            const transPromise = supabase.from('transactions').select('*')
            const productsPromise = supabase.from('products').select('*')

            const [financeRes, productsRes] = await Promise.all([transPromise, productsPromise])

            if (financeRes.error) {
                console.error('Statistika transactions:', financeRes.error)
            }
            if (productsRes.error) {
                console.error('Statistika products:', productsRes.error)
            }

            let ordersRes = await supabase
                .from('orders')
                .select(
                    `
                *,
                customers (id, name, phone),
                order_items (
                    quantity,
                    price,
                    product_id,
                    product_name,
                    size,
                    products (
                        id,
                        name,
                        size,
                        categories (name)
                    )
                )
            `
                )
                .is('deleted_at', null)
            if (ordersRes.error && isDeletedAtMissingError(ordersRes.error)) {
                ordersRes = await supabase.from('orders').select(
                    `
                *,
                customers (id, name, phone),
                order_items (
                    quantity,
                    price,
                    product_id,
                    product_name,
                    size,
                    products (
                        id,
                        name,
                        size,
                        categories (name)
                    )
                )
            `
                )
            }

            if (ordersRes.error) {
                console.error('Statistika orders:', ordersRes.error)
                const detail = ordersRes.error?.message
                    ? ` — ${ordersRes.error.message}`
                    : ''
                setLoadError(`${t('statistics.loadErrorOrders')}${detail}`)
            }

            if (!ordersRes.error && (financeRes.error || productsRes.error)) {
                const parts = []
                if (financeRes.error) parts.push(t('statistics.loadPartialFinance'))
                if (productsRes.error) parts.push(t('statistics.loadPartialProducts'))
                setPartialWarning(parts.join(' '))
            }

            setData({
                orders: ordersRes.error ? [] : ordersRes.data || [],
                finance: financeRes.error ? [] : financeRes.data || [],
                products: productsRes.error ? [] : productsRes.data || [],
            })
        } catch (error) {
            console.error('Error loading statistika:', error)
            const detail = error?.message ? ` — ${error.message}` : ''
            setLoadError(`${t('statistics.loadErrorGeneric')}${detail}`)
        } finally {
            setLoading(false)
        }
    }, [t])

    useEffect(() => {
        loadData()
    }, [loadData])

    const { start: periodStart, end: periodEnd } = useMemo(
        () => getPeriodBounds(dateMode, filterRange, monthValue, rangeFrom, rangeTo),
        [dateMode, filterRange, monthValue, rangeFrom, rangeTo]
    )

    const locale =
        language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ'

    const periodLabel = useMemo(() => {
        const a = periodStart.toLocaleDateString(locale, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        })
        const b = periodEnd.toLocaleDateString(locale, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        })
        return `${a} — ${b}`
    }, [periodStart, periodEnd, locale])

    const printContextLine = useMemo(() => {
        const statusLabel =
            orderStatusFilter === 'completed'
                ? t('statistics.orderStatusCompleted')
                : t('statistics.orderStatusAll')
        return `${t('statistics.activePeriod')}: ${periodLabel} · ${t('statistics.orderStatusFilter')}: ${statusLabel}`
    }, [orderStatusFilter, periodLabel, t])

    const printRefCategories = useRef(null)
    const printRefProducts = useRef(null)
    const printRefCustomers = useRef(null)
    const printRefCustomerModels = useRef(null)

    /** Davr: buyurtma yaratilgan sana (barcha statuslar uchun «hammasi» rejimi) */
    const ordersCreatedInPeriod = useMemo(
        () =>
            data.orders.filter((o) => dateInPeriodBounds(new Date(o.created_at), periodStart, periodEnd)),
        [data.orders, periodStart, periodEnd]
    )

    /**
     * Davr: tugallangan sana — `orders.updated_at` (status «tugallandi» payti), buyurtmalar jadvalidagi hisobot bilan mos.
     * Faqat `completed` / `tugallandi` / `tugallangan` qatorlar.
     */
    const completedOrdersInPeriod = useMemo(
        () =>
            data.orders.filter(
                (o) =>
                    isOrderCompletedStatus(o.status) &&
                    dateInPeriodBounds(completionAnchorDate(o), periodStart, periodEnd)
            ),
        [data.orders, periodStart, periodEnd]
    )

    const filteredOrders = useMemo(() => {
        if (orderStatusFilter === 'completed') return completedOrdersInPeriod
        return ordersCreatedInPeriod
    }, [orderStatusFilter, completedOrdersInPeriod, ordersCreatedInPeriod])

    const filteredFinance = useMemo(
        () => data.finance.filter((f) => financeRowInBounds(f, periodStart, periodEnd)),
        [data.finance, periodStart, periodEnd]
    )

    const totalIncomeFromCompletedOrders = useMemo(
        () => completedOrdersInPeriod.reduce((sum, o) => sum + sumOrderLineRevenue(o), 0),
        [completedOrdersInPeriod]
    )

    const salesChartData = useMemo(() => {
        const salesTrend = {}
        for (const o of filteredOrders) {
            const day = orderTrendDayKey(o, orderStatusFilter)
            salesTrend[day] = (salesTrend[day] || 0) + sumOrderLineRevenue(o)
        }
        return Object.entries(salesTrend)
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => a.date.localeCompare(b.date))
    }, [filteredOrders, orderStatusFilter])

    /** Kirim: tugallangan buyurtmalar (kun bo‘yicha); chiqim: moliya jadvalidagi xarajatlar */
    const financeChartData = useMemo(() => {
        const trend = {}
        for (const o of completedOrdersInPeriod) {
            const day = completionAnchorDate(o).toLocaleDateString('en-CA')
            if (!trend[day]) trend[day] = { date: day, income: 0, expense: 0 }
            trend[day].income += sumOrderLineRevenue(o)
        }
        for (const f of filteredFinance) {
            if (f.type !== 'expense') continue
            const raw = f.date
            let day = ''
            if (typeof raw === 'string' && raw.trim()) {
                day = raw.trim().slice(0, 10)
            } else if (raw != null && raw !== '') {
                try {
                    day = new Date(raw).toLocaleDateString('en-CA')
                } catch {
                    continue
                }
            }
            if (!day) continue
            if (!trend[day]) trend[day] = { date: day, income: 0, expense: 0 }
            trend[day].expense += Number(f.amount) || 0
        }
        return Object.values(trend).sort((a, b) => a.date.localeCompare(b.date))
    }, [completedOrdersInPeriod, filteredFinance])

    /** Kategoriya: sotilgan dona + qator summasi (diagramma — summa ulushi) */
    const categoryAnalyticsRows = useMemo(() => {
        const map = new Map()
        for (const o of filteredOrders) {
            for (const item of o.order_items || []) {
                const catRaw = item.products?.categories?.name
                const cat =
                    catRaw != null && String(catRaw).trim() !== ''
                        ? String(catRaw).trim()
                        : t('statistics.categoryOther')
                const q = parseItemQty(item.quantity)
                const lineQty = q > 0 ? q : 1
                const amount = (Number(item.price) || 0) * lineQty
                if (!map.has(cat)) {
                    map.set(cat, { key: cat, name: cat, qty: 0, revenue: 0 })
                }
                const r = map.get(cat)
                r.qty += lineQty
                r.revenue += amount
            }
        }
        const list = Array.from(map.values())
        list.sort((a, b) => {
            if (b.qty !== a.qty) return b.qty - a.qty
            return b.revenue - a.revenue
        })
        return list
    }, [filteredOrders, t])

    const categoryData = useMemo(
        () => categoryAnalyticsRows.map((r) => ({ name: r.name, value: r.revenue })),
        [categoryAnalyticsRows]
    )

    /** Kategoriya jadvali/diagramma: mahsulot qatorlari (narx × dona); kartochkalar bilan bir xil asos */
    const revenueFromOrderLines = useMemo(
        () => categoryAnalyticsRows.reduce((sum, r) => sum + r.revenue, 0),
        [categoryAnalyticsRows]
    )
    const categoryTotalsQty = useMemo(
        () => categoryAnalyticsRows.reduce((sum, r) => sum + r.qty, 0),
        [categoryAnalyticsRows]
    )

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

    const totalSales = filteredOrders.reduce((sum, o) => sum + sumOrderLineRevenue(o), 0)
    const totalExpense = filteredFinance
        .filter((f) => f.type === 'expense')
        .reduce((sum, f) => sum + (Number(f.amount) || 0), 0)

    /** Mahsulotlar: katalog + sotuvlar; kam sotilgandan ko‘p sotilgancha, 0 dona oxirida */
    const productAnalyticsRows = useMemo(() => {
        const rows = new Map()
        for (const p of data.products || []) {
            const id = p.id
            const label = (p.name && String(p.name).trim()) || (p.size != null && String(p.size).trim()) || `#${id}`
            rows.set(`pid:${id}`, {
                key: `pid:${id}`,
                productId: id,
                name: label,
                qty: 0,
                revenue: 0,
            })
        }
        for (const o of filteredOrders) {
            for (const item of o.order_items || []) {
                const qty = parseItemQty(item.quantity)
                const q = qty > 0 ? qty : 1
                const rev = (Number(item.price) || 0) * q
                const nm = (item.product_name || item.products?.name || '').trim() || t('common.unknown')
                const pid = item.product_id
                if (pid != null && pid !== '' && rows.has(`pid:${pid}`)) {
                    const r = rows.get(`pid:${pid}`)
                    r.qty += q
                    r.revenue += rev
                } else if (pid != null && pid !== '') {
                    const k = `pid:${pid}`
                    if (!rows.has(k)) {
                        rows.set(k, { key: k, productId: pid, name: nm, qty: 0, revenue: 0 })
                    }
                    const r = rows.get(k)
                    r.qty += q
                    r.revenue += rev
                } else {
                    const k = `name:${nm}`
                    if (!rows.has(k)) {
                        rows.set(k, { key: k, productId: null, name: nm, qty: 0, revenue: 0 })
                    }
                    const r = rows.get(k)
                    r.qty += q
                    r.revenue += rev
                }
            }
        }
        const list = Array.from(rows.values())
        list.sort((a, b) => {
            if (b.qty !== a.qty) return b.qty - a.qty
            return String(a.name).localeCompare(String(b.name), 'uz')
        })
        return list
    }, [data.products, filteredOrders, t])

    const unsoldCount = productAnalyticsRows.filter((r) => r.qty === 0).length

    /** Mijozlar: buyurtma jadvalidagi ism/telefon/id */
    const customerAnalyticsRows = useMemo(() => {
        const map = new Map()
        for (const o of filteredOrders) {
            const nameRaw = (o.customer_name || o.customers?.name || '').trim()
            const phoneRaw = (o.customer_phone || o.customers?.phone || '').trim()
            const name = nameRaw || t('common.unknown')
            const key =
                o.customer_id != null && o.customer_id !== ''
                    ? `cid:${o.customer_id}`
                    : phoneRaw
                      ? `ph:${phoneRaw}`
                      : `nm:${name}`
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    name,
                    phone: phoneRaw || '—',
                    orders: 0,
                    total: 0,
                    itemQty: 0,
                })
            }
            const c = map.get(key)
            c.orders += 1
            c.total += sumOrderLineRevenue(o)
            for (const item of o.order_items || []) {
                const q = parseItemQty(item.quantity)
                c.itemQty += q > 0 ? q : 1
            }
        }
        const list = Array.from(map.values())
        list.sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total
            return b.orders - a.orders
        })
        return list
    }, [filteredOrders, t])

    /** Mijoz × model (katalog kodi): qaysi modeldan qancha olgani */
    const customerModelAnalyticsRows = useMemo(() => {
        const totalByCust = new Map(customerAnalyticsRows.map((c) => [c.key, Number(c.total) || 0]))
        const agg = new Map()

        for (const o of filteredOrders) {
            const nameRaw = (o.customer_name || o.customers?.name || '').trim()
            const phoneRaw = (o.customer_phone || o.customers?.phone || '').trim()
            const name = nameRaw || t('common.unknown')
            const customerKey =
                o.customer_id != null && o.customer_id !== ''
                    ? `cid:${o.customer_id}`
                    : phoneRaw
                      ? `ph:${phoneRaw}`
                      : `nm:${name}`

            for (const item of o.order_items || []) {
                const modelCode = resolvedOrderItemModelCode(item, data.products)
                const q = parseItemQty(item.quantity)
                const lineQty = q > 0 ? q : 1
                const rev = (Number(item.price) || 0) * lineQty
                const rowKey = `${customerKey}|||${modelCode}`
                if (!agg.has(rowKey)) {
                    agg.set(rowKey, {
                        key: rowKey,
                        customerKey,
                        name,
                        phone: phoneRaw || '—',
                        modelCode,
                        qty: 0,
                        revenue: 0,
                    })
                }
                const r = agg.get(rowKey)
                r.qty += lineQty
                r.revenue += rev
            }
        }

        const list = Array.from(agg.values())
        list.sort((a, b) => {
            const ta = totalByCust.get(a.customerKey) ?? 0
            const tb = totalByCust.get(b.customerKey) ?? 0
            if (tb !== ta) return tb - ta
            if (b.qty !== a.qty) return b.qty - a.qty
            return String(a.modelCode).localeCompare(String(b.modelCode), 'uz', { numeric: true, sensitivity: 'base' })
        })
        return list
    }, [customerAnalyticsRows, data.products, filteredOrders, t])

    const topProductsBarData = useMemo(
        () =>
            productAnalyticsRows
                .filter((r) => r.qty > 0)
                .slice(0, TOP_N_BAR)
                .map((r) => ({
                    label: r.name.length > 26 ? `${r.name.slice(0, 24)}…` : r.name,
                    qty: r.qty,
                    full: r.name,
                })),
        [productAnalyticsRows]
    )

    const topCustomersBarData = useMemo(
        () =>
            customerAnalyticsRows.slice(0, TOP_N_BAR).map((r) => ({
                label: r.name.length > 22 ? `${r.name.slice(0, 20)}…` : r.name,
                total: Math.round(Number(r.total) * 100) / 100,
                full: r.name,
            })),
        [customerAnalyticsRows]
    )

    /** Google Gemini API ga yuboriladigan yig‘ma (shaxsiy telefon yo‘q) */
    const crmAiSummary = useMemo(
        () => ({
            periodLabel,
            orderStatusFilter,
            dateMode,
            filterRange,
            monthValue,
            rangeFrom,
            rangeTo,
            ordersInPeriod: filteredOrders.length,
            completedInPeriod: completedOrdersInPeriod.length,
            totalSalesUsd: Math.round(Number(totalSales) * 100) / 100,
            totalIncomeCompletedUsd: Math.round(Number(totalIncomeFromCompletedOrders) * 100) / 100,
            totalExpenseUsd: Math.round(Number(totalExpense) * 100) / 100,
            revenueFromOrderLinesUsd: Math.round(Number(revenueFromOrderLines) * 100) / 100,
            topCategories: categoryAnalyticsRows.slice(0, 6).map((r) => ({
                name: r.name,
                qty: Math.round(r.qty * 1000) / 1000,
                revenue: Math.round(r.revenue * 100) / 100,
            })),
            topProducts: productAnalyticsRows
                .filter((r) => r.qty > 0)
                .slice(0, 6)
                .map((r) => ({
                    name: r.name,
                    qty: Math.round(r.qty * 1000) / 1000,
                    revenue: Math.round(r.revenue * 100) / 100,
                })),
            topCustomers: customerAnalyticsRows.slice(0, 6).map((c) => ({
                name: c.name,
                orders: c.orders,
                totalUsd: Math.round(Number(c.total) * 100) / 100,
            })),
            unsoldCatalogProducts: unsoldCount,
        }),
        [
            periodLabel,
            orderStatusFilter,
            dateMode,
            filterRange,
            monthValue,
            rangeFrom,
            rangeTo,
            filteredOrders.length,
            completedOrdersInPeriod.length,
            totalSales,
            totalIncomeFromCompletedOrders,
            totalExpense,
            revenueFromOrderLines,
            categoryAnalyticsRows,
            productAnalyticsRows,
            customerAnalyticsRows,
            unsoldCount,
        ]
    )

    const exportFileBase = useMemo(
        () => `stat-${periodFileStamp(periodStart, periodEnd)}-${orderStatusFilter}`,
        [periodStart, periodEnd, orderStatusFilter]
    )

    const exportProductsCsv = useCallback(() => {
        const hdr = [
            t('statistics.colRank'),
            t('statistics.colProduct'),
            t('statistics.colQtySold'),
            t('statistics.colRevenue'),
        ]
        const lines = [
            hdr.map(csvEscape).join(','),
            ...productAnalyticsRows.map((row, i) =>
                [i + 1, row.name, row.qty, formatUsd(row.revenue)].map(csvEscape).join(',')
            ),
        ]
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
        downloadBlob(`${exportFileBase}-mahsulotlar.csv`, blob)
    }, [exportFileBase, productAnalyticsRows, t])

    const exportProductsXlsx = useCallback(() => {
        const hdr = [
            t('statistics.colRank'),
            t('statistics.colProduct'),
            t('statistics.colQtySold'),
            t('statistics.colRevenue'),
        ]
        const aoa = [
            hdr,
            ...productAnalyticsRows.map((row, i) => [i + 1, row.name, row.qty, Number(row.revenue) || 0]),
        ]
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Products')
        XLSX.writeFile(wb, `${exportFileBase}-mahsulotlar.xlsx`)
    }, [exportFileBase, productAnalyticsRows, t])

    const exportCategoriesCsv = useCallback(() => {
        const hdr = [
            t('statistics.colRank'),
            t('statistics.colCategory'),
            t('statistics.colQtySold'),
            t('statistics.colRevenue'),
        ]
        const lines = [
            hdr.map(csvEscape).join(','),
            ...categoryAnalyticsRows.map((row, i) =>
                [i + 1, row.name, row.qty, formatUsd(row.revenue)].map(csvEscape).join(',')
            ),
        ]
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
        downloadBlob(`${exportFileBase}-kategoriyalar.csv`, blob)
    }, [categoryAnalyticsRows, exportFileBase, t])

    const exportCategoriesXlsx = useCallback(() => {
        const hdr = [
            t('statistics.colRank'),
            t('statistics.colCategory'),
            t('statistics.colQtySold'),
            t('statistics.colRevenue'),
        ]
        const aoa = [
            hdr,
            ...categoryAnalyticsRows.map((row, i) => [i + 1, row.name, row.qty, Number(row.revenue) || 0]),
        ]
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Categories')
        XLSX.writeFile(wb, `${exportFileBase}-kategoriyalar.xlsx`)
    }, [categoryAnalyticsRows, exportFileBase, t])

    const exportCustomersCsv = useCallback(() => {
        const hdr = [
            t('statistics.colRank'),
            t('statistics.colCustomer'),
            t('statistics.colPhone'),
            t('statistics.colOrdersCount'),
            t('statistics.colItemsQty'),
            t('statistics.colTotalSpent'),
        ]
        const lines = [
            hdr.map(csvEscape).join(','),
            ...customerAnalyticsRows.map((row, i) =>
                [i + 1, row.name, row.phone, row.orders, row.itemQty, formatUsd(row.total)]
                    .map(csvEscape)
                    .join(',')
            ),
        ]
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
        downloadBlob(`${exportFileBase}-mijozlar.csv`, blob)
    }, [customerAnalyticsRows, exportFileBase, t])

    const exportCustomersXlsx = useCallback(() => {
        const hdr = [
            t('statistics.colRank'),
            t('statistics.colCustomer'),
            t('statistics.colPhone'),
            t('statistics.colOrdersCount'),
            t('statistics.colItemsQty'),
            t('statistics.colTotalSpent'),
        ]
        const aoa = [
            hdr,
            ...customerAnalyticsRows.map((row, i) => [
                i + 1,
                row.name,
                row.phone,
                row.orders,
                row.itemQty,
                Number(row.total) || 0,
            ]),
        ]
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Customers')
        XLSX.writeFile(wb, `${exportFileBase}-mijozlar.xlsx`)
    }, [customerAnalyticsRows, exportFileBase, t])

    const exportCustomerModelsCsv = useCallback(() => {
        const hdr = [
            t('statistics.colRank'),
            t('statistics.colCustomer'),
            t('statistics.colPhone'),
            t('statistics.colModelCode'),
            t('statistics.colQtySold'),
            t('statistics.colRevenue'),
        ]
        const lines = [
            hdr.map(csvEscape).join(','),
            ...customerModelAnalyticsRows.map((row, i) =>
                [i + 1, row.name, row.phone, row.modelCode, row.qty, formatUsd(row.revenue)]
                    .map(csvEscape)
                    .join(',')
            ),
        ]
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
        downloadBlob(`${exportFileBase}-mijoz-model.csv`, blob)
    }, [customerModelAnalyticsRows, exportFileBase, t])

    const exportCustomerModelsXlsx = useCallback(() => {
        const hdr = [
            t('statistics.colRank'),
            t('statistics.colCustomer'),
            t('statistics.colPhone'),
            t('statistics.colModelCode'),
            t('statistics.colQtySold'),
            t('statistics.colRevenue'),
        ]
        const aoa = [
            hdr,
            ...customerModelAnalyticsRows.map((row, i) => [
                i + 1,
                row.name,
                row.phone,
                row.modelCode,
                row.qty,
                Number(row.revenue) || 0,
            ]),
        ]
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'CustModels')
        XLSX.writeFile(wb, `${exportFileBase}-mijoz-model.xlsx`)
    }, [customerModelAnalyticsRows, exportFileBase, t])

    function onDateModeChange(next) {
        setDateMode(next)
        writeLs(LS_MODE, next)
    }

    function onFilterRangeChange(next) {
        setFilterRange(next)
        writeLs(LS_DAYS, next)
    }

    function onMonthChange(next) {
        setMonthValue(next)
        writeLs(LS_MONTH, next)
    }

    function onRangeFromChange(next) {
        setRangeFrom(next)
        writeLs(LS_FROM, next)
    }

    function onRangeToChange(next) {
        setRangeTo(next)
        writeLs(LS_TO, next)
    }

    function onOrderStatusFilterChange(next) {
        setOrderStatusFilter(next)
        writeLs(LS_STATUS, next)
    }

    if (!hydrated || loading) {
        return (
            <div className="p-8">
                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
                    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
                    <span className="font-medium text-gray-600">{t('statistics.loading')}</span>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
            <Header title={t('common.statistics')} toggleSidebar={toggleSidebar} />

            <p className="text-xs text-gray-500 mb-4">{t('statistics.hintBuyurtmalar')}</p>

            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between mb-6">
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: 'preset', label: t('statistics.dateModePreset') },
                        { id: 'month', label: t('statistics.dateModeMonth') },
                        { id: 'range', label: t('statistics.dateModeRange') },
                    ].map((btn) => (
                        <button
                            key={btn.id}
                            type="button"
                            onClick={() => onDateModeChange(btn.id)}
                            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                                dateMode === btn.id
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {dateMode === 'preset' ? (
                        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
                            <Calendar size={18} className="text-gray-500 shrink-0" />
                            <select
                                value={filterRange}
                                onChange={(e) => onFilterRangeChange(e.target.value)}
                                className="bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-700 outline-none cursor-pointer"
                            >
                                <option value="7">{t('statistics.last7Days')}</option>
                                <option value="30">{t('statistics.last30Days')}</option>
                                <option value="90">{t('statistics.last3Months')}</option>
                                <option value="365">{t('statistics.last1Year')}</option>
                            </select>
                        </div>
                    ) : null}
                    {dateMode === 'month' ? (
                        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
                            <Calendar size={18} className="text-gray-500" />
                            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">
                                {t('statistics.pickMonth')}
                            </label>
                            <input
                                type="month"
                                value={monthValue}
                                onChange={(e) => onMonthChange(e.target.value)}
                                className="border-0 bg-transparent text-sm font-bold text-gray-800 outline-none"
                            />
                        </div>
                    ) : null}
                    {dateMode === 'range' ? (
                        <div className="flex flex-wrap items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
                            <span className="text-xs font-semibold text-gray-500">{t('statistics.dateFrom')}</span>
                            <input
                                type="date"
                                value={rangeFrom}
                                onChange={(e) => onRangeFromChange(e.target.value)}
                                className="rounded-lg border border-gray-200 px-2 py-1 text-sm font-mono"
                            />
                            <span className="text-xs font-semibold text-gray-500">{t('statistics.dateTo')}</span>
                            <input
                                type="date"
                                value={rangeTo}
                                onChange={(e) => onRangeToChange(e.target.value)}
                                className="rounded-lg border border-gray-200 px-2 py-1 text-sm font-mono"
                            />
                        </div>
                    ) : null}

                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
                        <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">
                            {t('statistics.orderStatusFilter')}
                        </span>
                        <select
                            value={orderStatusFilter}
                            onChange={(e) => onOrderStatusFilterChange(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-800 outline-none cursor-pointer max-w-[11rem]"
                        >
                            <option value="all">{t('statistics.orderStatusAll')}</option>
                            <option value="completed">{t('statistics.orderStatusCompleted')}</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={() => loadData()}
                        className="p-2.5 bg-white hover:bg-gray-50 rounded-xl shadow-sm border border-gray-200 transition-all text-gray-600 hover:text-blue-600"
                        title={t('statistics.refreshData')}
                    >
                        <RefreshCcw size={20} />
                    </button>
                </div>
            </div>

            {loadError ? (
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                    <div className="flex gap-2 min-w-0">
                        <AlertCircle size={20} className="shrink-0 mt-0.5" aria-hidden />
                        <p className="min-w-0 break-words">{loadError}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => loadData()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-800 hover:bg-red-100"
                    >
                        <RefreshCcw size={14} />
                        {t('dashboard.retryLoad')}
                    </button>
                </div>
            ) : null}

            {!loadError && partialWarning ? (
                <div className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <AlertTriangle size={20} className="shrink-0 mt-0.5" aria-hidden />
                    <p className="min-w-0 break-words">{partialWarning}</p>
                </div>
            ) : null}

            <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-950">
                <span className="font-bold">{t('statistics.activePeriod')}:</span>{' '}
                <span className="font-mono tabular-nums">{periodLabel}</span>
                <span className="text-blue-800/80 ml-2">
                    ({t('statistics.ordersInPeriod')}: {filteredOrders.length}; {t('statistics.orderStatusFilter')}:{' '}
                    {orderStatusFilter === 'completed'
                        ? t('statistics.orderStatusCompleted')
                        : t('statistics.orderStatusAll')}
                    )
                </span>
            </div>

            {!loadError ? (
                <CrmAiInsightsPanel t={t} language={language} summary={crmAiSummary} />
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-xl">
                            <ShoppingCart size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-blue-100">{t('statistics.totalSalesPeriod')}</p>
                            <p className="text-2xl font-bold mt-1 font-mono tabular-nums">${formatUsd(totalSales)}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-2xl shadow-lg shadow-green-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-xl">
                            <TrendingUp size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-green-100">{t('statistics.totalIncome')}</p>
                            <p className="text-2xl font-bold mt-1 font-mono tabular-nums">
                                +${formatUsd(totalIncomeFromCompletedOrders)}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-2xl shadow-lg shadow-red-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-xl">
                            <TrendingDown size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-red-100">{t('statistics.totalExpense')}</p>
                            <p className="text-2xl font-bold mt-1 font-mono tabular-nums">-${formatUsd(totalExpense)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-4 text-gray-800">{t('statistics.topProductsBar')}</h3>
                    <div className="h-[320px]">
                        {topProductsBarData.length === 0 ? (
                            <p className="text-sm text-gray-400 py-12 text-center">{t('statistics.noData')}</p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={topProductsBarData}
                                    margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                    <XAxis type="number" tick={{ fontSize: 10 }} />
                                    <YAxis type="category" dataKey="label" width={108} tick={{ fontSize: 9 }} />
                                    <Tooltip
                                        formatter={(v) => [v, t('statistics.chartQtyShort')]}
                                        labelFormatter={(_, p) => (p?.[0]?.payload?.full ? String(p[0].payload.full) : '')}
                                    />
                                    <Bar dataKey="qty" fill="#6366f1" radius={[0, 4, 4, 0]} name={t('statistics.chartQtyShort')} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-4 text-gray-800">{t('statistics.topCustomersBar')}</h3>
                    <div className="h-[320px]">
                        {topCustomersBarData.length === 0 ? (
                            <p className="text-sm text-gray-400 py-12 text-center">{t('statistics.noData')}</p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={topCustomersBarData}
                                    margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                                    <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 9 }} />
                                    <Tooltip
                                        formatter={(v) => [`$${formatUsd(v)}`, t('statistics.colTotalSpent')]}
                                        labelFormatter={(_, p) => (p?.[0]?.payload?.full ? String(p[0].payload.full) : '')}
                                    />
                                    <Bar dataKey="total" fill="#059669" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-800">
                        <TrendingUp size={20} className="text-blue-500" />
                        {t('statistics.salesTrend')}
                    </h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={salesChartData}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10 }}
                                    interval="preserveStartEnd"
                                    tickFormatter={(v) => {
                                        try {
                                            return new Date(v + 'T12:00:00').toLocaleDateString(locale, {
                                                month: 'short',
                                                day: 'numeric',
                                            })
                                        } catch {
                                            return v
                                        }
                                    }}
                                />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={48} />
                                <Tooltip
                                    formatter={(val) => [`$${formatUsd(val)}`, t('statistics.totalSalesPeriod')]}
                                    labelFormatter={(l) => l}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#3b82f6"
                                    fillOpacity={1}
                                    fill="url(#colorSales)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">{t('statistics.incomeExpense')}</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={financeChartData} barSize={20}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 9 }} hide={financeChartData.length > 18} />
                                <YAxis tick={{ fontSize: 10 }} width={44} />
                                <Tooltip
                                    formatter={(val) => `$${formatUsd(val)}`}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    }}
                                    cursor={{ fill: 'transparent' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '12px' }} />
                                <Bar
                                    dataKey="income"
                                    name={t('statistics.chartIncomeFromOrders')}
                                    fill="#10b981"
                                    radius={[4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="expense"
                                    name={t('statistics.chartExpenseFromFinance')}
                                    fill="#ef4444"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div
                    ref={printRefCategories}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col"
                >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <h3 className="text-lg font-bold text-gray-800">{t('statistics.categoryShare')}</h3>
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={exportCategoriesCsv}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
                            >
                                <FileDown size={14} />
                                {t('statistics.exportCategoriesCsv')}
                            </button>
                            <button
                                type="button"
                                onClick={exportCategoriesXlsx}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                            >
                                <FileDown size={14} />
                                {t('statistics.exportCategoriesXlsx')}
                            </button>
                            <button
                                type="button"
                                onClick={() => printAnalyticsBlock(printRefCategories.current)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                                title={t('statistics.printSection')}
                            >
                                <Printer size={14} />
                                {t('statistics.printSection')}
                            </button>
                        </div>
                    </div>
                    <p className="mb-2 hidden print:block text-xs text-gray-700 border-b border-gray-300 pb-2">
                        {printContextLine}
                    </p>
                    <p className="text-xs text-gray-500 mb-3 print:hidden">{t('statistics.categoryTableHint')}</p>
                    <div className="h-[260px] flex items-center justify-center shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={62}
                                    outerRadius={92}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(val) => `$${formatUsd(val)}`} />
                                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <h4 className="text-sm font-bold flex items-center gap-2 text-gray-800 mt-4 mb-2 border-t border-gray-100 pt-4">
                        <FolderTree size={18} className="text-amber-600 shrink-0" />
                        {t('statistics.categoryQtyAnalytics')}
                    </h4>
                    <div className="stat-analytics-print-scroll flex-1 overflow-auto max-h-[280px] rounded-xl border border-gray-100 min-h-0">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 sticky top-0 z-10 text-xs uppercase text-gray-500 font-bold">
                                <tr>
                                    <th className="px-3 py-2 w-10">{t('statistics.colRank')}</th>
                                    <th className="px-3 py-2">{t('statistics.colCategory')}</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">{t('statistics.colQtySold')}</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">{t('statistics.colRevenue')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {categoryAnalyticsRows.map((row, idx) => (
                                    <tr key={row.key} className="hover:bg-amber-50/40">
                                        <td className="px-3 py-2 tabular-nums font-medium">{idx + 1}</td>
                                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[10rem] truncate" title={row.name}>
                                            {row.name}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{row.qty}</td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums">${formatUsd(row.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {categoryAnalyticsRows.length > 0 ? (
                                <tfoot>
                                    <tr className="bg-amber-50/90 font-bold text-gray-900 border-t-2 border-amber-200">
                                        <td className="px-3 py-2.5" colSpan={2}>
                                            {t('statistics.categoryFooterTotal')}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{categoryTotalsQty}</td>
                                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                            ${formatUsd(revenueFromOrderLines)}
                                        </td>
                                    </tr>
                                </tfoot>
                            ) : null}
                        </table>
                        {categoryAnalyticsRows.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">{t('statistics.noData')}</div>
                        ) : null}
                    </div>
                </div>

                <div
                    ref={printRefProducts}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col min-h-[320px]"
                >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                            <Package size={20} className="text-indigo-500" />
                            {t('statistics.productAnalytics')}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={exportProductsCsv}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
                            >
                                <FileDown size={14} />
                                {t('statistics.exportProductsCsv')}
                            </button>
                            <button
                                type="button"
                                onClick={exportProductsXlsx}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100"
                            >
                                <FileDown size={14} />
                                {t('statistics.exportProductsXlsx')}
                            </button>
                            <button
                                type="button"
                                onClick={() => printAnalyticsBlock(printRefProducts.current)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                                title={t('statistics.printSection')}
                            >
                                <Printer size={14} />
                                {t('statistics.printSection')}
                            </button>
                        </div>
                    </div>
                    <p className="mb-2 hidden print:block text-xs text-gray-700 border-b border-gray-300 pb-2">
                        {printContextLine}
                    </p>
                    <p className="text-xs text-gray-500 mb-4 print:hidden">
                        {t('statistics.colUnsold')}: <span className="font-bold text-gray-700">{unsoldCount}</span>
                    </p>
                    <div className="stat-analytics-print-scroll flex-1 overflow-auto max-h-[420px] rounded-xl border border-gray-100">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 sticky top-0 z-10 text-xs uppercase text-gray-500 font-bold">
                                <tr>
                                    <th className="px-3 py-2 w-10">{t('statistics.colRank')}</th>
                                    <th className="px-3 py-2">{t('statistics.colProduct')}</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">{t('statistics.colQtySold')}</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">{t('statistics.colRevenue')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {productAnalyticsRows.map((row, idx) => (
                                    <tr
                                        key={row.key}
                                        className={row.qty === 0 ? 'bg-gray-50/80 text-gray-500' : 'hover:bg-blue-50/40'}
                                    >
                                        <td className="px-3 py-2 tabular-nums font-medium">{idx + 1}</td>
                                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[12rem] truncate" title={row.name}>
                                            {row.name}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{row.qty}</td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums">${formatUsd(row.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {productAnalyticsRows.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">{t('statistics.noData')}</div>
                        ) : null}
                    </div>
                </div>
            </div>

            <div ref={printRefCustomers} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                        <Users size={20} className="text-emerald-600" />
                        {t('statistics.customerAnalytics')}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={exportCustomersCsv}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
                        >
                            <FileDown size={14} />
                            {t('statistics.exportCustomersCsv')}
                        </button>
                        <button
                            type="button"
                            onClick={exportCustomersXlsx}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100"
                        >
                            <FileDown size={14} />
                            {t('statistics.exportCustomersXlsx')}
                        </button>
                        <button
                            type="button"
                            onClick={() => printAnalyticsBlock(printRefCustomers.current)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                            title={t('statistics.printSection')}
                        >
                            <Printer size={14} />
                            {t('statistics.printSection')}
                        </button>
                    </div>
                </div>
                <p className="mb-3 hidden print:block text-xs text-gray-700 border-b border-gray-300 pb-2">
                    {printContextLine}
                </p>
                <div className="stat-analytics-print-scroll overflow-x-auto rounded-xl border border-gray-100 max-h-[480px] overflow-y-auto">
                    <table className="w-full text-sm text-left min-w-[640px]">
                        <thead className="bg-gray-50 sticky top-0 z-10 text-xs uppercase text-gray-500 font-bold">
                            <tr>
                                <th className="px-3 py-2 w-10">{t('statistics.colRank')}</th>
                                <th className="px-3 py-2">{t('statistics.colCustomer')}</th>
                                <th className="px-3 py-2">{t('statistics.colPhone')}</th>
                                <th className="px-3 py-2 text-right">{t('statistics.colOrdersCount')}</th>
                                <th className="px-3 py-2 text-right">{t('statistics.colItemsQty')}</th>
                                <th className="px-3 py-2 text-right">{t('statistics.colTotalSpent')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {customerAnalyticsRows.map((row, idx) => (
                                <tr key={row.key} className="hover:bg-emerald-50/30">
                                    <td className="px-3 py-2 tabular-nums font-medium">{idx + 1}</td>
                                    <td className="px-3 py-2 font-semibold text-gray-900">{row.name}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.phone}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums">{row.orders}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums">{row.itemQty}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-emerald-800">
                                        ${formatUsd(row.total)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {customerAnalyticsRows.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">{t('statistics.noData')}</div>
                    ) : null}
                </div>
            </div>

            <div ref={printRefCustomerModels} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                        <Layers size={20} className="text-violet-600" />
                        {t('statistics.customerModelAnalytics')}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={exportCustomerModelsCsv}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
                        >
                            <FileDown size={14} />
                            {t('statistics.exportCustomerModelsCsv')}
                        </button>
                        <button
                            type="button"
                            onClick={exportCustomerModelsXlsx}
                            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-900 hover:bg-violet-100"
                        >
                            <FileDown size={14} />
                            {t('statistics.exportCustomerModelsXlsx')}
                        </button>
                        <button
                            type="button"
                            onClick={() => printAnalyticsBlock(printRefCustomerModels.current)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                            title={t('statistics.printSection')}
                        >
                            <Printer size={14} />
                            {t('statistics.printSection')}
                        </button>
                    </div>
                </div>
                <p className="mb-2 hidden print:block text-xs text-gray-700 border-b border-gray-300 pb-2">
                    {printContextLine}
                </p>
                <p className="text-xs text-gray-500 mb-4 print:hidden">{t('statistics.customerModelHint')}</p>
                <div className="stat-analytics-print-scroll overflow-x-auto rounded-xl border border-gray-100 max-h-[480px] overflow-y-auto">
                    <table className="w-full text-sm text-left min-w-[720px]">
                        <thead className="bg-gray-50 sticky top-0 z-10 text-xs uppercase text-gray-500 font-bold">
                            <tr>
                                <th className="px-3 py-2 w-10">{t('statistics.colRank')}</th>
                                <th className="px-3 py-2">{t('statistics.colCustomer')}</th>
                                <th className="px-3 py-2">{t('statistics.colPhone')}</th>
                                <th className="px-3 py-2">{t('statistics.colModelCode')}</th>
                                <th className="px-3 py-2 text-right">{t('statistics.colQtySold')}</th>
                                <th className="px-3 py-2 text-right">{t('statistics.colRevenue')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {customerModelAnalyticsRows.map((row, idx) => (
                                <tr key={row.key} className="hover:bg-violet-50/30">
                                    <td className="px-3 py-2 tabular-nums font-medium">{idx + 1}</td>
                                    <td className="px-3 py-2 font-semibold text-gray-900">{row.name}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.phone}</td>
                                    <td className="px-3 py-2 font-mono text-xs font-medium text-gray-800 max-w-[14rem] truncate" title={row.modelCode}>
                                        {row.modelCode}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums">{row.qty}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums">${formatUsd(row.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {customerModelAnalyticsRows.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">{t('statistics.noData')}</div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
