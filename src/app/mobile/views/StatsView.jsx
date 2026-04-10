'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { isDeletedAtMissingError } from '@/lib/orderTrash'
import { BarChart, Bar, ResponsiveContainer, Cell, XAxis, YAxis, Tooltip } from 'recharts'
import { TrendingUp, Loader2, Package, ShoppingCart, Users, ChevronRight } from 'lucide-react'

export default function StatsView() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState({
        orders: [],
        products: [],
        chartData: [],
        avgCheck: 0
    })

    useEffect(() => {
        async function fetchStats() {
            try {
                setLoading(true)
                const now = new Date()
                const thirtyDaysAgo = new Date(now)
                thirtyDaysAgo.setDate(now.getDate() - 30)
                
                const orderSelect = `
                        id,
                        total,
                        status,
                        created_at,
                        customer_id,
                        customer_name,
                        customers(name),
                        order_items (
                            quantity,
                            price,
                            product_id,
                            product_name,
                            products (
                                id,
                                name,
                                categories (name)
                            )
                        )
                    `

                let ordersRes = await supabase
                    .from('orders')
                    .select(orderSelect)
                    .is('deleted_at', null)
                    .gte('created_at', thirtyDaysAgo.toISOString())
                    .order('created_at', { ascending: true })

                if (ordersRes.error && isDeletedAtMissingError(ordersRes.error)) {
                    ordersRes = await supabase
                        .from('orders')
                        .select(orderSelect)
                        .gte('created_at', thirtyDaysAgo.toISOString())
                        .order('created_at', { ascending: true })
                }

                const orders = ordersRes.error ? [] : ordersRes.data || []

                // 2. Fetch all products
                const { data: products } = await supabase
                    .from('products')
                    .select('id, name')

                setData({
                    orders,
                    products: products || [],
                    chartData: [],
                    avgCheck: 0
                })
            } catch (error) {
                console.error('Error fetching stats:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchStats()
    }, [])

    // --- Data Calculations ---

    const analytics = useMemo(() => {
        // Filter for Completed Orders (Match desktop logic: tugallandi/completed)
        const completedOrders = data.orders.filter(o => {
            const s = String(o.status || '').toLowerCase()
            return s === 'completed' || s === 'tugallandi' || s === 'tugallangan'
        })

        if (!completedOrders.length) return { chartData: [], categories: [], topProducts: [], topCustomers: [], avgCheck: 0 }

        const now = new Date()
        const sevenDaysAgo = new Date(now)
        sevenDaysAgo.setDate(now.getDate() - 6)

        // 1. Weekly Chart Storage
        const dayLabels = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan']
        const weekGroup = {}
        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgo)
            d.setDate(sevenDaysAgo.getDate() + i)
            weekGroup[dayLabels[d.getDay()]] = 0
        }

        // 2. Category Aggregator
        const catMap = new Map()
        
        // 3. Product Aggregator
        const prodMap = new Map()

        // 4. Customer Aggregator
        const custMap = new Map()

        let totalRevenue = 0
        let totalOrdersCount = 0

        completedOrders.forEach(o => {
            const date = new Date(o.created_at)
            const orderTotal = Number(o.total || 0)
            totalRevenue += orderTotal
            totalOrdersCount++

            // Weekly Chart
            if (date >= sevenDaysAgo) {
                const label = dayLabels[date.getDay()]
                if (weekGroup[label] !== undefined) {
                    weekGroup[label] += orderTotal
                }
            }

            // Customer Stats
            const cName = o.customers?.name || o.customer_name || 'Noma\'lum mijoz'
            if (!custMap.has(cName)) custMap.set(cName, { name: cName, total: 0, count: 0 })
            const cStat = custMap.get(cName)
            cStat.total += orderTotal
            cStat.count += 1

            // Items Loops
            o.order_items?.forEach(item => {
                const qty = Number(item.quantity) || 1
                const rev = (Number(item.price) || 0) * qty
                
                // Categories
                const catRaw = item.products?.categories?.name || 'Boshqa'
                if (!catMap.has(catRaw)) catMap.set(catRaw, { name: catRaw, value: 0, qty: 0 }) 
                catMap.get(catRaw).value += rev
                catMap.get(catRaw).qty += qty
               
                // Products
                const pName = item.products?.name || item.product_name || 'Noma\'lum'
                if (!prodMap.has(pName)) prodMap.set(pName, { name: pName, qty: 0, rev: 0 })
                const pStat = prodMap.get(pName)
                pStat.qty += qty
                pStat.rev += rev
            })
        })

        // Format Weekly Chart
        const chartData = Object.entries(weekGroup).map(([name, value], idx) => ({
            name,
            value,
            color: idx % 2 === 0 ? '#6366f1' : '#818cf8'
        }))

        // Format Categories (percentage + absolute qty)
        const categories = Array.from(catMap.values())
            .map(c => ({
                name: c.name,
                revenue: c.value,
                qty: c.qty,
                percentage: totalRevenue > 0 ? (c.value / totalRevenue) * 100 : 0
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 4)
            .map((c, idx) => ({
                ...c,
                color: ['bg-indigo-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500'][idx] || 'bg-slate-500',
                value: `${Math.round(c.percentage)}%`
            }))

        // Format Top Products
        const topProducts = Array.from(prodMap.values())
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5)

        // Format Top Customers
        const topCustomers = Array.from(custMap.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)

        return {
            chartData,
            categories,
            topProducts,
            topCustomers,
            avgCheck: totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0,
            count: totalOrdersCount
        }
    }, [data.orders])

    const formatAmount = (val) => {
        return '$' + Math.round(val).toLocaleString('uz-UZ').replace(/,/g, ' ')
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-400 font-medium animate-pulse">Statistika yuklanmoqda...</p>
            </div>
        )
    }

    return (
        <div className="p-6 pb-24 space-y-8 animate-in slide-in-from-bottom duration-700">
            {/* Header */}
            <section className="space-y-1">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-slate-400 text-sm font-medium">Boshqaruv paneli</p>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Biznes Analitika</h1>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Tugallangan</span>
                    </div>
                </div>
            </section>

            {/* Sales Chart Card */}
            <section className="p-6 rounded-[2rem] bg-slate-900/40 border border-white/5 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full" />
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-sm font-bold text-white mb-0.5">Sotuvlar o'sishi</h3>
                        <p className="text-[10px] text-slate-500 font-medium">Oxirgi 7 kunlik ko'rsatkich ($)</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                        <TrendingUp size={20} />
                    </div>
                </div>
                
                <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                            />
                            <Tooltip 
                                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                contentStyle={{ 
                                    backgroundColor: '#0f172a', 
                                    border: '1px solid rgba(255,255,255,0.1)', 
                                    borderRadius: '16px', 
                                    fontSize: '11px',
                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)'
                                }}
                                itemStyle={{ color: '#fff', fontWeight: 600 }}
                                formatter={(value) => [formatAmount(value), 'Tushum']}
                            />
                            <Bar 
                                dataKey="value" 
                                radius={[8, 8, 8, 8]} 
                                barSize={24}
                            >
                                {analytics.chartData.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={entry.color}
                                        fillOpacity={0.8}
                                        className="hover:fill-opacity-100 transition-all duration-300"
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </section>

            {/* Quick Metrics Grid */}
            <section className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-[2rem] bg-emerald-500/5 border border-emerald-500/10 backdrop-blur-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-16 h-16 bg-emerald-500/10 blur-2xl rounded-full" />
                    <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-500/60 mb-2">O'rtacha chek</p>
                    <div className="grid gap-0.5">
                        <span className="text-lg font-black text-white">{formatAmount(analytics.avgCheck)}</span>
                        <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-tighter">dollor (o'rtacha)</span>
                    </div>
                </div>
                <div className="p-5 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 backdrop-blur-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-16 h-16 bg-indigo-500/10 blur-2xl rounded-full" />
                    <p className="text-[10px] uppercase tracking-widest font-bold text-indigo-500/60 mb-2">Zakazlar</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-white">{analytics.count}</span>
                        <span className="text-[10px] text-indigo-400 font-bold uppercase">ta</span>
                    </div>
                </div>
            </section>

            {/* Category Split */}
            <section className="space-y-5">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-lg font-bold text-white/90">Kategoriyalar bo'yicha sotuv</h3>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">30 kunlik miqdor</span>
                </div>
                <div className="grid gap-4">
                    {analytics.categories.length > 0 ? (
                        analytics.categories.map((cat, idx) => (
                            <div key={idx} className="p-4 rounded-3xl bg-white/5 border border-white/5 space-y-3">
                                <div className="flex items-center justify-between text-xs font-bold">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${cat.color}`} />
                                        <span className="text-slate-300">{cat.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-emerald-400 font-black">{cat.qty.toLocaleString()} ta</span>
                                        <span className="text-slate-600 font-medium">{cat.value}</span>
                                    </div>
                                </div>
                                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full ${cat.color} rounded-full transition-all duration-1000 delay-300 shadow-[0_0_12px_rgba(0,0,0,0.5)]`} 
                                        style={{ width: cat.value }}
                                    />
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-center py-4 text-slate-600 text-sm italic">Ma'lumotlar mavjud emas (tugallangan buyurtmalar bo'yicha)</p>
                    )}
                </div>
            </section>

            {/* Top Products Analytics */}
            <section className="space-y-5">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-lg font-bold text-white/90">Eng ko'p sotilgan</h3>
                    <div className="flex items-center gap-1.5 text-indigo-400 bg-indigo-400/10 px-3 py-1 rounded-full">
                        <Package size={12} />
                        <span className="text-[10px] font-bold uppercase">Top 5</span>
                    </div>
                </div>
                <div className="space-y-3">
                    {analytics.topProducts.map((prod, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-300 group">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center text-indigo-400 font-bold text-lg shadow-lg">
                                {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-white/90 truncate group-hover:text-indigo-300 transition-colors uppercase tracking-tight">{prod.name}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{prod.qty.toLocaleString()} ta sotildi</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-800" />
                                    <span className="text-[11px] font-bold text-emerald-500/80">{formatAmount(prod.rev)}</span>
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-600 group-hover:text-slate-400 group-hover:bg-white/10 transition-all">
                                <ChevronRight size={16} />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Top Customers Summary */}
            <section className="space-y-5">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-lg font-bold text-white/90">Mijozlar foydasi (30 kun)</h3>
                    <div className="flex items-center gap-1.5 text-sky-400 bg-sky-400/10 px-3 py-1 rounded-full">
                        <Users size={12} />
                        <span className="text-[10px] font-bold uppercase">Liderlar</span>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    {analytics.topCustomers.map((cust, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 rounded-3xl bg-gradient-to-r from-white/[0.03] to-transparent border border-white/5 group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-400 font-black text-sm border border-sky-500/10">
                                    {cust.name.substring(0, 1).toUpperCase()}
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-white/90 group-hover:text-sky-300 transition-colors">{cust.name}</h4>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{cust.count} ta buyurtma</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-white">{formatAmount(cust.total)}</p>
                                <p className="text-[10px] font-bold text-slate-600 uppercase">dollor</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
