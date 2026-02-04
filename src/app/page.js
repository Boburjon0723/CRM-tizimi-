'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import StatCard from '@/components/StatCard'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Package, Users, ShoppingCart, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Dashboard() {
  const { toggleSidebar } = useLayout()
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
      const [mahsulotRes, xodimRes, buyurtmaRes, moliyaRes] = await Promise.all([
        supabase.from('mahsulotlar').select('miqdor'),
        supabase.from('xodimlar').select('id'),
        supabase.from('buyurtmalar').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('moliya').select('tur, summa, sana')
      ])

      const totalMahsulot = mahsulotRes.data?.reduce((sum, m) => sum + (m.miqdor || 0), 0) || 0
      const totalXodim = xodimRes.data?.length || 0
      const totalBuyurtma = buyurtmaRes.data?.length || 0

      const kirim = moliyaRes.data?.filter(m => m.tur === 'Kirim').reduce((sum, m) => sum + m.summa, 0) || 0
      const chiqim = moliyaRes.data?.filter(m => m.tur === 'Chiqim').reduce((sum, m) => sum + m.summa, 0) || 0
      const foyda = kirim - chiqim

      setStats({
        mahsulotlar: totalMahsulot,
        xodimlar: totalXodim,
        buyurtmalar: totalBuyurtma,
        foyda: foyda
      })

      setRecentOrders(buyurtmaRes.data || [])

      // Process chart data for last 7 days
      const days = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan']
      const weeklyData = {}

      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        const dayName = days[date.getDay()]
        weeklyData[dateStr] = { name: dayName, kirim: 0, chiqim: 0 }
      }

      moliyaRes.data?.forEach(m => {
        if (weeklyData[m.sana]) {
          if (m.tur === 'Kirim') weeklyData[m.sana].kirim += m.summa
          else weeklyData[m.sana].chiqim += m.summa
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
            <p className="text-gray-600">Yuklanmoqda...</p>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="max-w-7xl mx-auto">
      <Header title="Dashboard" toggleSidebar={toggleSidebar} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 px-6">
        <StatCard
          icon={Package}
          title="Umumiy Mahsulotlar"
          value={stats.mahsulotlar}
          color="bg-blue-500"
          trend={12}
        />
        <StatCard
          icon={Users}
          title="Xodimlar Soni"
          value={stats.xodimlar}
          color="bg-green-500"
          trend={5}
        />
        <StatCard
          icon={ShoppingCart}
          title="Buyurtmalar"
          value={stats.buyurtmalar}
          color="bg-purple-500"
          trend={-3}
        />
        <StatCard
          icon={DollarSign}
          title="Foyda"
          value={`${(stats.foyda / 1000000).toFixed(1)}M`}
          color="bg-amber-500"
          trend={18}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8 px-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-600" />
              Haftalik Statistika
            </h3>
            <select className="bg-gray-50 border-none text-sm font-medium text-gray-500 rounded-lg p-2 outline-none">
              <option>Bu hafta</option>
              <option>O'tgan hafta</option>
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
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="kirim" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="chiqim" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6">So'nggi Buyurtmalar</h3>
          <div className="space-y-4">
            {recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <ShoppingCart size={40} className="mb-3 opacity-20" />
                <p>Hozircha buyurtmalar yo'q</p>
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
            Barchasini ko'rish
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mx-6 mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-6">Oylik Kirim-Chiqim</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend />
            <Bar dataKey="kirim" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="chiqim" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}