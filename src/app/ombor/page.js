'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import {
    Package,
    RefreshCcw,
    Search,
    Filter,
    Download,
    Printer,
    X,
    Palette,
    ClipboardList,
} from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import * as XLSX from 'xlsx'
import {
    numStock,
    listProductColors,
    parseStockByColor,
    sumStockByColor,
    buildStockByColorMap,
} from '@/lib/stockByColor'
import {
    mergeProductInventoryRow,
    deriveInventoryStatusFromQty,
} from '@/lib/productInventoryMerge'

const ALL_CATEGORIES = '__all__'
const OUTFLOW_ALL_PRODUCTS = '__all__'
const OUTFLOW_RANGE_ALL = 'all'
const OUTFLOW_RANGE_TODAY = 'today'
const OUTFLOW_RANGE_7D = '7d'
const OUTFLOW_RANGE_30D = '30d'

/** Katalog: asosan `sale_price`, eski qatorlar uchun `price` */
function unitPriceUzs(p) {
    const sp = Number(p?.sale_price)
    if (Number.isFinite(sp) && sp >= 0) return sp
    const pr = Number(p?.price)
    return Number.isFinite(pr) && pr >= 0 ? pr : 0
}

/** Modal uchun: har bir rang va dona */
function getColorBreakdownRows(product) {
    if (!product) return []
    const map = buildStockByColorMap(product)
    return listProductColors(product).map((c) => ({
        color: c,
        qty: Math.max(0, Math.floor(Number(map[c]) || 0)),
    }))
}

/** `size` maydoni = katalogdagi mahsulot kodi (SKU) */
function findProductByCode(products, raw) {
    const q = String(raw || '').trim().toLowerCase()
    if (!q) return null
    const matches = products.filter((p) => String(p.size || '').trim().toLowerCase() === q)
    if (matches.length >= 1) return matches[0]
    return null
}

