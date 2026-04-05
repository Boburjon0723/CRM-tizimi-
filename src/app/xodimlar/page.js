'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import {
    UserPlus,
    Edit,
    Trash2,
    Save,
    X,
    Search,
    Users,
    DollarSign,
    Banknote,
    Wallet,
    TrendingDown,
    Lock,
    Unlock
} from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'

/** CRM maxfiy amallar: bot telefon orqali alohida. Bo‘sh bo‘lsa MOLIYA_DELETE_PIN ishlatiladi. */
const XODIMLAR_ACTION_PIN = String(
    process.env.NEXT_PUBLIC_XODIMLAR_ACTION_PIN ?? process.env.NEXT_PUBLIC_MOLIYA_DELETE_PIN ?? ''
).trim()

const REPORT_PERIOD_STORAGE_KEY = 'crm_employees_report_ym'

function getCurrentYm() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** periodYm: "YYYY-MM" */
function monthRangeFromYm(periodYm) {
    const s = String(periodYm || '').trim()
    const m = /^(\d{4})-(\d{2})$/.exec(s)
    if (!m) {
        const d = new Date()
        const y = d.getFullYear()
        const mo = d.getMonth() + 1
        const pad = (n) => String(n).padStart(2, '0')
        const from = `${y}-${pad(mo)}-01`
        const lastDay = new Date(y, mo, 0).getDate()
        return { from, to: `${y}-${pad(mo)}-${pad(lastDay)}` }
    }
    const y = Number(m[1])
    const mo = Number(m[2])
    if (mo < 1 || mo > 12) {
        return monthRangeFromYm(getCurrentYm())
    }
    const pad = (n) => String(n).padStart(2, '0')
    const from = `${y}-${pad(mo)}-01`
    const lastDay = new Date(y, mo, 0).getDate()
    const to = `${y}-${pad(mo)}-${pad(lastDay)}`
    return { from, to }
}

function activityDateInReportMonth(dateStr, periodYm) {
    const head = String(dateStr || '').trim().slice(0, 7)
    return head === String(periodYm || '').trim()
}

