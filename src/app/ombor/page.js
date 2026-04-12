'use client'

import { useEffect, useState, useMemo, useRef, Fragment } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { 
    Plus, AlertTriangle, TrendingUp, Package, RefreshCcw, 
    Minus, Search, Filter, History, Download, Settings, 
    X, ChevronDown, ChevronUp, Hash, Layers, Palette
} from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import StockAdjustDialog from '@/components/StockAdjustDialog'
import * as XLSX from 'xlsx'

const ALL_CATEGORIES = '__all__'

function numStock(v) {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, n) : 0
}

/** Katalog: asosan `sale_price`, eski qatorlar uchun `price` */
function unitPriceUzs(p) {
    const sp = Number(p?.sale_price)
    if (Number.isFinite(sp) && sp >= 0) return sp
    const pr = Number(p?.price)
    return Number.isFinite(pr) && pr >= 0 ? pr : 0
}

/** Katalogdagi ranglar ro'yxati (colors[] yoki color) */
function listProductColors(p) {
    const arr = Array.isArray(p?.colors) ? p.colors : []
    const names = arr.map((c) => String(c ?? '').trim()).filter(Boolean)
    const uniq = [...new Set(names)]
    if (uniq.length) return uniq
    const legacy = p?.color != null ? String(p.color).trim() : ''
    return legacy ? [legacy] : []
}

function parseStockByColor(p) {
    const raw = p?.stock_by_color
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const o = {}
        for (const [k, v] of Object.entries(raw)) {
            const n = Number(v)
            if (Number.isFinite(n) && n >= 0) o[k] = Math.floor(n)
        }
        return o
    }
    return {}
}

function sumStockByColor(map) {
    if (!map || typeof map !== 'object') return 0
    return Object.values(map).reduce((s, n) => s + (Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0), 0)
}

