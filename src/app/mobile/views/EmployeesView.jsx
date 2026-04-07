'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, CheckCircle2, AlertCircle, Clock, ChevronRight, Loader2 } from 'lucide-react'

export default function EmployeesView() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState({
        employees: [],
        totalPayroll: 0,
        monthLabel: ''
    })

    useEffect(() => {
        async function fetchEmployeeData() {
            try {
                setLoading(true)
                const now = new Date()
                const y = now.getFullYear()
                const m = now.getMonth() + 1
                const monthLabel = now.toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' })
                
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

                const processed = (emps || []).map(emp => {
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

                    return {
                        id: emp.id,
                        name: emp.name,
                        position: emp.position,
                        status,
                        type,
                        totalPaid
                    }
                })

                const totalPayroll = processed.reduce((sum, e) => sum + e.totalPaid, 0)

                setData({
                    employees: processed,
                    totalPayroll,
                    monthLabel
                })
            } catch (error) {
                console.error('Error fetching employee data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchEmployeeData()
    }, [])

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
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/10 uppercase tracking-widest">{data.monthLabel}</span>
                </div>
            </section>

            {/* Employee List */}
            <section className="space-y-3">
                {data.employees.length > 0 ? (
                    data.employees.map((emp, idx) => {
                        const statusStyle = getStatusStyle(emp.type)
                        return (
                            <div key={idx} className="flex items-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-300 group cursor-pointer active:scale-95">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-indigo-500/10 shrink-0">
                                    {emp.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                
                                <div className="flex-1 min-w-0 px-1">
                                    <h4 className="text-sm font-bold text-white/90 truncate">{emp.name}</h4>
                                    <p className="text-xs text-slate-500 truncate font-medium">{emp.position}</p>
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
        </div>
    )
}
