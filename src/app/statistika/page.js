'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    ShoppingCart,
    Package,
    Calendar,
    Filter,
    RefreshCcw
} from 'lucide-react'
import {
    AreaChart, Area,
    BarChart, Bar,
    XAxis, YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart, Pie, Cell,
    Legend
} from 'recharts'
import { useLayout } from '@/context/LayoutContext'

export default function StatistikaPage() {
    const { toggleSidebar } = useLayout()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState({
        orders: [],
        finance: [],
        products: []
    })
    const [filterRange, setFilterRange] = useState('30') // days

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)
            // Load Orders with items for category analysis
            const ordersPromise = supabase.from('orders').select(`
                *,
                order_items (
                    quantity,
                    price,
                    products (name, category)
                )
            `)

            const transPromise = supabase.from('transactions').select('*')
            const productsPromise = supabase.from('products').select('*')

            const [ordersRes, financeRes, productsRes] = await Promise.all([
                ordersPromise,
                transPromise,
                productsPromise
            ])

            setData({
                orders: ordersRes.data || [],
                finance: financeRes.data || [],
                products: productsRes.data || []
            })
        } catch (error) {
            console.error('Error loading statistika:', error)
        } finally {
            setLoading(false)
        }
    }

    // Processing data for charts
    const now = new Date()
    const startDate = new Date()
    startDate.setDate(now.getDate() - parseInt(filterRange))

    const filteredOrders = data.orders.filter(o => new Date(o.created_at) >= startDate)
    const filteredFinance = data.finance.filter(f => new Date(f.date) >= startDate)

    // 1. Sales Trend (by day)
    const salesTrend = {}
    filteredOrders.forEach(o => {
        const day = new Date(o.created_at).toLocaleDateString('en-CA') // YYYY-MM-DD
        salesTrend[day] = (salesTrend[day] || 0) + (o.total || 0)
    })
    const salesChartData = Object.entries(salesTrend)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date))

    // 2. Income vs Expense
    const financeTrend = {}
    filteredFinance.forEach(f => {
        const day = f.date
        if (!financeTrend[day]) financeTrend[day] = { date: day, income: 0, expense: 0 }
        if (f.type === 'income') financeTrend[day].income += (f.amount || 0)
        else financeTrend[day].expense += (f.amount || 0)
    })
    const financeChartData = Object.values(financeTrend).sort((a, b) => a.date.localeCompare(b.date))

    // 3. Category distribution
    // We need to iterate over orders -> order_items -> products.category
    const catSales = {}
    filteredOrders.forEach(o => {
        if (o.order_items) {
            o.order_items.forEach(item => {
                const cat = item.products?.category || 'Boshqa'
                const amount = (item.price || 0) * (item.quantity || 1)
                catSales[cat] = (catSales[cat] || 0) + amount
            })
        }
    })
    const categoryData = Object.entries(catSales).map(([name, value]) => ({ name, value }))

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

    const totalSales = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0)
    const totalIncome = filteredFinance.filter(f => f.type === 'income').reduce((sum, f) => sum + (f.amount || 0), 0)
    const totalExpense = filteredFinance.filter(f => f.type === 'expense').reduce((sum, f) => sum + (f.amount || 0), 0)

    // Top Selling Products
    const productSales = {}
    filteredOrders.forEach(o => {
        if (o.order_items) {
            o.order_items.forEach(item => {
                const name = item.products?.name || 'Noma\'lum'
                productSales[name] = (productSales[name] || 0) + ((item.price || 0) * (item.quantity || 1))
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
                </div>
            </div>
        )
    }

    return (
        <div className="pb-8">
            <Header title="Statistika va Tahlillar" toggleSidebar={toggleSidebar} />

            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border">
                    <Calendar size={18} className="text-gray-400" />
                    <select
                        value={filterRange}
                        onChange={(e) => setFilterRange(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 outline-none"
                    >
                        <option value="7">Oxirgi 7 kun</option>
                        <option value="30">Oxirgi 30 kun</option>
                        <option value="90">Oxirgi 3 oy</option>
                        <option value="365">Oxirgi 1 yil</option>
                    </select>
                </div>
                <button onClick={loadData} className="p-2 hover:bg-gray-100 rounded-lg transition">
                    <RefreshCcw size={20} className="text-gray-600" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                            <ShoppingCart size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Jami Savdo (Davr)</p>
                            <p className="text-2xl font-bold">{(totalSales / 1000000).toFixed(1)}M so'm</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-50 text-green-600 rounded-xl">
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Umumiy Kirim</p>
                            <p className="text-2xl font-bold">{(totalIncome / 1000000).toFixed(1)}M</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                            <TrendingDown size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Umumiy Chiqim</p>
                            <p className="text-2xl font-bold">{(totalExpense / 1000000).toFixed(1)}M</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <TrendingUp size={20} className="text-blue-500" />
                        Savdo Dinamikasi
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
                                <Tooltip formatter={(val) => val.toLocaleString() + " so'm"} />
                                <Area type="monotone" dataKey="amount" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold mb-6">Moliya: Kirim va Chiqim</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={financeChartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="date" hide />
                                <YAxis hide />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="income" name="Kirim" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="expense" name="Chiqim" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold mb-6 text-gray-800">Kategoriyalar bo'yicha ulush</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(val) => val.toLocaleString() + " so'm"} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold mb-4">Top Sotilayotgan Mahsulotlar</h3>
                    <div className="space-y-4">
                        {topProducts.map((prod, idx) => (
                            <div key={idx} className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                                        {idx + 1}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">{prod.name}</span>
                                </div>
                                <span className="text-sm font-bold text-blue-600">{prod.total?.toLocaleString()} so'm</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
