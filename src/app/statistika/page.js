'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import {
    TrendingUp,
    TrendingDown,
    ShoppingCart,
    Calendar,
    RefreshCcw,
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

const STAT_FILTER_RANGE_KEY = 'crm_stat_filter_days'
const VALID_FILTER_RANGES = ['7', '30', '90', '365']

function isOrderCompletedStatus(status) {
    const s = String(status || '').toLowerCase()
    return s === 'completed' || s === 'tugallandi' || s === 'tugallangan'
}

function isDeletedAtMissingError(err) {
    const m = String(err?.message || err?.code || err || '')
    return /deleted_at|42703|PGRST204|schema cache|does not exist|column/i.test(m)
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

function dateInBounds(d, start, end) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false
    return d >= start && d <= end
}

/** Tugallangan buyurtma: hisobot sanasi — `updated_at`, bo‘lmasa `created_at` */
function completionAnchorDate(o) {
    const raw = o.updated_at != null && o.updated_at !== '' ? o.updated_at : o.created_at
    return new Date(raw)
}

function parseLineQty(v) {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
}

export default function StatistikaPage() {
    const { toggleSidebar } = useLayout()
    const { t } = useLanguage()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState({
        orders: [],
        finance: [],
        products: [],
    })
    const [filterRange, setFilterRange] = useState('30')

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STAT_FILTER_RANGE_KEY)
            if (raw && VALID_FILTER_RANGES.includes(raw)) setFilterRange(raw)
        } catch {
            /* ignore */
        }
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)
            let ordersQuery = supabase.from('orders').select(`
                *,
                order_items (
                    quantity,
                    price,
                    product_name,
                    products (
                        name,
                        categories (name)
                    )
                )
            `)
            ordersQuery = ordersQuery.is('deleted_at', null)
            let ordersRes = await ordersQuery

            if (ordersRes.error && isDeletedAtMissingError(ordersRes.error)) {
                ordersRes = await supabase.from('orders').select(`
                    *,
                    order_items (
                        quantity,
                        price,
                        product_name,
                        products (
                            name,
                            categories (name)
                        )
                    )
                `)
            }

            const transPromise = supabase.from('transactions').select('*')
            const productsPromise = supabase.from('products').select('*')

            const [financeRes, productsRes] = await Promise.all([transPromise, productsPromise])

            setData({
                orders: ordersRes.error ? [] : ordersRes.data || [],
                finance: financeRes.data || [],
                products: productsRes.data || [],
            })
        } catch (error) {
            console.error('Error loading statistika:', error)
        } finally {
            setLoading(false)
        }
    }

    const onFilterRangeChange = useCallback((v) => {
        if (VALID_FILTER_RANGES.includes(v)) {
            setFilterRange(v)
            try {
                localStorage.setItem(STAT_FILTER_RANGE_KEY, v)
            } catch {
                /* ignore */
            }
        }
    }, [])

    const now = new Date()
    const days = parseInt(filterRange, 10) || 30
    const periodEnd = endOfDay(now)
    const periodStart = startOfDay(now)
    periodStart.setDate(periodStart.getDate() - (days - 1))

    /** Yaratilgan sana bo‘yicha davr */
    const filteredOrders = data.orders.filter((o) =>
        dateInBounds(new Date(o.created_at), periodStart, periodEnd)
    )

    /** Tugallangan sana (updated_at) bo‘yicha davr — kirim kartochkasi */
    const completedOrdersInPeriod = data.orders.filter(
        (o) =>
            isOrderCompletedStatus(o.status) && dateInBounds(completionAnchorDate(o), periodStart, periodEnd)
    )

    const filteredFinance = data.finance.filter((f) => {
        const raw = f.date
        if (raw == null || raw === '') return false
        const d =
            typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())
                ? new Date(`${String(raw).trim()}T12:00:00`)
                : new Date(raw)
        return dateInBounds(d, periodStart, periodEnd)
    })

    // Savdo trendi: yaratilgan kun bo‘yicha
    const salesTrend = {}
    filteredOrders.forEach((o) => {
        const day = new Date(o.created_at).toLocaleDateString('en-CA')
        salesTrend[day] = (salesTrend[day] || 0) + (Number(o.total) || 0)
    })
    const salesChartData = Object.entries(salesTrend)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date))

    // Moliya grafik: kirim — tugallangan buyurtmalar (kun = tugallangan sana); chiqim — jadval
    const financeTrend = {}
    completedOrdersInPeriod.forEach((o) => {
        const day = completionAnchorDate(o).toLocaleDateString('en-CA')
        if (!financeTrend[day]) financeTrend[day] = { date: day, income: 0, expense: 0 }
        financeTrend[day].income += Number(o.total) || 0
    })
    filteredFinance.forEach((f) => {
        const raw = f.date
        let day = ''
        if (typeof raw === 'string' && raw.trim()) {
            day = raw.trim().slice(0, 10)
        } else if (raw != null && raw !== '') {
            try {
                day = new Date(raw).toLocaleDateString('en-CA')
            } catch {
                return
            }
        }
        if (!day) return
        if (!financeTrend[day]) financeTrend[day] = { date: day, income: 0, expense: 0 }
        if (f.type === 'expense') financeTrend[day].expense += Number(f.amount) || 0
    })
    const financeChartData = Object.values(financeTrend).sort((a, b) => a.date.localeCompare(b.date))

    const catSales = {}
    filteredOrders.forEach((o) => {
        if (o.order_items) {
            o.order_items.forEach((item) => {
                const cat = item.products?.categories?.name || 'Boshqa'
                const q = parseLineQty(item.quantity)
                const lineQty = q > 0 ? q : 1
                const amount = (Number(item.price) || 0) * lineQty
                catSales[cat] = (catSales[cat] || 0) + amount
            })
        }
    })
    const categoryData = Object.entries(catSales).map(([name, value]) => ({ name, value }))

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

    const totalSales = filteredOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    /** Tugallangan buyurtmalar — davr tugallangan sana bo‘yicha (buyurtmalar jadvali) */
    const totalIncome = completedOrdersInPeriod.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    const totalExpense = filteredFinance
        .filter((f) => f.type === 'expense')
        .reduce((sum, f) => sum + (Number(f.amount) || 0), 0)

    const productSales = {}
    filteredOrders.forEach((o) => {
        if (o.order_items) {
            o.order_items.forEach((item) => {
                const name = item.product_name || item.products?.name || "Noma'lum"
                const q = parseLineQty(item.quantity)
                const lineQty = q > 0 ? q : 1
                productSales[name] = (productSales[name] || 0) + (Number(item.price) || 0) * lineQty
            })
        }
    })
    const topProducts = Object.entries(productSales)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
                    <div className="ml-4 font-bold text-blue-600">{t('statistics.loading')}</div>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-6 pb-8">
            <Header title={t('common.statistics')} toggleSidebar={toggleSidebar} />

            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-xl shadow-sm border border-gray-200">
                    <Calendar size={20} className="text-gray-500" />
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
                <button
                    type="button"
                    onClick={() => loadData()}
                    className="p-3 bg-white hover:bg-gray-50 rounded-xl shadow-sm border border-gray-200 transition-all text-gray-600 hover:text-blue-600"
                >
                    <RefreshCcw size={20} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-xl">
                            <ShoppingCart size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-blue-100">{t('statistics.totalSalesPeriod')}</p>
                            <p className="text-2xl font-bold mt-1">${totalSales.toLocaleString()}</p>
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
                            <p className="text-2xl font-bold mt-1">+${totalIncome.toLocaleString()}</p>
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
                            <p className="text-2xl font-bold mt-1">-${totalExpense.toLocaleString()}</p>
                        </div>
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
                                <XAxis dataKey="date" hide />
                                <YAxis hide />
                                <Tooltip
                                    formatter={(val) => `$${val.toLocaleString()}`}
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
                                    strokeWidth={3}
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
                                <XAxis dataKey="date" hide />
                                <YAxis hide />
                                <Tooltip
                                    formatter={(val) => `$${val.toLocaleString()}`}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    }}
                                    cursor={{ fill: 'transparent' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Bar dataKey="income" name={t('finances.income')} fill="#10b981" radius={[4, 4, 4, 4]} />
                                <Bar dataKey="expense" name={t('finances.expense')} fill="#ef4444" radius={[4, 4, 4, 4]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">{t('statistics.categoryShare')}</h3>
                    <div className="h-[300px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(val) => `$${val.toLocaleString()}`}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    }}
                                />
                                <Legend verticalAlign="bottom" iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">{t('statistics.topSellingProducts')}</h3>
                    <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {topProducts.map((prod, idx) => (
                            <div
                                key={idx}
                                className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl transition-colors group"
                            >
                                <div className="flex items-center gap-4">
                                    <div
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                            idx < 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                                        }`}
                                    >
                                        {idx + 1}
                                    </div>
                                    <span className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">
                                        {prod.name}
                                    </span>
                                </div>
                                <span className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                                    ${prod.total?.toLocaleString()}
                                </span>
                            </div>
                        ))}
                        {topProducts.length === 0 && (
                            <div className="text-center py-12 text-gray-400">
                                <p>{t('statistics.noData')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
