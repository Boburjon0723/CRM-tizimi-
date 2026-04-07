'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, ResponsiveContainer, Cell, XAxis, YAxis, Tooltip } from 'recharts'
import { TrendingUp, Loader2 } from 'lucide-react'

export default function StatsView() {
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        chartData: [],
        avgCheck: 0,
        categories: []
    })

    useEffect(() => {
        async function fetchStats() {
            try {
                setLoading(true)
                const now = new Date()
                const sevenDaysAgo = new Date(now)
                sevenDaysAgo.setDate(now.getDate() - 6)
                
                // 1. Weekly Sales Data
                const { data: recentOrders } = await supabase
                    .from('orders')
                    .select('total_amount, created_at')
                    .gte('created_at', sevenDaysAgo.toISOString())
                    .order('created_at', { ascending: true })

                // Group by day of week
                const dayLabels = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan']
                const grouped = {}
                
                // Prefill last 7 days
                for (let i = 0; i < 7; i++) {
                    const d = new Date(sevenDaysAgo)
                    d.setDate(sevenDaysAgo.getDate() + i)
                    const label = dayLabels[d.getDay()]
                    grouped[label] = 0
                }

                (recentOrders || []).forEach(o => {
                    const date = new Date(o.created_at)
                    const label = dayLabels[date.getDay()]
                    if (grouped[label] !== undefined) {
                        grouped[label] += Number(o.total_amount) || 0
                    }
                })

                const chartData = Object.entries(grouped).map(([name, value], idx) => ({
                    name,
                    value,
                    color: idx % 2 === 0 ? '#6366f1' : '#818cf8'
                }))

                // 2. Average Check (Last 30 days)
                const thirtyDaysAgo = new Date(now)
                thirtyDaysAgo.setDate(now.getDate() - 30)
                const { data: monthOrders } = await supabase
                    .from('orders')
                    .select('total_amount')
                    .gte('created_at', thirtyDaysAgo.toISOString())

                const totalMonth = (monthOrders || []).reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
                const avg = monthOrders?.length ? totalMonth / monthOrders.length : 0

                // 3. Category Split (Mocking for now as joining order_items is heavy, but structure it for real use)
                // In a real scenario, you'd join orders -> order_items -> products -> category
                const categories = [
                    { name: 'Pardalar', value: '65%', color: 'bg-indigo-500' },
                    { name: 'Aksessuarlar', value: '25%', color: 'bg-sky-500' },
                    { name: 'Xizmatlar', value: '10%', color: 'bg-emerald-500' },
                ]

                setStats({
                    chartData,
                    avgCheck: avg,
                    categories
                })
            } catch (error) {
                console.error('Error fetching stats:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchStats()
    }, [])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-400 font-medium animate-pulse">Statistika yuklanmoqda...</p>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-8 animate-in slide-in-from-bottom duration-700">
            {/* Header / Stats Title */}
            <section className="space-y-1">
                <p className="text-slate-400 text-sm font-medium">Statistika</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">Ko'rsatkichlar</h1>
            </section>

            {/* Main Sales Chart */}
            <section className="p-6 rounded-3xl bg-white/5 border border-white/5 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-white">Sotuvlar (7 kunlik)</h3>
                    <TrendingUp size={18} className="text-indigo-400" />
                </div>
                
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.chartData}>
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#94a3b8', fontSize: 10 }}
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                                itemStyle={{ color: '#fff' }}
                                formatter={(value) => [value.toLocaleString() + ' so\'m', 'Tushum']}
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {stats.chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </section>

            {/* Key Metrics Cards */}
            <section className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-3xl bg-white/5 border border-white/5 backdrop-blur-xl">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Konversiya</h4>
                    <div className="flex items-end gap-2 px-1">
                        <span className="text-xl font-bold text-white">4.2%</span>
                        <span className="text-[10px] text-emerald-400 font-bold mb-1">+0.5%</span>
                    </div>
                </div>
                <div className="p-4 rounded-3xl bg-white/5 border border-white/5 backdrop-blur-xl">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">O'rtacha chek</h4>
                    <div className="flex items-end gap-2 px-1 min-w-0">
                        <span className="text-lg font-bold text-white truncate">{(stats.avgCheck / 1000).toFixed(0)}k</span>
                        <span className="text-[10px] text-indigo-400 font-bold mb-1 shrink-0">SO'M</span>
                    </div>
                </div>
            </section>

            {/* Category Performance */}
            <section className="space-y-4">
                <h3 className="text-sm font-bold text-white/90">Kategoriyalar</h3>
                <div className="space-y-4">
                    {stats.categories.map((cat, idx) => (
                        <div key={idx} className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                                <span>{cat.name}</span>
                                <span>{cat.value}</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full ${cat.color} rounded-full transition-all duration-1000`} 
                                    style={{ width: cat.value }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
