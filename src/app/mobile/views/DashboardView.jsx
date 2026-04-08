'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TrendingUp, Users, Wallet, ShoppingCart, MessageCircle, MoreHorizontal, Loader2, Clock, Timer, CheckCircle, XCircle } from 'lucide-react'

export default function DashboardView({ role, setActiveTab }) {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState({
        employeesCount: 0,
        statusStats: { new: 0, pending: 0, completed: 0, cancelled: 0 },
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
                // setLoading(true) // do not set loading true on background refetch
                
                // 1. Orders by Status
                const { data: orders } = await supabase
                    .from('orders')
                    .select('status')
                
                const statusStats = { new: 0, pending: 0, completed: 0, cancelled: 0 }
                if (orders) {
                    orders.forEach(o => {
                        if (o.status === 'Yangi' || o.status === 'new') statusStats.new++
                        if (o.status === 'Jarayonda' || o.status === 'pending') statusStats.pending++
                        if (o.status === 'Tugallangan' || o.status === 'completed') statusStats.completed++
                        if (o.status === 'Bekor qilingan' || o.status === 'cancelled') statusStats.cancelled++
                    })
                }

                // 2. Employees Total
                const { count: empCount } = await supabase
                    .from('employees')
                    .select('*', { count: 'exact', head: true })

                // 3. Recent Activities (Last 5 orders)
                const { data: recentOrders } = await supabase
                    .from('orders')
                    .select('*, customers(name)')
                    .order('created_at', { ascending: false })
                    .limit(5)

                const activities = (recentOrders || []).map(o => ({
                    title: `Buyurtma #${String(o.id).slice(0, 8)}`,
                    time: new Date(o.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
                    desc: `Mijoz: ${o.customer_name || o.customers?.name || 'Noma\'lum'}`,
                    icon: ShoppingCart,
                    color: 'text-indigo-400'
                }))

                setData({
                    employeesCount: empCount || 0,
                    statusStats: statusStats,
                    recentActivities: activities
                })
            } catch (error) {
                console.error('Error fetching dashboard data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()

        const channel = supabase
            .channel('mobile_dashboard_updates')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => fetchData()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const stats = [
        { label: 'Yangi buyurtmalar', value: data.statusStats.new.toString(), change: 'Yangi', icon: Clock, color: 'bg-blue-500/10 text-blue-500' },
        { label: 'Jarayonda', value: data.statusStats.pending.toString(), change: 'Jarayonda', icon: Timer, color: 'bg-amber-500/10 text-amber-500' },
        { label: 'Tugallangan', value: data.statusStats.completed.toString(), change: 'Tugallangan', icon: CheckCircle, color: 'bg-emerald-500/10 text-emerald-500' },
        { label: 'Bekor qilingan', value: data.statusStats.cancelled.toString(), change: 'Bekor qilingan', icon: XCircle, color: 'bg-rose-500/10 text-rose-500' },
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
                            <div 
                                key={idx} 
                                onClick={() => setActiveTab && setActiveTab('orders')}
                                className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer active:scale-[0.98]"
                            >
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

