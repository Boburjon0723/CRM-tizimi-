'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Wallet, TrendingUp, TrendingDown, Clock, Search, MoreVertical, Loader2 } from 'lucide-react'

export default function FinanceView() {
    const [loading, setLoading] = useState(true)
    const [finance, setFinance] = useState({
        balance: 0,
        monthlyIn: 0,
        monthlyOut: 0,
        transactions: []
    })

    useEffect(() => {
        async function fetchFinanceData() {
            try {
                setLoading(true)
                const now = new Date()
                const y = now.getFullYear()
                const m = now.getMonth() + 1
                const startOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
                
                // 1. Fetch Transactions
                const { data: allTrans } = await supabase
                    .from('transactions')
                    .select('*')
                    .order('date', { ascending: false })
                    .order('created_at', { ascending: false })

                const transactions = allTrans || []
                
                // 2. Calculate Total Balance
                const balance = transactions.reduce((sum, t) => {
                    const amt = Number(t.amount) || 0
                    return t.type === 'inflow' ? sum + amt : sum - amt
                }, 0)

                // 3. Calculate Monthly Stats
                const monthlyIn = transactions
                    .filter(t => t.date >= startOfMonth && t.type === 'inflow')
                    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

                const monthlyOut = transactions
                    .filter(t => t.date >= startOfMonth && t.type === 'outflow')
                    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

                // 4. Recent Transactions (First 10)
                const recent = transactions.slice(0, 10).map(t => ({
                    title: t.note || (t.type === 'inflow' ? 'Kirim' : 'Chiqim'),
                    amount: (t.type === 'inflow' ? '+' : '-') + Number(t.amount).toLocaleString(),
                    type: t.type === 'inflow' ? 'in' : 'out',
                    date: t.date,
                    category: t.type === 'inflow' ? 'Daromad' : 'Xarajat'
                }))

                setFinance({
                    balance,
                    monthlyIn,
                    monthlyOut,
                    transactions: recent
                })
            } catch (error) {
                console.error('Error fetching finance data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchFinanceData()
    }, [])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-400 font-medium animate-pulse">Moliya ma'lumotlari yuklanmoqda...</p>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-700">
            {/* Header / Finance Title */}
            <section className="space-y-1">
                <p className="text-slate-400 text-sm font-medium">Moliya</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">Balans & Tranzaksiyalar</h1>
            </section>

            {/* Wallet Card */}
            <section className="p-8 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-700 shadow-2xl shadow-indigo-500/20 relative overflow-hidden group">
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 blur-3xl rounded-full" />
                <div className="relative z-10 space-y-6">
                    <div className="flex items-start justify-between">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                            <Wallet size={24} />
                        </div>
                        <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-white/10 text-white uppercase tracking-widest border border-white/10">Asosiy hamyon</span>
                    </div>
                    
                    <div className="space-y-1">
                        <p className="text-indigo-100/60 text-xs font-bold uppercase tracking-wider">Mavjud mablag'</p>
                        <h2 className="text-3xl font-bold text-white tracking-tighter truncate">{finance.balance.toLocaleString()} <span className="text-sm font-medium text-indigo-100/70 uppercase">So'm</span></h2>
                    </div>

                    <div className="pt-4 flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="p-1 rounded-full bg-emerald-400/20 text-emerald-300">
                                <TrendingUp size={12} />
                            </div>
                            <span className="text-[10px] font-bold text-white truncate max-w-[80px]">{(finance.monthlyIn / 1000000).toFixed(1)}M</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="p-1 rounded-full bg-rose-400/20 text-rose-300">
                                <TrendingDown size={12} />
                            </div>
                            <span className="text-[10px] font-bold text-white truncate max-w-[80px]">{(finance.monthlyOut / 1000000).toFixed(1)}M</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Transaction List */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white/90">Tranzaksiyalar</h2>
                    <button className="p-2 text-slate-500 hover:text-slate-300">
                        <Search size={20} />
                    </button>
                </div>

                <div className="space-y-3">
                    {finance.transactions.length > 0 ? (
                        finance.transactions.map((tx, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-300 group cursor-pointer active:scale-95">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                                    tx.type === 'in' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                }`}>
                                    {tx.type === 'in' ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
                                </div>
                                
                                <div className="flex-1 min-w-0 px-1">
                                    <h4 className="text-sm font-bold text-white/90 truncate">{tx.title}</h4>
                                    <div className="flex items-center gap-2 text-[10px] font-medium">
                                        <span className="text-slate-500">{tx.category}</span>
                                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                                        <span className="text-slate-500">{tx.date}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className={`text-sm font-bold ${
                                        tx.type === 'in' ? 'text-emerald-400' : 'text-rose-400'
                                    }`}>
                                        {tx.amount}
                                    </span>
                                    <MoreVertical size={14} className="text-slate-700 group-hover:text-slate-500 transition-colors" />
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-center py-8 text-slate-500 text-sm">Tranzaksiyalar topilmadi</p>
                    )}
                </div>
            </section>
        </div>
    )
}
