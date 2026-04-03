'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts'
import {
    ArrowLeft,
    Download,
    Plus,
    Users,
    PackagePlus,
    Banknote,
    Printer,
    X,
    Upload,
    Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import MoliyaTopNav from '@/components/MoliyaTopNav'
import { MoliyaCardSkeleton } from '@/components/MoliyaSkeletons'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { pickLocalizedName } from '@/utils/localizedName'
import { downloadSupplyTemplateXlsx, parseSupplySpreadsheetFile } from '@/utils/financeSupplyExcel'

const MOLIYA_DELETE_PIN = String(process.env.NEXT_PUBLIC_MOLIYA_DELETE_PIN ?? '').trim()

function formatUzs(n) {
    const v = Number(n) || 0
    return `${v.toLocaleString('uz-UZ')} UZS`
}

/** Biz hamkorga qarzdormiz — qator boshidagi minus bilan */
function formatOurDebtUzs(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100
    if (v < 0.01) return null
    return `−${v.toLocaleString('uz-UZ')} UZS`
}

/** O‘ng yig‘ma kartada: biz qarzdor bo‘lsak, shu summa «+» bilan (hamkor tomondan talab) */
function formatOurDebtPlusUzs(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100
    if (v < 0.01) return null
    return `+${v.toLocaleString('uz-UZ')} UZS`
}

function parseMoney(s) {
    const n = Number(String(s ?? '').replace(/\s/g, '').replace(/,/g, '.'))
    return Number.isFinite(n) ? n : NaN
}

const EMPTY_SUPPLY_LINE = {
    item_name: '',
    quantity_display: '',
    unit_price_uzs: '',
    line_total_uzs: '',
}

function cleanSupplyLines(lines) {
    return (lines || [])
        .map((ln) => ({
            item_name: String(ln.item_name || '').trim(),
            quantity_display: String(ln.quantity_display || '').trim(),
            unit_price_uzs: parseMoney(ln.unit_price_uzs),
            line_total_uzs: parseMoney(ln.line_total_uzs),
        }))
        .filter(
            (ln) =>
                ln.item_name &&
                ln.quantity_display &&
                Number.isFinite(ln.unit_price_uzs) &&
                ln.unit_price_uzs >= 0 &&
                Number.isFinite(ln.line_total_uzs) &&
                ln.line_total_uzs > 0
        )
}

function genReferenceCode() {
    const s = Math.random().toString(36).slice(2, 10).toUpperCase()
    return `TRX-${s}`
}

function displayRefCode(row) {
    if (row?.reference_code) return row.reference_code
    const id = String(row?.id || '').replace(/-/g, '')
    return `TRX-${id.slice(0, 6).toUpperCase()}`
}

function computeBalance(entries) {
    let b = 0
    for (const e of entries || []) {
        const amt = Number(e.amount_uzs) || 0
        if (e.entry_type === 'supply') b += amt
        else b -= amt
    }
    return Math.round(b * 100) / 100
}

/** YYYY-MM-DD — Supabase DATE yoki ISO string uchun; grafik va filtrlarda solishtirish to‘g‘ri bo‘lishi uchun */
function entryDateKey(entry) {
    const s = String(entry?.entry_date ?? '')
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
    if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return s
}

function localCalendarISODate(d) {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${day}`
}

function statusForBalance(balance, t) {
    if (Math.abs(balance) < 0.01)
        return { label: t('finances.partnerStatusClosed'), className: 'bg-slate-100 text-slate-700' }
    if (balance > 0)
        return { label: t('finances.partnerStatusWeOwe'), className: 'bg-red-100 text-red-800' }
    return { label: t('finances.partnerStatusTheyOwe'), className: 'bg-red-100 text-red-800' }
}

function statusBadgeActiveClass(balance) {
    if (Math.abs(balance) < 0.01) return 'bg-white/15 text-white'
    if (balance > 0) return 'bg-red-500/25 text-red-100'
    return 'bg-red-500/25 text-red-100'
}

function lastEntry(entries) {
    if (!entries?.length) return null
    return [...entries].sort((a, b) => {
        const da = entryDateKey(a)
        const db = entryDateKey(b)
        if (da !== db) return db.localeCompare(da)
        return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })[0]
}

function lastOpSummary(entry, t, language) {
    if (!entry) return '—'
    const typeLabel =
        entry.entry_type === 'supply' ? t('finances.entryTypeSupply') : t('finances.entryTypePayment')
    const d = new Date(`${entryDateKey(entry)}T12:00:00`)
    const now = new Date()
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    const isToday = d.toDateString() === now.toDateString()
    const isYesterday = d.toDateString() === y.toDateString()
    let when = d.toLocaleDateString(language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ')
    if (isToday) when = t('finances.today')
    else if (isYesterday) when = t('finances.yesterday')
    return `${typeLabel} (${when})`
}

export default function MoliyaBoshqaruvPage() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert } = useDialog()

    const [partners, setPartners] = useState([])
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [schemaMissing, setSchemaMissing] = useState(false)
    const [selectedId, setSelectedId] = useState(null)

    const [partnerModal, setPartnerModal] = useState(false)
    const [partnerForm, setPartnerForm] = useState({
        name: '',
        legal_id: '',
        phone: '',
        note: '',
    })

    const [entryModal, setEntryModal] = useState({ open: false, type: 'supply' })
    const [entryForm, setEntryForm] = useState({
        amount_uzs: '',
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        warehouse_note: '',
        responsible_name: '',
        lines: [{ ...EMPTY_SUPPLY_LINE }],
    })
    const [financeLines, setFinanceLines] = useState([])
    const [detailModal, setDetailModal] = useState(null)
    const [supplyStep, setSupplyStep] = useState(1)
    const supplyExcelInputRef = useRef(null)
    const supplyExcelModeRef = useRef('replace')
    const [deletePinModal, setDeletePinModal] = useState(null)
    const [deletePinValue, setDeletePinValue] = useState('')

    const loadAll = useCallback(async () => {
        setSchemaMissing(false)
        const { data: p, error: pe } = await supabase
            .from('finance_partners')
            .select('*')
            .eq('is_active', true)
            .order('name_uz', { ascending: true })

        if (pe) {
            const msg = String(pe.message || '')
            if (msg.includes('Could not find the table') || msg.includes('does not exist')) {
                setSchemaMissing(true)
                setPartners([])
                setEntries([])
                setFinanceLines([])
                return
            }
            console.error(pe)
            await showAlert(`${t('finances.partnersLoadError')}: ${pe.message}`, { variant: 'error' })
            setPartners([])
            setEntries([])
            setFinanceLines([])
            return
        }

        const { data: e, error: ee } = await supabase
            .from('partner_finance_entries')
            .select('*')
            .order('entry_date', { ascending: false })

        if (ee) {
            console.error(ee)
            await showAlert(`${t('finances.entriesLoadError')}: ${ee.message}`, { variant: 'error' })
            setEntries([])
            setFinanceLines([])
        } else {
            setEntries(e || [])
            const { data: ln, error: le } = await supabase
                .from('partner_finance_entry_lines')
                .select('*')
                .order('line_index', { ascending: true })
            if (le) {
                const m = String(le.message || '')
                if (m.includes('Could not find the table') || m.includes('does not exist')) {
                    setFinanceLines([])
                } else {
                    console.error(le)
                    setFinanceLines([])
                }
            } else {
                setFinanceLines(ln || [])
            }
        }

        setPartners(p || [])
    }, [showAlert, t])

    useEffect(() => {
        let ok = true
        ;(async () => {
            setLoading(true)
            try {
                await loadAll()
            } finally {
                if (ok) setLoading(false)
            }
        })()
        return () => {
            ok = false
        }
    }, [loadAll])

    const entriesByPartner = useMemo(() => {
        const m = {}
        for (const e of entries) {
            const id = e.partner_id
            if (!m[id]) m[id] = []
            m[id].push(e)
        }
        return m
    }, [entries])

    const linesByEntryId = useMemo(() => {
        const m = {}
        for (const L of financeLines) {
            const id = L.entry_id
            if (!m[id]) m[id] = []
            m[id].push(L)
        }
        return m
    }, [financeLines])

    const balanceByPartner = useMemo(() => {
        const m = {}
        for (const p of partners) {
            m[p.id] = computeBalance(entriesByPartner[p.id] || [])
        }
        return m
    }, [partners, entriesByPartner])

    const totals = useMemo(() => {
        let ourDebt = 0
        let theyOwe = 0
        for (const p of partners) {
            const b = balanceByPartner[p.id] || 0
            if (b > 0) ourDebt += b
            else if (b < 0) theyOwe += -b
        }
        return {
            ourDebt: Math.round(ourDebt * 100) / 100,
            theyOwe: Math.round(theyOwe * 100) / 100,
        }
    }, [partners, balanceByPartner])

    const selectedPartner = partners.find((x) => x.id === selectedId) || null
    const selectedEntries = selectedId ? entriesByPartner[selectedId] || [] : []
    const selectedBalance = selectedId ? balanceByPartner[selectedId] || 0 : 0

    const sortedSelectedEntries = useMemo(() => {
        return [...selectedEntries].sort((a, b) => {
            const da = entryDateKey(a)
            const db = entryDateKey(b)
            if (da !== db) return db.localeCompare(da)
            return String(b.created_at || '').localeCompare(String(a.created_at || ''))
        })
    }, [selectedEntries])

    const chartData = useMemo(() => {
        if (!selectedId) return []
        const list = selectedEntries
        const days = []
        for (let i = 6; i >= 0; i--) {
            const d = new Date()
            d.setHours(12, 0, 0, 0)
            d.setDate(d.getDate() - i)
            days.push({ iso: localCalendarISODate(d), labelDate: d })
        }
        return days.map(({ iso, labelDate }) => {
            const upTo = list.filter((e) => entryDateKey(e) <= iso)
            const bal = computeBalance(upTo)
            const label = labelDate.toLocaleDateString(
                language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
                { weekday: 'short', day: 'numeric' }
            )
            return { day: label, balance: bal }
        })
    }, [selectedId, selectedEntries, language])

    const supplyCleanedPreview = useMemo(
        () => cleanSupplyLines(entryForm.lines),
        [entryForm.lines]
    )
    const supplyPreviewSum = useMemo(
        () => supplyCleanedPreview.reduce((a, ln) => a + ln.line_total_uzs, 0),
        [supplyCleanedPreview]
    )

    async function savePartner(e) {
        e.preventDefault()
        if (!partnerForm.name.trim()) {
            await showAlert(t('finances.partnerNameRequired'), { variant: 'warning' })
            return
        }
        try {
            const nm = partnerForm.name.trim()
            const { error } = await supabase.from('finance_partners').insert([
                {
                    name_uz: nm,
                    name_ru: null,
                    name_en: null,
                    legal_id: partnerForm.legal_id.trim() || null,
                    phone: partnerForm.phone.trim() || null,
                    note: partnerForm.note.trim() || null,
                },
            ])
            if (error) throw error
            setPartnerModal(false)
            setPartnerForm({
                name: '',
                legal_id: '',
                phone: '',
                note: '',
            })
            await showAlert(t('finances.partnerCreated'), { variant: 'success' })
            await loadAll()
        } catch (err) {
            console.error(err)
            await showAlert(err.message || String(err), { variant: 'error' })
        }
    }

    async function saveEntry(e) {
        e.preventDefault()
        if (!selectedId) return
        const ref = genReferenceCode()
        try {
            if (entryModal.type === 'payment') {
                const amt = parseMoney(entryForm.amount_uzs)
                if (!Number.isFinite(amt) || amt <= 0) {
                    await showAlert(t('finances.partnersInvalidAmount'), { variant: 'warning' })
                    return
                }
                const { error } = await supabase.from('partner_finance_entries').insert([
                    {
                        partner_id: selectedId,
                        entry_type: 'payment',
                        amount_uzs: amt,
                        entry_date: entryForm.entry_date,
                        description: entryForm.description.trim() || null,
                        reference_code: ref,
                        warehouse_note: null,
                        responsible_name: null,
                    },
                ])
                if (error) throw error
            } else {
                const cleaned = cleanSupplyLines(entryForm.lines)
                if (!cleaned.length) {
                    await showAlert(t('finances.trxLinesInvalid'), { variant: 'warning' })
                    return
                }
                const sum = cleaned.reduce((a, ln) => a + ln.line_total_uzs, 0)
                if (!Number.isFinite(sum) || sum <= 0) {
                    await showAlert(t('finances.partnersInvalidAmount'), { variant: 'warning' })
                    return
                }
                const { data: inserted, error: insErr } = await supabase
                    .from('partner_finance_entries')
                    .insert([
                        {
                            partner_id: selectedId,
                            entry_type: 'supply',
                            amount_uzs: sum,
                            entry_date: entryForm.entry_date,
                            description: entryForm.description.trim() || null,
                            reference_code: ref,
                            warehouse_note: entryForm.warehouse_note.trim() || null,
                            responsible_name: entryForm.responsible_name.trim() || null,
                        },
                    ])
                    .select('id')
                    .single()
                if (insErr) throw insErr
                const entryId = inserted?.id
                if (entryId && cleaned.length) {
                    const rows = cleaned.map((ln, i) => ({
                        entry_id: entryId,
                        line_index: i,
                        item_name: ln.item_name,
                        quantity_display: ln.quantity_display,
                        unit_price_uzs: ln.unit_price_uzs,
                        line_total_uzs: ln.line_total_uzs,
                    }))
                    const { error: lineErr } = await supabase.from('partner_finance_entry_lines').insert(rows)
                    if (lineErr) {
                        await supabase.from('partner_finance_entries').delete().eq('id', entryId)
                        throw lineErr
                    }
                }
            }
            setEntryModal({ ...entryModal, open: false })
            setSupplyStep(1)
            setEntryForm({
                amount_uzs: '',
                entry_date: new Date().toISOString().split('T')[0],
                description: '',
                warehouse_note: '',
                responsible_name: '',
                lines: [{ ...EMPTY_SUPPLY_LINE }],
            })
            await showAlert(t('finances.entrySaved'), { variant: 'success' })
            await loadAll()
        } catch (err) {
            console.error(err)
            await showAlert(err.message || String(err), { variant: 'error' })
        }
    }

    function openEntry(type) {
        setEntryModal({ open: true, type })
        setSupplyStep(1)
        setEntryForm({
            amount_uzs: '',
            entry_date: new Date().toISOString().split('T')[0],
            description: '',
            warehouse_note: '',
            responsible_name: '',
            lines: [{ ...EMPTY_SUPPLY_LINE }],
        })
    }

    function closeEntryModal() {
        setEntryModal((m) => ({ ...m, open: false }))
        setSupplyStep(1)
    }

    async function handleSupplyExcelTemplate() {
        try {
            await downloadSupplyTemplateXlsx()
        } catch (err) {
            console.error(err)
            await showAlert(`${t('finances.supplyExcelError')}: ${err.message || err}`, { variant: 'error' })
        }
    }

    async function handleSupplyExcelFile(ev, mode) {
        const input = ev.target
        const file = input.files?.[0]
        input.value = ''
        if (!file) return
        try {
            const parsed = await parseSupplySpreadsheetFile(file)
            if (!parsed.length) {
                await showAlert(t('finances.supplyExcelNoRows'), { variant: 'warning' })
                return
            }
            setEntryForm((f) => {
                const base =
                    mode === 'append'
                        ? f.lines.filter((ln) => String(ln.item_name || '').trim())
                        : []
                return { ...f, lines: [...base, ...parsed] }
            })
            await showAlert(t('finances.supplyExcelImported').replace('{n}', String(parsed.length)), {
                variant: 'success',
            })
        } catch (err) {
            console.error(err)
            await showAlert(`${t('finances.supplyExcelError')}: ${err.message || err}`, { variant: 'error' })
        }
    }

    async function goSupplyNext() {
        if (supplyStep === 2) {
            if (!cleanSupplyLines(entryForm.lines).length) {
                await showAlert(t('finances.trxLinesInvalid'), { variant: 'warning' })
                return
            }
            setSupplyStep(3)
            return
        }
        if (supplyStep === 1) {
            setSupplyStep(2)
        }
    }

    function buildDetailRows(entry) {
        if (entry.entry_type === 'payment') return []
        const raw = linesByEntryId[entry.id] || []
        if (raw.length) {
            return [...raw].sort((a, b) => (a.line_index || 0) - (b.line_index || 0))
        }
        return [
            {
                id: 'synthetic',
                item_name: entry.description?.trim() || t('finances.trxSyntheticRow'),
                quantity_display: '—',
                unit_price_uzs: null,
                line_total_uzs: Number(entry.amount_uzs) || 0,
                _synthetic: true,
            },
        ]
    }

    function formatDetailDate(iso) {
        const d = new Date(String(iso || '') + 'T12:00:00')
        if (Number.isNaN(d.getTime())) return '—'
        return d.toLocaleDateString(
            language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
            { day: 'numeric', month: 'short', year: 'numeric' }
        )
    }

    function openDeletePartnerGate() {
        if (!MOLIYA_DELETE_PIN) {
            void showAlert(t('finances.deletePinNotConfigured'), { variant: 'warning' })
            return
        }
        if (!selectedPartner) return
        setDeletePinValue('')
        setDeletePinModal({
            kind: 'partner',
            partnerId: selectedPartner.id,
            subtitle: pickLocalizedName(selectedPartner, language),
        })
    }

    function openDeleteEntryGate(row, ev) {
        ev?.stopPropagation?.()
        ev?.preventDefault?.()
        if (!MOLIYA_DELETE_PIN) {
            void showAlert(t('finances.deletePinNotConfigured'), { variant: 'warning' })
            return
        }
        setDeletePinValue('')
        setDeletePinModal({
            kind: 'entry',
            entryId: row.id,
            subtitle: `${displayRefCode(row)} · ${row.entry_date} · ${formatUzs(row.amount_uzs)}`,
        })
    }

    function closeDeletePinModal() {
        setDeletePinModal(null)
        setDeletePinValue('')
    }

    async function confirmDeleteWithPassword(e) {
        e?.preventDefault?.()
        if (!deletePinModal) return
        if (deletePinValue !== MOLIYA_DELETE_PIN) {
            await showAlert(t('finances.deletePinWrong'), { variant: 'error' })
            return
        }
        try {
            if (deletePinModal.kind === 'partner') {
                const { error } = await supabase
                    .from('finance_partners')
                    .delete()
                    .eq('id', deletePinModal.partnerId)
                if (error) throw error
                setSelectedId(null)
                setDetailModal(null)
            } else {
                const entryId = deletePinModal.entryId
                const { error } = await supabase
                    .from('partner_finance_entries')
                    .delete()
                    .eq('id', entryId)
                if (error) throw error
                setDetailModal((dm) => (dm?.entry?.id === entryId ? null : dm))
            }
            closeDeletePinModal()
            await showAlert(t('finances.deleteSuccess'), { variant: 'success' })
            await loadAll()
        } catch (err) {
            console.error(err)
            await showAlert(`${t('finances.deleteError')}: ${err.message || err}`, { variant: 'error' })
        }
    }

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-6 pb-16">
                <Header title={t('finances.partnersManageTitle')} toggleSidebar={toggleSidebar} />
                <MoliyaTopNav />
                <MoliyaCardSkeleton />
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-6 pb-16">
            <Header title={t('finances.partnersManageTitle')} toggleSidebar={toggleSidebar} />
            <MoliyaTopNav />

            {schemaMissing ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 text-sm mb-6">
                    <p className="font-semibold mb-2">Jadval topilmadi</p>
                    <p className="leading-relaxed">
                        Supabase SQL Editor da loyiha ildizidagi{' '}
                        <code className="bg-white/80 px-1 rounded">add_finance_partners.sql</code> faylini
                        ishga tushiring.
                    </p>
                </div>
            ) : null}

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div>
                    <p className="text-gray-500 text-sm">{t('finances.partnersManageSubtitle')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('finances.partnerSelectHint')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => showAlert(t('finances.partnersReportSoon'), { variant: 'info' })}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <Download size={18} />
                        {t('finances.partnerReport')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setPartnerModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                    >
                        <Plus size={18} />
                        {t('finances.partnerAdd')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        {t('finances.totalOurDebt')}
                    </p>
                    <p className="text-2xl font-bold text-red-600 mt-1 tabular-nums">
                        {formatOurDebtUzs(totals.ourDebt) ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">{t('finances.partnerBalanceOurDebt')}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        {t('finances.totalTheyOweUs')}
                    </p>
                    <p
                        className={`text-2xl font-bold mt-1 tabular-nums ${
                            totals.theyOwe > 0.01
                                ? 'text-emerald-600'
                                : totals.ourDebt > 0.01
                                  ? 'text-red-600'
                                  : 'text-gray-400'
                        }`}
                    >
                        {totals.theyOwe > 0.01
                            ? formatUzs(totals.theyOwe)
                            : formatOurDebtPlusUzs(totals.ourDebt) ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">{t('finances.partnerBalanceTheyOwe')}</p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 min-h-[480px]">
                <aside className="w-full lg:w-80 shrink-0 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden flex flex-col max-h-[70vh] lg:max-h-none">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                        <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <Users size={18} className="text-slate-600" />
                            {t('finances.partnersListTitle')}
                        </span>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2">
                        {partners.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-10 px-3">{t('finances.noPartnersYet')}</p>
                        ) : (
                            <ul className="space-y-1">
                                {partners.map((p) => {
                                    const bal = balanceByPartner[p.id] || 0
                                    const st = statusForBalance(bal, t)
                                    const active = selectedId === p.id
                                    return (
                                        <li key={p.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(p.id)}
                                                className={`w-full text-left rounded-xl px-3 py-3 transition-colors border ${
                                                    active
                                                        ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                                        : 'bg-white border-gray-100 hover:bg-gray-50 text-gray-900'
                                                }`}
                                            >
                                                <div className="font-semibold text-sm leading-snug pr-6">
                                                    {pickLocalizedName(p, language)}
                                                </div>
                                                {p.legal_id ? (
                                                    <div
                                                        className={`text-xs mt-0.5 ${active ? 'text-slate-300' : 'text-gray-500'}`}
                                                    >
                                                        ID: {p.legal_id}
                                                    </div>
                                                ) : null}
                                                <div className="flex items-center justify-between mt-2 gap-2">
                                                    <span
                                                        className={`text-xs font-mono tabular-nums font-semibold ${
                                                            active
                                                                ? bal > 0.01
                                                                    ? 'text-red-200'
                                                                    : bal < -0.01
                                                                      ? 'text-emerald-200'
                                                                      : 'text-slate-300'
                                                                : bal > 0.01
                                                                  ? 'text-red-600'
                                                                  : bal < -0.01
                                                                    ? 'text-emerald-600'
                                                                    : 'text-gray-500'
                                                        }`}
                                                    >
                                                        {bal > 0.01
                                                            ? formatOurDebtUzs(bal)
                                                            : bal < -0.01
                                                              ? formatUzs(-bal)
                                                              : '—'}
                                                    </span>
                                                    <span
                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                                            active ? statusBadgeActiveClass(bal) : st.className
                                                        }`}
                                                    >
                                                        {st.label}
                                                    </span>
                                                </div>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </aside>

                <main className="flex-1 rounded-2xl border border-gray-100 bg-white shadow-sm p-5 sm:p-6 min-h-[480px]">
                    {!selectedPartner ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16 px-4">
                            <Users size={48} className="opacity-20 mb-4" />
                            <p className="text-sm font-medium text-gray-500 max-w-sm">
                                {t('finances.partnerDetailEmpty')}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 border-b border-gray-100 pb-5">
                                <div className="flex items-start gap-3">
                                    <button
                                        type="button"
                                        className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600"
                                        onClick={() => setSelectedId(null)}
                                        aria-label="Back"
                                    >
                                        <ArrowLeft size={22} />
                                    </button>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">
                                            {pickLocalizedName(selectedPartner, language)}
                                        </h2>
                                        {selectedPartner.phone ? (
                                            <p className="text-sm text-gray-500 mt-1">{selectedPartner.phone}</p>
                                        ) : null}
                                        {selectedPartner.note ? (
                                            <p className="text-xs text-gray-400 mt-2 max-w-xl">{selectedPartner.note}</p>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openEntry('supply')}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                                    >
                                        <PackagePlus size={18} />
                                        {t('finances.partnerAddSupply')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEntry('payment')}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                                    >
                                        <Banknote size={18} />
                                        {t('finances.partnerAddPayment')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openDeletePartnerGate}
                                        disabled={!MOLIYA_DELETE_PIN}
                                        title={
                                            MOLIYA_DELETE_PIN
                                                ? t('finances.deletePartner')
                                                : t('finances.deletePinNotConfigured')
                                        }
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Trash2 size={18} />
                                        {t('finances.deletePartner')}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                <div className="rounded-xl bg-gray-50 p-4">
                                    <p className="text-xs font-bold text-gray-500 uppercase">
                                        {t('finances.partnerBalanceOurDebt')}
                                    </p>
                                    <p className="text-lg font-bold text-red-600 tabular-nums mt-1">
                                        {formatOurDebtUzs(selectedBalance) ?? '—'}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-gray-50 p-4">
                                    <p className="text-xs font-bold text-gray-500 uppercase">
                                        {t('finances.partnerBalanceTheyOwe')}
                                    </p>
                                    <p
                                        className={`text-lg font-bold tabular-nums mt-1 ${
                                            selectedBalance < -0.01
                                                ? 'text-emerald-600'
                                                : selectedBalance > 0.01
                                                  ? 'text-red-600'
                                                  : 'text-gray-400'
                                        }`}
                                    >
                                        {selectedBalance < -0.01
                                            ? formatUzs(-selectedBalance)
                                            : formatOurDebtPlusUzs(selectedBalance) ?? '—'}
                                    </p>
                                </div>
                            </div>

                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-bold text-gray-500 uppercase">
                                    {t('finances.partnerLastOp')}
                                </p>
                                <span
                                    className={`text-xs font-bold px-2 py-1 rounded-lg ${statusForBalance(selectedBalance, t).className}`}
                                >
                                    {statusForBalance(selectedBalance, t).label}
                                </span>
                            </div>
                            <p className="text-sm text-gray-800 mb-6">
                                {lastOpSummary(lastEntry(selectedEntries), t, language)}
                            </p>

                            <div className="h-48 w-full mb-8">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-2">
                                    {t('finances.chartLast7Days')}
                                </p>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                                        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                                        <Tooltip formatter={(v) => formatUzs(v)} />
                                        <Line
                                            type="monotone"
                                            dataKey="balance"
                                            stroke="#0f172a"
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <h3 className="text-sm font-bold text-gray-800 mb-1">{t('finances.partnerHistoryTitle')}</h3>
                            <p className="text-xs text-gray-400 mb-3">{t('finances.trxClickRowHint')}</p>
                            <div className="overflow-x-auto rounded-xl border border-gray-100">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-bold border-b border-gray-100">
                                            <th className="px-4 py-3">{t('finances.reportsDateCol')}</th>
                                            <th className="px-4 py-3">{t('finances.reportsColType')}</th>
                                            <th className="px-4 py-3 text-right">{t('finances.amountUzs')}</th>
                                            <th className="px-4 py-3">{t('finances.costNote')}</th>
                                            <th className="px-2 py-3 w-12 text-center" aria-label={t('common.delete')}>
                                                <span className="sr-only">{t('common.delete')}</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {sortedSelectedEntries.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                                                    {t('finances.noEntriesYet')}
                                                </td>
                                            </tr>
                                        ) : (
                                            sortedSelectedEntries.map((row) => (
                                                <tr
                                                    key={row.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => setDetailModal({ entry: row, partner: selectedPartner })}
                                                    onKeyDown={(ev) => {
                                                        if (ev.key === 'Enter' || ev.key === ' ')
                                                            setDetailModal({ entry: row, partner: selectedPartner })
                                                    }}
                                                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-4 py-3 tabular-nums text-gray-700">
                                                        {row.entry_date}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span
                                                            className={
                                                                row.entry_type === 'supply'
                                                                    ? 'text-emerald-700 font-medium'
                                                                    : 'text-blue-700 font-medium'
                                                            }
                                                        >
                                                            {row.entry_type === 'supply'
                                                                ? t('finances.entryTypeSupply')
                                                                : t('finances.entryTypePayment')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                                                        {formatUzs(row.amount_uzs)}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">
                                                        {row.description || '—'}
                                                    </td>
                                                    <td className="px-1 py-2 text-center align-middle">
                                                        <button
                                                            type="button"
                                                            disabled={!MOLIYA_DELETE_PIN}
                                                            title={
                                                                MOLIYA_DELETE_PIN
                                                                    ? t('finances.deleteEntry')
                                                                    : t('finances.deletePinNotConfigured')
                                                            }
                                                            onClick={(ev) => openDeleteEntryGate(row, ev)}
                                                            className="inline-flex p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                                            aria-label={t('finances.deleteEntry')}
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </main>
            </div>

            {partnerModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">{t('finances.partnerAdd')}</h3>
                        <form onSubmit={savePartner} className="space-y-3">
                            <input
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder={t('finances.partnerDisplayName')}
                                value={partnerForm.name}
                                onChange={(e) => setPartnerForm((f) => ({ ...f, name: e.target.value }))}
                            />
                            <input
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder={t('finances.partnerLegalId')}
                                value={partnerForm.legal_id}
                                onChange={(e) => setPartnerForm((f) => ({ ...f, legal_id: e.target.value }))}
                            />
                            <input
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder={t('finances.partnerPhone')}
                                value={partnerForm.phone}
                                onChange={(e) => setPartnerForm((f) => ({ ...f, phone: e.target.value }))}
                            />
                            <textarea
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                rows={2}
                                placeholder={t('finances.partnerNote')}
                                value={partnerForm.note}
                                onChange={(e) => setPartnerForm((f) => ({ ...f, note: e.target.value }))}
                            />
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-lg border text-sm font-semibold"
                                    onClick={() => setPartnerModal(false)}
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
                                >
                                    {t('common.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {entryModal.open ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
                    <input
                        ref={supplyExcelInputRef}
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        onChange={(ev) => handleSupplyExcelFile(ev, supplyExcelModeRef.current)}
                    />
                    <div
                        className={`bg-white rounded-2xl shadow-xl w-full p-6 my-8 ${
                            entryModal.type === 'supply' ? 'max-w-5xl max-h-[92vh] overflow-y-auto' : 'max-w-md'
                        }`}
                    >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {entryModal.type === 'supply'
                                        ? t('finances.partnerAddSupply')
                                        : t('finances.partnerAddPayment')}
                                </h3>
                                {entryModal.type === 'supply' ? (
                                    <p className="text-xs font-semibold text-slate-600 mt-0.5">
                                        {t('finances.supplyWizardTitle')}
                                    </p>
                                ) : null}
                                <p className="text-xs text-gray-500 mt-1">
                                    {pickLocalizedName(selectedPartner, language)}
                                </p>
                            </div>
                            {entryModal.type === 'supply' ? (
                                <div className="flex flex-wrap gap-1.5 text-[11px] font-bold shrink-0">
                                    {[
                                        { s: 1, label: t('finances.supplyStep1Title') },
                                        { s: 2, label: t('finances.supplyStep2Title') },
                                        { s: 3, label: t('finances.supplyStep3Title') },
                                    ].map(({ s, label }) => (
                                        <span
                                            key={s}
                                            className={`px-2.5 py-1 rounded-lg border ${
                                                supplyStep === s
                                                    ? 'bg-slate-900 text-white border-slate-900'
                                                    : 'bg-white text-gray-500 border-gray-200'
                                            }`}
                                        >
                                            {label}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <form
                            className="space-y-3"
                            onSubmit={(e) => {
                                e.preventDefault()
                                if (entryModal.type === 'payment') saveEntry(e)
                                else if (supplyStep === 3) saveEntry(e)
                            }}
                        >
                            {entryModal.type === 'payment' ? (
                                <>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        placeholder={t('finances.amountUzs')}
                                        value={entryForm.amount_uzs}
                                        onChange={(e) => setEntryForm((f) => ({ ...f, amount_uzs: e.target.value }))}
                                    />
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        value={entryForm.entry_date}
                                        onChange={(e) => setEntryForm((f) => ({ ...f, entry_date: e.target.value }))}
                                    />
                                    <textarea
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        rows={2}
                                        placeholder={t('finances.costNote')}
                                        value={entryForm.description}
                                        onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                                    />
                                </>
                            ) : supplyStep === 1 ? (
                                <>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        {t('finances.supplyStep1Hint')}
                                    </p>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        value={entryForm.entry_date}
                                        onChange={(e) => setEntryForm((f) => ({ ...f, entry_date: e.target.value }))}
                                    />
                                    <input
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        placeholder={t('finances.trxWarehousePh')}
                                        value={entryForm.warehouse_note}
                                        onChange={(e) => setEntryForm((f) => ({ ...f, warehouse_note: e.target.value }))}
                                    />
                                    <input
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        placeholder={t('finances.trxResponsiblePh')}
                                        value={entryForm.responsible_name}
                                        onChange={(e) =>
                                            setEntryForm((f) => ({ ...f, responsible_name: e.target.value }))
                                        }
                                    />
                                    <textarea
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        rows={2}
                                        placeholder={t('finances.costNote')}
                                        value={entryForm.description}
                                        onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                                    />
                                </>
                            ) : supplyStep === 2 ? (
                                <>
                                    <p className="text-xs text-gray-600">{t('finances.trxSupplyLinesHint')}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSupplyExcelTemplate}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                                        >
                                            <Download size={16} />
                                            {t('finances.supplyExcelTemplate')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                supplyExcelModeRef.current = 'replace'
                                                supplyExcelInputRef.current?.click()
                                            }}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                                        >
                                            <Upload size={16} />
                                            {t('finances.supplyExcelImportReplace')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                supplyExcelModeRef.current = 'append'
                                                supplyExcelInputRef.current?.click()
                                            }}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                                        >
                                            <Upload size={16} />
                                            {t('finances.supplyExcelImportAppend')}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-gray-400">{t('finances.supplyExcelHint')}</p>
                                    <div className="flex flex-wrap gap-2 items-center text-xs text-gray-600">
                                        <span>
                                            {t('finances.supplyLineCount')}:{' '}
                                            <strong className="tabular-nums">{(entryForm.lines || []).length}</strong>
                                        </span>
                                        <button
                                            type="button"
                                            className="font-semibold text-slate-700 hover:underline"
                                            onClick={() =>
                                                setEntryForm((f) => ({
                                                    ...f,
                                                    lines: [
                                                        ...f.lines,
                                                        ...Array.from({ length: 10 }, () => ({ ...EMPTY_SUPPLY_LINE })),
                                                    ],
                                                }))
                                            }
                                        >
                                            {t('finances.supplyBulkEmptyRows')}
                                        </button>
                                        <button
                                            type="button"
                                            className="font-semibold text-slate-700 hover:underline"
                                            onClick={() =>
                                                setEntryForm((f) => ({
                                                    ...f,
                                                    lines: [...f.lines, { ...EMPTY_SUPPLY_LINE }],
                                                }))
                                            }
                                        >
                                            + {t('finances.trxAddLine')}
                                        </button>
                                    </div>
                                    <div className="max-h-[min(420px,52vh)] overflow-auto rounded-xl border border-gray-200">
                                        <table className="w-full text-sm min-w-[640px]">
                                            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-[11px] uppercase text-gray-500 font-bold">
                                                <tr>
                                                    <th className="px-2 py-2 text-left w-10">{t('finances.trxColNum')}</th>
                                                    <th className="px-2 py-2 text-left min-w-[140px]">
                                                        {t('finances.trxColName')}
                                                    </th>
                                                    <th className="px-2 py-2 text-left min-w-[100px]">
                                                        {t('finances.trxColQty')}
                                                    </th>
                                                    <th className="px-2 py-2 text-right min-w-[100px]">
                                                        {t('finances.trxColUnitPrice')}
                                                    </th>
                                                    <th className="px-2 py-2 text-right min-w-[100px]">
                                                        {t('finances.trxColTotal')}
                                                    </th>
                                                    <th className="px-2 py-2 w-16" />
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {(entryForm.lines || []).map((ln, idx) => (
                                                    <tr key={idx} className="bg-white hover:bg-gray-50/50">
                                                        <td className="px-2 py-1.5 text-gray-400 tabular-nums align-top">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="px-2 py-1.5 align-top">
                                                            <input
                                                                className="w-full min-w-0 px-2 py-1 rounded border border-gray-200 text-sm"
                                                                placeholder={t('finances.trxColName')}
                                                                value={ln.item_name}
                                                                onChange={(e) =>
                                                                    setEntryForm((f) => ({
                                                                        ...f,
                                                                        lines: f.lines.map((x, j) =>
                                                                            j === idx
                                                                                ? { ...x, item_name: e.target.value }
                                                                                : x
                                                                        ),
                                                                    }))
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-2 py-1.5 align-top">
                                                            <input
                                                                className="w-full min-w-0 px-2 py-1 rounded border border-gray-200 text-sm"
                                                                placeholder={t('finances.trxColQty')}
                                                                value={ln.quantity_display}
                                                                onChange={(e) =>
                                                                    setEntryForm((f) => ({
                                                                        ...f,
                                                                        lines: f.lines.map((x, j) =>
                                                                            j === idx
                                                                                ? {
                                                                                      ...x,
                                                                                      quantity_display: e.target.value,
                                                                                  }
                                                                                : x
                                                                        ),
                                                                    }))
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-2 py-1.5 align-top">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                className="w-full min-w-0 px-2 py-1 rounded border border-gray-200 text-sm text-right tabular-nums"
                                                                placeholder={t('finances.trxColUnitPrice')}
                                                                value={ln.unit_price_uzs}
                                                                onChange={(e) =>
                                                                    setEntryForm((f) => ({
                                                                        ...f,
                                                                        lines: f.lines.map((x, j) =>
                                                                            j === idx
                                                                                ? {
                                                                                      ...x,
                                                                                      unit_price_uzs: e.target.value,
                                                                                  }
                                                                                : x
                                                                        ),
                                                                    }))
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-2 py-1.5 align-top">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                className="w-full min-w-0 px-2 py-1 rounded border border-gray-200 text-sm text-right tabular-nums font-medium"
                                                                placeholder={t('finances.trxColTotal')}
                                                                value={ln.line_total_uzs}
                                                                onChange={(e) =>
                                                                    setEntryForm((f) => ({
                                                                        ...f,
                                                                        lines: f.lines.map((x, j) =>
                                                                            j === idx
                                                                                ? {
                                                                                      ...x,
                                                                                      line_total_uzs: e.target.value,
                                                                                  }
                                                                                : x
                                                                        ),
                                                                    }))
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-1 py-1.5 align-top">
                                                            {(entryForm.lines || []).length > 1 ? (
                                                                <button
                                                                    type="button"
                                                                    className="text-[11px] text-red-600 font-semibold px-1"
                                                                    onClick={() =>
                                                                        setEntryForm((f) => ({
                                                                            ...f,
                                                                            lines: f.lines.filter((_, j) => j !== idx),
                                                                        }))
                                                                    }
                                                                >
                                                                    ×
                                                                </button>
                                                            ) : null}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-sm space-y-2">
                                        <div className="flex flex-wrap justify-between gap-2">
                                            <span className="text-gray-500">{t('finances.reportsDateCol')}</span>
                                            <span className="font-medium tabular-nums">{entryForm.entry_date}</span>
                                        </div>
                                        <div className="flex flex-wrap justify-between gap-2">
                                            <span className="text-gray-500">{t('finances.trxWarehouse')}</span>
                                            <span className="font-medium text-right">
                                                {entryForm.warehouse_note.trim() || '—'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap justify-between gap-2">
                                            <span className="text-gray-500">{t('finances.trxResponsible')}</span>
                                            <span className="font-medium text-right">
                                                {entryForm.responsible_name.trim() || '—'}
                                            </span>
                                        </div>
                                        {entryForm.description.trim() ? (
                                            <div className="pt-2 border-t border-gray-200">
                                                <span className="text-gray-500 text-xs block mb-1">
                                                    {t('finances.costNote')}
                                                </span>
                                                <span className="text-gray-800">{entryForm.description.trim()}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500 font-bold border-b border-gray-100">
                                                <tr>
                                                    <th className="px-3 py-2 w-10">{t('finances.trxColNum')}</th>
                                                    <th className="px-3 py-2">{t('finances.trxColName')}</th>
                                                    <th className="px-3 py-2">{t('finances.trxColQty')}</th>
                                                    <th className="px-3 py-2 text-right">{t('finances.trxColUnitPrice')}</th>
                                                    <th className="px-3 py-2 text-right">{t('finances.trxColTotal')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {supplyCleanedPreview.map((ln, i) => (
                                                    <tr key={i}>
                                                        <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                                                        <td className="px-3 py-2 font-medium text-gray-900">{ln.item_name}</td>
                                                        <td className="px-3 py-2 text-gray-700">{ln.quantity_display}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums">
                                                            {formatUzs(ln.unit_price_uzs)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                                            {formatUzs(ln.line_total_uzs)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="flex justify-between items-baseline pt-1 border-t border-gray-100">
                                        <span className="text-sm font-bold text-gray-700">
                                            {t('finances.supplyPreviewTotal')}
                                        </span>
                                        <span className="text-lg font-bold text-blue-700 tabular-nums">
                                            {formatUzs(supplyPreviewSum)}
                                        </span>
                                    </div>
                                </>
                            )}

                            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-lg border text-sm font-semibold"
                                    onClick={closeEntryModal}
                                >
                                    {t('common.cancel')}
                                </button>
                                {entryModal.type === 'payment' ? (
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
                                    >
                                        {t('common.save')}
                                    </button>
                                ) : supplyStep === 1 ? (
                                    <button
                                        type="button"
                                        onClick={() => goSupplyNext()}
                                        className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
                                    >
                                        {t('finances.supplyWizardNext')}
                                    </button>
                                ) : supplyStep === 2 ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setSupplyStep(1)}
                                            className="px-4 py-2 rounded-lg border text-sm font-semibold"
                                        >
                                            {t('finances.supplyWizardBack')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => goSupplyNext()}
                                            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
                                        >
                                            {t('finances.supplyWizardReview')}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setSupplyStep(2)}
                                            className="px-4 py-2 rounded-lg border text-sm font-semibold"
                                        >
                                            {t('finances.supplyWizardBack')}
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
                                        >
                                            {t('common.save')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {detailModal ? (
                <>
                    <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #trx-detail-modal, #trx-detail-modal * { visibility: visible !important; }
              #trx-detail-modal {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-height: none !important;
                overflow: visible !important;
                background: white !important;
                box-shadow: none !important;
              }
            }
          `}</style>
                    <div
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
                        onClick={() => setDetailModal(null)}
                        onKeyDown={(ev) => ev.key === 'Escape' && setDetailModal(null)}
                        role="presentation"
                    >
                        <div
                            id="trx-detail-modal"
                            role="dialog"
                            aria-modal="true"
                            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">{t('finances.trxDetailsTitle')}</h3>
                                    <p className="text-sm font-mono text-slate-600 mt-1">
                                        #{displayRefCode(detailModal.entry)}
                                    </p>
                                    <p className="text-sm font-semibold text-gray-800 mt-2">
                                        {pickLocalizedName(detailModal.partner, language)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {formatDetailDate(detailModal.entry.entry_date)}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2 shrink-0">
                                    <button
                                        type="button"
                                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                                        aria-label={t('common.cancel')}
                                        onClick={() => setDetailModal(null)}
                                    >
                                        <X size={22} />
                                    </button>
                                    <span
                                        className={
                                            detailModal.entry.entry_type === 'supply'
                                                ? 'text-xs font-bold px-3 py-1 rounded-full bg-blue-600 text-white'
                                                : 'text-xs font-bold px-3 py-1 rounded-full bg-slate-700 text-white'
                                        }
                                    >
                                        {detailModal.entry.entry_type === 'supply'
                                            ? t('finances.trxBadgeSupply')
                                            : t('finances.trxBadgePayment')}
                                    </span>
                                </div>
                            </div>

                            <div className="p-5">
                                {detailModal.entry.entry_type === 'supply' ? (
                                    <>
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-bold text-gray-800">{t('finances.trxRawList')}</h4>
                                        </div>
                                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                                            <table className="w-full text-left text-sm">
                                                <thead>
                                                    <tr className="bg-gray-50 text-[11px] uppercase text-gray-500 font-bold">
                                                        <th className="px-3 py-2 w-10">{t('finances.trxColNum')}</th>
                                                        <th className="px-3 py-2">{t('finances.trxColName')}</th>
                                                        <th className="px-3 py-2">{t('finances.trxColQty')}</th>
                                                        <th className="px-3 py-2 text-right whitespace-nowrap">
                                                            {t('finances.trxColUnitPrice')}
                                                        </th>
                                                        <th className="px-3 py-2 text-right">{t('finances.trxColTotal')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {buildDetailRows(detailModal.entry).map((line, i) => (
                                                        <tr key={line.id || i}>
                                                            <td className="px-3 py-2.5 text-gray-500">{i + 1}</td>
                                                            <td className="px-3 py-2.5 font-medium text-gray-900">
                                                                {line.item_name}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-gray-700">
                                                                {line.quantity_display}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                                                                {line._synthetic || line.unit_price_uzs == null
                                                                    ? '—'
                                                                    : formatUzs(line.unit_price_uzs)}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                                                                {formatUzs(line.line_total_uzs)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                ) : (
                                    <div className="rounded-xl border border-gray-200 bg-slate-50 p-4 mb-4">
                                        <p className="text-xs font-bold text-gray-500 uppercase">
                                            {t('finances.trxPaymentSummary')}
                                        </p>
                                        <p className="text-2xl font-bold text-blue-800 tabular-nums mt-2">
                                            {formatUzs(detailModal.entry.amount_uzs)}
                                        </p>
                                        {detailModal.entry.description ? (
                                            <p className="text-sm text-gray-600 mt-3">{detailModal.entry.description}</p>
                                        ) : null}
                                    </div>
                                )}

                                <div className="mt-6 space-y-2 text-sm border-t border-gray-100 pt-4">
                                    <div className="flex flex-wrap gap-2 justify-between">
                                        <span className="text-gray-500">{t('finances.trxWarehouse')}</span>
                                        <span className="font-medium text-gray-900 text-right">
                                            {detailModal.entry.warehouse_note?.trim() || '—'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-between items-center">
                                        <span className="text-gray-500">{t('finances.trxResponsible')}</span>
                                        <span className="font-medium text-gray-900 text-right flex items-center gap-2">
                                            <span className="inline-flex h-8 w-8 rounded-full bg-slate-200 text-slate-600 text-xs font-bold items-center justify-center">
                                                {(detailModal.entry.responsible_name || '?')
                                                    .trim()
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </span>
                                            {detailModal.entry.responsible_name?.trim() || '—'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-between items-baseline pt-2">
                                        <span className="text-gray-600 font-bold">{t('finances.trxGrandTotal')}</span>
                                        <span className="text-xl font-bold text-blue-700 tabular-nums">
                                            {formatUzs(detailModal.entry.amount_uzs)}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-wrap gap-2 print:hidden">
                                    <button
                                        type="button"
                                        disabled={!MOLIYA_DELETE_PIN}
                                        title={
                                            MOLIYA_DELETE_PIN
                                                ? t('finances.deleteEntry')
                                                : t('finances.deletePinNotConfigured')
                                        }
                                        onClick={() => openDeleteEntryGate(detailModal.entry)}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Trash2 size={18} />
                                        {t('finances.deleteEntry')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => window.print()}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                                    >
                                        <Printer size={18} />
                                        {t('finances.trxPrint')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => showAlert(t('finances.trxPdfSoon'), { variant: 'info' })}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                                    >
                                        <Download size={18} />
                                        {t('finances.trxPdf')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : null}

            {deletePinModal ? (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
                    role="presentation"
                    onClick={closeDeletePinModal}
                    onKeyDown={(ev) => ev.key === 'Escape' && closeDeletePinModal()}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-pin-title"
                        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 id="delete-pin-title" className="text-lg font-bold text-gray-900">
                            {t('finances.deletePinTitle')}
                        </h3>
                        <p className="text-sm font-semibold text-gray-800 mt-2">
                            {deletePinModal.kind === 'partner'
                                ? t('finances.deletePartner')
                                : t('finances.deleteEntry')}
                        </p>
                        <p className="text-sm text-gray-600 mt-1 break-words">{deletePinModal.subtitle}</p>
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                            {deletePinModal.kind === 'partner'
                                ? t('finances.deletePartnerConfirmText')
                                : t('finances.deleteEntryConfirmText')}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{t('finances.deletePinHint')}</p>
                        <form onSubmit={confirmDeleteWithPassword} className="mt-4 space-y-4">
                            <input
                                type="password"
                                autoComplete="off"
                                autoFocus
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder={t('finances.deletePinLabel')}
                                value={deletePinValue}
                                onChange={(e) => setDeletePinValue(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-lg border text-sm font-semibold"
                                    onClick={closeDeletePinModal}
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                                >
                                    {t('common.delete')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
