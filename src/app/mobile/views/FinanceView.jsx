'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Wallet, TrendingUp, TrendingDown, Clock, Search, MoreVertical, Loader2, Users, Building2, ChevronLeft } from 'lucide-react'
import PartnersFinanceSubView from './PartnersFinanceSubView'
import DepartmentsSubView from './DepartmentsSubView'
import { useLanguage } from '@/context/LanguageContext'

export default function FinanceView() {
    const { t } = useLanguage()
    const [currentSubView, setCurrentSubView] = useState(null) // null, 'partners', 'departments'
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
                // We no longer need to calculate balance or recent transactions for this view
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

    if (currentSubView === 'partners') {
        return (
            <div className="animate-in slide-in-from-right duration-300">
                <button 
                    onClick={() => setCurrentSubView(null)}
                    className="flex items-center gap-2 p-6 text-slate-400 hover:text-white transition-colors"
                >
                    <ChevronLeft size={20} />
                    <span className="font-bold">Ortga</span>
                </button>
                <PartnersFinanceSubView />
            </div>
        )
    }

    if (currentSubView === 'departments') {
        return (
            <div className="animate-in slide-in-from-right duration-300">
                <button 
                    onClick={() => setCurrentSubView(null)}
                    className="flex items-center gap-2 p-6 text-slate-400 hover:text-white transition-colors"
                >
                    <ChevronLeft size={20} />
                    <span className="font-bold">Ortga</span>
                </button>
                <DepartmentsSubView />
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

            {/* Navigation Hub */}
            <section className="grid grid-cols-2 gap-4">
                <button 
                    onClick={() => setCurrentSubView('partners')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-900 border border-white/10 shadow-xl active:scale-95 transition-all text-white"
                >
                    <div className="p-3 rounded-2xl bg-white/10 ring-1 ring-white/20">
                        <Users size={28} />
                    </div>
                    <span className="text-xs font-bold text-center">Hamkorlar moliyasi</span>
                </button>

                <button 
                    onClick={() => setCurrentSubView('departments')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 shadow-xl active:scale-95 transition-all text-white"
                >
                    <div className="p-3 rounded-2xl bg-white/10 ring-1 ring-white/20">
                        <Building2 size={28} />
                    </div>
                    <span className="text-xs font-bold text-center">Bo'limlar</span>
                </button>
            </section>
        </div>
    )
}