/** Ko'rsatish / tahrir: rang kalitlari bilan; DB bo'sh bo'lsa joriy jami ranglarga taqsimlanadi */
function buildStockByColorMap(product) {
    const colors = listProductColors(product)
    if (!colors.length) return {}
    const fromDb = parseStockByColor(product)
    const out = {}
    let sumDb = 0
    for (const c of colors) {
        const v = fromDb[c]
        const n = v != null && Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0
        out[c] = n
        sumDb += n
    }
    if (sumDb > 0) return out
    const total = numStock(product.stock)
    if (total <= 0) return Object.fromEntries(colors.map((c) => [c, 0]))
    const per = Math.floor(total / colors.length)
    let rem = total - per * colors.length
    colors.forEach((c, i) => {
        out[c] = per + (i === 0 ? rem : 0)
    })
    return out
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
    const [adjustingProduct, setAdjustingProduct] = useState(null)
    const [historyProduct, setHistoryProduct] = useState(null)
    const [historyData, setHistoryData] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [collapsedCategories, setCollapsedCategories] = useState({})
    /** mahsulot id -> rang bo'yicha zaxira (tahrir) */
    const [colorDrafts, setColorDrafts] = useState({})
    const [expandedColorRows, setExpandedColorRows] = useState({})

    const sectionRefs = useRef({})

    const locale = language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US'

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setLoadError(null)
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('products')
                .select('*, categories(name)')
                .order('name', { ascending: true })

            if (error) throw error
            setProducts(data || [])
        } catch (error) {
            console.error('Error loading inventory:', error)
            setLoadError(error?.message || String(error))
        } finally {
            setLoading(false)
        }
    }

    async function updateStock(id, currentStock, change, reason = '') {
        const base = numStock(currentStock)
        const newStock = Math.max(0, base + change)
        
        try {
            // 1. Update product stock
            const { error: productError } = await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', id)

            if (productError) throw productError

            // 2. Log movement (if reason or substantial change)
            const type = change > 0 ? 'restock' : 'manual_adjustment'
            const { error: moveError } = await supabase
                .from('stock_movements')
                .insert([{
                    product_id: id,
                    change_amount: change,
                    previous_stock: base,
                    new_stock: newStock,
                    reason: reason || (change > 0 ? 'Manual increase' : 'Manual decrease'),
                    type: type
                }])
            
            // We don't throw for movement errors to keep it resilient, 
            // but logging is preferred.
            if (moveError) console.warn('Movement log failed:', moveError)

            setProducts((prev) => prev.map((m) => (m.id === id ? { ...m, stock: newStock } : m)))
            showToast(t('common.saveSuccess') || 'Saqlandi', { type: 'success' })
        } catch (error) {
            console.error('Error updating stock:', error)
            const msg = error?.message || String(error)
            const hint = /stock/i.test(msg) ? `\n\n${t('warehouse.stockColumnHint')}` : ''
            void showAlert(`${t('common.saveError')}${hint}`, { variant: 'error' })
        }
    }

    async function saveStockByColor(product, draftMap) {
        const colors = listProductColors(product)
        if (!colors.length) return
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
            const { error: productError } = await supabase
                .from('products')
                .update({ stock: nextTotal, stock_by_color: clean })
                .eq('id', product.id)

            if (productError) throw productError

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
            setColorDrafts((d) => ({ ...d, [product.id]: clean }))
            showToast(t('warehouse.updateSuccess') || 'Saqlandi', { type: 'success' })
        } catch (error) {
            console.error('saveStockByColor:', error)
            const msg = error?.message || String(error)
            const hint = /stock_by_color|column|does not exist|42703/i.test(msg)
                ? `\n\nSupabase: ${t('warehouse.stockByColorHint')}`
                : ''
            void showAlert(`${t('common.saveError')}${hint}`, { variant: 'error' })
        }
    }

    function toggleColorRow(product) {
        const id = product.id
        const open = !expandedColorRows[id]
        setExpandedColorRows((prev) => ({ ...prev, [id]: open }))
        if (open) {
            setColorDrafts((prev) => ({ ...prev, [id]: buildStockByColorMap(product) }))
        }
    }

    async function loadHistory(productId) {
        setHistoryLoading(true)
        try {
            const { data, error } = await supabase
                .from('stock_movements')
                .select('*')
                .eq('product_id', productId)
                .order('created_at', { ascending: false })
                .limit(20)
            
            if (error) throw error
            setHistoryData(data || [])
        } catch (err) {
            console.error('History load failed:', err)
        } finally {
            setHistoryLoading(false)
        }
    }

    const exportToExcel = () => {
        const wsData = products.map((p) => {
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
        })

        const ws = XLSX.utils.json_to_sheet(wsData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Ombor')
        XLSX.writeFile(wb, `Ombor_Hisoboti_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    const categoryOptions = useMemo(() => {
        const uniq = [...new Set(products.map((m) => m.categories?.name || m.category).filter(Boolean))]
        return [{ value: ALL_CATEGORIES, label: t('warehouse.allCategories') }, ...uniq.map((c) => ({ value: c, label: c }))]
    }, [products, t])

    const filteredInventory = useMemo(() => {
        const q = searchTerm.toLowerCase()
        return products.filter((m) => {
            const matchesSearch = (m.name || '').toLowerCase().includes(q)
            const catName = m.categories?.name || m.category
            const matchesCategory = filterCategory === ALL_CATEGORIES || catName === filterCategory
            return matchesSearch && matchesCategory
        })
    }, [products, searchTerm, filterCategory])

    const lowStockItems = useMemo(
        () => products.filter((m) => numStock(m.stock) < (m.min_stock || 10)),
        [products]
    )
    const outOfStockItems = useMemo(
        () => products.filter((m) => numStock(m.stock) === 0),
        [products]
    )
    const totalInventoryValue = useMemo(
        () => products.reduce((sum, m) => sum + numStock(m.stock) * unitPriceUzs(m), 0),
        [products]
    )

    const groupedInventory = useMemo(() => {
        const groups = {}
        filteredInventory.forEach(item => {
            const cat = item.categories?.name || item.category || 'Boshqa'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(item)
        })
        return groups
    }, [filteredInventory])

    const toggleCollapse = (cat) => {
        setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
    }

    const scrollToSection = (cat) => {
        sectionRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

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
        <div className="max-w-7xl mx-auto px-6 pb-20">
            <Header title={t('warehouse.title')} toggleSidebar={toggleSidebar} />

            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-950">
                <p className="font-semibold text-sky-900">{t('warehouse.introLead')}</p>
                <p className="mt-1 text-sky-900/85 leading-relaxed">{t('warehouse.introDetail')}</p>
            </div>

            <p className="mb-4 text-sm text-gray-600">
                <Link
                    href="/mahsulotlar"
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                >
                    {t('dashboard.crossLinkToProducts')} →
                </Link>
            </p>

            {loadError ? (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">{t('warehouse.totalProducts')}</p>
                            <p className="text-3xl font-bold mt-2">{products.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Package className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white p-6 rounded-2xl shadow-lg shadow-yellow-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-yellow-100">{t('warehouse.lowStock')}</p>
                            <p className="text-3xl font-bold mt-2">{lowStockItems.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <TrendingUp className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-2xl shadow-lg shadow-red-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-red-100">{t('warehouse.outOfStock')}</p>
                            <p className="text-3xl font-bold mt-2">{outOfStockItems.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <AlertTriangle className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-2xl shadow-lg shadow-green-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-green-100">{t('warehouse.inventoryValue')}</p>
                            <p className="text-3xl font-bold mt-2">{totalInventoryValue.toLocaleString(locale)}</p>
                            <p className="text-xs font-medium text-green-100/90 mt-1">{t('warehouse.inventoryValueHint')}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <TrendingUp className="text-white" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="sticky top-0 z-30 space-y-4 bg-gray-50/80 backdrop-blur-md pt-2 pb-4">
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
                            onClick={exportToExcel}
                            className="flex items-center gap-2 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl transition-all border border-emerald-200"
                        >
                            <Download size={20} />
                            <span className="hidden sm:inline">{t('common.export') || 'Eksport'}</span>
                        </button>
                    </div>
                </div>

                {/* Category Quick Jump Chips */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                        <Layers size={18} />
                    </div>
                    {Object.keys(groupedInventory).sort().map(cat => (
                        <button
                            key={cat}
                            onClick={() => scrollToSection(cat)}
                            className="shrink-0 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-full text-sm font-bold hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm active:scale-95"
                        >
                            {cat} <span className="ml-1 opacity-50 text-xs">{groupedInventory[cat].length}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-8 mt-4">
                {Object.keys(groupedInventory).length > 0 ? (
                    Object.keys(groupedInventory).sort().map(cat => {
                        const items = groupedInventory[cat]
                        const isCollapsed = collapsedCategories[cat]
                        const catValue = items.reduce((sum, m) => sum + numStock(m.stock) * unitPriceUzs(m), 0)

                        return (
                            <div 
                                key={cat} 
                                ref={el => sectionRefs.current[cat] = el}
                                className="scroll-mt-40 transition-all"
                            >
                                <div className="flex items-center justify-between mb-4 group cursor-pointer" onClick={() => toggleCollapse(cat)}>
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-200 ring-4 ring-blue-50">
                                            <Hash size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">
                                                {cat}
                                            </h3>
                                            <div className="flex items-center gap-3 mt-1 text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                <span>{items.length} turdagi tovar</span>
                                                <span className="w-1 h-1 rounded-full bg-gray-300" />
                                                <span className="text-emerald-600">Qiymat: {catValue.toLocaleString(locale)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                                        {isCollapsed ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
                                    </button>
                                </div>

                                {!isCollapsed && (
                                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50/50 border-b border-gray-100 text-[10px] uppercase tracking-widest text-gray-400 font-black">
                                                        <th className="px-6 py-4">{t('warehouse.product')}</th>
                                                        <th className="px-6 py-4">{t('warehouse.stock')}</th>
                                                        <th className="px-6 py-4">{t('warehouse.price')}</th>
                                                        <th className="px-6 py-4">{t('warehouse.status')}</th>
                                                        <th className="px-6 py-4 text-right">Amallar</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {items.map((item) => {
                                                        const colorList = listProductColors(item)
                                                        const hasColors = colorList.length > 0
                                                        const stockNum = numStock(item.stock)
                                                        const priceNum = unitPriceUzs(item)
                                                        const isLow = stockNum < (item.min_stock || 10)
                                                        const expanded = !!expandedColorRows[item.id]
                                                        const draft = colorDrafts[item.id] || buildStockByColorMap(item)
                                                        return (
                                                            <Fragment key={item.id}>
                                                                <tr className="hover:bg-blue-50/30 transition-colors group">
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="relative">
                                                                                {item.image_url ? (
                                                                                    <img
                                                                                        src={item.image_url}
                                                                                        alt={item.name}
                                                                                        className="w-12 h-12 rounded-xl object-cover bg-gray-100 border border-gray-100 shadow-sm"
                                                                                    />
                                                                                ) : (
                                                                                    <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 border border-gray-100">
                                                                                        <Package size={24} />
                                                                                    </div>
                                                                                )}
                                                                                {isLow && (
                                                                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full" />
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <div className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                                                    {item.name}
                                                                                </div>
                                                                                <div className="text-[10px] font-bold text-gray-400 uppercase mt-0.5 tracking-tighter">
                                                                                    KOD: {item.size || "Noma'lum"}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex flex-col gap-1">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span
                                                                                    className={`font-black text-xl tabular-nums ${isLow ? 'text-red-500' : 'text-gray-900'}`}
                                                                                >
                                                                                    {stockNum}
                                                                                </span>
                                                                                {hasColors && (
                                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 text-[10px] font-black uppercase border border-violet-100">
                                                                                        <Palette size={12} />
                                                                                        {colorList.length}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {hasColors && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => toggleColorRow(item)}
                                                                                    className="text-left text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 w-fit"
                                                                                >
                                                                                    {expanded ? (
                                                                                        <ChevronUp size={14} />
                                                                                    ) : (
                                                                                        <ChevronDown size={14} />
                                                                                    )}
                                                                                    {expanded
                                                                                        ? t('warehouse.stockByColorCollapse')
                                                                                        : t('warehouse.stockByColorExpand')}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 font-mono font-bold text-gray-700 tabular-nums">
                                                                        {priceNum.toLocaleString(locale)}
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        {stockNum === 0 ? (
                                                                            <span className="px-3 py-1 bg-red-50 text-red-700 text-[10px] font-black rounded-lg uppercase tracking-wider border border-red-100">
                                                                                {t('warehouse.soldOut')}
                                                                            </span>
                                                                        ) : isLow ? (
                                                                            <span className="px-3 py-1 bg-yellow-50 text-yellow-700 text-[10px] font-black rounded-lg uppercase tracking-wider border border-yellow-100">
                                                                                {t('warehouse.almostOut')}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-lg uppercase tracking-wider border border-emerald-100">
                                                                                {t('warehouse.enough')}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-4 text-right">
                                                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setHistoryProduct(item)
                                                                                    loadHistory(item.id)
                                                                                }}
                                                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                                                                title={t('warehouse.viewHistory')}
                                                                            >
                                                                                <History size={18} />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => !hasColors && setAdjustingProduct(item)}
                                                                                disabled={hasColors}
                                                                                className={`p-2 rounded-lg transition-colors ${hasColors ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'}`}
                                                                                title={
                                                                                    hasColors
                                                                                        ? t('warehouse.stockByColorHint')
                                                                                        : t('warehouse.adjustStockTitle')
                                                                                }
                                                                            >
                                                                                <Settings size={18} />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    !hasColors &&
                                                                                    updateStock(item.id, item.stock, -1, 'Ombor: 1 dona kamaytirildi')
                                                                                }
                                                                                disabled={hasColors}
                                                                                className={`p-2 rounded-lg transition-colors ${hasColors ? 'text-gray-200 cursor-not-allowed' : 'text-red-500 hover:bg-red-50'}`}
                                                                                title={
                                                                                    hasColors
                                                                                        ? t('warehouse.stockByColorHint')
                                                                                        : t('warehouse.minusStockTitle')
                                                                                }
                                                                            >
                                                                                <Minus size={18} />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    !hasColors &&
                                                                                    updateStock(item.id, item.stock, 1, "Ombor: 1 dona qo'shildi")
                                                                                }
                                                                                disabled={hasColors}
                                                                                className={`p-2 rounded-lg transition-colors ${hasColors ? 'text-gray-200 cursor-not-allowed' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                                                                title={
                                                                                    hasColors
                                                                                        ? t('warehouse.stockByColorHint')
                                                                                        : t('warehouse.plusStockTitle')
                                                                                }
                                                                            >
                                                                                <Plus size={18} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {hasColors && expanded && (
                                                                    <tr className="bg-violet-50/40 border-b border-violet-100">
                                                                        <td colSpan={5} className="px-6 py-4">
                                                                            <p className="text-xs font-bold text-violet-900 mb-3 flex items-center gap-2">
                                                                                <Palette size={16} />
                                                                                {t('warehouse.stockByColor')}
                                                                            </p>
                                                                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                                                                                {colorList.map((cn) => (
                                                                                    <label
                                                                                        key={cn}
                                                                                        className="flex flex-col gap-1 bg-white rounded-xl border border-violet-100 px-3 py-2 shadow-sm"
                                                                                    >
                                                                                        <span className="text-[10px] font-black uppercase text-gray-500 tracking-tight">
                                                                                            {cn}
                                                                                        </span>
                                                                                        <input
                                                                                            type="number"
                                                                                            min={0}
                                                                                            step={1}
                                                                                            value={draft[cn] ?? 0}
                                                                                            onChange={(e) => {
                                                                                                const v = Math.max(
                                                                                                    0,
                                                                                                    Math.floor(Number(e.target.value) || 0)
                                                                                                )
                                                                                                setColorDrafts((prev) => ({
                                                                                                    ...prev,
                                                                                                    [item.id]: {
                                                                                                        ...(prev[item.id] || draft),
                                                                                                        [cn]: v,
                                                                                                    },
                                                                                                }))
                                                                                            }}
                                                                                            className="w-full px-2 py-2 border border-gray-200 rounded-lg font-mono font-bold text-lg tabular-nums"
                                                                                        />
                                                                                    </label>
                                                                                ))}
                                                                            </div>
                                                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                <p className="text-sm text-gray-700">
                                                                                    <span className="font-bold">{t('warehouse.stockTotalFromColors')}:</span>{' '}
                                                                                    <span className="font-mono tabular-nums text-violet-800">
                                                                                        {sumStockByColor(draft)}
                                                                                    </span>
                                                                                </p>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => saveStockByColor(item, draft)}
                                                                                    className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-black rounded-xl shadow-md"
                                                                                >
                                                                                    {t('warehouse.stockByColorSave')}
                                                                                </button>
                                                                            </div>
                                                                            <p className="text-[11px] text-gray-500 mt-2">{t('warehouse.stockByColorHint')}</p>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </Fragment>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })
                ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center text-gray-400">
                        <div className="flex flex-col items-center">
                            <Package size={64} className="mb-4 opacity-10" />
                            <p className="font-bold text-lg">{t('warehouse.noProducts')}</p>
                            <p className="text-sm opacity-60">Qidiruv yoki filtrlarni o'zgartirib ko'ring</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Low stock alert section removed as per user request */}

            {/* Custom Styles for sticky and no-scrollbar */}
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {adjustingProduct && (
                <StockAdjustDialog
                    product={adjustingProduct}
                    onClose={() => setAdjustingProduct(null)}
                    onConfirm={(amount, reason) => 
                        updateStock(adjustingProduct.id, adjustingProduct.stock, amount, reason)
                    }
                />
            )}

            {historyProduct && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div 
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
                        onClick={() => setHistoryProduct(null)}
                    />
                    <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden min-h-[500px] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-8 border-b border-gray-50 bg-gray-50/50">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">{t('warehouse.stockHistory') || 'Zaxira tarixi'}</h3>
                                <p className="text-sm font-bold text-blue-600 mt-1 uppercase tracking-widest">{historyProduct.name}</p>
                            </div>
                            <button 
                                onClick={() => setHistoryProduct(null)}
                                className="p-3 hover:bg-white rounded-full transition-all shadow-sm group"
                            >
                                <X size={24} className="text-gray-400 group-hover:text-red-500" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-4">
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                </div>
                            ) : historyData.length > 0 ? (
                                historyData.map((record) => (
                                    <div key={record.id} className="flex gap-5 p-5 rounded-2xl border border-gray-100 bg-white hover:border-blue-100 transition-colors">
                                        <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${record.change_amount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                            {record.change_amount > 0 ? <Plus size={24} /> : <Minus size={24} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <span className={`text-xl font-black tabular-nums ${record.change_amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {record.change_amount > 0 ? '+' : ''}{record.change_amount}
                                                    </span>
                                                    <span className="mx-3 text-gray-200">|</span>
                                                    <span className="text-sm font-bold text-gray-500 tabular-nums">
                                                        {record.previous_stock} → {record.new_stock}
                                                    </span>
                                                </div>
                                                <time className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                    {new Date(record.created_at).toLocaleString(locale)}
                                                </time>
                                            </div>
                                            <p className="text-sm text-gray-700 mt-2 font-medium leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                "{record.reason || 'Siz tomondan o\'zgartirildi'}"
                                            </p>
                                            <div className="mt-3 text-[10px] uppercase tracking-widest font-black text-gray-300">
                                                Harakat turi: {record.type.replace('_', ' ')}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                                    <History size={64} className="mb-6 opacity-5" />
                                    <p className="font-bold text-lg">{t('warehouse.noHistory') || 'Hozircha harakatlar tarixi mavjud emas'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
