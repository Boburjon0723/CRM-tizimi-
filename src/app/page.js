'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import StatCard from '@/components/StatCard'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Package, Users, ShoppingCart, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'

export default function Dashboard() {
  const { toggleSidebar } = useLayout()
  const { t, language } = useLanguage()
  const [stats, setStats] = useState({
    mahsulotlar: 0,
    xodimlar: 0,
    buyurtmalar: 0,
    foyda: 0
  })
  const [chartData, setChartData] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()

    // Subscribe to real-time changes
    const ordersChannel = supabase
      .channel('dashboard_updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => loadData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
    }
  }, [])

  async function loadData() {
    try {
      const [productsRes, employeesRes, ordersRes, transactionsRes] = await Promise.all([
        supabase.from('products').select('stock'),
        supabase.from('employees').select('id'),
        supabase.from('orders').select('*, customers(name)').order('created_at', { ascending: false }).limit(5),
        supabase.from('transactions').select('type, amount, date')
      ])

      const totalStock = productsRes.data?.reduce((sum, p) => sum + (p.stock || 0), 0) || 0
      const totalEmployees = employeesRes.data?.length || 0
      const totalOrders = (await supabase.from('orders').select('id', { count: 'exact', head: true })).count || 0

      const income = transactionsRes.data?.filter(t => t.type === 'income').reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0
      const expense = transactionsRes.data?.filter(t => t.type === 'expense').reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0
      const profit = income - expense

      setStats({
        mahsulotlar: totalStock,
        xodimlar: totalEmployees,
        buyurtmalar: totalOrders,
        foyda: profit
      })

      // Format recent orders for display
      const formattedRecentOrders = (ordersRes.data || []).map(order => ({
        id: order.id,
        mijoz: order.customers?.name || 'Mijoz',
        mahsulot: 'Order #' + order.id.toString().slice(0, 8),
        summa: order.total,
        status: order.status
      }))

      setRecentOrders(formattedRecentOrders)

      // Process chart data for last 7 days
      const daysUz = [t('dashboard.sun'), t('dashboard.mon'), t('dashboard.tue'), t('dashboard.wed'), t('dashboard.thu'), t('dashboard.fri'), t('dashboard.sat')]
      const weeklyData = {}

      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        const dayName = daysUz[date.getDay()]
        weeklyData[dateStr] = { name: dayName, kirim: 0, chiqim: 0 }
      }

      transactionsRes.data?.forEach(t => {
        if (weeklyData[t.date]) {
          if (t.type === 'income') weeklyData[t.date].kirim += (Number(t.amount) || 0)
          else weeklyData[t.date].chiqim += (Number(t.amount) || 0)
        }
      })

      setChartData(Object.values(weeklyData))
    } catch (error) {
      console.error('Data loading error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t('common.loading')}</p>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="max-w-7xl mx-auto">
      <Header title={t('common.dashboard')} toggleSidebar={toggleSidebar} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8 px-4 md:px-6">
        <StatCard
          icon={Package}
          title={t('dashboard.products')}
          value={stats.mahsulotlar}
          color="bg-blue-500"
          trend={12}
        />
        <StatCard
          icon={Users}
          title={t('dashboard.employees')}
          value={stats.xodimlar}
          color="bg-green-500"
          trend={5}
        />
        <StatCard
          icon={ShoppingCart}
          title={t('common.orders')}
          value={stats.buyurtmalar}
          color="bg-purple-500"
          trend={-3}
        />
        <StatCard
          icon={DollarSign}
          title={t('dashboard.profit')}
          value={`${(stats.foyda / 1000000).toFixed(1)}M`}
          color="bg-amber-500"
          trend={18}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8 mb-6 md:mb-8 px-4 md:px-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-600" />
              {t('dashboard.weeklyStats')}
            </h3>
            <select className="bg-gray-50 border-none text-sm font-medium text-gray-500 rounded-lg p-2 outline-none">
              <option>{t('dashboard.thisWeek')}</option>
              <option>{t('dashboard.lastWeek')}</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Legend
                formatter={(value) => value === 'kirim' ? t('dashboard.income') : t('dashboard.expense')}
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Line type="monotone" dataKey="kirim" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="chiqim" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6">{t('dashboard.recentOrders')}</h3>
          <div className="space-y-4">
            {recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <ShoppingCart size={40} className="mb-3 opacity-20" />
                <p>{t('dashboard.noOrders')}</p>
              </div>
            ) : (
              recentOrders.map(order => (
                <div key={order.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100 group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm">
                      {order.mijoz?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{order.mijoz}</p>
                      <p className="text-xs text-gray-500 w-32 truncate">{order.mahsulot}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900 text-sm">{order.summa?.toLocaleString()} $</p>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${order.status === 'Yangi' ? 'bg-blue-100 text-blue-700' :
                      order.status === 'Jarayonda' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <button className="w-full mt-6 py-2.5 text-sm font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
            {t('dashboard.viewAll')}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mx-6 mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-6">{t('dashboard.monthlyStats')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend formatter={(value) => value === 'kirim' ? t('dashboard.income') : t('dashboard.expense')} />
            <Bar dataKey="kirim" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="chiqim" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}