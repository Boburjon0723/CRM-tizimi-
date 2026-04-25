'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, CheckCircle2, AlertCircle, Clock, ChevronRight, Loader2, X, Wallet } from 'lucide-react'

function employeeMapKey(id) {
    if (id == null || id === '') return ''
    return String(id).trim().toLowerCase()
}

function calendarYmd(value) {
    if (value == null || value === '') return ''
    const s = String(value).trim()
    const head = s.length >= 10 ? s.slice(0, 10) : ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function formatYmdUz(ymd) {
    if (!ymd || typeof ymd !== 'string') return ''
    const [y, m, d] = ymd.split('-')
    if (!y || !m || !d) return ymd
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`
}

export default function EmployeesView() {
    const [loading, setLoading] = useState(true)
    const [selectedEmployee, setSelectedEmployee] = useState(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [actionType, setActionType] = useState(null)
    const [actionAmount, setActionAmount] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [data, setData] = useState({
        employees: [],
        totalPayroll: 0
    })

    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })

    const displayMonthLabel = useMemo(() => {
        if (!selectedDate) return ''
        const [y, m] = selectedDate.split('-')
        return new Date(y, m - 1, 1).toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' })
    }, [selectedDate])

    useEffect(() => {
        async function fetchEmployeeData() {
            try {
                setLoading(true)
                const [yStr, mStr] = selectedDate.split('-')
                const y = parseInt(yStr, 10)
                const m = parseInt(mStr, 10)
                
                const startOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
                const endOfMonth = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`

                // 1. Fetch Employees
                const { data: emps } = await supabase
                    .from('employees')
                    .select('*')
                
                // 2. Fetch Advances for current month
                const { data: advances } = await supabase
                    .from('employee_advances')
                    .select('employee_id, amount')
                    .gte('advance_date', startOfMonth)
                    .lte('advance_date', endOfMonth)

                // 3. Fetch Salary Payments for current month
                const { data: payments } = await supabase
                    .from('employee_salary_payments')
                    .select('employee_id, amount')
                    .gte('payment_date', startOfMonth)
                    .lte('payment_date', endOfMonth)

                // 4. Fetch approved leave dates (all time), latest first
                const { data: leaveRows, error: leaveErr } = await supabase
                    .from('employee_leave_requests')
                    .select('employee_id, resolved_at, created_at, status')
                    .eq('status', 'approved')
                    .order('resolved_at', { ascending: false })
                    .limit(3000)

                if (leaveErr) {
                    const msg = String(leaveErr.message || '')
                    if (!msg.includes('Could not find the table') && !msg.includes('does not exist')) {
                        console.warn('employee_leave_requests:', leaveErr.message)
                    }
                }

                const approvedLeaveDatesByEmployee = {}
                for (const r of leaveRows || []) {
                    const k = employeeMapKey(r.employee_id)
                    if (!k) continue
                    const iso = r.resolved_at || r.created_at
                    const ymd = calendarYmd(iso)
                    if (!ymd) continue
                    if (!approvedLeaveDatesByEmployee[k]) approvedLeaveDatesByEmployee[k] = new Set()
                    approvedLeaveDatesByEmployee[k].add(ymd)
                }

                const processed = (emps || []).map(emp => {
                    const empKey = employeeMapKey(emp.id)
                    const advSum = (advances || [])
                        .filter(a => a.employee_id === emp.id)
                        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
                    
                    const paySum = (payments || [])
                        .filter(p => p.employee_id === emp.id)
                        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

                    const totalPaid = advSum + paySum
                    const contract = Number(emp.monthly_salary) || 0
                    
                    let status = 'Kutilmoqda'
                    let type = 'error'

                    if (totalPaid >= contract && contract > 0) {
                        status = 'To\'landi'
                        type = 'success'
                    } else if (totalPaid > 0) {
                        status = 'Qisman'
                        type = 'warning'
                    }

                    const restDaysCount = Math.max(0, Number(emp.rest_days) || 0)
                    const approvedLeaveDates = [...(approvedLeaveDatesByEmployee[empKey] || [])]
                        .sort((a, b) => b.localeCompare(a))
                        .map((ymd) => formatYmdUz(ymd))
                    const approvedVisibleDates =
                        restDaysCount > 0 ? approvedLeaveDates.slice(0, restDaysCount) : []

                    return {
                        id: emp.id,
                        name: emp.name,
                        position: emp.position,
                        phone: emp.phone || '',
                        restDays: restDaysCount,
                        approvedVisibleDates,
                        status,
                        type,
                        totalPaid,
                        contract,
                        advSum,
                        paySum
                    }
                })

                const totalPayroll = processed.reduce((sum, e) => sum + e.totalPaid, 0)

                setData({
                    employees: processed,
                    totalPayroll
                })
            } catch (error) {
                console.error('Error fetching employee data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchEmployeeData()
    }, [selectedDate, refreshKey])

    const handleActionSubmit = async () => {
        if (!actionAmount || isNaN(actionAmount) || Number(actionAmount) <= 0) return
        setSubmitting(true)
        try {
            const amount = Number(actionAmount)
            const dateStr = new Date().toISOString().split('T')[0]

            if (actionType === 'advance') {
                const { error } = await supabase.from('employee_advances').insert({
                    employee_id: selectedEmployee.id,
                    amount,
                    advance_date: dateStr,
                    note: 'Mobil ilova'
                })
                if (error) throw error
            } else if (actionType === 'salary') {
                const { error } = await supabase.from('employee_salary_payments').insert({
                    employee_id: selectedEmployee.id,
                    amount,
                    payment_date: dateStr,
                    note: 'Mobil ilova'
                })
                if (error) throw error
            }
            
            setActionType(null)
            setActionAmount('')
            setSelectedEmployee(null)
            setRefreshKey(prev => prev + 1)
        } catch(err) {
            console.error('Action error:', err)
            alert('Xatolik yuz berdi: ' + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const getStatusStyle = (type) => {
        switch (type) {
            case 'success':
                return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
            case 'warning':
                return { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' }
            case 'error':
                return { icon: AlertCircle, color: 'text-rose-400', bg: 'bg-rose-500/10' }
            default:
                return { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-500/10' }
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-400 font-medium animate-pulse">Xodimlar ma'lumotlari yuklanmoqda...</p>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-700">
            {/* Header / Employees Title */}
            <section className="space-y-1">
                <p className="text-slate-400 text-sm font-medium">Xodimlar</p>
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-white tracking-tight">Oylik & Avans</h1>
                    <div className="relative flex items-center justify-center cursor-pointer rounded-full font-bold bg-indigo-600/30 text-indigo-400 border border-indigo-500/10 active:scale-95 transition-all">
                        <input 
                            type="month" 
                            value={selectedDate}
                            onChange={(e) => {
                                if (e.target.value) setSelectedDate(e.target.value)
                            }}
                            onClick={(e) => {
                                try {
                                    if (typeof e.target.showPicker === 'function') {
                                        e.target.showPicker()
                                    }
                                } catch (err) {
                                    // Ignore if not supported
                                }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="flex items-center gap-1.5 px-3 py-1.5 pointer-events-none">
                            <span className="text-[10px] uppercase tracking-widest">{displayMonthLabel}</span>
                            <ChevronRight size={12} className="rotate-90 text-indigo-500/80" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Employee List */}
            <section className="space-y-3">
                {data.employees.length > 0 ? (
                    data.employees.map((emp, idx) => {
                        const statusStyle = getStatusStyle(emp.type)
                        return (
                            <div 
                                key={idx} 
                                onClick={() => setSelectedEmployee(emp)}
                                className="flex items-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-300 group cursor-pointer active:scale-95"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-indigo-500/10 shrink-0">
                                    {emp.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                
                                <div className="flex-1 min-w-0 px-1">
                                    <h4 className="text-sm font-bold text-white/90 truncate">{emp.name}</h4>
                                    <p className="text-xs text-slate-500 truncate font-medium">{emp.position}</p>
                                    {emp.approvedVisibleDates?.length > 0 ? (
                                        <p className="text-[10px] text-slate-400 truncate mt-1">
                                            Dam (tasdiqlangan): <span className="font-mono">{emp.approvedVisibleDates.join(', ')}</span>
                                        </p>
                                    ) : null}
                                </div>

                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${statusStyle.bg} border border-white/5`}>
                                        <statusStyle.icon size={12} className={statusStyle.color} />
                                        <span className={`text-[10px] font-bold ${statusStyle.color}`}>{emp.status}</span>
                                    </div>
                                    <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                                </div>
                            </div>
                        )
                    })
                ) : (
                    <p className="text-center py-8 text-slate-500 text-sm">Xodimlar topilmadi</p>
                )}
            </section>

            {/* Quick Actions / Summary Card */}
            <section className="p-6 rounded-3xl bg-indigo-600 shadow-xl shadow-indigo-600/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-32 h-32 bg-white/10 blur-3xl rounded-full" />
                <div className="relative z-10 flex items-center justify-between">
                    <div className="space-y-1">
                        <p className="text-indigo-100/70 text-xs font-bold uppercase tracking-wider">Jami berilgan (oy davomida)</p>
                        <h3 className="text-2xl font-bold text-white truncate max-w-[200px]">{data.totalPayroll.toLocaleString()} <span className="text-sm font-medium text-indigo-100 uppercase">So'm</span></h3>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white group-hover:bg-white/20 transition-colors">
                        <Users size={20} />
                    </div>
                </div>
            </section>
            {/* Employee Details Bottom Sheet */}
            {selectedEmployee && (
                <div className="fixed inset-0 z-[100] flex flex-col justify-end items-center">
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" onClick={() => {
                        setSelectedEmployee(null)
                        setActionType(null)
                        setActionAmount('')
                    }} />
                    <div className="relative w-full max-w-lg bg-slate-900 border-t border-white/10 rounded-t-3xl shadow-2xl p-6 pb-safe animate-in slide-in-from-bottom duration-300">
                        <button 
                            onClick={() => {
                                setSelectedEmployee(null)
                                setActionType(null)
                                setActionAmount('')
                            }}
                            className="absolute top-4 right-4 p-2 bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-indigo-500/20 shrink-0">
                                {selectedEmployee.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white tracking-tight leading-tight">{selectedEmployee.name}</h2>
                                <p className="text-sm font-medium text-slate-400 mt-1">{selectedEmployee.position}</p>
                                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1">
                                    <span className="text-[10px] text-indigo-200/85">Dam (tasdiqlangan):</span>
                                    <span className="text-[11px] font-mono text-indigo-100">
                                        {selectedEmployee.approvedVisibleDates?.length > 0
                                            ? selectedEmployee.approvedVisibleDates.join(', ')
                                            : 'yo‘q'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Shartnoma</p>
                                <p className="text-sm font-bold text-white">{selectedEmployee.contract.toLocaleString()} So'm</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/10">
                                <p className="text-[10px] uppercase font-bold text-indigo-400 mb-1">Jami berilgan</p>
                                <p className="text-sm font-bold text-indigo-100">{selectedEmployee.totalPaid.toLocaleString()} So'm</p>
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Qoldiq summa:</span>
                                <span className="text-base font-bold text-white">
                                    {Math.max(0, selectedEmployee.contract - selectedEmployee.totalPaid).toLocaleString()} So'm
                                </span>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                                <div 
                                    className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                                    style={{ width: `${Math.min(100, selectedEmployee.contract ? (selectedEmployee.totalPaid / selectedEmployee.contract) * 100 : 0)}%`}} 
                                />
                            </div>
                        </div>

                        {!actionType ? (
                            <div className="flex gap-3 mb-6">
                                <button 
                                    onClick={() => setActionType('advance')}
                                    className="flex-1 py-3.5 px-4 bg-white/5 hover:bg-white/10 active:scale-95 transition-all rounded-xl border border-white/5 text-sm font-bold text-white flex items-center justify-center gap-2"
                                >
                                    <Wallet size={18} className="text-indigo-400" />
                                    Avans
                                </button>
                                <button 
                                    onClick={() => {
                                        setActionType('salary')
                                        setActionAmount(String(Math.max(0, selectedEmployee.contract - selectedEmployee.totalPaid)))
                                    }}
                                    className="flex-1 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all rounded-xl border border-indigo-500 text-sm font-bold text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                                >
                                    <CheckCircle2 size={18} />
                                    Oylik yopish
                                </button>
                            </div>
                        ) : (
                            <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10 animate-in fade-in zoom-in-95">
                                <p className="text-sm font-bold text-white mb-3">
                                    {actionType === 'advance' ? 'Avans summasi' : 'Oylik to\'lov summasi'}
                                </p>
                                <div className="relative mb-3">
                                    <input 
                                        type="number"
                                        value={actionAmount}
                                        onChange={e => setActionAmount(e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold uppercase">So'm</span>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        disabled={submitting}
                                        onClick={() => {
                                            setActionType(null)
                                            setActionAmount('')
                                        }} 
                                        className="px-4 py-3 rounded-xl bg-white/5 text-slate-300 font-bold hover:bg-white/10 transition-colors"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button 
                                        disabled={submitting || !actionAmount}
                                        onClick={handleActionSubmit}
                                        className="flex-1 py-3 rounded-xl bg-indigo-600 disabled:opacity-50 text-white font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                                    >
                                        {submitting ? <Loader2 size={18} className="animate-spin" /> : 'Saqlash'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
