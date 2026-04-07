'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TrendingUp, Users, Wallet, ShoppingCart, MessageCircle, MoreHorizontal, Loader2 } from 'lucide-react'

export default function DashboardView({ role }) {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState({
        revenue: 0,
        ordersCount: 0,
        employeesCount: 0,
        balance: 0,
        recentActivities: []
    })

    const greeting = {
        admin: 'Direktor',
        manager: 'Menejer',
        finance: 'Moliya Xodimi',
        staff: 'Xodim',
    }

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true)
                const today = new Date().toISOString().split('T')[0]
                
                // 1. Daily Revenue (Inflows today)
                const { data: transToday } = await supabase
                    .from('transactions')
                    .select('amount, type')
                    .eq('date', today)
                
                const dailyRev = (transToday || [])
                    .filter(t => t.type === 'inflow')
                    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

                // 2. New Orders today
                const { count: ordersCount } = await supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', `${today}T00:00:00`)
                    .lte('created_at', `${today}T23:59:59`)

                // 3. Employees Total
                const { count: empCount } = await supabase
                    .from('employees')
                    .select('*', { count: 'exact', head: true })

                // 4. Finance Balance
                const { data: allTrans } = await supabase
                    .from('transactions')
                    .select('amount, type')
                
                const balance = (allTrans || []).reduce((sum, t) => {
                    const amt = Number(t.amount) || 0
                    return t.type === 'inflow' ? sum + amt : sum - amt
                }, 0)

                // 5. Recent Activities (Last 5 orders)
                const { data: recentOrders } = await supabase
                    .from('orders')
                    .select('id, total_amount, created_at, customers(name)')
                    .order('created_at', { ascending: false })
                    .limit(5)

                const activities = (recentOrders || []).map(o => ({
                    title: `Buyurtma #${o.id.toString().slice(-4)}`,
                    time: new Date(o.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
                    desc: `Mijoz: ${o.customers?.name || 'Noma\'lum'}`,
                    icon: ShoppingCart,
                    color: 'text-indigo-400'
                }))

                setData({
                    revenue: dailyRev,
                    ordersCount: ordersCount || 0,
                    employeesCount: empCount || 0,
                    balance: balance,
                    recentActivities: activities
                })
            } catch (error) {
                console.error('Error fetching dashboard data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    const stats = [
        { label: 'Kunlik tushum', value: data.revenue.toLocaleString(), change: 'Bugun', icon: TrendingUp, color: 'bg-emerald-500/10 text-emerald-500' },
        { label: 'Yangi buyurtmalar', value: data.ordersCount.toString(), change: 'Bugun', icon: ShoppingCart, color: 'bg-indigo-500/10 text-indigo-500' },
        { label: 'Xodimlar', value: `${data.employeesCount} kishi`, change: 'Aktiv', icon: Users, color: 'bg-sky-500/10 text-sky-500' },
        { label: 'Moliya balansi', value: data.balance.toLocaleString(), change: 'Umumiy', icon: Wallet, color: 'bg-amber-500/10 text-amber-500' },
    ]

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-400 font-medium animate-pulse">Ma'lumotlar yuklanmoqda...</p>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-700">
            {/* Header / Greeting */}
            <section className="space-y-1">
                <p className="text-slate-400 text-sm font-medium">Xush kelibsiz,</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                    Assalomu alaykum, <span className="text-indigo-400">{greeting[role] || 'Foydalanuvchi'}</span>
                </h1>
            </section>

            {/* Quick Stats Grid */}
            <section className="grid grid-cols-2 gap-4">
                {stats.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-3xl bg-white/5 border border-white/5 backdrop-blur-xl hover:bg-white/10 transition-all duration-300 group">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-3 ${item.color} group-hover:scale-110 transition-transform`}>
                            <item.icon size={20} />
                        </div>
                        <p className="text-xs font-medium text-slate-400 mb-1">{item.label}</p>
                        <h3 className="text-lg font-bold text-white mb-1 truncate">{item.value}</h3>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400">
                            {item.change}
                        </span>
                    </div>
                ))}
            </section>

            {/* Recent Activities or Alerts */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white/90">So'nggi harakatlar</h2>
                    <button className="p-2 text-slate-500 hover:text-slate-300">
                        <MoreHorizontal size={20} />
                    </button>
                </div>

                <div className="space-y-3">
                    {data.recentActivities.length > 0 ? (
                        data.recentActivities.map((activity, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center ${activity.color} shrink-0`}>
                                    <activity.icon size={22} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-white/90 truncate">{activity.title}</h4>
                                    <p className="text-xs text-slate-400 truncate">{activity.desc}</p>
                                </div>
                                <span className="text-[10px] font-medium text-slate-500 shrink-0">{activity.time}</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-center py-8 text-slate-500 text-sm">Hozircha harakatlar yo'q</p>
                    )}
                </div>
            </section>
        </div>
    )
}
