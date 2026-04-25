'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
    Banknote,
    Wallet,
    Lock,
    Unlock,
    CheckCircle2,
    Printer
} from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { normalizeUzbekPhone } from '@/lib/phoneNormalize'

const REPORT_PERIOD_STORAGE_KEY = 'crm_employees_report_ym'
const MONTHLY_REST_DAYS_LIMIT = 2

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

/** Supabase UUID ba’zan turli registrda qaytadi — map kalitlari bir xil bo‘lsin */
function employeeMapKey(id) {
    if (id == null || id === '') return ''
    return String(id).trim().toLowerCase()
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
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
        rest_days: '0',
        phone: ''
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
    /** { employeeId, name } | null — PIN dan keyin: avans/oylik ro‘yxati */
    const [salaryOverviewModal, setSalaryOverviewModal] = useState(null)
    const [salaryForm, setSalaryForm] = useState({ payment_date: '', note: '' })
    const [salarySaving, setSalarySaving] = useState(false)
    /** Tez ikki marta «Saqlash» — setState kechikishi sababli ikkala insert ketmasin */
    const salaryPaymentSubmitLockRef = useRef(false)
    const [advancesTableMissing, setAdvancesTableMissing] = useState(false)
    const [advancesLoadError, setAdvancesLoadError] = useState(null)
    const [advanceModal, setAdvanceModal] = useState(null)
    const [advanceForm, setAdvanceForm] = useState({ amount: '', advance_date: '', note: '' })
    const [advanceSaving, setAdvanceSaving] = useState(false)
    /** employee_id (normalize) → tasdiqlangan dam olish sanalari DD.MM.YYYY (yangisi birinchi) */
    const [approvedLeaveDatesByEmployee, setApprovedLeaveDatesByEmployee] = useState({})
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

    /** YYYY-MM-DD → DD.MM.YYYY */
    function formatYmdUz(ymd) {
        if (!ymd || typeof ymd !== 'string') return ''
        const [y, m, d] = ymd.split('-')
        if (!y || !m || !d) return ymd
        return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`
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

    /** Avans va oylik yozuvlarini sana bo‘yicha ketma-ket (xronologiya) birlashtirish. */
    function mergeEmployeePayoutsTimeline(advList, salList) {
        const items = []
        for (const r of advList || []) {
            const sortKey = calendarYmdForFilter(r.advance_date) || '9999-12-31'
            items.push({
                kind: 'advance',
                sortKey,
                id: r.id,
                amount: r.amount,
                note: r.note,
                raw: r,
                displayDate: r.advance_date
            })
        }
        for (const r of salList || []) {
            const sortKey = calendarYmdForFilter(r.payment_date) || '9999-12-31'
            items.push({
                kind: 'salary',
                sortKey,
                id: r.id,
                amount: r.amount,
                note: r.note,
                raw: r,
                displayDate: r.payment_date
            })
        }
        items.sort((a, b) => {
            const cmp = String(a.sortKey).localeCompare(String(b.sortKey))
            if (cmp !== 0) return cmp
            if (a.kind !== b.kind) return a.kind === 'advance' ? -1 : 1
            return String(a.id ?? '').localeCompare(String(b.id ?? ''))
        })
        return items
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
            const id = employeeMapKey(a.employee_id)
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
            const id = employeeMapKey(r.employee_id)
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

    const loadEmployees = useCallback(async (opts) => {
        const silent = opts?.silent === true
        try {
            if (!silent) setLoading(true)
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
                setApprovedLeaveDatesByEmployee({})
            } else {
                const byKey = {}
                for (const r of leaveRows || []) {
                    const k = employeeMapKey(r.employee_id)
                    if (!k) continue
                    const iso = r.resolved_at || r.created_at
                    const ymd = calendarYmdForFilter(iso)
                    if (!ymd) continue
                    if (!byKey[k]) byKey[k] = new Set()
                    byKey[k].add(ymd)
                }
                const out = {}
                for (const k of Object.keys(byKey)) {
                    const days = [...byKey[k]].sort((a, b) => b.localeCompare(a))
                    out[k] = days.map((ymd) => formatYmdUz(ymd))
                }
                setApprovedLeaveDatesByEmployee(out)
            }
        } catch (error) {
            console.error('Error loading employees:', error)
        } finally {
            if (!silent) setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadEmployees()
    }, [loadEmployees])

    async function executeCloseMonth(periodYm) {
        try {
            const { error } = await supabase.from('employee_payroll_month_closures').insert({
                period_ym: periodYm,
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
            await loadEmployees({ silent: true })
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.payrollMonthCloseError'), { variant: 'error' })
        }
    }

    async function executeReopenMonth(periodYm) {
        try {
            const { error } = await supabase
                .from('employee_payroll_month_closures')
                .delete()
                .eq('period_ym', periodYm)
            if (error) throw error
            await showAlert(t('employees.payrollMonthReopenedOk'), { variant: 'success' })
            await loadEmployees({ silent: true })
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.payrollMonthReopenError'), { variant: 'error' })
        }
    }

    async function openDeleteAdvance(row, employeeName) {
        if (!row?.id) {
            void showAlert(t('employees.advanceDeleteNoId'), { variant: 'warning' })
            return
        }
        const line = `${employeeName} — ${formatAdvanceDate(row.advance_date)} · ${formatUzs(row.amount)}`
        if (!(await showConfirm(`${t('employees.deleteOneAdvance')}?\n${line}`, { variant: 'warning' }))) return
        try {
            const { error } = await supabase.from('employee_advances').delete().eq('id', row.id)
            if (error) throw error
            await showAlert(t('employees.advanceDeletedOk'), { variant: 'success' })
            await loadEmployees({ silent: true })
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.advanceDeleteError'), { variant: 'error' })
        }
    }

    async function openDeleteAllAdvancesPeriod(xodim, advList) {
        const ids = (advList || []).map((r) => r.id).filter(Boolean)
        if (!ids.length) return
        if (
            !(await showConfirm(
                `${t('employees.deleteAllAdvancesThisMonth')}?\n${xodim.name} · ${ids.length}`,
                { variant: 'warning' }
            ))
        )
            return
        try {
            const { error } = await supabase.from('employee_advances').delete().in('id', ids)
            if (error) throw error
            await showAlert(t('employees.advancesBulkDeletedOk'), { variant: 'success' })
            await loadEmployees({ silent: true })
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.advanceDeleteError'), { variant: 'error' })
        }
    }

    async function openDeleteSalaryPayment(row, employeeName) {
        if (!row?.id) {
            void showAlert(t('employees.salaryPaymentDeleteNoId'), { variant: 'warning' })
            return
        }
        const line = `${employeeName} — ${formatAdvanceDate(row.payment_date)} · ${formatUzs(row.amount)}`
        if (!(await showConfirm(`${t('employees.deleteOneSalaryPayment')}?\n${line}`, { variant: 'warning' }))) return
        try {
            const { error } = await supabase.from('employee_salary_payments').delete().eq('id', row.id)
            if (error) throw error
            await showAlert(t('employees.salaryPaymentDeletedOk'), { variant: 'success' })
            await loadEmployees({ silent: true })
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.salaryPaymentDeleteError'), { variant: 'error' })
        }
    }

    async function openDeleteAllSalaryPaymentsPeriod(xodim, salList) {
        const ids = (salList || []).map((r) => r.id).filter(Boolean)
        if (!ids.length) return
        if (
            !(await showConfirm(
                `${t('employees.deleteAllSalaryPaymentsThisMonth')}?\n${xodim.name} · ${ids.length}`,
                { variant: 'warning' }
            ))
        )
            return
        try {
            const { error } = await supabase.from('employee_salary_payments').delete().in('id', ids)
            if (error) throw error
            await showAlert(t('employees.salaryPaymentsBulkDeletedOk'), { variant: 'success' })
            await loadEmployees({ silent: true })
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.salaryPaymentDeleteError'), { variant: 'error' })
        }
    }

    function scheduleDaysCap() {
        const m = /^(\d{4})-(\d{2})$/.exec(String(reportPeriodYm || ''))
        if (!m) return 30
        const y = Number(m[1])
        const mo = Number(m[2])
        if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return 30
        return new Date(y, mo, 0).getDate()
    }

    function onRestDaysChange(raw) {
        const W = scheduleDaysCap()
        const r = Math.max(0, parseInt(String(raw).replace(/\D/g, ''), 10) || 0)
        const rr = Math.min(MONTHLY_REST_DAYS_LIMIT, r)
        const w = Math.max(0, W - rr)
        setForm((f) => ({ ...f, rest_days: String(rr), worked_days: String(w) }))
    }

    function onWorkedDaysChange(raw) {
        const W = scheduleDaysCap()
        const w0 = Math.max(0, parseInt(String(raw).replace(/\D/g, ''), 10) || 0)
        const ww = Math.min(W, w0)
        const r = Math.max(0, W - ww)
        const rr = Math.min(MONTHLY_REST_DAYS_LIMIT, r)
        const workedNormalized = Math.max(0, W - rr)
        setForm((f) => ({ ...f, worked_days: String(workedNormalized), rest_days: String(rr) }))
    }

    async function persistEmployee() {
        if (!form.name || !form.position || !form.monthly_salary) {
            alert(t('employees.requiredError'))
            return
        }
        const phoneTrim = String(form.phone || '').trim()
        if (phoneTrim) {
            const n = normalizeUzbekPhone(phoneTrim)
            if (!n) {
                void showAlert(t('employees.phoneInvalidWarn'), { variant: 'warning' })
                return
            }
        }
        const restDaysRaw = parseInt(form.rest_days, 10) || 0
        if (restDaysRaw > MONTHLY_REST_DAYS_LIMIT) {
            void showAlert(
                t('employees.restDaysLimitWarn').replace('{{n}}', String(MONTHLY_REST_DAYS_LIMIT)),
                { variant: 'warning' }
            )
            return
        }
        try {
            const W = scheduleDaysCap()
            const restDaysFinal = Math.min(MONTHLY_REST_DAYS_LIMIT, Math.max(0, restDaysRaw))
            const workedDaysFinal = Math.max(0, W - restDaysFinal)
            const employeeData = {
                name: form.name,
                position: form.position,
                monthly_salary: parseFloat(form.monthly_salary),
                bonus_percent: parseFloat(form.bonus_percent) || 0,
                worked_days: workedDaysFinal,
                rest_days: restDaysFinal,
                phone: phoneTrim ? normalizeUzbekPhone(phoneTrim) : null
            }

            if (editId) {
                const { error } = await supabase.from('employees').update(employeeData).eq('id', editId)
                if (error) throw error
                setEditId(null)
            } else {
                const { error } = await supabase.from('employees').insert([employeeData])
                if (error) throw error
            }

            setForm({
                name: '',
                position: '',
                monthly_salary: '',
                bonus_percent: '0',
                worked_days: '0',
                rest_days: '0',
                phone: ''
            })
            setIsAdding(false)
            await loadEmployees({ silent: true })
        } catch (error) {
            console.error('Error saving employee:', error)
            const detail = error?.message || error?.error_description || String(error?.code || '')
            await showAlert(
                detail ? `${t('common.saveError')}\n\n${detail}` : t('common.saveError'),
                { variant: 'error' }
            )
        }
    }

    function handleSubmit(e) {
        e.preventDefault()
        if (!form.name || !form.position || !form.monthly_salary) {
            alert(t('employees.requiredError'))
            return
        }
        void persistEmployee()
    }

    async function handleDelete(id) {
        if (!(await showConfirm(t('employees.deleteConfirm'), { variant: 'warning' }))) return
        try {
            const { error } = await supabase.from('employees').delete().eq('id', id)
            if (error) throw error
            await loadEmployees({ silent: true })
        } catch (error) {
            console.error('Error deleting employee:', error)
            await showAlert(t('employees.deleteError'), { variant: 'error' })
        }
    }

    function handleEdit(item) {
        setForm({
            name: item.name,
            position: item.position,
            monthly_salary: item.monthly_salary.toString(),
            bonus_percent: item.bonus_percent?.toString() || '0',
            worked_days: item.worked_days?.toString() || '0',
            rest_days: item.rest_days?.toString() || '0',
            phone: item.phone ? String(item.phone) : ''
        })
        setEditId(item.id)
        setIsAdding(true)
    }

    function handleCancel() {
        setForm({
            name: '',
            position: '',
            monthly_salary: '',
            bonus_percent: '0',
            worked_days: '0',
            rest_days: '0',
            phone: ''
        })
        setEditId(null)
        setIsAdding(false)
    }

    function salaryCloseAutoAmountForEmployee(xodim) {
        const contractTotal = (Number(xodim.monthly_salary) || 0) + (Number(xodim.bonus_percent) || 0)
        const k = employeeMapKey(xodim.id)
        const advList = advancesByEmployee[k] || []
        const salList = salaryPaymentsByEmployee[k] || []
        const advSum = advList.reduce((s, r) => s + (Number(r.amount) || 0), 0)
        const salSum = salList.reduce((s, r) => s + (Number(r.amount) || 0), 0)
        const { remaining } = payoutRemainingVsContract(contractTotal, advSum, salSum)
        const remainingNum = Number(remaining) || 0
        const unsettledAdvance = Math.max(0, advSum - salSum)
        return remainingNum >= 0.01 ? remainingNum : unsettledAdvance >= 0.01 ? unsettledAdvance : 0
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
        if (salaryCloseAutoAmountForEmployee(xodim) < 0.01) {
            await showAlert(t('employees.salaryCloseDuplicateWarn'), { variant: 'warning' })
            return
        }
        setSalaryOverviewModal({ employeeId: xodim.id, name: xodim.name })
        setSalaryForm({
            payment_date: defaultActivityDateForReportPeriod(reportPeriodYm),
            note: ''
        })
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
        setAdvanceModal({ employeeId: xodim.id, name: xodim.name })
        setAdvanceForm({
            amount: '',
            advance_date: defaultActivityDateForReportPeriod(reportPeriodYm),
            note: ''
        })
    }

    function closeSalaryOverviewModal() {
        setSalaryOverviewModal(null)
        setSalaryForm({ payment_date: '', note: '' })
    }

    function closeAdvanceModal() {
        setAdvanceModal(null)
        setAdvanceForm({ amount: '', advance_date: '', note: '' })
    }

    function hasSalaryPaymentDuplicateThisMonth(employeeId, paymentDateInput, amount) {
        const ymd = calendarYmdForFilter(paymentDateInput)
        if (ymd.length !== 10) return false
        const empKey = employeeMapKey(employeeId)
        const list = salaryPaymentsByEmployee[empKey] || []
        const a = Number(amount) || 0
        return list.some(
            (r) =>
                calendarYmdForFilter(r.payment_date) === ymd &&
                Math.abs((Number(r.amount) || 0) - a) < 0.01
        )
    }

    async function handleSalaryPaymentSubmit(e) {
        e.preventDefault()
        if (!salaryOverviewModal || !salaryOverviewPayoutContext) return
        const amt = Math.round((Number(salaryOverviewPayoutContext.salaryAutoSaveAmount) || 0) * 100) / 100
        if (amt < 0.01) {
            await showAlert(t('employees.salaryCloseDuplicateWarn'), { variant: 'warning' })
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

        if (salaryPaymentSubmitLockRef.current) return
        salaryPaymentSubmitLockRef.current = true
        try {
            setSalarySaving(true)
            if (
                hasSalaryPaymentDuplicateThisMonth(
                    salaryOverviewModal.employeeId,
                    salaryForm.payment_date,
                    amt
                )
            ) {
                await showAlert(t('employees.salaryPaymentDuplicateBlocked'), { variant: 'warning' })
                return
            }
            const empUuid = String(salaryOverviewModal.employeeId).trim()
            const { data: dupOnServer, error: dupServErr } = await supabase
                .from('employee_salary_payments')
                .select('id')
                .eq('employee_id', empUuid)
                .eq('payment_date', salaryForm.payment_date)
                .eq('amount', amt)
                .limit(1)
            if (dupServErr) {
                console.error('employee_salary_payments dup check:', dupServErr)
                await showAlert(
                    `${t('employees.salaryPaymentDupCheckFailed')}\n\n${dupServErr.message || String(dupServErr.code || '')}`,
                    { variant: 'error' }
                )
                return
            }
            if (dupOnServer?.length) {
                await showAlert(t('employees.salaryPaymentDuplicateBlocked'), { variant: 'warning' })
                await loadEmployees({ silent: true })
                return
            }
            const cleanNote = salaryForm.note?.trim() || null
            const { data: insertedSal, error } = await supabase
                .from('employee_salary_payments')
                .insert([
                    {
                        employee_id: empUuid,
                        amount: amt,
                        payment_date: salaryForm.payment_date,
                        note: cleanNote && cleanNote !== '-' ? cleanNote : null,
                        source: 'crm'
                    }
                ])
                .select('id, employee_id, amount, payment_date, note, created_at')
            if (error) {
                const em = String(error.message || '').toLowerCase()
                const dup =
                    String(error.code || '') === '23505' ||
                    em.includes('duplicate key') ||
                    em.includes('unique constraint')
                if (dup) {
                    await showAlert(t('employees.salaryPaymentDuplicateBlocked'), { variant: 'warning' })
                    return
                }
                throw error
            }
            const newSalRow = insertedSal?.[0]
            if (newSalRow) {
                setSalaryRaw((prev) =>
                    prev.some((r) => r.id === newSalRow.id) ? prev : [newSalRow, ...prev]
                )
            }
            /** Alert/modaldan oldin — aks holda `loadEmployees` tugamaguncha ro‘yxat eski, ikkinchi «yopish» dublikat yaratadi */
            await loadEmployees({ silent: true })
            await showAlert(t('employees.salaryPaymentSaved'), { variant: 'success' })
            closeSalaryOverviewModal()
        } catch (err) {
            console.error(err)
            await showAlert(t('employees.salaryPaymentError'), { variant: 'error' })
        } finally {
            salaryPaymentSubmitLockRef.current = false
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
            await loadEmployees({ silent: true })
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

    const filteredEmployees = employees.filter((x) => {
        const q = searchTerm.toLowerCase().trim()
        if (!q) return true
        if (x.name?.toLowerCase().includes(q)) return true
        if (x.position?.toLowerCase().includes(q)) return true
        const digitsQ = q.replace(/\D/g, '')
        if (digitsQ.length > 0) {
            const ph = String(x.phone || '').replace(/\D/g, '')
            if (ph.includes(digitsQ)) return true
        }
        return false
    })

    const scheduleHintText = t('employees.daysScheduleHint').replace(
        '{{n}}',
        String(scheduleDaysCap())
    )

    const monthAdvancesGrandTotalRaw = useMemo(
        () =>
            Object.values(advancesByEmployee).reduce(
                (sum, list) => sum + (list || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
                0
            ),
        [advancesByEmployee]
    )
    const monthSalaryPaidGrandTotalRaw = useMemo(
        () =>
            Object.values(salaryPaymentsByEmployee).reduce(
                (sum, list) => sum + (list || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
                0
            ),
        [salaryPaymentsByEmployee]
    )

    /** Sariq karta: avanslar − oylik to‘lovlari (yopilgan qism ayiriladi) */
    const monthAdvancesNetDisplay = useMemo(() => {
        if (salaryPaymentsTableMissing) return monthAdvancesGrandTotalRaw
        return Math.max(0, monthAdvancesGrandTotalRaw - monthSalaryPaidGrandTotalRaw)
    }, [
        monthAdvancesGrandTotalRaw,
        monthSalaryPaidGrandTotalRaw,
        salaryPaymentsTableMissing
    ])

    /** Jami chiqim: ikki yo‘nalishni ikki marta hisoblamaslik */
    const monthTotalPaidOutGrandTotal = useMemo(() => {
        if (salaryPaymentsTableMissing) return monthAdvancesGrandTotalRaw
        return Math.max(monthAdvancesGrandTotalRaw, monthSalaryPaidGrandTotalRaw)
    }, [monthAdvancesGrandTotalRaw, monthSalaryPaidGrandTotalRaw, salaryPaymentsTableMissing])

    const salaryOverviewPayoutContext = useMemo(() => {
        if (!salaryOverviewModal?.employeeId) return null
        const xodim = employees.find(
            (e) => employeeMapKey(e.id) === employeeMapKey(salaryOverviewModal.employeeId)
        )
        if (!xodim) return null
        const contractTotal = (Number(xodim.monthly_salary) || 0) + (Number(xodim.bonus_percent) || 0)
        const k = employeeMapKey(xodim.id)
        const advList = advancesByEmployee[k] || []
        const salList = salaryPaymentsByEmployee[k] || []
        const advSum = advList.reduce((s, r) => s + (Number(r.amount) || 0), 0)
        const salSum = salList.reduce((s, r) => s + (Number(r.amount) || 0), 0)
        const { remaining, totalOut } = payoutRemainingVsContract(contractTotal, advSum, salSum)
        const timeline = mergeEmployeePayoutsTimeline(advList, salList)
        const salaryAutoSaveAmount = salaryCloseAutoAmountForEmployee(xodim)
        return {
            contractTotal,
            advSum,
            salSum,
            remaining,
            totalOut,
            advList,
            salList,
            timeline,
            xodim,
            salaryAutoSaveAmount
        }
    }, [salaryOverviewModal, employees, advancesByEmployee, salaryPaymentsByEmployee])

    const statsMonthLabel = useMemo(() => {
        const { from } = monthRangeFromYm(reportPeriodYm)
        const [y, mo] = from.split('-').map(Number)
        const d = new Date(y, mo - 1, 1)
        const loc = language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ'
        return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
    }, [reportPeriodYm, language])

    const isReportMonthClosed = closedPeriodYms.includes(reportPeriodYm)

    async function printEmployeesPayrollTable() {
        const rows = filteredEmployees.map((xodim) => {
            const empKey = employeeMapKey(xodim.id)
            const contractTotal = (Number(xodim.monthly_salary) || 0) + (Number(xodim.bonus_percent) || 0)
            const advList = advancesByEmployee[empKey] || []
            const advSum = advList.reduce((s, r) => s + (Number(r.amount) || 0), 0)
            const salList = salaryPaymentsByEmployee[empKey] || []
            const salSum = salList.reduce((s, r) => s + (Number(r.amount) || 0), 0)
            const totalOut = salaryPaymentsTableMissing ? advSum : Math.max(advSum, salSum)
            const remaining = Math.max(0, contractTotal - totalOut)
            return `
                <tr>
                    <td>${escapeHtml(xodim.name || '')}</td>
                    <td>${escapeHtml(xodim.position || '')}</td>
                    <td>${escapeHtml(formatUzs(contractTotal))}</td>
                    <td>${escapeHtml(formatUzs(advSum))}</td>
                    <td>${escapeHtml(salaryPaymentsTableMissing ? '—' : formatUzs(salSum))}</td>
                    <td>${escapeHtml(formatUzs(totalOut))}</td>
                    <td>${escapeHtml(formatUzs(remaining))}</td>
                </tr>
            `
        })
        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(t('common.employees'))}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .sub { margin: 0 0 4px; color: #475569; font-size: 13px; }
    .cards { margin: 10px 0 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(t('common.employees'))}</h1>
  <p class="sub">${escapeHtml(statsMonthLabel)}</p>
  <p class="sub">${escapeHtml(new Date().toLocaleString())}</p>
  <div class="cards">
    <div>${escapeHtml(t('employees.statsCardAdvancesTotal'))}: ${escapeHtml(formatUzs(monthAdvancesNetDisplay))}</div>
    <div>${escapeHtml(t('employees.statsCardSalaryClosedTotal'))}: ${escapeHtml(salaryPaymentsTableMissing ? '—' : formatUzs(monthSalaryPaidGrandTotalRaw))}</div>
    <div>${escapeHtml(t('employees.monthTotalPaidOutCard'))}: ${escapeHtml(formatUzs(monthTotalPaidOutGrandTotal))}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(t('employees.name'))}</th>
        <th>${escapeHtml(t('employees.position'))}</th>
        <th>${escapeHtml(t('employees.salaryModalContractLabel'))}</th>
        <th>${escapeHtml(t('employees.salaryModalPaidAdvanceLabel'))}</th>
        <th>${escapeHtml(t('employees.salaryModalPaidSalaryLabel'))}</th>
        <th>${escapeHtml(t('employees.rowTotalPaidOutLabel'))}</th>
        <th>${escapeHtml(t('employees.salaryModalRemainingLabel'))}</th>
      </tr>
    </thead>
    <tbody>
      ${rows.length ? rows.join('') : `<tr><td colspan="7">${escapeHtml(t('employees.noEmployees'))}</td></tr>`}
    </tbody>
  </table>
</body>
</html>`
        const popup = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=820')
        if (popup) {
            popup.document.write(html)
            popup.document.close()
            popup.focus()
            popup.print()
            return
        }

        // Popup bloklansa ham shu oynada print qilish uchun fallback.
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        document.body.appendChild(iframe)
        const doc = iframe.contentWindow?.document
        if (!doc) {
            iframe.remove()
            window.print()
            return
        }
        doc.open()
        doc.write(html)
        doc.close()
        setTimeout(() => {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
            setTimeout(() => iframe.remove(), 1500)
        }, 120)
    }

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
                                    onClick={() => void executeReopenMonth(reportPeriodYm)}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-950 hover:bg-amber-200 transition-colors"
                                >
                                    <Unlock size={14} aria-hidden />
                                    {t('employees.payrollReopenMonth')}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void executeCloseMonth(reportPeriodYm)}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">{t('employees.statsCardEmployeesCount')}</p>
                            <p className="text-xs text-blue-100/85 mt-0.5">{t('employees.statsCardEmployeesHint')}</p>
                            <p className="text-3xl font-bold mt-2 tabular-nums">{employees.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Users className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white p-6 rounded-xl shadow-lg shadow-amber-200/80">
                    <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-amber-50">{t('employees.statsCardAdvancesTotal')}</p>
                            <p className="text-xs text-amber-100/90 mt-0.5">{t('employees.statsCardAdvancesHint')}</p>
                            <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums">
                                {formatUzs(monthAdvancesNetDisplay)}
                            </p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl shrink-0">
                            <Wallet className="text-white" size={24} aria-hidden />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white p-6 rounded-xl shadow-lg shadow-emerald-200/80">
                    <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-emerald-50">{t('employees.statsCardSalaryClosedTotal')}</p>
                            <p className="text-xs text-emerald-100/90 mt-0.5">{t('employees.statsCardSalaryClosedHint')}</p>
                            <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums">
                                {salaryPaymentsTableMissing ? '—' : formatUzs(monthSalaryPaidGrandTotalRaw)}
                            </p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl shrink-0">
                            <Banknote className="text-white" size={24} aria-hidden />
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-8 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-emerald-50/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                        {t('employees.monthTotalPaidOutCard')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{t('employees.monthTotalPaidOutHint')}</p>
                </div>
                <p className="text-2xl font-bold tabular-nums text-slate-900 shrink-0">
                    {formatUzs(monthTotalPaidOutGrandTotal)}
                </p>
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

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void printEmployeesPayrollTable()}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-3 rounded-xl transition-all border border-slate-200 font-bold"
                    >
                        <Printer size={18} />
                        <span className="hidden sm:inline">{t('common.print')}</span>
                    </button>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 font-bold"
                    >
                        {isAdding ? <X size={20} /> : <UserPlus size={20} />}
                        <span className="hidden sm:inline">{isAdding ? t('common.cancel') : t('employees.addEmployee')}</span>
                    </button>
                </div>
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
                            <div className="space-y-2 md:col-span-2 lg:col-span-3">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.phoneLabel')}</label>
                                <input
                                    type="tel"
                                    autoComplete="tel"
                                    placeholder={t('employees.phonePlaceholder')}
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                                />
                            </div>
                            <div className="md:col-span-2 lg:col-span-3">
                                <p className="text-xs text-gray-500 leading-relaxed">{scheduleHintText}</p>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('employees.workedDays')}</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={form.worked_days}
                                    onChange={(e) => onWorkedDaysChange(e.target.value)}
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
                                    onChange={(e) => onRestDaysChange(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    min="0"
                                    max={String(MONTHLY_REST_DAYS_LIMIT)}
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
                    <div className="overflow-x-auto overscroll-x-contain">
                        <table className="w-full min-w-[50rem] text-left border-separate border-spacing-0">
                            <thead className="text-xs uppercase tracking-wider text-gray-500 font-bold">
                                <tr>
                                    <th className="sticky left-0 z-30 bg-gray-50 px-2 py-3 text-left align-bottom rounded-tl-2xl border-b border-gray-100 shadow-[4px_0_12px_-6px_rgba(15,23,42,0.12)] w-[11rem] min-w-[11rem] max-w-[11rem]">
                                        {t('employees.name')}
                                    </th>
                                    <th className="sticky left-[11rem] z-30 bg-gray-50 px-2 py-3 text-left align-bottom border-b border-gray-100 shadow-[4px_0_12px_-6px_rgba(15,23,42,0.12)] w-[8.5rem] min-w-[8.5rem] max-w-[8.5rem]">
                                        {t('employees.position')}
                                    </th>
                                    <th className="bg-gray-50 px-3 py-3 align-bottom border-b border-gray-100 min-w-[15rem] max-w-[26rem]">
                                        <span className="block normal-case">{t('employees.operationsColumnTitle')}</span>
                                        <span className="block font-normal normal-case text-[10px] text-gray-400 mt-0.5 leading-tight">
                                            {t('employees.operationsColumnSub')}
                                        </span>
                                    </th>
                                    <th className="sticky right-[3.5rem] z-30 bg-gray-50 px-1 py-2 text-center align-bottom border-b border-gray-100 border-l border-gray-200/80 w-14 min-w-[3.5rem] shadow-[-6px_0_14px_-6px_rgba(15,23,42,0.1)]">
                                        <span className="block normal-case text-[10px] leading-tight text-gray-600 font-bold">
                                            {t('employees.tableColEditShort')}
                                        </span>
                                    </th>
                                    <th className="sticky right-0 z-30 bg-gray-50 px-1 py-2 text-center align-bottom rounded-tr-2xl border-b border-gray-100 border-l border-gray-200/80 w-14 min-w-[3.5rem] shadow-[-6px_0_14px_-6px_rgba(15,23,42,0.1)]">
                                        <span className="block normal-case text-[10px] leading-tight text-gray-600 font-bold">
                                            {t('employees.tableColDeleteShort')}
                                        </span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.map((xodim) => {
                                    const empKey = employeeMapKey(xodim.id)
                                    const approvedLeaveDates = approvedLeaveDatesByEmployee[empKey] || []
                                    const restDaysCount = Math.max(0, Number(xodim.rest_days) || 0)
                                    const approvedVisibleDates =
                                        restDaysCount > 0 ? approvedLeaveDates.slice(0, restDaysCount) : []
                                    const contractTotal = (xodim.monthly_salary || 0) + (xodim.bonus_percent || 0)
                                    const advList = advancesByEmployee[empKey] || []
                                    const advSum = advList.reduce((s, r) => s + (r.amount || 0), 0)
                                    const salList = salaryPaymentsByEmployee[empKey] || []
                                    const salSum = salList.reduce((s, r) => s + (r.amount || 0), 0)
                                    const payoutTimeline = mergeEmployeePayoutsTimeline(advList, salList)
                                    const rowHasPayrollContext =
                                        contractTotal >= 0.01 || advSum >= 0.01 || salSum >= 0.01
                                    const salaryCloseDoneThisMonth =
                                        !salaryPaymentsTableMissing &&
                                        rowHasPayrollContext &&
                                        salaryCloseAutoAmountForEmployee(xodim) < 0.01
                                    return (
                                        <tr key={xodim.id} className="group transition-colors">
                                            <td className="sticky left-0 z-20 bg-white group-hover:bg-blue-50/50 px-2 py-3 align-top border-b border-gray-100 shadow-[4px_0_12px_-6px_rgba(15,23,42,0.06)] w-[11rem] min-w-[11rem] max-w-[11rem]">
                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="font-bold text-gray-900 break-words leading-snug">{xodim.name}</span>
                                                    {xodim.phone ? (
                                                        <span className="text-[11px] font-mono text-gray-500">{xodim.phone}</span>
                                                    ) : null}
                                                    {approvedVisibleDates.length > 0 ? (
                                                        <div className="text-[10px] text-gray-600 leading-snug">
                                                            <span className="text-gray-500">
                                                                {t('employees.approvedLeaveDatesLabel')}{' '}
                                                            </span>
                                                            <span className="font-mono tabular-nums">
                                                                {approvedVisibleDates.join(', ')}
                                                            </span>
                                                        </div>
                                                    ) : null}
                                                    {salaryStatusBadge(contractTotal, advSum + salSum)}
                                                </div>
                                            </td>
                                            <td className="sticky left-[11rem] z-20 bg-white group-hover:bg-blue-50/50 px-2 py-3 align-top border-b border-gray-100 shadow-[4px_0_12px_-6px_rgba(15,23,42,0.06)] w-[8.5rem] min-w-[8.5rem] max-w-[8.5rem]">
                                                <span className="text-[12px] text-gray-800 break-words leading-snug font-medium line-clamp-4">
                                                    {xodim.position}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 align-top border-b border-gray-100 bg-white group-hover:bg-blue-50/50 min-w-[15rem] max-w-[26rem]">
                                                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs tabular-nums">
                                                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                                        <span className="text-gray-600 font-semibold">
                                                            {t('employees.rowTotalPaidOutLabel')}
                                                        </span>
                                                        <span className="font-bold text-slate-900 text-sm">
                                                            {formatUzs(
                                                                salaryPaymentsTableMissing
                                                                    ? advSum
                                                                    : Math.max(advSum, salSum)
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            closedPeriodYms.includes(reportPeriodYm) ||
                                                            advancesTableMissing
                                                        }
                                                        onClick={() => void openAdvanceModal(xodim)}
                                                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-bold leading-snug bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:pointer-events-none shadow-sm whitespace-nowrap"
                                                        title={
                                                            closedPeriodYms.includes(reportPeriodYm)
                                                                ? t('employees.payrollMonthClosedNoNewRows')
                                                                : advancesTableMissing
                                                                  ? t('employees.advancesTableMissing')
                                                                  : t('employees.rowGiveCashTitle')
                                                        }
                                                    >
                                                        <Wallet className="shrink-0 opacity-95" size={14} aria-hidden />
                                                        {t('employees.rowGiveCashShort')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            closedPeriodYms.includes(reportPeriodYm) ||
                                                            salaryPaymentsTableMissing
                                                        }
                                                        onClick={() => void openSalaryModal(xodim)}
                                                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-bold leading-snug bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none shadow-sm whitespace-nowrap"
                                                        title={
                                                            closedPeriodYms.includes(reportPeriodYm)
                                                                ? t('employees.payrollMonthClosedNoNewRows')
                                                                : salaryPaymentsTableMissing
                                                                  ? t('employees.salaryPaymentsTableMissing')
                                                                  : t('employees.rowCloseSalaryTitle')
                                                        }
                                                    >
                                                        <Banknote className="shrink-0 opacity-95" size={14} aria-hidden />
                                                        {t('employees.rowCloseSalaryShort')}
                                                    </button>
                                                    {salaryCloseDoneThisMonth ? (
                                                        <span
                                                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-bold leading-tight text-emerald-900 shadow-sm"
                                                            title={t('employees.rowSalaryClosedThisMonthTitle')}
                                                            role="status"
                                                        >
                                                            <CheckCircle2
                                                                className="shrink-0 text-emerald-600"
                                                                size={14}
                                                                aria-hidden
                                                            />
                                                            {t('employees.rowSalaryClosedThisMonthShort')}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="text-[9px] text-gray-500 leading-snug mb-2">
                                                    {t('employees.rowStatsLinkHint')}
                                                </p>
                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {!advancesTableMissing && advList.length > 1 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openDeleteAllAdvancesPeriod(xodim, advList)}
                                                            className="text-[11px] font-bold text-red-700 hover:text-red-900 hover:underline"
                                                        >
                                                            {t('employees.deleteAllAdvancesThisMonth')}
                                                        </button>
                                                    ) : null}
                                                    {!salaryPaymentsTableMissing && salList.length > 1 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openDeleteAllSalaryPaymentsPeriod(xodim, salList)}
                                                            className="text-[11px] font-bold text-red-700 hover:text-red-900 hover:underline"
                                                        >
                                                            {t('employees.deleteAllSalaryPaymentsThisMonth')}
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {payoutTimeline.length > 0 ? (
                                                    <ol className="space-y-2 text-xs text-gray-700 font-normal list-none pl-0">
                                                        {payoutTimeline.map((item, idx) => (
                                                            <li
                                                                key={
                                                                    item.kind === 'advance'
                                                                        ? `a-${item.raw?.id || `${item.sortKey}-${item.amount}-${idx}`}`
                                                                        : `s-${item.raw?.id || `${item.sortKey}-${item.amount}-${idx}`}`
                                                                }
                                                                className="tabular-nums rounded-lg border border-gray-100 bg-gray-50/60 px-2 py-2"
                                                            >
                                                                <div className="flex flex-wrap items-start gap-2">
                                                                    <span className="shrink-0 w-5 text-[10px] font-bold text-gray-400 pt-0.5">
                                                                        {idx + 1}.
                                                                    </span>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                                                                            <span className="text-gray-500">
                                                                                {formatAdvanceDate(item.displayDate)}
                                                                            </span>
                                                                            <span className="text-gray-400">—</span>
                                                                            <span className="font-semibold text-gray-900">
                                                                                {formatUzs(item.amount)}
                                                                            </span>
                                                                        </div>
                                                                        {item.note ? (
                                                                            <div className="text-[11px] text-gray-500 mt-1 max-w-[14rem] leading-snug">
                                                                                {t('employees.expenseNotePrefix')}
                                                                                {item.note}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                    <div className="shrink-0 flex flex-wrap items-center justify-end gap-1">
                                                                        {item.kind === 'advance' &&
                                                                        !advancesTableMissing &&
                                                                        item.raw?.id ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    openDeleteAdvance(item.raw, xodim.name)
                                                                                }
                                                                                className="shrink-0 p-1 rounded-md text-red-600 hover:bg-red-50"
                                                                                title={t('employees.deleteOneAdvance')}
                                                                            >
                                                                                <Trash2 size={14} aria-hidden />
                                                                            </button>
                                                                        ) : null}
                                                                        {item.kind === 'salary' && item.raw?.id ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    openDeleteSalaryPayment(item.raw, xodim.name)
                                                                                }
                                                                                className="shrink-0 p-1 rounded-md text-red-600 hover:bg-red-50"
                                                                                title={t('employees.deleteOneSalaryPayment')}
                                                                            >
                                                                                <Trash2 size={14} aria-hidden />
                                                                            </button>
                                                                        ) : null}
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ol>
                                                ) : (
                                                    <p className="text-xs text-gray-400">{t('employees.noPayoutsThisMonth')}</p>
                                                )}
                                            </td>
                                            <td className="sticky right-[3.5rem] z-20 bg-white group-hover:bg-blue-50/50 px-0 py-3 align-middle border-b border-gray-100 border-l border-gray-200/80 w-14 min-w-[3.5rem] shadow-[-6px_0_14px_-6px_rgba(15,23,42,0.06)]">
                                                <div className="flex justify-center items-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEdit(xodim)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title={t('employees.editEmployee')}
                                                    >
                                                        <Edit size={20} aria-hidden />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="sticky right-0 z-20 bg-white group-hover:bg-blue-50/50 px-0 py-3 align-middle border-b border-gray-100 border-l border-gray-200/80 w-14 min-w-[3.5rem] shadow-[-6px_0_14px_-6px_rgba(15,23,42,0.06)]">
                                                <div className="flex justify-center items-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDelete(xodim.id)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title={t('common.delete')}
                                                    >
                                                        <Trash2 size={20} aria-hidden />
                                                    </button>
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

            {salaryOverviewModal && salaryOverviewPayoutContext ? (
                <div
                    className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="salary-overview-title"
                    onClick={(ev) => {
                        if (ev.target === ev.currentTarget) closeSalaryOverviewModal()
                    }}
                >
                    <div
                        className="relative w-full max-w-lg max-h-[min(92vh,720px)] flex flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={closeSalaryOverviewModal}
                            className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 z-10"
                            aria-label={t('common.close')}
                        >
                            <X size={20} />
                        </button>
                        <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
                            <h2 id="salary-overview-title" className="text-lg font-bold text-gray-900 pr-10">
                                {salaryOverviewModal.name}
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                {t('employees.salaryOverviewSubtitle')} —{' '}
                                <span className="font-semibold text-gray-700 capitalize">{statsMonthLabel}</span>
                            </p>
                        </div>
                        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
                            <div>
                                <p className="text-sm font-bold text-gray-900 mb-2">{t('employees.advancesAccountingTitle')}</p>
                                <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-950 tabular-nums font-semibold">
                                    {t('employees.salaryModalPaidAdvanceLabel')}:{' '}
                                    {formatUzs(salaryOverviewPayoutContext.advSum)}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-gray-800 space-y-1.5 tabular-nums">
                                <div className="flex flex-wrap justify-between gap-x-2">
                                    <span className="text-gray-600">{t('employees.salaryModalContractLabel')}</span>
                                    <span className="font-semibold">{formatUzs(salaryOverviewPayoutContext.contractTotal)}</span>
                                </div>
                                <div className="flex flex-wrap justify-between gap-x-2">
                                    <span className="text-gray-600">{t('employees.salaryModalPaidAdvanceLabel')}</span>
                                    <span className="font-semibold text-amber-900">{formatUzs(salaryOverviewPayoutContext.advSum)}</span>
                                </div>
                                <div className="flex flex-wrap justify-between gap-x-2">
                                    <span className="text-gray-600">{t('employees.salaryModalPaidSalaryLabel')}</span>
                                    <span className="font-semibold text-emerald-900">
                                        {salaryPaymentsTableMissing ? '—' : formatUzs(salaryOverviewPayoutContext.salSum)}
                                    </span>
                                </div>
                                <div className="flex flex-wrap justify-between gap-x-2 pt-1 border-t border-slate-200">
                                    <span className="text-gray-700 font-medium">{t('employees.salaryModalTotalPaidLabel')}</span>
                                    <span className="font-bold">
                                        {salaryPaymentsTableMissing
                                            ? formatUzs(salaryOverviewPayoutContext.advSum)
                                            : formatUzs(salaryOverviewPayoutContext.totalOut)}
                                    </span>
                                </div>
                                <div className="flex flex-wrap justify-between gap-x-2">
                                    <span className="text-gray-700 font-medium">{t('employees.salaryModalRemainingLabel')}</span>
                                    <span className="font-bold text-amber-800">
                                        {salaryPaymentsTableMissing
                                            ? '—'
                                            : formatUzs(salaryOverviewPayoutContext.remaining)}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                                    {t('employees.salaryOverviewListTitle')}
                                </p>
                                {salaryOverviewPayoutContext.timeline.length > 0 ? (
                                    <ol className="space-y-2 text-xs text-gray-700 list-none pl-0">
                                        {salaryOverviewPayoutContext.timeline.map((item, idx) => (
                                            <li
                                                key={
                                                    item.kind === 'advance'
                                                        ? `ov-a-${item.raw?.id || `${item.sortKey}-${idx}`}`
                                                        : `ov-s-${item.raw?.id || `${item.sortKey}-${idx}`}`
                                                }
                                                className="rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-2 tabular-nums flex gap-2"
                                            >
                                                <span className="text-gray-400 font-bold shrink-0">{idx + 1}.</span>
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-gray-500">{formatAdvanceDate(item.displayDate)}</span>
                                                    <span className="text-gray-400"> — </span>
                                                    <span className="font-semibold text-gray-900">{formatUzs(item.amount)}</span>
                                                    {item.note ? (
                                                        <div className="text-[11px] text-gray-500 mt-1">{item.note}</div>
                                                    ) : null}
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p className="text-sm text-gray-400">{t('employees.noPayoutsThisMonth')}</p>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 shrink-0 bg-white rounded-b-2xl space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                {t('employees.salaryOverviewFormLead')}
                            </p>
                            {salaryPaymentsTableMissing || closedPeriodYms.includes(reportPeriodYm) ? (
                                <p className="text-sm text-amber-800 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                                    {salaryPaymentsTableMissing
                                        ? t('employees.salaryPaymentsTableMissing')
                                        : t('employees.payrollMonthClosedNoNewRows')}
                                </p>
                            ) : (
                                <form onSubmit={handleSalaryPaymentSubmit} className="space-y-3">
                                    <p className="text-[11px] text-gray-500 leading-relaxed">
                                        {t('employees.salaryPaymentCalculatedTotalsNote')}
                                    </p>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 space-y-2 text-xs tabular-nums">
                                        <div className="flex flex-wrap justify-between gap-x-2 gap-y-1">
                                            <span className="text-gray-600 font-medium">
                                                {t('employees.salaryModalTotalPaidLabel')}
                                            </span>
                                            <span className="font-bold text-gray-900">
                                                {formatUzs(salaryOverviewPayoutContext.totalOut)}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 pt-1 border-t border-slate-200">
                                            <span className="text-gray-700 font-bold">
                                                {t('employees.salaryPaymentAutoSaveAmountLabel')}
                                            </span>
                                            <span className="font-bold text-emerald-800">
                                                {salaryOverviewPayoutContext.salaryAutoSaveAmount >= 0.01
                                                    ? formatUzs(salaryOverviewPayoutContext.salaryAutoSaveAmount)
                                                    : '—'}
                                            </span>
                                        </div>
                                    </div>
                                    {salaryOverviewPayoutContext.salaryAutoSaveAmount >= 0.01 &&
                                    salaryOverviewPayoutContext.remaining < 0.01 ? (
                                        <p className="text-xs text-emerald-900 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                                            {t('employees.salaryCloseFromAdvanceHint')}
                                        </p>
                                    ) : null}
                                    {salaryOverviewPayoutContext.salaryAutoSaveAmount < 0.01 ? (
                                        <p className="text-xs text-slate-700 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                                            {t('employees.salaryNoRemainingToSaveHint')}
                                        </p>
                                    ) : null}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700">
                                            {t('employees.salaryPaymentDateLabel')}
                                        </label>
                                        <input
                                            type="date"
                                            required={salaryOverviewPayoutContext.salaryAutoSaveAmount >= 0.01}
                                            value={salaryForm.payment_date}
                                            onChange={(e) => setSalaryForm({ ...salaryForm, payment_date: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-gray-700">
                                            {t('employees.salaryPaymentNoteLabel')}
                                        </label>
                                        <input
                                            type="text"
                                            value={salaryForm.note}
                                            onChange={(e) => setSalaryForm({ ...salaryForm, note: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                                            placeholder="—"
                                        />
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={closeSalaryOverviewModal}
                                            className="px-5 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-100 text-sm"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={salarySaving}
                                            className="px-6 py-2.5 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-sm"
                                        >
                                            {salarySaving
                                                ? t('common.loading')
                                                : salaryOverviewPayoutContext.salaryAutoSaveAmount >= 0.01
                                                  ? t('common.save')
                                                  : t('common.close')}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-gray-400">
                                        {salaryOverviewPayoutContext.salaryAutoSaveAmount >= 0.01
                                            ? t('employees.salarySaveClosesModalHint')
                                            : t('employees.salaryCloseModalHint')}
                                    </p>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            ) : salaryOverviewModal && !salaryOverviewPayoutContext ? (
                <div
                    className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="relative w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
                        <p className="text-sm text-gray-700">{t('employees.salaryOverviewNotFound')}</p>
                        <button
                            type="button"
                            onClick={closeSalaryOverviewModal}
                            className="mt-4 px-5 py-2 rounded-xl font-bold bg-gray-100 text-gray-800 hover:bg-gray-200"
                        >
                            {t('common.close')}
                        </button>
                    </div>
                </div>
            ) : null}

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

        </div>
    )
}