'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, AlertTriangle, TrendingUp, Package, RefreshCcw, Minus, Search, Filter } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'

const ALL_CATEGORIES = '__all__'

function numStock(v) {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

/** Katalog: asosan `sale_price`, eski qatorlar uchun `price` */
function unitPriceUzs(p) {
    const sp = Number(p?.sale_price)
    if (Number.isFinite(sp) && sp >= 0) return sp
    const pr = Number(p?.price)
    return Number.isFinite(pr) && pr >= 0 ? pr : 0
}

export default function Ombor() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert } = useDialog()
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterCategory, setFilterCategory] = useState(ALL_CATEGORIES)

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
                .select('*')
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

    async function updateStock(id, currentStock, change) {
        const base = numStock(currentStock)
        const newStock = Math.max(0, base + change)
        try {
            const { error } = await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', id)

            if (error) throw error
            setProducts((prev) => prev.map((m) => (m.id === id ? { ...m, stock: newStock } : m)))
        } catch (error) {
            console.error('Error updating stock:', error)
            const msg = error?.message || String(error)
            const hint = /stock/i.test(msg) ? `\n\n${t('warehouse.stockColumnHint')}` : ''
            void showAlert(`${t('common.saveError')}${hint}`, { variant: 'error' })
        }
    }

    const categoryOptions = useMemo(() => {
        const uniq = [...new Set(products.map((m) => m.category).filter(Boolean))]
        return [{ value: ALL_CATEGORIES, label: t('warehouse.allCategories') }, ...uniq.map((c) => ({ value: c, label: c }))]
    }, [products, t])

    const filteredInventory = useMemo(() => {
        const q = searchTerm.toLowerCase()
        return products.filter((m) => {
            const matchesSearch = (m.name || '').toLowerCase().includes(q)
            const matchesCategory = filterCategory === ALL_CATEGORIES || m.category === filterCategory
            return matchesSearch && matchesCategory
        })
    }, [products, searchTerm, filterCategory])

    const lowStockItems = useMemo(
        () => products.filter((m) => numStock(m.stock) < 10),
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
        <div className="max-w-7xl mx-auto px-6">
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
                        {/stock/i.test(loadError) ? (
                            <p className="mt-2 text-xs text-amber-900/90 leading-relaxed">{t('warehouse.stockColumnHint')}</p>
                        ) : null}
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

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder={t('warehouse.searchPlaceholder')}
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all"
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
                            className="bg-transparent py-3 outline-none text-gray-700 font-medium cursor-pointer w-full"
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
                        type="button"
                    >
                        <RefreshCcw size={20} />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                <th className="px-6 py-4 rounded-tl-2xl">{t('warehouse.product')}</th>
                                <th className="px-6 py-4">{t('warehouse.category')}</th>
                                <th className="px-6 py-4">{t('warehouse.stock')}</th>
                                <th className="px-6 py-4">{t('warehouse.price')}</th>
                                <th className="px-6 py-4">{t('warehouse.status')}</th>
                                <th className="px-6 py-4 rounded-tr-2xl text-right">{t('warehouse.management')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredInventory.length > 0 ? (
                                filteredInventory.map((item) => {
                                    const stockNum = numStock(item.stock)
                                    const priceNum = unitPriceUzs(item)
                                    return (
                                        <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {item.image_url ? (
                                                        <img
                                                            src={item.image_url}
                                                            alt={item.name}
                                                            className="w-10 h-10 rounded-lg object-cover bg-gray-100 border border-gray-200"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200">
                                                            <Package size={20} />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="font-bold text-gray-900">{item.name}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-3 py-1 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold uppercase tracking-wide border border-gray-200">
                                                    {item.category || '-'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className={`font-bold text-lg ${stockNum < 10 ? 'text-red-500' : 'text-gray-900'}`}
                                                >
                                                    {stockNum}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-mono font-bold text-gray-700">
                                                {priceNum.toLocaleString(locale)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {stockNum === 0 ? (
                                                    <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg uppercase">
                                                        {t('warehouse.soldOut')}
                                                    </span>
                                                ) : stockNum < 10 ? (
                                                    <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg uppercase">
                                                        {t('warehouse.almostOut')}
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg uppercase">
                                                        {t('warehouse.enough')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateStock(item.id, item.stock, -1)}
                                                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-bold"
                                                        title={t('warehouse.minusStockTitle')}
                                                    >
                                                        <Minus size={18} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateStock(item.id, item.stock, 1)}
                                                        className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-bold"
                                                        title={t('warehouse.plusStockTitle')}
                                                    >
                                                        <Plus size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            ) : (
                                <tr>
                                    <td colSpan="6" className="px-6 py-16 text-center text-gray-400">
                                        <div className="flex flex-col items-center">
                                            <Package size={48} className="mb-4 opacity-20" />
                                            <p className="font-medium">{t('warehouse.noProducts')}</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {lowStockItems.length > 0 && (
                <div className="mt-8 bg-gradient-to-r from-yellow-50 to-white border-l-4 border-yellow-400 p-6 rounded-r-xl shadow-sm">
                    <h4 className="text-yellow-800 font-bold mb-3 flex items-center gap-2 text-lg">
                        <AlertTriangle size={24} className="text-yellow-500" />
                        {t('warehouse.lowStockAlert')}
                    </h4>
                    <div className="flex flex-wrap gap-3">
                        {lowStockItems.map((item) => (
                            <span
                                key={item.id}
                                className="bg-white pl-3 pr-4 py-1.5 rounded-full text-sm border border-yellow-200 text-yellow-700 font-semibold shadow-sm flex items-center gap-2"
                            >
                                {item.name}
                                <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs">
                                    {numStock(item.stock)} ta
                                </span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