export default function Xodimlar() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
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
    const [reportPeriodYm, setReportPeriodYm] = useState(() => {
        if (typeof window === 'undefined') return getCurrentYm()
        try {
            const saved = localStorage.getItem(REPORT_PERIOD_STORAGE_KEY)
            if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved
        } catch (_) {
            /* ignore */
        }
        return getCurrentYm()
    })
    const [advancesRaw, setAdvancesRaw] = useState([])
    const [salaryRaw, setSalaryRaw] = useState([])
    const [closedPeriodYms, setClosedPeriodYms] = useState([])
    const [payrollClosuresTableMissing, setPayrollClosuresTableMissing] = useState(false)
    const [salaryPaymentsTableMissing, setSalaryPaymentsTableMissing] = useState(false)
    /** { employeeId, name } | null */
    const [salaryModal, setSalaryModal] = useState(null)
    const [salaryForm, setSalaryForm] = useState({ amount: '', payment_date: '', note: '' })
    const [salarySaving, setSalarySaving] = useState(false)
    const [advancesTableMissing, setAdvancesTableMissing] = useState(false)
    const [advancesLoadError, setAdvancesLoadError] = useState(null)
    const [advanceModal, setAdvanceModal] = useState(null)
    const [advanceForm, setAdvanceForm] = useState({ amount: '', advance_date: '', note: '' })
    const [advanceSaving, setAdvanceSaving] = useState(false)
    const [actionPinModal, setActionPinModal] = useState(null)
    const [actionPinValue, setActionPinValue] = useState('')

    function formatUzs(n) {
        const v = Number(n) || 0
        return `${v.toLocaleString('uz-UZ')} so'm`
    }

    /** Shartnoma bo‘yicha qolgan: avans va oylik to‘lov alohida, jami chiqim = ikkalasi yig‘indisi. */
    function payoutRemainingVsContract(contractTotal, advSum, salSum) {
        const exp = Number(contractTotal) || 0
        const adv = Number(advSum) || 0
        const sal = Number(salSum) || 0
        const totalOut = adv + sal
        const remaining = Math.max(0, exp - totalOut)
        const overpaid = totalOut > exp + 0.01 ? totalOut - exp : 0
        return { remaining, totalOut, overpaid }
    }

    function formatAdvanceDate(iso) {
        if (!iso) return ''
        const part = String(iso).split('T')[0]
        const [y, m, d] = part.split('-')
        if (!d || !m || !y) return part
        return `${d}.${m}.${y}`
    }

    /**
     * Oy filtri uchun YYYY-MM-DD. `advance_date` jadvalda DATE — PostgREST ko‘pincha "YYYY-MM-DD..." qaytaradi.
     * `new Date("...Z")` ba’zi vaqt zonalarida oy chegarasini siljitadi; shuning uchun boshidagi 10 belgi ustuvor.
     */
    function calendarYmdForFilter(value) {
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

    function rowInMonthRange(ymdLocal, from, to) {
        return ymdLocal.length === 10 && ymdLocal >= from && ymdLocal <= to
    }

    function todayIsoLocal() {
        const d = new Date()
        const y = d.getFullYear()
        const mo = d.getMonth() + 1
        const day = d.getDate()
        const pad = (n) => String(n).padStart(2, '0')
        return `${y}-${pad(mo)}-${pad(day)}`
    }

    function defaultActivityDateForReportPeriod(periodYm) {
        const { from, to } = monthRangeFromYm(periodYm)
        const today = todayIsoLocal()
        if (today < from) return from
        if (today > to) return to
        return today
    }

    useEffect(() => {
        try {
            localStorage.setItem(REPORT_PERIOD_STORAGE_KEY, reportPeriodYm)
        } catch (_) {
            /* ignore */
        }
    }, [reportPeriodYm])

    const advancesByEmployee = useMemo(() => {
        const { from, to } = monthRangeFromYm(reportPeriodYm)
        const byEmp = {}
        for (const a of advancesRaw) {
            const ymd = calendarYmdForFilter(a.advance_date)
            if (!rowInMonthRange(ymd, from, to)) continue
            const id = a.employee_id != null ? String(a.employee_id) : ''
            if (!id) continue
            if (!byEmp[id]) byEmp[id] = []
            byEmp[id].push({
                id: a.id,
                advance_date: a.advance_date,
                amount: Number(a.amount || 0),
                note: a.note ? String(a.note).trim() : ''
            })
        }
        for (const k of Object.keys(byEmp)) {
            byEmp[k].sort((a, b) => String(b.advance_date).localeCompare(String(a.advance_date)))
        }
        return byEmp
    }, [advancesRaw, reportPeriodYm])

    const salaryPaymentsByEmployee = useMemo(() => {
        const { from, to } = monthRangeFromYm(reportPeriodYm)
        const salBy = {}
        for (const r of salaryRaw) {
            const ymd = calendarYmdForFilter(r.payment_date)
            if (!rowInMonthRange(ymd, from, to)) continue
            const id = r.employee_id != null ? String(r.employee_id) : ''
            if (!id) continue
            if (!salBy[id]) salBy[id] = []
            salBy[id].push({
                id: r.id,
                payment_date: r.payment_date,
                amount: Number(r.amount || 0),
                note: r.note ? String(r.note).trim() : ''
            })
        }
        for (const k of Object.keys(salBy)) {
            salBy[k].sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))
        }
        return salBy
    }, [salaryRaw, reportPeriodYm])

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

            /**
             * Oy filtrini serverda emas, mahalliy kalendarda qo‘llaymiz: PostgREST DATE/timestamptz
             * bilan .gte/.lte ba’zan yozuvni “yo‘q” qilib qo‘yadi (vaqt zonasi / tip).
             * Tanlangan oy almashtirilganda qayta yuklash shart emas — `advancesRaw` + useMemo.
             */
            const { data: advRows, error: advErr } = await supabase
                .from('employee_advances')
                .select('id, employee_id, amount, advance_date, note, created_at')
                .order('created_at', { ascending: false })
                .limit(5000)

            if (advErr) {
                const msg = String(advErr.message || '')
                if (!msg.includes('Could not find the table') && !msg.includes('does not exist')) {
                    console.warn('employee_advances:', advErr.message)
                }
                setAdvancesRaw([])
                const missing =
                    msg.includes('Could not find the table') || msg.includes('does not exist')
                setAdvancesTableMissing(missing)
                setAdvancesLoadError(missing ? null : msg || String(advErr.code || ''))
            } else {
                setAdvancesTableMissing(false)
                setAdvancesLoadError(null)
                setAdvancesRaw(advRows || [])
            }

            const { data: salRows, error: salErr } = await supabase
                .from('employee_salary_payments')
                .select('id, employee_id, amount, payment_date, note, created_at')
                .order('created_at', { ascending: false })
                .limit(5000)

            if (salErr) {
                const msg = String(salErr.message || '')
                if (!msg.includes('Could not find the table') && !msg.includes('does not exist')) {
                    console.warn('employee_salary_payments:', salErr.message)
                }
                setSalaryRaw([])
                setSalaryPaymentsTableMissing(
                    msg.includes('Could not find the table') || msg.includes('does not exist')
                )
            } else {
                setSalaryPaymentsTableMissing(false)
                setSalaryRaw(salRows || [])
            }

            const { data: closeRows, error: closeErr } = await supabase
                .from('employee_payroll_month_closures')
                .select('period_ym')
                .order('period_ym', { ascending: false })

            if (closeErr) {
                const msg = String(closeErr.message || '')
                const missing =
                    msg.includes('Could not find the table') || msg.includes('does not exist')
                setPayrollClosuresTableMissing(missing)
                if (!missing) console.warn('employee_payroll_month_closures:', closeErr.message)
                setClosedPeriodYms([])
            } else {
                setPayrollClosuresTableMissing(false)
                setClosedPeriodYms((closeRows || []).map((r) => r.period_ym).filter(Boolean))
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
        if (
            kind === 'deleteAdvance' ||
            kind === 'deleteAllAdvancesPeriod' ||
            kind === 'deleteSalaryPayment' ||
            kind === 'deleteAllSalaryPaymentsPeriod'
        ) {
            return t('common.delete')
        }
        if (kind === 'save') return t('common.save')
        if (kind === 'closeMonth') return t('employees.payrollCloseMonthSubmit')
        if (kind === 'reopenMonth') return t('employees.payrollReopenMonthSubmit')
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
            case 'closeMonth':
                return t('employees.actionPinGateCloseMonth')
            case 'reopenMonth':
                return t('employees.actionPinGateReopenMonth')
            case 'deleteAdvance':
                return t('employees.actionPinGateDeleteAdvance')
            case 'deleteAllAdvancesPeriod':
                return t('employees.actionPinGateDeleteAllAdvances')
            case 'deleteSalaryPayment':
                return t('employees.actionPinGateDeleteSalaryPayment')
            case 'deleteAllSalaryPaymentsPeriod':
                return t('employees.actionPinGateDeleteAllSalary')
            default:
                return t('finances.deletePinTitle')
        }
    }

    function openDeleteAdvance(row, employeeName) {
        if (!requireEmployeePinOrWarn()) return
        if (!row?.id) {
            void showAlert(t('employees.advanceDeleteNoId'), { variant: 'warning' })
            return
        }
        openEmployeeActionPin('deleteAdvance', {
            advanceId: row.id,
            subtitle: `${employeeName} — ${formatAdvanceDate(row.advance_date)} · ${formatUzs(row.amount)}`
        })
    }

    function openDeleteAllAdvancesPeriod(xodim, advList) {
        if (!requireEmployeePinOrWarn()) return
        const ids = (advList || []).map((r) => r.id).filter(Boolean)
        if (!ids.length) return
        openEmployeeActionPin('deleteAllAdvancesPeriod', {
            advanceIds: ids,
            subtitle: `${xodim.name} · ${ids.length} ${t('employees.advanceEntriesShort')}`
        })
    }

    function openDeleteSalaryPayment(row, employeeName) {
        if (!requireEmployeePinOrWarn()) return
        if (!row?.id) {
            void showAlert(t('employees.salaryPaymentDeleteNoId'), { variant: 'warning' })
            return
        }
        openEmployeeActionPin('deleteSalaryPayment', {
            salaryPaymentId: row.id,
            subtitle: `${employeeName} — ${formatAdvanceDate(row.payment_date)} · ${formatUzs(row.amount)}`
        })
    }

    function openDeleteAllSalaryPaymentsPeriod(xodim, salList) {
        if (!requireEmployeePinOrWarn()) return
        const ids = (salList || []).map((r) => r.id).filter(Boolean)
        if (!ids.length) return
        openEmployeeActionPin('deleteAllSalaryPaymentsPeriod', {
            salaryPaymentIds: ids,
            subtitle: `${xodim.name} · ${ids.length} ${t('employees.salaryPaymentEntriesShort')}`
        })
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

        if (m.kind === 'closeMonth' && m.periodYm) {
            try {
                const { error } = await supabase.from('employee_payroll_month_closures').insert({
                    period_ym: m.periodYm,
                    source: 'crm'
                })
                if (error) {
                    const dup =
                        String(error.code) === '23505' ||
                        String(error.message || '')
                            .toLowerCase()
                            .includes('duplicate')
                    if (dup) {
                        await showAlert(t('employees.payrollMonthAlreadyClosed'), { variant: 'warning' })
                    } else {
                        throw error
                    }
                } else {
                    await showAlert(t('employees.payrollMonthClosedOk'), { variant: 'success' })
                }
                await loadEmployees()
            } catch (err) {
                console.error(err)
                await showAlert(t('employees.payrollMonthCloseError'), { variant: 'error' })
            }
            return
        }
        if (m.kind === 'reopenMonth' && m.periodYm) {
            try {
                const { error } = await supabase
                    .from('employee_payroll_month_closures')
                    .delete()
                    .eq('period_ym', m.periodYm)
                if (error) throw error
                await showAlert(t('employees.payrollMonthReopenedOk'), { variant: 'success' })
                await loadEmployees()
            } catch (err) {
                console.error(err)
                await showAlert(t('employees.payrollMonthReopenError'), { variant: 'error' })
            }
            return
        }

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
                payment_date: defaultActivityDateForReportPeriod(reportPeriodYm),
                note: ''
            })
            return
        }
        if (m.kind === 'advance' && m.xodim) {
            const xodim = m.xodim
            setAdvanceModal({ employeeId: xodim.id, name: xodim.name })
            setAdvanceForm({
                amount: '',
                advance_date: defaultActivityDateForReportPeriod(reportPeriodYm),
                note: ''
            })
            return
        }
        if (m.kind === 'deleteAdvance' && m.advanceId) {
            try {
                const { error } = await supabase.from('employee_advances').delete().eq('id', m.advanceId)
                if (error) throw error
                await showAlert(t('employees.advanceDeletedOk'), { variant: 'success' })
                await loadEmployees()
            } catch (err) {
                console.error(err)
                await showAlert(t('employees.advanceDeleteError'), { variant: 'error' })
            }
            return
        }
        if (m.kind === 'deleteAllAdvancesPeriod' && m.advanceIds?.length) {
            try {
                const { error } = await supabase.from('employee_advances').delete().in('id', m.advanceIds)
                if (error) throw error
                await showAlert(t('employees.advancesBulkDeletedOk'), { variant: 'success' })
                await loadEmployees()
            } catch (err) {
                console.error(err)
                await showAlert(t('employees.advanceDeleteError'), { variant: 'error' })
            }
            return
        }
        if (m.kind === 'deleteSalaryPayment' && m.salaryPaymentId) {
            try {
                const { error } = await supabase
                    .from('employee_salary_payments')
                    .delete()
                    .eq('id', m.salaryPaymentId)
                if (error) throw error
                await showAlert(t('employees.salaryPaymentDeletedOk'), { variant: 'success' })
                await loadEmployees()
            } catch (err) {
                console.error(err)
                await showAlert(t('employees.salaryPaymentDeleteError'), { variant: 'error' })
            }
            return
        }
        if (m.kind === 'deleteAllSalaryPaymentsPeriod' && m.salaryPaymentIds?.length) {
            try {
                const { error } = await supabase
                    .from('employee_salary_payments')
                    .delete()
                    .in('id', m.salaryPaymentIds)
                if (error) throw error
                await showAlert(t('employees.salaryPaymentsBulkDeletedOk'), { variant: 'success' })
                await loadEmployees()
            } catch (err) {
                console.error(err)
                await showAlert(t('employees.salaryPaymentDeleteError'), { variant: 'error' })
            }
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
        if (closedPeriodYms.includes(reportPeriodYm)) {
            await showAlert(t('employees.payrollMonthClosedNoNewRows'), { variant: 'warning' })
            return
        }
        openEmployeeActionPin('salary', { xodim, subtitle: xodim.name })
    }

    async function openAdvanceModal(xodim) {
        if (advancesTableMissing) {
            await showAlert(t('employees.advancesTableMissing'), { variant: 'warning' })
            return
        }
        if (closedPeriodYms.includes(reportPeriodYm)) {
            await showAlert(t('employees.payrollMonthClosedNoNewRows'), { variant: 'warning' })
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
        if (!activityDateInReportMonth(salaryForm.payment_date, reportPeriodYm)) {
            await showAlert(t('employees.payrollDateOutsideReportMonth'), { variant: 'warning' })
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
            await showAlert(t('employees.advanceDateRequired'), { variant: 'warning' })
            return
        }
        if (!activityDateInReportMonth(advanceForm.advance_date, reportPeriodYm)) {
            await showAlert(t('employees.payrollDateOutsideReportMonth'), { variant: 'warning' })
            return
        }
        try {
            setAdvanceSaving(true)
            const cleanNote = advanceForm.note?.trim() || null
            const empId = String(advanceModal.employeeId || '').trim()
            if (!empId) {
                await showAlert(t('employees.advanceError'), { variant: 'error' })
                return
            }
            const { data: inserted, error } = await supabase
                .from('employee_advances')
                .insert([
                    {
                        employee_id: empId,
                        amount: amt,
                        advance_date: advanceForm.advance_date,
                        note: cleanNote && cleanNote !== '-' ? cleanNote : null,
                        source: 'crm'
                    }
                ])
                .select('id, employee_id, amount, advance_date, note')
            if (error) throw error
            if (!inserted?.length) {
                await showAlert(t('employees.advanceInsertNoRow'), { variant: 'error' })
                return
            }
            await showAlert(t('employees.advanceSaved'), { variant: 'success' })
            closeAdvanceModal()
            await loadEmployees()
        } catch (err) {
            console.error(err)
            const detail = err?.message || err?.error_description || String(err)
            await showAlert(`${t('employees.advanceError')}\n\n${detail}`, { variant: 'error' })
        } finally {
            setAdvanceSaving(false)
        }
    }

    function salaryStatusBadge(expectedTotal, settledTotal) {
        const exp = Number(expectedTotal) || 0
        const paid = Number(settledTotal) || 0
        if (exp <= 0) return null
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
    const monthAdvancesGrandTotal = useMemo(
        () =>
            Object.values(advancesByEmployee).reduce(
                (sum, list) => sum + (list || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
                0
            ),
        [advancesByEmployee]
    )
    const monthSalaryPaidGrandTotal = useMemo(
        () =>
            Object.values(salaryPaymentsByEmployee).reduce(
                (sum, list) => sum + (list || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
                0
            ),
        [salaryPaymentsByEmployee]
    )
    const monthSalaryRemainingGrandTotal = useMemo(() => {
        return employees.reduce((sum, x) => {
            const c = (Number(x.monthly_salary) || 0) + (Number(x.bonus_percent) || 0)
            if (c <= 0) return sum
            const k = String(x.id)
            const adv = (advancesByEmployee[k] || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
            const sal = (salaryPaymentsByEmployee[k] || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
            return sum + Math.max(0, c - adv - sal)
        }, 0)
    }, [employees, advancesByEmployee, salaryPaymentsByEmployee])

    const statsMonthLabel = useMemo(() => {
        const { from } = monthRangeFromYm(reportPeriodYm)
        const [y, mo] = from.split('-').map(Number)
        const d = new Date(y, mo - 1, 1)
        const loc = language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ'
        return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
    }, [reportPeriodYm, language])

    const isReportMonthClosed = closedPeriodYms.includes(reportPeriodYm)

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

            <div className="flex flex-col gap-3 mb-4 px-0.5">
                <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3 justify-between">
                    <p className="text-sm text-gray-500">
                        <span className="font-medium text-gray-700">{t('employees.statsMonthLabel')}</span>{' '}
                        <span className="text-gray-800 font-semibold capitalize">{statsMonthLabel}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <label
                            htmlFor="report-period-ym"
                            className="text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap"
                        >
                            {t('employees.reportPeriodPickerLabel')}
                        </label>
                        <input
                            id="report-period-ym"
                            type="month"
                            value={reportPeriodYm}
                            onChange={(e) => {
                                const v = e.target.value
                                if (v && /^\d{4}-\d{2}$/.test(v)) setReportPeriodYm(v)
                            }}
                            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-900"
                        />
                        <button
                            type="button"
                            onClick={() => setReportPeriodYm(getCurrentYm())}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
                        >
                            {t('employees.reportPeriodCurrentMonth')}
                        </button>
                        {!payrollClosuresTableMissing ? (
                            isReportMonthClosed ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        openEmployeeActionPin('reopenMonth', {
                                            periodYm: reportPeriodYm,
                                            subtitle: statsMonthLabel
                                        })
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-950 hover:bg-amber-200 transition-colors"
                                >
                                    <Unlock size={14} aria-hidden />
                                    {t('employees.payrollReopenMonth')}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() =>
                                        openEmployeeActionPin('closeMonth', {
                                            periodYm: reportPeriodYm,
                                            subtitle: statsMonthLabel
                                        })
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 transition-colors"
                                >
                                    <Lock size={14} aria-hidden />
                                    {t('employees.payrollCloseMonth')}
                                </button>
                            )
                        ) : null}
                    </div>
                </div>
                {isReportMonthClosed ? (
                    <div
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                        role="status"
                    >
                        <span className="font-semibold capitalize">{statsMonthLabel}</span>
                        {' — '}
                        {t('employees.payrollMonthClosedBanner')}
                    </div>
                ) : null}
                {payrollClosuresTableMissing ? (
                    <div
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                        role="status"
                    >
                        {t('employees.payrollClosuresTableMissing')}
                    </div>
                ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
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
                            <p className="text-xs text-green-100/90 mt-0.5">{t('employees.contractSalaryHint')}</p>
                            <p className="text-2xl sm:text-3xl font-bold mt-2">{formatUzs(totalSalary)}</p>
                            {totalBonus > 0 ? (
                                <p className="text-xs text-green-100/85 mt-1">
                                    + {t('employees.bonus')}: {formatUzs(totalBonus)}
                                </p>
                            ) : null}
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <DollarSign className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white p-6 rounded-xl shadow-lg shadow-amber-200/80">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-amber-50">{t('employees.monthAdvancesTotalCard')}</p>
                            <p className="text-xs text-amber-100/90 mt-0.5">{t('employees.actualCashAdvancesHint')}</p>
                            <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums">{formatUzs(monthAdvancesGrandTotal)}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Wallet className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-violet-500 to-purple-700 text-white p-6 rounded-xl shadow-lg shadow-violet-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-violet-100">{t('employees.monthSalaryPaidTotalCard')}</p>
                            <p className="text-xs text-violet-100/90 mt-0.5">{t('employees.actualSalaryPaymentsHint')}</p>
                            <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums">{formatUzs(monthSalaryPaidGrandTotal)}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Banknote className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-teal-500 to-cyan-700 text-white p-6 rounded-xl shadow-lg shadow-teal-200/80">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-teal-50">{t('employees.monthSalaryRemainingTotalCard')}</p>
                            <p className="text-xs text-teal-100/90 mt-0.5">{t('employees.monthSalaryRemainingHint')}</p>
                            <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums">{formatUzs(monthSalaryRemainingGrandTotal)}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <TrendingDown className="text-white" size={24} />
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
            {advancesLoadError ? (
                <div
                    className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 break-words"
                    role="alert"
                >
                    <span className="font-semibold">{t('employees.advancesLoadErrorTitle')}</span> {advancesLoadError}
                </div>
            ) : null}
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
                                    <th className="px-6 py-4 min-w-[12rem]">
                                        <span className="block">{t('employees.salaryRemainingColumn')}</span>
                                        <span className="block font-normal normal-case text-[10px] text-gray-400 mt-0.5 leading-tight">
                                            {t('employees.salaryRemainingColumnSub')}
                                        </span>
                                    </th>
                                    <th className="px-6 py-4 rounded-tr-2xl text-right">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredEmployees.map((xodim) => {
                                    const empKey = String(xodim.id)
                                    const contractTotal = (xodim.monthly_salary || 0) + (xodim.bonus_percent || 0)
                                    const advList = advancesByEmployee[empKey] || []
                                    const advSum = advList.reduce((s, r) => s + (r.amount || 0), 0)
                                    const salList = salaryPaymentsByEmployee[empKey] || []
                                    const salSum = salList.reduce((s, r) => s + (r.amount || 0), 0)
                                    const { remaining, totalOut, overpaid } = payoutRemainingVsContract(
                                        contractTotal,
                                        advSum,
                                        salSum
                                    )
                                    return (
                                        <tr key={xodim.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4 align-top">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="font-bold text-gray-900">{xodim.name}</span>
                                                    {salaryStatusBadge(contractTotal, advSum + salSum)}
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
                                                    <div className="mt-2">
                                                        {XODIMLAR_ACTION_PIN && !advancesTableMissing && advList.length > 1 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openDeleteAllAdvancesPeriod(xodim, advList)}
                                                                className="mb-2 text-[11px] font-bold text-red-700 hover:text-red-900 hover:underline"
                                                            >
                                                                {t('employees.deleteAllAdvancesThisMonth')}
                                                            </button>
                                                        ) : null}
                                                        <ul className="space-y-1.5 text-xs text-gray-600 font-normal">
                                                            {advList.map((row) => (
                                                                <li
                                                                    key={row.id || `${row.advance_date}-${row.amount}`}
                                                                    className="tabular-nums flex items-start gap-1.5"
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <div>
                                                                            <span className="text-gray-500">
                                                                                {formatAdvanceDate(row.advance_date)}
                                                                            </span>
                                                                            {' — '}
                                                                            {formatUzs(row.amount)}
                                                                        </div>
                                                                        {row.note ? (
                                                                            <div className="text-[11px] text-gray-500 mt-0.5 max-w-[12rem] leading-snug">
                                                                                {t('employees.expenseNotePrefix')}
                                                                                {row.note}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                    {XODIMLAR_ACTION_PIN && !advancesTableMissing && row.id ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openDeleteAdvance(row, xodim.name)}
                                                                            className="shrink-0 p-1 rounded-md text-red-600 hover:bg-red-50 opacity-70 hover:opacity-100"
                                                                            title={t('employees.deleteOneAdvance')}
                                                                        >
                                                                            <Trash2 size={14} aria-hidden />
                                                                        </button>
                                                                    ) : null}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
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
                                                            <div className="mt-2">
                                                                {XODIMLAR_ACTION_PIN && salList.length > 1 ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openDeleteAllSalaryPaymentsPeriod(xodim, salList)}
                                                                        className="mb-2 text-[11px] font-bold text-red-700 hover:text-red-900 hover:underline"
                                                                    >
                                                                        {t('employees.deleteAllSalaryPaymentsThisMonth')}
                                                                    </button>
                                                                ) : null}
                                                                <ul className="space-y-1.5 text-xs text-gray-600 font-normal">
                                                                    {salList.map((row) => (
                                                                        <li
                                                                            key={row.id || `${row.payment_date}-${row.amount}`}
                                                                            className="tabular-nums flex items-start gap-1.5"
                                                                        >
                                                                            <div className="min-w-0 flex-1">
                                                                                <div>
                                                                                    <span className="text-gray-500">
                                                                                        {formatAdvanceDate(row.payment_date)}
                                                                                    </span>
                                                                                    {' — '}
                                                                                    {formatUzs(row.amount)}
                                                                                </div>
                                                                                {row.note ? (
                                                                                    <div className="text-[11px] text-gray-500 mt-0.5 max-w-[12rem] leading-snug">
                                                                                        {t('employees.expenseNotePrefix')}
                                                                                        {row.note}
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>
                                                                            {XODIMLAR_ACTION_PIN && row.id ? (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        openDeleteSalaryPayment(row, xodim.name)
                                                                                    }
                                                                                    className="shrink-0 p-1 rounded-md text-red-600 hover:bg-red-50 opacity-70 hover:opacity-100"
                                                                                    title={t('employees.deleteOneSalaryPayment')}
                                                                                >
                                                                                    <Trash2 size={14} aria-hidden />
                                                                                </button>
                                                                            ) : null}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        ) : (
                                                            <p className="mt-1 text-xs text-gray-400">{t('employees.noSalaryPaymentsThisMonth')}</p>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 align-top">
                                                {contractTotal > 0 ? (
                                                    <>
                                                        <div
                                                            className={`font-bold text-lg tabular-nums ${
                                                                remaining > 0 ? 'text-amber-800' : 'text-emerald-700'
                                                            }`}
                                                        >
                                                            {formatUzs(remaining)}
                                                        </div>
                                                        <div className="text-[11px] text-gray-600 mt-2 space-y-1 leading-snug">
                                                            <div>
                                                                <span className="text-amber-800/90 font-medium">
                                                                    {t('employees.payoutBreakdownAdvanceShort')}
                                                                </span>
                                                                {': '}
                                                                <span className="tabular-nums">{formatUzs(advSum)}</span>
                                                                <span className="text-gray-300 mx-1">|</span>
                                                                <span className="text-emerald-800/90 font-medium">
                                                                    {t('employees.payoutBreakdownSalaryShort')}
                                                                </span>
                                                                {': '}
                                                                <span className="tabular-nums">
                                                                    {salaryPaymentsTableMissing ? '—' : formatUzs(salSum)}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                {t('employees.payoutBreakdownTotalShort')}
                                                                {': '}
                                                                <span className="tabular-nums font-semibold text-gray-800">
                                                                    {formatUzs(totalOut)}
                                                                </span>
                                                            </div>
                                                            <div className="text-gray-500">
                                                                {t('employees.contractExpectedShort')}
                                                                {': '}
                                                                <span className="tabular-nums font-medium text-gray-700">
                                                                    {formatUzs(contractTotal)}
                                                                </span>
                                                            </div>
                                                            {overpaid > 0.01 ? (
                                                                <div className="text-rose-600 font-medium">
                                                                    {t('employees.salaryOverpaidHint')}: {formatUzs(overpaid)}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="text-sm text-gray-400">—</div>
                                                )}
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
                                        actionPinModal.kind === 'delete' ||
                                        actionPinModal.kind === 'deleteAdvance' ||
                                        actionPinModal.kind === 'deleteAllAdvancesPeriod' ||
                                        actionPinModal.kind === 'deleteSalaryPayment' ||
                                        actionPinModal.kind === 'deleteAllSalaryPaymentsPeriod'
                                            ? 'px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700'
                                            : actionPinModal.kind === 'reopenMonth'
                                              ? 'px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700'
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