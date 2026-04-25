'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import StatCard from '@/components/StatCard'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Package, Users, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDashboardStats, useRecentOrders } from '@/hooks/useDashboardStats'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Haftalik tranzaksiya ma'lumotlarini grafik uchun formatlash.
 * Bu funksiyani komponent tashqarisida saqlash — render bilan bog'liq emas.
 */
function buildChartData(transactions, t, language) {
  const daysUz = [
    t('dashboard.sun'), t('dashboard.mon'), t('dashboard.tue'),
    t('dashboard.wed'), t('dashboard.thu'), t('dashboard.fri'), t('dashboard.sat')
  ]
  const weeklyData = {}
  for (let i = 6; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    const dayName = daysUz[date.getDay()]
    weeklyData[dateStr] = { name: dayName, kirim: 0, chiqim: 0 }
  }
  transactions.forEach((tx) => {
    if (weeklyData[tx.date]) {
      if (tx.type === 'income') weeklyData[tx.date].kirim += (Number(tx.amount) || 0)
      else weeklyData[tx.date].chiqim += (Number(tx.amount) || 0)
    }
  })
  return Object.values(weeklyData)
}


export default function Dashboard() {
  const { toggleSidebar } = useLayout()
  const { t, language } = useLanguage()
  const queryClient = useQueryClient()

  // React Query: keshdan tezkor ko'rsatish + orqafon yangilanish
  const { data: statsData, isLoading: statsLoading, error: statsError } = useDashboardStats()
  const { data: recentOrders = [], isLoading: ordersLoading } = useRecentOrders()

  const loading = statsLoading || ordersLoading

  // Statistika ma'lumotlari
  const stats = {
    mahsulotlar: statsData?.mahsulotlar ?? 0,
    xodimlar: statsData?.xodimlar ?? 0,
    buyurtmalar: statsData?.buyurtmalar ?? 0,
    foyda: statsData?.foyda ?? 0,
  }

  // Grafik uchun haftalik ma'lumot
  const chartData = buildChartData(statsData?.transactions || [], t, language)

  // Supabase realtime — yangi buyurtmada keshni yangilash
  useEffect(() => {
    const ordersChannel = supabase
      .channel('dashboard_updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
          queryClient.invalidateQueries({ queryKey: ['recent-orders'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
    }
  }, [queryClient])

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
      {/* Banner to force PWA/Mobile view without back history */}
      <div className="block md:hidden p-4 mb-2">
        <button
          onClick={() => window.location.replace('/mobile')}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all outline-none"
        >
          📱 Mobil versiyaga o'tish (PWA shaklida)
        </button>
      </div>

      <Header title={t('common.dashboard')} toggleSidebar={toggleSidebar} />

      {statsError ? (
        <div className="mx-4 md:mx-6 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p>
            <span className="font-semibold">{t('dashboard.loadErrorTitle')}</span>{' '}
            <span className="text-amber-900/90 break-words">{statsError?.message || String(statsError)}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
              queryClient.invalidateQueries({ queryKey: ['recent-orders'] })
            }}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
          >
            {t('dashboard.retryLoad')}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8 px-4 md:px-6">
        <StatCard
          icon={Package}
          title={t('dashboard.products')}
          value={stats.mahsulotlar}
          color="bg-blue-500"
          href="/mahsulotlar"
        />
        <StatCard
          icon={Users}
          title={t('dashboard.employees')}
          value={stats.xodimlar}
          color="bg-green-500"
          href="/xodimlar"
        />
        <StatCard
          icon={ShoppingCart}
          title={t('common.orders')}
          value={stats.buyurtmalar}
          color="bg-purple-500"
          href="/buyurtmalar"
        />
        <StatCard
          icon={DollarSign}
          title={t('dashboard.profit')}
          value={`${(stats.foyda / 1000000).toFixed(1)}M`}
          color="bg-amber-500"
          href="/moliya"
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
                <Link
                  key={order.id}
                  href={`/buyurtmalar?highlight=${encodeURIComponent(String(order.id))}`}
                  className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
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
                </Link>
              ))
            )}
          </div>
          <Link
            href="/buyurtmalar"
            className="block w-full mt-6 py-2.5 text-center text-sm font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t('dashboard.viewAll')}
          </Link>
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