export default function Ombor() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert, showToast } = useDialog()
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterCategory, setFilterCategory] = useState(ALL_CATEGORIES)
    /** Ranglar bo'yicha miqdor — modal oynada */
    const [colorBreakdownProduct, setColorBreakdownProduct] = useState(null)

    /** Omborga qo'shish: kod orqali */
    const [addWarehouseOpen, setAddWarehouseOpen] = useState(false)
    const [addCodeInput, setAddCodeInput] = useState('')
    const [addWarehouseProduct, setAddWarehouseProduct] = useState(null)
    const [addWarehouseDraft, setAddWarehouseDraft] = useState({})
    const [addWarehouseSingleQty, setAddWarehouseSingleQty] = useState(0)
    const [addWarehouseError, setAddWarehouseError] = useState(null)
    const [addWarehouseSaving, setAddWarehouseSaving] = useState(false)
    /** So'nggi buyurtma chiqimlari (stock_movements: type=sale) */
    const [orderOutflows, setOrderOutflows] = useState([])
    const [orderOutflowsLoading, setOrderOutflowsLoading] = useState(false)
    const [orderOutflowsError, setOrderOutflowsError] = useState(null)
    const [outflowSearchTerm, setOutflowSearchTerm] = useState('')
    const [outflowProductFilter, setOutflowProductFilter] = useState(OUTFLOW_ALL_PRODUCTS)
    const [outflowRange, setOutflowRange] = useState(OUTFLOW_RANGE_30D)

    const locale = language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US'

    useEffect(() => {
        loadData()
    }, [])

    async function loadRecentOrderOutflows() {
        setOrderOutflowsError(null)
        setOrderOutflowsLoading(true)
        try {
            let rows = null
            const primary = await supabase
                .from('stock_movements')
                .select('id, created_at, product_id, order_id, change_amount, color_key, reason, type')
                .eq('type', 'sale')
                .order('created_at', { ascending: false })
                .limit(30)
            if (!primary.error) {
                rows = primary.data || []
            } else {
                const msg = String(primary.error?.message || '')
                if (/color_key|order_id|column|does not exist|42703/i.test(msg)) {
                    const fb = await supabase
                        .from('stock_movements')
                        .select('id, created_at, product_id, change_amount, reason, type')
                        .eq('type', 'sale')
                        .order('created_at', { ascending: false })
                        .limit(30)
                    if (fb.error) throw fb.error
                    rows = fb.data || []
                } else {
                    throw primary.error
                }
            }

            const orderIds = [...new Set((rows || []).map((r) => r.order_id).filter(Boolean))]
            const orderMeta = {}
            if (orderIds.length > 0) {
                const tries = ['id, order_number, customer_name', 'id, order_number', 'id']
                for (const sel of tries) {
                    const q = await supabase.from('orders').select(sel).in('id', orderIds)
                    if (q.error) {
                        const m = String(q.error?.message || q.error?.code || '')
                        if (/column|does not exist|42703/i.test(m)) continue
                        break
                    }
                    for (const o of q.data || []) {
                        orderMeta[o.id] = {
                            order_number: o.order_number || null,
                            customer_name: o.customer_name || null,
                        }
                    }
                    break
                }
            }

            setOrderOutflows(
                (rows || []).map((r) => {
                    const qty = Math.abs(Math.floor(Number(r.change_amount) || 0))
                    const ref = r.order_id ? orderMeta[r.order_id] : null
                    return {
                        id: r.id,
                        created_at: r.created_at,
                        product_id: r.product_id,
                        order_id: r.order_id || null,
                        order_number: ref?.order_number || null,
                        customer_name: ref?.customer_name || null,
                        qty,
                        color_key: r.color_key || null,
                        reason: r.reason || '',
                    }
                })
            )
        } catch (error) {
            console.error('loadRecentOrderOutflows:', error)
            setOrderOutflows([])
            setOrderOutflowsError(error?.message || String(error))
        } finally {
            setOrderOutflowsLoading(false)
        }
    }

    async function loadData() {
        setLoadError(null)
        try {
            setLoading(true)
            const primary = await supabase
                .from('products')
                .select(
                    '*, categories(name), product_inventory(quantity, stock_by_color, status)'
                )
                .order('name', { ascending: true })

            let rows = []
            if (!primary.error) {
                rows = (primary.data || []).map(mergeProductInventoryRow)
            } else {
                const fb = await supabase
                    .from('products')
                    .select('*, categories(name)')
                    .order('name', { ascending: true })
                if (fb.error) throw fb.error
                rows = fb.data || []
            }

            setProducts(rows)
            await loadRecentOrderOutflows()
        } catch (error) {
            console.error('Error loading inventory:', error)
            setLoadError(error?.message || String(error))
        } finally {
            setLoading(false)
        }
    }

    async function saveStockByColor(product, draftMap) {
        const colors = listProductColors(product)
        if (!colors.length) return false
        const prev = numStock(product.stock)
        const clean = {}
        for (const c of colors) {
            const v = draftMap[c]
            clean[c] = Math.max(0, Math.floor(Number(v) || 0))
        }
        const nextTotal = sumStockByColor(clean)
        const change = nextTotal - prev
        const reasonLine = colors.map((c) => `${c}: ${clean[c]}`).join('; ')
        try {
            const { error: invError } = await supabase.from('product_inventory').upsert(
                {
                    product_id: product.id,
                    quantity: nextTotal,
                    stock_by_color: clean,
                    status: deriveInventoryStatusFromQty(nextTotal),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'product_id' }
            )

            if (invError) throw invError

            if (change !== 0) {
                const { error: moveError } = await supabase.from('stock_movements').insert([
                    {
                        product_id: product.id,
                        change_amount: change,
                        previous_stock: prev,
                        new_stock: nextTotal,
                        reason: `Ombor (ranglar): ${reasonLine}`,
                        type: change > 0 ? 'restock' : 'manual_adjustment',
                    },
                ])
                if (moveError) console.warn('Movement log failed:', moveError)
            }

            setProducts((prev) =>
                prev.map((m) =>
                    m.id === product.id ? { ...m, stock: nextTotal, stock_by_color: clean } : m
                )
            )
            showToast(t('warehouse.updateSuccess') || 'Saqlandi', { type: 'success' })
            return true
        } catch (error) {
            console.error('saveStockByColor:', error)
            const msg = error?.message || String(error)
            const hint = /stock_by_color|column|does not exist|42703/i.test(msg)
                ? `\n\nSupabase: ${t('warehouse.stockByColorHint')}`
                : ''
            void showAlert(`${t('common.saveError')}${hint}`, { variant: 'error' })
            return false
        }
    }

    async function saveAbsoluteStock(product, nextTotalRaw) {
        const prev = numStock(product.stock)
        const next = Math.max(0, Math.floor(Number(nextTotalRaw) || 0))
        const change = next - prev
        try {
            const { error: invError } = await supabase.from('product_inventory').upsert(
                {
                    product_id: product.id,
                    quantity: next,
                    stock_by_color: null,
                    status: deriveInventoryStatusFromQty(next),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'product_id' }
            )

            if (invError) throw invError

            if (change !== 0) {
                const { error: moveError } = await supabase.from('stock_movements').insert([
                    {
                        product_id: product.id,
                        change_amount: change,
                        previous_stock: prev,
                        new_stock: next,
                        reason: `Ombor (kod orqali): jami ${next} dona`,
                        type: change > 0 ? 'restock' : 'manual_adjustment',
                    },
                ])
                if (moveError) console.warn('Movement log failed:', moveError)
            }

            setProducts((prevList) =>
                prevList.map((m) =>
                    m.id === product.id ? { ...m, stock: next, stock_by_color: null } : m
                )
            )
            showToast(t('warehouse.updateSuccess') || 'Saqlandi', { type: 'success' })
            return true
        } catch (error) {
            console.error('saveAbsoluteStock:', error)
            const msg = error?.message || String(error)
            const hint = /stock/i.test(msg) ? `\n\n${t('warehouse.stockColumnHint')}` : ''
            void showAlert(`${t('common.saveError')}${hint}`, { variant: 'error' })
            return false
        }
    }

    const resolveAddWarehouseProduct = useCallback(() => {
        setAddWarehouseError(null)
        const found = findProductByCode(products, addCodeInput)
        if (!found) {
            setAddWarehouseProduct(null)
            setAddWarehouseDraft({})
            setAddWarehouseSingleQty(0)
            setAddWarehouseError(t('warehouse.addNotFound'))
            return
        }
        setAddWarehouseProduct(found)
        const cols = listProductColors(found)
        if (cols.length > 0) {
            setAddWarehouseDraft(buildStockByColorMap(found))
        } else {
            setAddWarehouseSingleQty(numStock(found.stock))
        }
    }, [products, addCodeInput, t])

    const handleAddWarehouseSave = useCallback(async () => {
        if (!addWarehouseProduct) return
        const latest = products.find((p) => p.id === addWarehouseProduct.id) || addWarehouseProduct
        setAddWarehouseSaving(true)
        try {
            const cols = listProductColors(latest)
            let ok = false
            if (cols.length > 0) {
                ok = await saveStockByColor(latest, addWarehouseDraft)
            } else {
                ok = await saveAbsoluteStock(latest, addWarehouseSingleQty)
            }
            if (!ok) return
            setAddWarehouseOpen(false)
            setAddWarehouseProduct(null)
            setAddCodeInput('')
            setAddWarehouseDraft({})
            setAddWarehouseSingleQty(0)
            setAddWarehouseError(null)
        } finally {
            setAddWarehouseSaving(false)
        }
    }, [
        addWarehouseProduct,
        products,
        addWarehouseDraft,
        addWarehouseSingleQty,
    ])

    const categoryOptions = useMemo(() => {
        const uniq = [...new Set(products.map((m) => m.categories?.name || m.category).filter(Boolean))]
        return [{ value: ALL_CATEGORIES, label: t('warehouse.allCategories') }, ...uniq.map((c) => ({ value: c, label: c }))]
    }, [products, t])
    const productById = useMemo(
        () => Object.fromEntries(products.map((p) => [String(p.id), p])),
        [products]
    )
    const outflowProductOptions = useMemo(() => {
        const ids = [...new Set(orderOutflows.map((x) => String(x.product_id || '')).filter(Boolean))]
        return ids
            .map((id) => ({
                value: id,
                label: productById[id]?.name || `${t('common.unknown')} (${id})`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'uz', { sensitivity: 'base' }))
    }, [orderOutflows, productById, t])
    const filteredOrderOutflows = useMemo(() => {
        const q = outflowSearchTerm.trim().toLowerCase()
        const now = Date.now()
        let minTs = null
        if (outflowRange === OUTFLOW_RANGE_TODAY) {
            const d = new Date()
            d.setHours(0, 0, 0, 0)
            minTs = d.getTime()
        } else if (outflowRange === OUTFLOW_RANGE_7D) {
            minTs = now - 7 * 24 * 60 * 60 * 1000
        } else if (outflowRange === OUTFLOW_RANGE_30D) {
            minTs = now - 30 * 24 * 60 * 60 * 1000
        }
        return orderOutflows.filter((row) => {
            if (
                outflowProductFilter !== OUTFLOW_ALL_PRODUCTS &&
                String(row.product_id || '') !== outflowProductFilter
            ) {
                return false
            }
            if (minTs != null) {
                const ts = row.created_at ? new Date(row.created_at).getTime() : 0
                if (!Number.isFinite(ts) || ts < minTs) return false
            }
            if (!q) return true
            const p = productById[String(row.product_id || '')]
            const haystack = [
                row.order_number,
                row.order_id,
                row.customer_name,
                row.color_key,
                row.reason,
                p?.name,
                p?.size,
            ]
                .map((v) => String(v || '').toLowerCase())
                .join(' ')
            return haystack.includes(q)
        })
    }, [orderOutflows, outflowSearchTerm, outflowProductFilter, outflowRange, productById])

    /** Qidiruv + kategoriya — barcha mahsulotlar (zaxira 0 ham) */
    const filteredInventory = useMemo(() => {
        const q = searchTerm.toLowerCase()
        return products.filter((m) => {
            const matchesSearch = (m.name || '').toLowerCase().includes(q)
            const catName = m.categories?.name || m.category
            const matchesCategory = filterCategory === ALL_CATEGORIES || catName === filterCategory
            return matchesSearch && matchesCategory
        })
    }, [products, searchTerm, filterCategory])

    /** Fizik ombor: shu filtrda zaxirasi borlar, tartib — kategoriya, nom */
    const physicalStockFiltered = useMemo(() => {
        return [...filteredInventory]
            .filter((m) => numStock(m.stock) > 0)
            .sort((a, b) => {
                const ca = String(a.categories?.name || a.category || '').localeCompare(
                    String(b.categories?.name || b.category || ''),
                    'uz',
                    { sensitivity: 'base' }
                )
                if (ca !== 0) return ca
                return String(a.name || '').localeCompare(String(b.name || ''), 'uz', { sensitivity: 'base' })
            })
    }, [filteredInventory])

    const physicalTotals = useMemo(() => {
        let units = 0
        let value = 0
        for (const m of physicalStockFiltered) {
            const q = numStock(m.stock)
            units += q
            value += q * unitPriceUzs(m)
        }
        return { units, value: Math.round(value * 100) / 100 }
    }, [physicalStockFiltered])

    /**
     * Fizik ombor jadvali: mahsulot qatorlari + har kategoriya oxirida oraliq jami
     */
    const physicalRowsFlat = useMemo(() => {
        const list = physicalStockFiltered
        if (!list.length) return []
        const catKey = (m) => String(m?.categories?.name || m?.category || '').trim() || '—'
        const out = []
        let displayIdx = 0
        let i = 0
        while (i < list.length) {
            const firstCat = catKey(list[i])
            let subUnits = 0
            let subVal = 0
            const start = i
            while (i < list.length && catKey(list[i]) === firstCat) {
                const p = list[i]
                const q = numStock(p.stock)
                const price = unitPriceUzs(p)
                const line = Math.round(q * price * 100) / 100
                subUnits += q
                subVal += line
                displayIdx += 1
                out.push({
                    kind: 'product',
                    key: String(p.id),
                    product: p,
                    displayIndex: displayIdx,
                    q,
                    price,
                    line,
                })
                i++
            }
            out.push({
                kind: 'subtotal',
                key: `sub-${firstCat}-${start}`,
                category: firstCat,
                units: subUnits,
                value: Math.round(subVal * 100) / 100,
            })
        }
        return out
    }, [physicalStockFiltered])

    const colorBreakdownRows = useMemo(
        () => (colorBreakdownProduct ? getColorBreakdownRows(colorBreakdownProduct) : []),
        [colorBreakdownProduct]
    )

    const exportToExcel = useCallback(() => {
        const buildFullRow = (p) => {
            const cols = listProductColors(p)
            const byColor = parseStockByColor(p)
            const jsonCol =
                cols.length > 0
                    ? JSON.stringify(
                          cols.reduce((acc, c) => {
                              acc[c] = byColor[c] != null ? byColor[c] : 0
                              return acc
                          }, {})
                      )
                    : ''
            return {
                Nomi: p.name,
                Kategoriya: p.categories?.name || p.category || '-',
                'Mavjud (dona)': numStock(p.stock),
                [t('warehouse.exportStockByColorCol')]: jsonCol,
                'Min. Zaxira': p.min_stock || 10,
                'Sotuv narxi': unitPriceUzs(p),
                Holati:
                    numStock(p.stock) === 0
                        ? 'Tugagan'
                        : numStock(p.stock) < (p.min_stock || 10)
                          ? 'Kam qolgan'
                          : 'Yetarli',
            }
        }

        const buildPhysicalRow = (p) => {
            const q = numStock(p.stock)
            const price = unitPriceUzs(p)
            return {
                [t('warehouse.excelColName')]: p.name,
                [t('warehouse.excelColCategory')]: p.categories?.name || p.category || '—',
                [t('warehouse.excelColQty')]: q,
                [t('warehouse.excelColUnitPrice')]: price,
                [t('warehouse.excelColLineValue')]: Math.round(q * price * 100) / 100,
            }
        }

        const wb = XLSX.utils.book_new()
        const wsAll = XLSX.utils.json_to_sheet(filteredInventory.map(buildFullRow))
        XLSX.utils.book_append_sheet(wb, wsAll, t('warehouse.excelSheetAll'))

        const physData = []
        for (const r of physicalRowsFlat) {
            if (r.kind === 'product') {
                physData.push(buildPhysicalRow(r.product))
            } else {
                physData.push({
                    [t('warehouse.excelColName')]: t('warehouse.excelCategorySubtotalLabel').replace(
                        '{cat}',
                        r.category
                    ),
                    [t('warehouse.excelColCategory')]: '',
                    [t('warehouse.excelColQty')]: r.units,
                    [t('warehouse.excelColUnitPrice')]: '—',
                    [t('warehouse.excelColLineValue')]: r.value,
                })
            }
        }
        if (physData.length > 0) {
            physData.push({
                [t('warehouse.excelColName')]: t('warehouse.excelGrandTotalLabel'),
                [t('warehouse.excelColCategory')]: '',
                [t('warehouse.excelColQty')]: physicalTotals.units,
                [t('warehouse.excelColUnitPrice')]: '—',
                [t('warehouse.excelColLineValue')]: physicalTotals.value,
            })
        }
        const wsPhys = XLSX.utils.json_to_sheet(
            physData.length > 0
                ? physData
                : [{ [t('warehouse.excelColName')]: t('warehouse.physicalEmptyExport') }]
        )
        XLSX.utils.book_append_sheet(wb, wsPhys, t('warehouse.excelSheetPhysical'))

        XLSX.writeFile(wb, `Ombor_Hisoboti_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }, [filteredInventory, physicalRowsFlat, physicalTotals, t])

    const printPhysicalTable = useCallback(() => {
        if (physicalStockFiltered.length === 0) {
            void showToast(t('warehouse.printEmpty'), { type: 'warning' })
            return
        }
        window.print()
    }, [physicalStockFiltered.length, showToast, t])

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-6 pb-20 print:max-w-none print:px-4 print:pb-4">
            <div className="no-print">
                <Header title={t('warehouse.title')} toggleSidebar={toggleSidebar} />
            </div>

            <div className="no-print mb-4 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-950">
                <p className="font-semibold text-sky-900">{t('warehouse.introLead')}</p>
                <p className="mt-1 text-sky-900/85 leading-relaxed">{t('warehouse.introDetail')}</p>
                <p className="mt-2 text-sky-900/90 text-xs font-medium border-t border-sky-200/80 pt-2">
                    {t('warehouse.introTwoTables')}
                </p>
            </div>

            <p className="no-print mb-4 text-sm text-gray-600">
                <Link
                    href="/mahsulotlar"
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                >
                    {t('dashboard.crossLinkToProducts')} →
                </Link>
            </p>

            {loadError ? (
                <div className="no-print mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                        <p className="break-words">
                            <span className="font-semibold">{t('dashboard.loadErrorTitle')}</span> {loadError}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadData()}
                        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
                    >
                        {t('dashboard.retryLoad')}
                    </button>
                </div>
            ) : null}

            <section className="no-print mb-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-black text-slate-900">{t('warehouse.outflowTitle')}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{t('warehouse.outflowSubtitle')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadData()}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                        <RefreshCcw size={14} />
                        {t('warehouse.refresh')}
                    </button>
                </div>
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                            <input
                                type="text"
                                value={outflowSearchTerm}
                                onChange={(e) => setOutflowSearchTerm(e.target.value)}
                                placeholder={t('warehouse.outflowSearchPlaceholder')}
                                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                            />
                        </div>
                        <select
                            value={outflowProductFilter}
                            onChange={(e) => setOutflowProductFilter(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
                        >
                            <option value={OUTFLOW_ALL_PRODUCTS}>{t('warehouse.outflowFilterAllProducts')}</option>
                            {outflowProductOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { key: OUTFLOW_RANGE_TODAY, label: t('warehouse.outflowRangeToday') },
                            { key: OUTFLOW_RANGE_7D, label: t('warehouse.outflowRangeWeek') },
                            { key: OUTFLOW_RANGE_30D, label: t('warehouse.outflowRangeMonth') },
                            { key: OUTFLOW_RANGE_ALL, label: t('warehouse.outflowRangeAll') },
                        ].map((r) => (
                            <button
                                key={r.key}
                                type="button"
                                onClick={() => setOutflowRange(r.key)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                    outflowRange === r.key
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>
                {orderOutflowsLoading ? (
                    <div className="px-5 py-10 text-sm text-slate-500">{t('common.loading')}</div>
                ) : orderOutflowsError ? (
                    <div className="px-5 py-4 text-sm text-amber-800 bg-amber-50 border-t border-amber-100">
                        {t('warehouse.outflowLoadError')}: {orderOutflowsError}
                    </div>
                ) : orderOutflows.length === 0 ? (
                    <div className="px-5 py-10 text-sm text-slate-500">{t('warehouse.outflowEmpty')}</div>
                ) : filteredOrderOutflows.length === 0 ? (
                    <div className="px-5 py-10 text-sm text-slate-500">{t('warehouse.outflowEmptyFiltered')}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-black">
                                    <th className="px-4 py-3 text-left">{t('warehouse.outflowDateCol')}</th>
                                    <th className="px-4 py-3 text-left">{t('warehouse.outflowOrderCol')}</th>
                                    <th className="px-4 py-3 text-left">{t('warehouse.outflowProductCol')}</th>
                                    <th className="px-4 py-3 text-left">{t('warehouse.outflowColorCol')}</th>
                                    <th className="px-4 py-3 text-right">{t('warehouse.outflowQtyCol')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredOrderOutflows.map((row) => {
                                    const p = productById[String(row.product_id)]
                                    const orderLabel = row.order_number
                                        ? `№${row.order_number}`
                                        : row.order_id
                                          ? `#${String(row.order_id).slice(0, 8)}`
                                          : '—'
                                    return (
                                        <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                                            <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                                                {row.created_at
                                                    ? new Date(row.created_at).toLocaleString(locale)
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <p className="font-semibold text-slate-900">{orderLabel}</p>
                                                {row.customer_name ? (
                                                    <p className="text-xs text-slate-500">{row.customer_name}</p>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <p className="font-semibold text-slate-900">{p?.name || t('common.unknown')}</p>
                                                <p className="text-xs text-slate-500">{p?.size || row.product_id || '—'}</p>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-700">{row.color_key || '—'}</td>
                                            <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-700">
                                                -{row.qty}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <div className="no-print mb-6">
                <button
                    type="button"
                    onClick={() => {
                        setAddWarehouseOpen(true)
                        setAddCodeInput('')
                        setAddWarehouseProduct(null)
                        setAddWarehouseDraft({})
                        setAddWarehouseSingleQty(0)
                        setAddWarehouseError(null)
                    }}
                    className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-200/80 transition hover:bg-emerald-700 active:scale-[0.99]"
                >
                    <ClipboardList size={22} />
                    {t('warehouse.addToWarehouseButton')}
                </button>
            </div>

            <div className="no-print sticky top-0 z-30 space-y-4 bg-gray-50/80 backdrop-blur-md pt-2 pb-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder={t('warehouse.searchPlaceholder')}
                            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-gray-50 px-4 rounded-xl border border-transparent focus-within:bg-white focus-within:border-blue-500 transition-all flex-1 md:flex-none">
                            <Filter size={20} className="text-gray-500" />
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="bg-transparent py-3 outline-none text-gray-700 font-bold cursor-pointer w-full text-sm"
                            >
                                {categoryOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={() => void loadData()}
                            className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition-colors border border-transparent hover:border-gray-200"
                            title={t('warehouse.refresh')}
                        >
                            <RefreshCcw size={20} />
                        </button>

                        <button
                            type="button"
                            onClick={printPhysicalTable}
                            disabled={physicalStockFiltered.length === 0}
                            className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl transition-all border border-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
                            title={t('warehouse.printTableHint')}
                        >
                            <Printer size={20} />
                            <span className="hidden sm:inline">{t('warehouse.printTable')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={exportToExcel}
                            className="flex items-center gap-2 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl transition-all border border-emerald-200"
                        >
                            <Download size={20} />
                            <span className="hidden sm:inline">{t('common.export') || 'Eksport'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Fizik ombor — Excel uslubidagi alohida jadval (faqat zaxirasi 0 dan ortiq) */}
            <section className="mb-10 warehouse-print-section print:break-inside-auto">
                <div className="mb-4 hidden print:block border-b-2 border-gray-800 pb-3">
                    <p className="text-xl font-black text-gray-900">{t('warehouse.physicalStockTitle')}</p>
                    <p className="text-sm text-gray-700 mt-1">
                        {t('warehouse.printGeneratedAt')}: {new Date().toLocaleString(locale)}
                    </p>
                    <p className="text-xs text-gray-600 mt-2 leading-snug">{t('warehouse.printFilterNote')}</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3 no-print">
                    <div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">
                            {t('warehouse.physicalStockTitle')}
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">{t('warehouse.physicalStockSubtitle')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 justify-end">
                        {physicalStockFiltered.length > 0 ? (
                            <p className="text-sm font-bold text-emerald-700 tabular-nums">
                                {t('warehouse.physicalTotalsInline')
                                    .replace('{units}', String(physicalTotals.units))
                                    .replace('{value}', physicalTotals.value.toLocaleString(locale))}
                            </p>
                        ) : null}
                        <button
                            type="button"
                            onClick={printPhysicalTable}
                            disabled={physicalStockFiltered.length === 0}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                            title={t('warehouse.printTableHint')}
                        >
                            <Printer size={18} />
                            {t('warehouse.printTable')}
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto print:overflow-visible rounded-xl border border-gray-300 bg-white shadow-sm">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600 font-black border-b border-gray-300">
                                <th className="border border-gray-200 px-3 py-2.5 w-10 text-center">#</th>
                                <th className="border border-gray-200 px-3 py-2.5 text-left min-w-[180px]">
                                    {t('warehouse.product')}
                                </th>
                                <th className="border border-gray-200 px-3 py-2.5 text-left min-w-[120px]">
                                    {t('warehouse.category')}
                                </th>
                                <th className="border border-gray-200 px-3 py-2.5 text-right tabular-nums">
                                    {t('warehouse.excelColQty')}
                                </th>
                                <th className="border border-gray-200 px-3 py-2.5 text-right tabular-nums">
                                    {t('warehouse.price')}
                                </th>
                                <th className="border border-gray-200 px-3 py-2.5 text-right tabular-nums min-w-[110px]">
                                    {t('warehouse.excelColLineValue')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {physicalRowsFlat.map((entry) => {
                                if (entry.kind === 'subtotal') {
                                    return (
                                        <tr
                                            key={entry.key}
                                            className="bg-amber-50/95 font-bold text-amber-950 border-t-2 border-amber-200"
                                        >
                                            <td className="border border-gray-200 px-3 py-2.5 text-center text-amber-700/70 font-mono text-xs">
                                                —
                                            </td>
                                            <td
                                                colSpan={2}
                                                className="border border-gray-200 px-3 py-2.5 text-right text-xs uppercase tracking-wide"
                                            >
                                                {t('warehouse.categorySubtotalLabel').replace(
                                                    '{cat}',
                                                    entry.category
                                                )}
                                            </td>
                                            <td className="border border-gray-200 px-3 py-2.5 text-right font-mono tabular-nums">
                                                {entry.units}
                                            </td>
                                            <td className="border border-gray-200 px-3 py-2.5 text-center text-amber-800/60 text-xs">
                                                —
                                            </td>
                                            <td className="border border-gray-200 px-3 py-2.5 text-right font-mono tabular-nums text-amber-900">
                                                {entry.value.toLocaleString(locale)}
                                            </td>
                                        </tr>
                                    )
                                }
                                const row = entry.product
                                return (
                                    <tr
                                        key={entry.key}
                                        className="hover:bg-emerald-50/40 cursor-pointer"
                                        title={t('warehouse.colorBreakdownClickHint')}
                                        onClick={() => setColorBreakdownProduct(row)}
                                    >
                                        <td className="border border-gray-200 px-3 py-2 text-center text-gray-500 font-mono">
                                            {entry.displayIndex}
                                        </td>
                                        <td className="border border-gray-200 px-3 py-2 font-semibold text-gray-900">
                                            {row.name}
                                        </td>
                                        <td className="border border-gray-200 px-3 py-2 text-gray-700">
                                            {row.categories?.name || row.category || '—'}
                                        </td>
                                        <td className="border border-gray-200 px-3 py-2 text-right font-mono font-bold tabular-nums">
                                            {entry.q}
                                        </td>
                                        <td className="border border-gray-200 px-3 py-2 text-right font-mono tabular-nums">
                                            {entry.price.toLocaleString(locale)}
                                        </td>
                                        <td className="border border-gray-200 px-3 py-2 text-right font-mono font-semibold tabular-nums text-emerald-800">
                                            {entry.line.toLocaleString(locale)}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        {physicalStockFiltered.length > 0 ? (
                            <tfoot>
                                <tr className="bg-emerald-100/90 font-black text-emerald-950">
                                    <td
                                        colSpan={3}
                                        className="border border-gray-300 px-3 py-3 text-right uppercase tracking-wide text-xs"
                                    >
                                        {t('warehouse.excelGrandTotalLabel')}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-3 text-right font-mono tabular-nums">
                                        {physicalTotals.units}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-3 text-center text-gray-500">—</td>
                                    <td className="border border-gray-300 px-3 py-3 text-right font-mono tabular-nums">
                                        {physicalTotals.value.toLocaleString(locale)}
                                    </td>
                                </tr>
                            </tfoot>
                        ) : null}
                    </table>
                </div>
                {physicalStockFiltered.length === 0 ? (
                    <p className="text-sm text-gray-500 mt-2 italic no-print">{t('warehouse.physicalEmpty')}</p>
                ) : null}
            </section>

            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 landscape;
                        margin: 12mm;
                    }
                    .no-print {
                        display: none !important;
                    }
                    body {
                        background: white !important;
                    }
                    .warehouse-print-section {
                        max-width: 100%;
                    }
                    .warehouse-print-section table {
                        font-size: 10px;
                    }
                    .warehouse-print-section tr {
                        break-inside: avoid;
                    }
                }
            `}</style>

            {colorBreakdownProduct && (
                <div className="no-print fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => setColorBreakdownProduct(null)}
                    />
                    <div
                        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-violet-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-4 p-6 border-b border-gray-100 bg-gradient-to-r from-violet-50/80 to-white">
                            {colorBreakdownProduct.image_url ? (
                                <img
                                    src={colorBreakdownProduct.image_url}
                                    alt=""
                                    className="w-16 h-16 rounded-xl object-cover border border-gray-100 shrink-0"
                                />
                            ) : (
                                <div className="w-16 h-16 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                                    <Package className="text-violet-600" size={28} />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <h3 className="text-lg font-black text-gray-900 leading-tight">
                                    {t('warehouse.colorBreakdownModalTitle')}
                                </h3>
                                <p className="text-sm font-semibold text-violet-700 mt-1 line-clamp-2">
                                    {colorBreakdownProduct.name}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setColorBreakdownProduct(null)}
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 shrink-0"
                                aria-label={t('common.close')}
                            >
                                <X size={22} />
                            </button>
                        </div>
                        <div className="p-6">
                            {colorBreakdownRows.length > 0 ? (
                                <>
                                    <div className="overflow-hidden rounded-xl border border-gray-200">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-black">
                                                    <th className="text-left px-4 py-2.5 border-b border-gray-200">
                                                        {t('warehouse.colorBreakdownColorCol')}
                                                    </th>
                                                    <th className="text-right px-4 py-2.5 border-b border-gray-200 tabular-nums">
                                                        {t('warehouse.colorBreakdownQtyCol')}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {colorBreakdownRows.map(({ color, qty }) => (
                                                    <tr key={color} className="border-b border-gray-100 last:border-0">
                                                        <td className="px-4 py-3 font-medium text-gray-900">{color}</td>
                                                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-violet-900">
                                                            {qty}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-violet-50/90 font-black text-violet-950">
                                                    <td className="px-4 py-3 text-xs uppercase tracking-wide">
                                                        {t('warehouse.colorBreakdownTotal')}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                                                        {numStock(colorBreakdownProduct.stock)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-3">
                                        {t('warehouse.colorBreakdownFooterNote')}
                                    </p>
                                </>
                            ) : (
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center">
                                    <p className="text-sm font-bold text-gray-700">
                                        {t('warehouse.colorBreakdownNoVariants')}
                                    </p>
                                    <p className="text-3xl font-black tabular-nums text-violet-800 mt-2">
                                        {numStock(colorBreakdownProduct.stock)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">{t('warehouse.colorBreakdownSingleLabel')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {addWarehouseOpen ? (
                <div className="no-print fixed inset-0 z-[101] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => {
                            setAddWarehouseOpen(false)
                            setAddWarehouseProduct(null)
                            setAddWarehouseError(null)
                        }}
                    />
                    <div
                        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-emerald-100 animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-100 bg-gradient-to-r from-emerald-50/90 to-white">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">{t('warehouse.addModalTitle')}</h3>
                                <p className="text-sm text-gray-600 mt-1">{t('warehouse.addModalLead')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setAddWarehouseOpen(false)
                                    setAddWarehouseProduct(null)
                                    setAddWarehouseError(null)
                                }}
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 shrink-0"
                                aria-label={t('common.close')}
                            >
                                <X size={22} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                                    {t('warehouse.addCodeLabel')}
                                </label>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        value={addCodeInput}
                                        onChange={(e) => setAddCodeInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                resolveAddWarehouseProduct()
                                            }
                                        }}
                                        placeholder={t('warehouse.addCodePlaceholder')}
                                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-500 outline-none font-mono font-semibold"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => resolveAddWarehouseProduct()}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-900 shrink-0"
                                    >
                                        <Search size={18} />
                                        {t('warehouse.addSearchButton')}
                                    </button>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2">{t('warehouse.addCodeHint')}</p>
                            </div>

                            {addWarehouseError ? (
                                <p className="text-sm font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                    {addWarehouseError}
                                </p>
                            ) : null}

                            {addWarehouseProduct ? (
                                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-4">
                                    <div className="flex gap-4">
                                        {addWarehouseProduct.image_url ? (
                                            <img
                                                src={addWarehouseProduct.image_url}
                                                alt=""
                                                className="w-24 h-24 rounded-xl object-cover border border-gray-200 bg-white shrink-0"
                                            />
                                        ) : (
                                            <div className="w-24 h-24 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                                                <Package className="text-gray-400" size={36} />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-black text-gray-900 leading-snug">{addWarehouseProduct.name}</p>
                                            <p className="text-xs font-bold text-emerald-700 mt-1">
                                                {t('warehouse.addResolvedCode').replace(
                                                    '{code}',
                                                    String(addWarehouseProduct.size || '—')
                                                )}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {addWarehouseProduct.categories?.name ||
                                                    addWarehouseProduct.category ||
                                                    '—'}
                                            </p>
                                        </div>
                                    </div>

                                    {listProductColors(addWarehouseProduct).length > 0 ? (
                                        <>
                                            <p className="text-xs font-black text-violet-900 flex items-center gap-2">
                                                <Palette size={16} />
                                                {t('warehouse.stockByColor')}
                                            </p>
                                            <div className="grid sm:grid-cols-2 gap-3">
                                                {listProductColors(addWarehouseProduct).map((cn) => (
                                                    <label
                                                        key={cn}
                                                        className="flex flex-col gap-1 bg-white rounded-xl border border-violet-100 px-3 py-2 shadow-sm"
                                                    >
                                                        <span className="text-[10px] font-black uppercase text-gray-500">
                                                            {cn}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step={1}
                                                            value={addWarehouseDraft[cn] ?? 0}
                                                            onChange={(e) => {
                                                                const v = Math.max(
                                                                    0,
                                                                    Math.floor(Number(e.target.value) || 0)
                                                                )
                                                                setAddWarehouseDraft((prev) => ({
                                                                    ...prev,
                                                                    [cn]: v,
                                                                }))
                                                            }}
                                                            className="w-full px-2 py-2 border border-gray-200 rounded-lg font-mono font-bold text-lg tabular-nums"
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                            <p className="text-sm text-gray-700">
                                                <span className="font-bold">{t('warehouse.stockTotalFromColors')}:</span>{' '}
                                                <span className="font-mono tabular-nums text-violet-800">
                                                    {sumStockByColor(addWarehouseDraft)}
                                                </span>
                                            </p>
                                        </>
                                    ) : (
                                        <label className="block">
                                            <span className="text-xs font-bold text-gray-600">{t('warehouse.stock')}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={addWarehouseSingleQty}
                                                onChange={(e) =>
                                                    setAddWarehouseSingleQty(
                                                        Math.max(0, Math.floor(Number(e.target.value) || 0))
                                                    )
                                                }
                                                className="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 font-mono font-bold text-xl tabular-nums"
                                            />
                                        </label>
                                    )}

                                    <div className="flex flex-wrap gap-2 pt-2">
                                        <button
                                            type="button"
                                            disabled={addWarehouseSaving}
                                            onClick={() => void handleAddWarehouseSave()}
                                            className="flex-1 min-w-[120px] px-5 py-3 rounded-xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700 disabled:opacity-60"
                                        >
                                            {addWarehouseSaving ? '…' : t('warehouse.addSaveButton')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAddWarehouseOpen(false)
                                                setAddWarehouseProduct(null)
                                                setAddWarehouseError(null)
                                            }}
                                            className="px-5 py-3 rounded-xl border border-gray-200 font-bold text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
