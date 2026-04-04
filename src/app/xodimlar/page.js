'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { UserPlus, Edit, Trash2, Save, X, Search, Users, DollarSign, CreditCard, Banknote, Wallet } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'

/** CRM maxfiy amallar: bot telefon orqali alohida. Bo‘sh bo‘lsa MOLIYA_DELETE_PIN ishlatiladi. */
const XODIMLAR_ACTION_PIN = String(
    process.env.NEXT_PUBLIC_XODIMLAR_ACTION_PIN ?? process.env.NEXT_PUBLIC_MOLIYA_DELETE_PIN ?? ''
).trim()

export default function Xodimlar() {
    const { toggleSidebar } = useLayout()
    const { t } = useLanguage()
    const { showAlert, showConfirm } = useDialog()
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [form, setForm] = useState({
        name: '',
        position: '',
        monthly_salary: '',
        bonus_percent: '0',
        worked_days: '0',
        rest_days: '0'
    })
    /** Shu oy: employee_id → [{ advance_date, amount }] */
    const [advancesByEmployee, setAdvancesByEmployee] = useState({})
    /** Shu oy: employee_id → [{ payment_date, amount }] */
    const [salaryPaymentsByEmployee, setSalaryPaymentsByEmployee] = useState({})
    const [salaryPaymentsTableMissing, setSalaryPaymentsTableMissing] = useState(false)
    /** { employeeId, name } | null */
    const [salaryModal, setSalaryModal] = useState(null)
    const [salaryForm, setSalaryForm] = useState({ amount: '', payment_date: '', note: '' })
    const [salarySaving, setSalarySaving] = useState(false)
    const [advancesTableMissing, setAdvancesTableMissing] = useState(false)
    const [advanceModal, setAdvanceModal] = useState(null)
    const [advanceForm, setAdvanceForm] = useState({ amount: '', advance_date: '', note: '' })
    const [advanceSaving, setAdvanceSaving] = useState(false)
    const [actionPinModal, setActionPinModal] = useState(null)
    const [actionPinValue, setActionPinValue] = useState('')

    function formatUzs(n) {
        const v = Number(n) || 0
        return `${v.toLocaleString('uz-UZ')} so'm`
    }

    function formatAdvanceDate(iso) {
        if (!iso) return ''
        const part = String(iso).split('T')[0]
        const [y, m, d] = part.split('-')
        if (!d || !m || !y) return part
        return `${d}.${m}.${y}`
    }

    function currentMonthRange() {
        const d = new Date()
        const y = d.getFullYear()
        const mo = d.getMonth()
        const pad = (n) => String(n).padStart(2, '0')
        const from = `${y}-${pad(mo + 1)}-01`
        const lastDay = new Date(y, mo + 1, 0).getDate()
        const to = `${y}-${pad(mo + 1)}-${pad(lastDay)}`
        return { from, to }
    }

    function todayIsoLocal() {
        const d = new Date()
        const y = d.getFullYear()
        const mo = d.getMonth() + 1
        const day = d.getDate()
        const pad = (n) => String(n).padStart(2, '0')
        return `${y}-${pad(mo)}-${pad(day)}`
    }

    const loadEmployees = useCallback(async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('employees')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            const rows = data || []
            setEmployees(rows)

            const { from, to } = currentMonthRange()
            const { data: advRows, error: advErr } = await supabase
                .from('employee_advances')
                .select('employee_id, amount, advance_date')
                .gte('advance_date', from)
                .lte('advance_date', to)
                .order('advance_date', { ascending: false })

            if (advErr) {
                const msg = String(advErr.message || '')
                if (!msg.includes('Could not find the table') && !msg.includes('does not exist')) {
                    console.warn('employee_advances:', advErr.message)
                }
                setAdvancesByEmployee({})
                setAdvancesTableMissing(
                    msg.includes('Could not find the table') || msg.includes('does not exist')
                )
            } else {
                setAdvancesTableMissing(false)
                const byEmp = {}
                for (const a of advRows || []) {
                    const id = a.employee_id
                    if (!id) continue
                    if (!byEmp[id]) byEmp[id] = []
                    byEmp[id].push({
                        advance_date: a.advance_date,
                        amount: Number(a.amount || 0)
                    })
                }
                for (const k of Object.keys(byEmp)) {
                    byEmp[k].sort((a, b) => String(b.advance_date).localeCompare(String(a.advance_date)))
                }
                setAdvancesByEmployee(byEmp)
            }

            const { data: salRows, error: salErr } = await supabase
                .from('employee_salary_payments')
                .select('employee_id, amount, payment_date')
                .gte('payment_date', from)
                .lte('payment_date', to)
                .order('payment_date', { ascending: false })

            if (salErr) {
                const msg = String(salErr.message || '')
                if (!msg.includes('Could not find the table') && !msg.includes('does not exist')) {
                    console.warn('employee_salary_payments:', salErr.message)
                }
                setSalaryPaymentsByEmployee({})
                setSalaryPaymentsTableMissing(
                    msg.includes('Could not find the table') || msg.includes('does not exist')
                )
            } else {
                setSalaryPaymentsTableMissing(false)
                const salBy = {}
                for (const r of salRows || []) {
                    const id = r.employee_id
                    if (!id) continue
                    if (!salBy[id]) salBy[id] = []
                    salBy[id].push({
                        payment_date: r.payment_date,
                        amount: Number(r.amount || 0)
                    })
                }
                for (const k of Object.keys(salBy)) {
                    salBy[k].sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))
                }
                setSalaryPaymentsByEmployee(salBy)
            }
        } catch (error) {
            console.error('Error loading employees:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadEmployees()
    }, [loadEmployees])

    function requireEmployeePinOrWarn() {
        if (XODIMLAR_ACTION_PIN) return true
        void showAlert(t('employees.actionPinNotConfigured'), { variant: 'warning' })
        return false
    }

    function openEmployeeActionPin(kind, extra = {}) {
        if (!requireEmployeePinOrWarn()) return
        setActionPinModal({ kind, ...extra })
        setActionPinValue('')
    }

    function closeActionPinModal() {
        setActionPinModal(null)
        setActionPinValue('')
    }

    function actionPinSubmitLabel(kind) {
        if (kind === 'delete') return t('common.delete')
        if (kind === 'save') return t('common.save')
        return t('common.ok')
    }

    function actionPinGateTitle(kind) {
        switch (kind) {
            case 'delete':
                return t('employees.actionPinGateDelete')
            case 'edit':
                return t('employees.actionPinGateEdit')
            case 'salary':
                return t('employees.actionPinGateSalary')
            case 'advance':
                return t('employees.actionPinGateAdvance')
            case 'save':
                return t('employees.actionPinGateSave')
            default:
                return t('finances.deletePinTitle')
        }
    }

    async function persistEmployee() {
        if (!form.name || !form.position || !form.monthly_salary) {
            alert(t('employees.requiredError'))
            return
        }
        try {
            const employeeData = {
                name: form.name,
                position: form.position,
                monthly_salary: parseFloat(form.monthly_salary),
                bonus_percent: parseFloat(form.bonus_percent) || 0,
                worked_days: parseInt(form.worked_days) || 0,
                rest_days: parseInt(form.rest_days) || 0
            }

            if (editId) {
                const { error } = await supabase.from('employees').update(employeeData).eq('id', editId)
                if (error) throw error
                setEditId(null)
            } else {
                const { error } = await supabase.from('employees').insert([employeeData])
                if (error) throw error
            }

            setForm({ name: '', position: '', monthly_salary: '', bonus_percent: '0', worked_days: '0', rest_days: '0' })
            setIsAdding(false)
            loadEmployees()
        } catch (error) {
            console.error('Error saving employee:', error)
            await showAlert(t('common.saveError'), { variant: 'error' })
        }
    }

    async function confirmEmployeeActionPin(e) {
        e.preventDefault()
        if (!actionPinModal) return
        if (actionPinValue !== XODIMLAR_ACTION_PIN) {
            await showAlert(t('finances.deletePinWrong'), { variant: 'error' })
            return
        }
        const m = actionPinModal
        closeActionPinModal()

        if (m.kind === 'save') {
            await persistEmployee()
            return
        }
        if (m.kind === 'edit' && m.xodim) {
            const item = m.xodim
            setForm({
                name: item.name,
                position: item.position,
                monthly_salary: item.monthly_salary.toString(),
                bonus_percent: item.bonus_percent?.toString() || '0',
                worked_days: item.worked_days?.toString() || '0',
                rest_days: item.rest_days?.toString() || '0'
            })
            setEditId(item.id)
            setIsAdding(true)
            return
        }
        if (m.kind === 'salary' && m.xodim) {
            const xodim = m.xodim
            const suggested = (Number(xodim.monthly_salary) || 0) + (Number(xodim.bonus_percent) || 0)
            setSalaryModal({ employeeId: xodim.id, name: xodim.name })
            setSalaryForm({
                amount: suggested > 0 ? String(suggested) : '',
                payment_date: todayIsoLocal(),
                note: ''
            })
            return
        }
        if (m.kind === 'advance' && m.xodim) {
            const xodim = m.xodim
            setAdvanceModal({ employeeId: xodim.id, name: xodim.name })
            setAdvanceForm({ amount: '', advance_date: todayIsoLocal(), note: '' })
            return
        }
        if (m.kind === 'delete' && m.employeeId) {
            try {
                const { error } = await supabase.from('employees').delete().eq('id', m.employeeId)
                if (error) throw error
                loadEmployees()
            } catch (error) {
                console.error('Error deleting employee:', error)
                await showAlert(t('employees.deleteError'), { variant: 'error' })
            }
        }
    }

    function handleSubmit(e) {
        e.preventDefault()
        if (!form.name || !form.position || !form.monthly_salary) {
            alert(t('employees.requiredError'))
            return
        }
        openEmployeeActionPin('save', { subtitle: form.name })
    }

    function handleDelete(id) {
        if (!requireEmployeePinOrWarn()) return
        const emp = employees.find((x) => x.id === id)
        openEmployeeActionPin('delete', { employeeId: id, subtitle: emp?.name || String(id) })
    }

    function handleEdit(item) {
        openEmployeeActionPin('edit', { xodim: item, subtitle: item.name })
    }

    function handleCancel() {
        setForm({ name: '', position: '', monthly_salary: '', bonus_percent: '0', worked_days: '0', rest_days: '0' })
        setEditId(null)
        setIsAdding(false)
    }

    async function openSalaryModal(xodim) {
        if (salaryPaymentsTableMissing) {
            await showAlert(t('employees.salaryPaymentsTableMissing'), { variant: 'warning' })
            return
        }
        openEmployeeActionPin('salary', { xodim, subtitle: xodim.name })
    }

    async function openAdvanceModal(xodim) {
        if (advancesTableMissing) {
            await showAlert(t('employees.advancesTableMissing'), { variant: 'warning' })
            return
        }
        openEmployeeActionPin('advance', { xodim, subtitle: xodim.name })
    }

    function closeSalaryModal() {
        setSalaryModal(null)
        setSalaryForm({ amount: '', payment_date: '', note: '' })
    }

    function closeAdvanceModal() {
        setAdvanceModal(null)
        setAdvanceForm({ amount: '', advance_date: '', note: '' })
    }

    async function handleSalaryPaymentSubmit(e) {
        e.preventDefault()
        if (!salaryModal) return
        const amt = parseFloat(String(salaryForm.amount).replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(amt) || amt <= 0) {
            await showAlert(t('employees.salaryAmountInvalid'), { variant: 'warning' })
            return
        }
        if (!salaryForm.payment_date) {
            await showAlert(t('employees.salaryPaymentDateRequired'), { variant: 'warning' })
            return
        }

        try {
            setSalarySaving(true)
            const cleanNote = salaryForm.note?.trim() || null
            const { error } = await supabase.from('employee_salary_payments').insert([
                {
                    employee_id: salaryModal.employeeId,
                    amount: amt,
                    payment_date: salaryForm.payment_date,
                    note: cleanNote && cleanNote !== '-' ? cleanNote : null,
                    source: 'crm'
                }
            ])
            if (error) throw error
            await showAlert(t('employees.salaryPaymentSaved'), { variant: 'success' })
            closeSalaryModal()
            loadEmployees()
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.salaryPaymentError'), { variant: 'error' })
        } finally {
            setSalarySaving(false)
        }
    }

    async function handleAdvanceSubmit(e) {
        e.preventDefault()
        if (!advanceModal) return
        const amt = parseFloat(String(advanceForm.amount).replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(amt) || amt <= 0) {
            await showAlert(t('employees.salaryAmountInvalid'), { variant: 'warning' })
            return
        }
        if (!advanceForm.advance_date) {
            await showAlert(t('employees.advanceDateLabel'), { variant: 'warning' })
            return
        }
        try {
            setAdvanceSaving(true)
            const cleanNote = advanceForm.note?.trim() || null
            const { error } = await supabase.from('employee_advances').insert([
                {
                    employee_id: advanceModal.employeeId,
                    amount: amt,
                    advance_date: advanceForm.advance_date,
                    note: cleanNote && cleanNote !== '-' ? cleanNote : null,
                    source: 'crm'
                }
            ])
            if (error) throw error
            await showAlert(t('employees.advanceSaved'), { variant: 'success' })
            closeAdvanceModal()
            loadEmployees()
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.advanceError'), { variant: 'error' })
        } finally {
            setAdvanceSaving(false)
        }
    }

    function salaryStatusBadge(expectedTotal, paidTotal) {
        if (salaryPaymentsTableMissing) return null
        const exp = Number(expectedTotal) || 0
        const paid = Number(paidTotal) || 0
        if (paid <= 0) {
            return (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                    {t('employees.salaryBadgePending')}
                </span>
            )
        }
        if (exp > 0 && paid + 0.01 < exp) {
            return (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                    {t('employees.salaryBadgePartial')}
                </span>
            )
        }
        return (
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {t('employees.salaryBadgePaid')}
            </span>
        )
    }

    const filteredEmployees = employees.filter(x =>
        x.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        x.position?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalSalary = employees.reduce((sum, x) => sum + (x.monthly_salary || 0), 0)
    const totalBonus = employees.reduce((sum, x) => sum + (x.bonus_percent || 0), 0)
    const totalPayout = totalSalary + totalBonus

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
                </div>
            </div>
        )
    }


    return (
        <div className="max-w-7xl mx-auto px-6">
            <Header title={t('common.employees')} toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">{t('employees.totalEmployees')}</p>
                            <p className="text-3xl font-bold mt-2">{employees.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Users className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg shadow-green-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-green-100">{t('employees.totalSalaries')}</p>
                            <p className="text-3xl font-bold mt-2">{formatUzs(totalSalary)}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <DollarSign className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg shadow-purple-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-purple-100">{t('employees.totalPayouts')}</p>
                            <p className="text-3xl font-bold mt-2">{formatUzs(totalPayout)}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <CreditCard className="text-white" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {salaryPaymentsTableMissing && (
                <div
                    className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                    role="status"
                >
                    {t('employees.salaryPaymentsTableMissing')}
                </div>
            )}
            {advancesTableMissing && (
                <div
                    className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                    role="status"
                >
                    {t('employees.advancesTableMissing')}
                </div>
            )}
            {!XODIMLAR_ACTION_PIN && (
                <div
                    className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                    role="status"
                >
                    {t('employees.actionPinNotConfigured')}
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder={t('employees.searchPlaceholder')}
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 font-bold"
                >
                    {isAdding ? <X size={20} /> : <UserPlus size={20} />}
                    <span className="hidden sm:inline">{isAdding ? t('common.cancel') : t('employees.addEmployee')}</span>
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 mb-8 fade-in">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">
                        {editId ? t('employees.editEmployee') : t('employees.addEmployeeTitle')}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.nameLabel')}</label>
                                <input
                                    type="text"
                                    placeholder={t('employees.name')}
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.positionLabel')}</label>
                                <input
                                    type="text"
                                    placeholder={t('employees.position')}
                                    value={form.position}
                                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.salaryLabel')}</label>
                                <input
                                    type="number"
                                    placeholder={t('employees.salaryPlaceholder')}
                                    value={form.monthly_salary}
                                    onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    required
                                    min="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.bonus')}</label>
                                <input
                                    type="number"
                                    placeholder={t('employees.bonusPlaceholder')}
                                    value={form.bonus_percent}
                                    onChange={(e) => setForm({ ...form, bonus_percent: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    min="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.workedDays')}</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={form.worked_days}
                                    onChange={(e) => setForm({ ...form, worked_days: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    min="0"
                                    max="31"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.restDays')}</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={form.rest_days}
                                    onChange={(e) => setForm({ ...form, rest_days: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    min="0"
                                    max="31"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/30 font-bold transition-all"
                            >
                                <Save size={20} />
                                {t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filteredEmployees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <Users size={48} className="mb-4 opacity-20" />
                        <p className="font-medium text-lg">{t('employees.noEmployees')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                    <th className="px-6 py-4 rounded-tl-2xl">{t('employees.name')}</th>
                                    <th className="px-6 py-4">{t('employees.position')}</th>
                                    <th className="px-6 py-4">{t('employees.salary')}</th>
                                    <th className="px-6 py-4">{t('employees.bonus')}</th>
                                    <th className="px-6 py-4">{t('employees.workedDays')}/{t('employees.restDays')}</th>
                                    <th className="px-6 py-4 whitespace-nowrap min-w-[12rem]">{t('employees.monthAdvanceUzs')}</th>
                                    <th className="px-6 py-4 whitespace-nowrap min-w-[12rem]">{t('employees.monthSalaryPaymentsUzs')}</th>
                                    <th className="px-6 py-4">{t('employees.totalPayment')}</th>
                                    <th className="px-6 py-4 rounded-tr-2xl text-right">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredEmployees.map((xodim) => {
                                    const totalPayment = (xodim.monthly_salary || 0) + (xodim.bonus_percent || 0)
                                    const advList = advancesByEmployee[xodim.id] || []
                                    const advSum = advList.reduce((s, r) => s + (r.amount || 0), 0)
                                    const salList = salaryPaymentsByEmployee[xodim.id] || []
                                    const salSum = salList.reduce((s, r) => s + (r.amount || 0), 0)
                                    return (
                                        <tr key={xodim.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4 align-top">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="font-bold text-gray-900">{xodim.name}</span>
                                                    {salaryStatusBadge(totalPayment, salSum)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold uppercase tracking-wide border border-blue-100">
                                                    {xodim.position}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-700 tabular-nums">{formatUzs(xodim.monthly_salary)}</td>
                                            <td className="px-6 py-4 text-green-600 font-medium tabular-nums">
                                                {xodim.bonus_percent ? `+${formatUzs(xodim.bonus_percent)}` : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-xs text-gray-400 font-bold uppercase">{t('employees.work')}</span>
                                                        <span className="text-green-600 font-bold">{xodim.worked_days || 0}</span>
                                                    </div>
                                                    <div className="h-8 w-px bg-gray-200"></div>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-xs text-gray-400 font-bold uppercase">{t('employees.rest')}</span>
                                                        <span className="text-red-500 font-bold">{xodim.rest_days || 0}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-amber-900 align-top">
                                                <div className="font-semibold tabular-nums">{formatUzs(advSum)}</div>
                                                {advList.length > 0 ? (
                                                    <ul className="mt-2 space-y-1 text-xs text-gray-600 font-normal">
                                                        {advList.map((row, idx) => (
                                                            <li key={`${row.advance_date}-${idx}`} className="tabular-nums">
                                                                <span className="text-gray-500">{formatAdvanceDate(row.advance_date)}</span>
                                                                {' — '}
                                                                {formatUzs(row.amount)}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="mt-1 text-xs text-gray-400">{t('employees.noAdvancesThisMonth')}</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-emerald-950 align-top">
                                                {salaryPaymentsTableMissing ? (
                                                    <span className="text-xs text-gray-400">—</span>
                                                ) : (
                                                    <>
                                                        <div className="font-semibold tabular-nums">{formatUzs(salSum)}</div>
                                                        {salList.length > 0 ? (
                                                            <ul className="mt-2 space-y-1 text-xs text-gray-600 font-normal">
                                                                {salList.map((row, idx) => (
                                                                    <li key={`${row.payment_date}-${idx}`} className="tabular-nums">
                                                                        <span className="text-gray-500">{formatAdvanceDate(row.payment_date)}</span>
                                                                        {' — '}
                                                                        {formatUzs(row.amount)}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="mt-1 text-xs text-gray-400">{t('employees.noSalaryPaymentsThisMonth')}</p>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-gray-900 text-lg tabular-nums">
                                                {formatUzs(totalPayment)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={!XODIMLAR_ACTION_PIN}
                                                        onClick={() => void openAdvanceModal(xodim)}
                                                        className="p-2 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
                                                        title={
                                                            XODIMLAR_ACTION_PIN
                                                                ? t('employees.recordAdvancePayment')
                                                                : t('employees.actionPinNotConfigured')
                                                        }
                                                    >
                                                        <Wallet size={18} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={!XODIMLAR_ACTION_PIN}
                                                        onClick={() => void openSalaryModal(xodim)}
                                                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
                                                        title={
                                                            XODIMLAR_ACTION_PIN
                                                                ? t('employees.recordSalaryPayment')
                                                                : t('employees.actionPinNotConfigured')
                                                        }
                                                    >
                                                        <Banknote size={18} />
                                                    </button>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            type="button"
                                                            disabled={!XODIMLAR_ACTION_PIN}
                                                            onClick={() => handleEdit(xodim)}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
                                                            title={
                                                                XODIMLAR_ACTION_PIN
                                                                    ? t('employees.editEmployee')
                                                                    : t('employees.actionPinNotConfigured')
                                                            }
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={!XODIMLAR_ACTION_PIN}
                                                            onClick={() => handleDelete(xodim.id)}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
                                                            title={
                                                                XODIMLAR_ACTION_PIN
                                                                    ? t('common.delete')
                                                                    : t('employees.actionPinNotConfigured')
                                                            }
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {salaryModal && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="salary-modal-title"
                >
                    <div className="relative w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
                        <button
                            type="button"
                            onClick={closeSalaryModal}
                            className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label={t('common.close')}
                        >
                            <X size={20} />
                        </button>
                        <h2 id="salary-modal-title" className="text-xl font-bold text-gray-900 pr-10 mb-1">
                            {t('employees.salaryPaymentModalTitle')}
                        </h2>
                        <p className="text-sm text-gray-500 mb-6">{salaryModal.name}</p>
                        <form onSubmit={handleSalaryPaymentSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.salaryPaymentAmount')}</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                    value={salaryForm.amount}
                                    onChange={(e) => setSalaryForm({ ...salaryForm, amount: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.salaryPaymentDateLabel')}</label>
                                <input
                                    type="date"
                                    required
                                    value={salaryForm.payment_date}
                                    onChange={(e) => setSalaryForm({ ...salaryForm, payment_date: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.salaryPaymentNoteLabel')}</label>
                                <input
                                    type="text"
                                    value={salaryForm.note}
                                    onChange={(e) => setSalaryForm({ ...salaryForm, note: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                                    placeholder="—"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeSalaryModal}
                                    className="px-5 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={salarySaving}
                                    className="px-6 py-2.5 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    {salarySaving ? t('common.loading') : t('common.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {advanceModal && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="advance-modal-title"
                >
                    <div className="relative w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
                        <button
                            type="button"
                            onClick={closeAdvanceModal}
                            className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label={t('common.close')}
                        >
                            <X size={20} />
                        </button>
                        <h2 id="advance-modal-title" className="text-xl font-bold text-gray-900 pr-10 mb-1">
                            {t('employees.advanceModalTitle')}
                        </h2>
                        <p className="text-sm text-gray-500 mb-6">{advanceModal.name}</p>
                        <form onSubmit={handleAdvanceSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.advanceAmount')}</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                    value={advanceForm.amount}
                                    onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.advanceDateLabel')}</label>
                                <input
                                    type="date"
                                    required
                                    value={advanceForm.advance_date}
                                    onChange={(e) => setAdvanceForm({ ...advanceForm, advance_date: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.advanceNoteLabel')}</label>
                                <input
                                    type="text"
                                    value={advanceForm.note}
                                    onChange={(e) => setAdvanceForm({ ...advanceForm, note: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                                    placeholder="—"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeAdvanceModal}
                                    className="px-5 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={advanceSaving}
                                    className="px-6 py-2.5 rounded-xl font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                                >
                                    {advanceSaving ? t('common.loading') : t('common.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {actionPinModal ? (
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="employee-pin-title"
                    onClick={(ev) => {
                        if (ev.target === ev.currentTarget) closeActionPinModal()
                    }}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 id="employee-pin-title" className="text-lg font-bold text-gray-900">
                            {t('finances.deletePinTitle')}
                        </h3>
                        <p className="text-sm font-semibold text-gray-800 mt-2">{actionPinGateTitle(actionPinModal.kind)}</p>
                        {actionPinModal.subtitle ? (
                            <p className="text-sm text-gray-600 mt-1 break-words">{actionPinModal.subtitle}</p>
                        ) : null}
                        <p className="text-xs text-gray-500 mt-3">{t('employees.actionPinIntro')}</p>
                        <p className="text-xs text-gray-500 mt-1">{t('finances.deletePinHint')}</p>
                        <form onSubmit={confirmEmployeeActionPin} className="mt-4 space-y-4">
                            <input
                                type="password"
                                autoComplete="off"
                                autoFocus
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder={t('finances.deletePinLabel')}
                                value={actionPinValue}
                                onChange={(e) => setActionPinValue(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-lg border text-sm font-semibold"
                                    onClick={closeActionPinModal}
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className={
                                        actionPinModal.kind === 'delete'
                                            ? 'px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700'
                                            : 'px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700'
                                    }
                                >
                                    {actionPinSubmitLabel(actionPinModal.kind)}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    )
}