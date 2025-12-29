'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import StatCard from '@/components/StatCard'
import { Package, Users, ShoppingCart, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'

export default function Dashboard({ toggleSidebar }) {
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
    <div>
      <Header title="Dashboard" toggleSidebar={toggleSidebar} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={Package}
          title="Umumiy Mahsulotlar"
          value={stats.mahsulotlar}
          color="bg-gradient-to-br from-blue-500 to-blue-600"
          trend={12}
        />
        <StatCard
          icon={Users}
          title="Xodimlar Soni"
          value={stats.xodimlar}
          color="bg-gradient-to-br from-green-500 to-green-600"
          trend={5}
        />
        <StatCard
          icon={ShoppingCart}
          title="Buyurtmalar"
          value={stats.buyurtmalar}
          color="bg-gradient-to-br from-purple-500 to-purple-600"
          trend={-3}
        />
        <StatCard
          icon={DollarSign}
          title="Foyda"
          value={`${(stats.foyda / 1000000).toFixed(1)}M`}
          color="bg-gradient-to-br from-yellow-500 to-yellow-600"
          trend={18}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-green-600" />
            Haftalik Statistika
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="kirim" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="chiqim" stroke="#ef4444" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h3 className="text-lg font-semibold mb-4">So'nggi Buyurtmalar</h3>
          <div className="space-y-3">
            {recentOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Hozircha buyurtmalar yo'q</p>
            ) : (
              recentOrders.map(order => (
                <div key={order.id} className="flex justify-between items-center border-b pb-3 hover:bg-gray-50 p-2 rounded transition">
                  <div>
                    <p className="font-medium">{order.mijoz}</p>
                    <p className="text-sm text-gray-500">{order.mahsulot}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{order.summa?.toLocaleString()} so'm</p>
                    <span className={`text-xs px-2 py-1 rounded ${order.status === 'Yangi' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'Jarayonda' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Oylik Kirim-Chiqim</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="kirim" fill="#10b981" />
            <Bar dataKey="chiqim" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}