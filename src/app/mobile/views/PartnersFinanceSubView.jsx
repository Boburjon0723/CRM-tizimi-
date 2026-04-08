'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { 
    Users, 
    ChevronRight, 
    ArrowUpCircle, 
    ArrowDownCircle, 
    Plus, 
    X, 
    Loader2,
    DollarSign,
    Calendar,
    FileText,
    History
} from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { 
    normalizeFinCurrency, 
    formatFinAmount 
} from '@/utils/financeCurrency'

export default function PartnersFinanceSubView() {
    const { t } = useLanguage()
    const [loading, setLoading] = useState(true)
    const [partners, setPartners] = useState([])
    const [entries, setEntries] = useState([])
    const [selectedPartner, setSelectedPartner] = useState(null)
    const [showAddForm, setShowAddForm] = useState(false)
    const [formType, setFormType] = useState('payment') // 'payment' (to partner), 'payment_in' (from partner)
    
    const [form, setForm] = useState({
        amount: '',
        currency: 'UZS',
        date: new Date().toISOString().split('T')[0],
        description: ''
    })

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        try {
            setLoading(true)
            const { data: p } = await supabase
                .from('finance_partners')
                .select('*')
                .eq('is_active', true)
                .order('name_uz', { ascending: true })

            const { data: e } = await supabase
                .from('partner_finance_entries')
                .select('*')
                .order('entry_date', { ascending: false })

            setPartners(p || [])
            setEntries(e || [])
        } catch (error) {
            console.error('Error fetching partner data:', error)
        } finally {
            setLoading(false)
        }
    }

    const partnerBalances = useMemo(() => {
        const balances = {}
        partners.forEach(p => {
            const partnerEntries = entries.filter(e => e.partner_id === p.id)
            let uzs = 0
            let usd = 0
            
            partnerEntries.forEach(e => {
                const amt = Number(e.amount_uzs) || 0
                const cur = normalizeFinCurrency(e.currency)
                
                // supply (kirim) / payment_in (tushum) -> increases what we owe or decreases what they owe
                // payment (to'lov) / sale_out (sotish) -> decreases what we owe or increases what they owe
                if (e.entry_type === 'supply' || e.entry_type === 'payment_in') {
                    if (cur === 'USD') usd += amt
                    else uzs += amt
                } else {
                    if (cur === 'USD') usd -= amt
                    else uzs -= amt
                }
            })
            balances[p.id] = { UZS: uzs, USD: usd }
        })
        return balances
    }, [partners, entries])

    async function handleSaveEntry(e) {
        e.preventDefault()
        if (!selectedPartner) return
        
        const amount = Number(form.amount)
        if (!amount || amount <= 0) return

        try {
            const { error } = await supabase.from('partner_finance_entries').insert([{
                partner_id: selectedPartner.id,
                entry_type: formType,
                amount_uzs: amount,
                currency: form.currency,
                entry_date: form.date,
                description: form.description.trim() || null,
                reference_code: `MOB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
            }])

            if (error) throw error

            setShowAddForm(false)
            setForm({
                amount: '',
                currency: 'UZS',
                date: new Date().toISOString().split('T')[0],
                description: ''
            })
            fetchData()
        } catch (error) {
            console.error('Error saving entry:', error)
            alert('Saqlashda xatolik yuz berdi')
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="text-sm font-medium">Hamkorlar yuklanmoqda...</p>
            </div>
        )
    }

    if (selectedPartner) {
        const balance = partnerBalances[selectedPartner.id] || { UZS: 0, USD: 0 }
        const partnerEntries = entries.filter(e => e.partner_id === selectedPartner.id)

        return (
            <div className="p-6 space-y-6">
                {/* Partner Detail Card */}
                <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                            <Users size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">{selectedPartner.name_uz}</h3>
                            <p className="text-xs text-slate-500">{selectedPartner.phone || 'Telefon yo\'q'}</p>
                        </div>
                        <button 
                            onClick={() => setSelectedPartner(null)}
                            className="ml-auto p-2 text-slate-500"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mb-1">Balans (UZS)</p>
                            <p className={`text-sm font-bold ${balance.UZS > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {balance.UZS > 0 ? 'Biz qarzdormiz' : 'Ular qarzdor'}
                                <br />
                                <span className="text-lg tabular-nums">{Math.abs(balance.UZS).toLocaleString()}</span>
                            </p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mb-1">Balans (USD)</p>
                            <p className={`text-sm font-bold ${balance.USD > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {balance.USD > 0 ? 'Biz qarzdormiz' : 'Ular qarzdor'}
                                <br />
                                <span className="text-lg tabular-nums">${Math.abs(balance.USD).toLocaleString()}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button 
                            onClick={() => { setFormType('payment'); setShowAddForm(true); }}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-500 text-white text-xs font-bold active:scale-95 transition-all shadow-lg shadow-rose-500/20"
                        >
                            <ArrowUpCircle size={16} />
                            To'lov berish
                        </button>
                        <button 
                            onClick={() => { setFormType('payment_in'); setShowAddForm(true); }}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-bold active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
                        >
                            <ArrowDownCircle size={16} />
                            Tushum olish
                        </button>
                    </div>
                </div>

                {/* History */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-400">
                        <History size={16} />
                        <h4 className="text-xs font-bold uppercase tracking-widest">Amallar tarixi</h4>
                    </div>
                    <div className="space-y-3">
                        {partnerEntries.map(e => (
                            <div key={e.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    (e.entry_type === 'supply' || e.entry_type === 'payment_in') 
                                        ? 'bg-emerald-500/10 text-emerald-400' 
                                        : 'bg-rose-500/10 text-rose-400'
                                }`}>
                                    {(e.entry_type === 'supply' || e.entry_type === 'payment_in') ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">
                                        {e.entry_type === 'supply' ? 'Xomashyo kirimi' : 
                                         e.entry_type === 'payment_in' ? 'Hamkor tushumi' :
                                         e.entry_type === 'sale_out' ? 'Sotish (chiqim)' : 'Hamkorga to\'lov'}
                                    </p>
                                    <p className="text-[10px] text-slate-500">{e.entry_date}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-bold tabular-nums ${
                                        (e.entry_type === 'supply' || e.entry_type === 'payment_in') ? 'text-emerald-400' : 'text-rose-400'
                                    }`}>
                                        {(e.entry_type === 'supply' || e.entry_type === 'payment_in') ? '+' : '-'}
                                        {normalizeFinCurrency(e.currency) === 'USD' ? '$' : ''}
                                        {Number(e.amount_uzs).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] text-slate-700 font-mono tracking-tighter">{e.reference_code}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Modal Form */}
                {showAddForm && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="w-full max-w-md bg-slate-900 rounded-t-[40px] sm:rounded-[40px] border border-white/10 p-8 shadow-2xl space-y-6 animate-in slide-in-from-bottom duration-300">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-white">
                                    {formType === 'payment' ? 'Hamkorga to\'lov' : 'Hamkordan tushum'}
                                </h3>
                                <button onClick={() => setShowAddForm(false)} className="p-2 text-slate-500 hover:text-white">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleSaveEntry} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Summa</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                                            <DollarSign size={20} />
                                        </div>
                                        <input 
                                            type="number"
                                            value={form.amount}
                                            onChange={e => setForm({...form, amount: e.target.value})}
                                            placeholder="0.00"
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold outline-none focus:border-indigo-500 transition-all text-lg"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valyuta</label>
                                        <select 
                                            value={form.currency}
                                            onChange={e => setForm({...form, currency: e.target.value})}
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white font-bold outline-none focus:border-indigo-500 transition-all"
                                        >
                                            <option value="UZS">So'm (UZS)</option>
                                            <option value="USD">Dollar (USD)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Sana</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                                <Calendar size={18} />
                                            </div>
                                            <input 
                                                type="date"
                                                value={form.date}
                                                onChange={e => setForm({...form, date: e.target.value})}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold outline-none focus:border-indigo-500 transition-all text-xs"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Izoh (ixtiyoriy)</label>
                                    <div className="relative">
                                        <div className="absolute left-4 top-4 text-slate-500">
                                            <FileText size={18} />
                                        </div>
                                        <textarea 
                                            value={form.description}
                                            onChange={e => setForm({...form, description: e.target.value})}
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-medium outline-none focus:border-indigo-500 transition-all h-24 text-sm"
                                            placeholder="To'lov haqida qo'shimcha ma'lumot..."
                                        />
                                    </div>
                                </div>

                                <button 
                                    type="submit"
                                    className={`w-full py-5 rounded-3xl font-bold text-white shadow-2xl transition-all active:scale-95 ${
                                        formType === 'payment' ? 'bg-rose-600 shadow-rose-600/30' : 'bg-emerald-600 shadow-emerald-600/30'
                                    }`}
                                >
                                    {formType === 'payment' ? 'To\'lovni tasdiqlash' : 'Tushumni tasdiqlash'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6">
            <h2 className="text-xl font-bold text-white mb-2">Hamkorlar ro'yxati</h2>
            <div className="grid gap-4">
                {partners.map(p => {
                    const balance = partnerBalances[p.id] || { UZS: 0, USD: 0 }
                    const isNeutral = Math.abs(balance.UZS) < 0.1 && Math.abs(balance.USD) < 0.1
                    const ourDebt = balance.UZS > 0 || balance.USD > 0

                    return (
                        <div 
                            key={p.id}
                            onClick={() => setSelectedPartner(p)}
                            className="p-5 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-4 group"
                        >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                                isNeutral ? 'bg-slate-500/10 text-slate-400' : 
                                ourDebt ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                            }`}>
                                <Users size={24} />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">{p.name_uz}</h3>
                                <div className="flex items-center gap-3 text-[10px] font-medium mt-1">
                                    <span className={balance.UZS > 0 ? 'text-rose-400/80' : 'text-emerald-400/80'}>
                                        {Math.abs(balance.UZS).toLocaleString()} UZS
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-slate-700" />
                                    <span className={balance.USD > 0 ? 'text-rose-400/80' : 'text-emerald-400/80'}>
                                        ${Math.abs(balance.USD).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <ChevronRight size={18} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
