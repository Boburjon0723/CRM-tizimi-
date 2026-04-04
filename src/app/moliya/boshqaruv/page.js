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
    ArrowDownToLine,
    ArrowLeft,
    Download,
    Plus,
    Users,
    PackagePlus,
    PackageMinus,
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
import {
    formatFinAmount,
    formatOurDebtFin,
    formatTheyOweUsFin,
    normalizeFinCurrency,
} from '@/utils/financeCurrency'
import {
    downloadPartnerFinanceReportXlsx,
    filterPartnerFinanceEntries,
    openPartnerReportPrintWindow,
} from '@/utils/partnerFinanceReportExport'

const MOLIYA_DELETE_PIN = String(process.env.NEXT_PUBLIC_MOLIYA_DELETE_PIN ?? '').trim()

function parseMoney(s) {
    const n = Number(String(s ?? '').replace(/\s/g, '').replace(/,/g, '.'))
    return Number.isFinite(n) ? n : NaN
}

/** Miqdor va birlik narxidan qator jamisini hisoblab, input uchun qator qaytaradi */
function lineTotalFromQtyAndUnitPrice(quantityDisplay, unitPriceStr) {
    const q = parseMoney(quantityDisplay)
    const p = parseMoney(unitPriceStr)
    if (!Number.isFinite(q) || !Number.isFinite(p) || q < 0 || p < 0) return ''
    const total = Math.round(q * p * 100) / 100
    return String(total)
}

const EMPTY_SUPPLY_LINE = {
    item_name: '',
    quantity_display: '',
    unit_price_uzs: '',
    line_total_uzs: '',
}

function entryUsesLineItems(entryType) {
    return entryType === 'supply' || entryType === 'sale_out'
}

function entryIsSingleAmount(entryType) {
    return entryType === 'payment' || entryType === 'payment_in'
}

function entryTypeLabel(entryType, t) {
    if (entryType === 'supply') return t('finances.entryTypeSupply')
    if (entryType === 'sale_out') return t('finances.entryTypeSaleOut')
    if (entryType === 'payment_in') return t('finances.entryTypePaymentIn')
    return t('finances.entryTypePayment')
}

function cleanPartnerFinanceLines(lines) {
    return (lines || [])
        .map((ln) => {
            const item_name = String(ln.item_name || '').trim()
            const quantity_display = String(ln.quantity_display || '').trim()
            const unit_price_uzs = parseMoney(ln.unit_price_uzs)
            const line_total_uzs = parseMoney(ln.line_total_uzs)
            return {
                item_name,
                quantity_display,
                unit_price_uzs,
                line_total_uzs,
                raw_material_id: null,
                quantity_numeric: null,
                product_id: null,
                product_quantity: null,
            }
        })
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

/** Eski yozuvlarda ombor bog‘langan bo‘lsa, o‘chirishda zaxirani qaytarish */
async function restoreSaleOutStockFromLines(supabase, dbLines) {
    for (const ln of dbLines || []) {
        const rid = ln.raw_material_id
        const rqty = Number(ln.quantity_numeric)
        if (rid && rqty > 0) {
            const { data: row, error } = await supabase
                .from('raw_materials')
                .select('track_stock, stock_quantity')
                .eq('id', rid)
                .maybeSingle()
            if (error || !row?.track_stock) continue
            const cur = Number(row.stock_quantity ?? 0)
            const next = Math.round((cur + rqty) * 1000) / 1000
            await supabase.from('raw_materials').update({ stock_quantity: next }).eq('id', rid)
        }
        const pid = ln.product_id
        const pq = Math.floor(Number(ln.product_quantity))
        if (pid && pq > 0) {
            const { data: row, error } = await supabase
                .from('products')
                .select('stock')
                .eq('id', pid)
                .maybeSingle()
            if (error) continue
            const cur = Math.floor(Number(row?.stock ?? 0))
            await supabase.from('products').update({ stock: cur + pq }).eq('id', pid)
        }
    }
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

function computeBalance(entries, currency) {
    const cur = normalizeFinCurrency(currency)
    let b = 0
    for (const e of entries || []) {
        if (normalizeFinCurrency(e.currency) !== cur) continue
        const amt = Number(e.amount_uzs) || 0
        if (e.entry_type === 'supply' || e.entry_type === 'payment_in') b += amt
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

function statusForDualBalance(balUzs, balUsd, t) {
    const owes = balUzs > 0.01 || balUsd > 0.01
    const owed = balUzs < -0.01 || balUsd < -0.01
    if (!owes && !owed)
        return { label: t('finances.partnerStatusClosed'), className: 'bg-slate-100 text-slate-700' }
    if (owes) return { label: t('finances.partnerStatusWeOwe'), className: 'bg-red-100 text-red-800' }
    return { label: t('finances.partnerStatusTheyOwe'), className: 'bg-red-100 text-red-800' }
}

function statusBadgeActiveClassDual(balUzs, balUsd) {
    if (Math.abs(balUzs) < 0.01 && Math.abs(balUsd) < 0.01) return 'bg-white/15 text-white'
    if (balUzs > 0.01 || balUsd > 0.01) return 'bg-red-500/25 text-red-100'
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
    const typeLabel = entryTypeLabel(entry.entry_type, t)
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
        currency: 'UZS',
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        warehouse_note: '',
        responsible_name: '',
        lines: [{ ...EMPTY_SUPPLY_LINE }],
    })
    const [chartCurrency, setChartCurrency] = useState('UZS')
    const [financeLines, setFinanceLines] = useState([])
    const [detailModal, setDetailModal] = useState(null)
    const [supplyStep, setSupplyStep] = useState(1)
    const supplyExcelInputRef = useRef(null)
    const supplyExcelModeRef = useRef('replace')
    const [deletePinModal, setDeletePinModal] = useState(null)
    const [deletePinValue, setDeletePinValue] = useState('')

    const [reportModalOpen, setReportModalOpen] = useState(false)
    const [reportFilter, setReportFilter] = useState({
        dateFrom: '',
        dateTo: '',
        partnerId: '',
        entryType: 'all',
        currency: 'all',
    })

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
            setEntries(
                (e || []).map((row) => ({
                    ...row,
                    currency: normalizeFinCurrency(row.currency),
                }))
            )
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
            const list = entriesByPartner[p.id] || []
            m[p.id] = {
                UZS: computeBalance(list, 'UZS'),
                USD: computeBalance(list, 'USD'),
            }
        }
        return m
    }, [partners, entriesByPartner])

    const totals = useMemo(() => {
        let ourDebtUzs = 0
        let ourDebtUsd = 0
        let theyOweUzs = 0
        let theyOweUsd = 0
        for (const p of partners) {
            const b = balanceByPartner[p.id]
            if (!b) continue
            if (b.UZS > 0.01) ourDebtUzs += b.UZS
            else if (b.UZS < -0.01) theyOweUzs += -b.UZS
            if (b.USD > 0.01) ourDebtUsd += b.USD
            else if (b.USD < -0.01) theyOweUsd += -b.USD
        }
        return {
            ourDebtUzs: Math.round(ourDebtUzs * 100) / 100,
            ourDebtUsd: Math.round(ourDebtUsd * 100) / 100,
            theyOweUzs: Math.round(theyOweUzs * 100) / 100,
            theyOweUsd: Math.round(theyOweUsd * 100) / 100,
        }
    }, [partners, balanceByPartner])

    const selectedPartner = partners.find((x) => x.id === selectedId) || null
    const selectedEntries = selectedId ? entriesByPartner[selectedId] || [] : []
    const selectedBalances = selectedId
        ? balanceByPartner[selectedId] || { UZS: 0, USD: 0 }
        : { UZS: 0, USD: 0 }

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
        const cur = normalizeFinCurrency(chartCurrency)
        const list = selectedEntries.filter((e) => normalizeFinCurrency(e.currency) === cur)
        const days = []
        for (let i = 6; i >= 0; i--) {
            const d = new Date()
            d.setHours(12, 0, 0, 0)
            d.setDate(d.getDate() - i)
            days.push({ iso: localCalendarISODate(d), labelDate: d })
        }
        return days.map(({ iso, labelDate }) => {
            const upTo = list.filter((e) => entryDateKey(e) <= iso)
            const bal = computeBalance(upTo, cur)
            const label = labelDate.toLocaleDateString(
                language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
                { weekday: 'short', day: 'numeric' }
            )
            return { day: label, balance: bal }
        })
    }, [selectedId, selectedEntries, language, chartCurrency])

    const supplyCleanedPreview = useMemo(
        () => cleanPartnerFinanceLines(entryForm.lines),
        [entryForm.lines]
    )

    const supplyPreviewSum = useMemo(
        () => supplyCleanedPreview.reduce((a, ln) => a + ln.line_total_uzs, 0),
        [supplyCleanedPreview]
    )

    const getPartnerReportTables = useCallback(() => {
        const filtered = filterPartnerFinanceEntries(entries, reportFilter)
        const sorted = [...filtered].sort((a, b) => {
            const da = entryDateKey(a)
            const db = entryDateKey(b)
            if (da !== db) return db.localeCompare(da)
            return String(b.created_at || '').localeCompare(String(a.created_at || ''))
        })
        const partnersScope = partners.filter((p) => !reportFilter.partnerId || p.id === reportFilter.partnerId)
        const summaryRows = partnersScope.map((p) => {
            const bal = balanceByPartner[p.id] || { UZS: 0, USD: 0 }
            const st = statusForDualBalance(bal.UZS, bal.USD, t).label
            return [
                pickLocalizedName(p, language),
                Math.round(bal.UZS * 100) / 100,
                Math.round(bal.USD * 100) / 100,
                st,
            ]
        })
        const opRows = sorted.map((e) => {
            const p = partners.find((x) => x.id === e.partner_id)
            return [
                p ? pickLocalizedName(p, language) : '—',
                entryDateKey(e),
                displayRefCode(e),
                entryTypeLabel(e.entry_type, t),
                normalizeFinCurrency(e.currency),
                Math.round((Number(e.amount_uzs) || 0) * 100) / 100,
                String(e.description || '').slice(0, 2000),
                String(e.warehouse_note || ''),
                String(e.responsible_name || ''),
            ]
        })
        const lineRows = []
        for (const e of sorted) {
            if (!entryUsesLineItems(e.entry_type)) continue
            const raw = linesByEntryId[e.id] || []
            if (!raw.length) continue
            const ref = displayRefCode(e)
            const cur = normalizeFinCurrency(e.currency)
            const sortedL = [...raw].sort((a, b) => (a.line_index || 0) - (b.line_index || 0))
            sortedL.forEach((ln, i) => {
                lineRows.push([
                    ref,
                    i + 1,
                    ln.item_name,
                    ln.quantity_display,
                    Math.round((Number(ln.unit_price_uzs) || 0) * 100) / 100,
                    Math.round((Number(ln.line_total_uzs) || 0) * 100) / 100,
                    cur,
                ])
            })
        }
        const periodLabel = `${t('finances.partnerReportPeriod')}: ${reportFilter.dateFrom || '—'} — ${reportFilter.dateTo || '—'}`
        return { summaryRows, opRows, lineRows, periodLabel }
    }, [entries, reportFilter, partners, balanceByPartner, linesByEntryId, t, language])

    const handlePartnerReportXlsx = useCallback(async () => {
        try {
            const { summaryRows, opRows, lineRows } = getPartnerReportTables()
            await downloadPartnerFinanceReportXlsx({
                fileBase: `hamkorlar-hisobot_${reportFilter.dateFrom || 'all'}_${reportFilter.dateTo || 'all'}`,
                summaryHeaders: [
                    t('finances.partnerReportColPartner'),
                    t('finances.partnerReportColBalUzs'),
                    t('finances.partnerReportColBalUsd'),
                    t('finances.partnerReportColStatus'),
                ],
                summaryRows,
                operationsHeaders: [
                    t('finances.partnerReportColPartner'),
                    t('finances.partnerReportColDate'),
                    t('finances.partnerReportColRef'),
                    t('finances.partnerReportColType'),
                    t('finances.partnerReportColCurrency'),
                    t('finances.partnerReportColAmount'),
                    t('finances.partnerReportColDesc'),
                    t('finances.partnerReportColWarehouse'),
                    t('finances.partnerReportColResponsible'),
                ],
                operationsRows: opRows,
                lineHeaders: [
                    t('finances.partnerReportColRef'),
                    t('finances.partnerReportColLineNum'),
                    t('finances.partnerReportColItem'),
                    t('finances.partnerReportColQty'),
                    t('finances.partnerReportColUnitPrice'),
                    t('finances.partnerReportColLineTotal'),
                    t('finances.partnerReportColCurrency'),
                ],
                lineRows,
                sheetSummary: t('finances.partnerReportSheetSummary'),
                sheetOperations: t('finances.partnerReportSheetOps'),
                sheetLines: t('finances.partnerReportSheetLines'),
            })
        } catch (err) {
            console.error(err)
            await showAlert(`${t('finances.partnerReportExportError')}: ${err.message || String(err)}`, {
                variant: 'error',
            })
        }
    }, [getPartnerReportTables, reportFilter.dateFrom, reportFilter.dateTo, t, showAlert])

    const handlePartnerReportPrint = useCallback(() => {
        try {
            const { summaryRows, opRows, lineRows, periodLabel } = getPartnerReportTables()
            const summaryHeaders = [
                t('finances.partnerReportColPartner'),
                t('finances.partnerReportColBalUzs'),
                t('finances.partnerReportColBalUsd'),
                t('finances.partnerReportColStatus'),
            ]
            const operationsHeaders = [
                t('finances.partnerReportColPartner'),
                t('finances.partnerReportColDate'),
                t('finances.partnerReportColRef'),
                t('finances.partnerReportColType'),
                t('finances.partnerReportColCurrency'),
                t('finances.partnerReportColAmount'),
                t('finances.partnerReportColDesc'),
                t('finances.partnerReportColWarehouse'),
                t('finances.partnerReportColResponsible'),
            ]
            const lineHeaders = [
                t('finances.partnerReportColRef'),
                t('finances.partnerReportColLineNum'),
                t('finances.partnerReportColItem'),
                t('finances.partnerReportColQty'),
                t('finances.partnerReportColUnitPrice'),
                t('finances.partnerReportColLineTotal'),
                t('finances.partnerReportColCurrency'),
            ]
            const ok = openPartnerReportPrintWindow({
                title: t('finances.partnerReportModalTitle'),
                periodLabel,
                summarySectionTitle: t('finances.partnerReportSectionSummary'),
                operationsSectionTitle: t('finances.partnerReportSectionOps'),
                summaryHeaders,
                summaryRows,
                operationsHeaders,
                operationsRows: opRows,
                lineHeaders,
                lineRows,
                linesSheetTitle: t('finances.partnerReportSectionLines'),
            })
            if (!ok) void showAlert(t('finances.partnerReportPrintBlocked'), { variant: 'warning' })
        } catch (err) {
            console.error(err)
            void showAlert(`${t('finances.partnerReportExportError')}: ${err.message || String(err)}`, {
                variant: 'error',
            })
        }
    }, [getPartnerReportTables, t, showAlert])

    function openPartnerReportModal() {
        const d = new Date()
        const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        const to = localCalendarISODate(d)
        setReportFilter({
            dateFrom: from,
            dateTo: to,
            partnerId: selectedId || '',
            entryType: 'all',
            currency: 'all',
        })
        setReportModalOpen(true)
    }

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
            if (entryIsSingleAmount(entryModal.type)) {
                const amt = parseMoney(entryForm.amount_uzs)
                if (!Number.isFinite(amt) || amt <= 0) {
                    await showAlert(t('finances.partnersInvalidAmount'), { variant: 'warning' })
                    return
                }
                const entryTypeSaved = entryModal.type === 'payment_in' ? 'payment_in' : 'payment'
                const { error } = await supabase.from('partner_finance_entries').insert([
                    {
                        partner_id: selectedId,
                        entry_type: entryTypeSaved,
                        amount_uzs: amt,
                        currency: normalizeFinCurrency(entryForm.currency),
                        entry_date: entryForm.entry_date,
                        description: entryForm.description.trim() || null,
                        reference_code: ref,
                        warehouse_note: null,
                        responsible_name: null,
                    },
                ])
                if (error) throw error
            } else {
                const lineMode = entryModal.type === 'sale_out' ? 'sale_out' : 'supply'
                const cleaned = cleanPartnerFinanceLines(entryForm.lines)
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
                            entry_type: lineMode === 'sale_out' ? 'sale_out' : 'supply',
                            amount_uzs: sum,
                            currency: normalizeFinCurrency(entryForm.currency),
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
                    // Faqat bazada har doim bo‘ladigan ustunlar (product_id / raw_material_id ixtiyoriy migratsiyalar — yo‘q bo‘lsa xato)
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
                currency: 'UZS',
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
            currency: 'UZS',
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
            if (
                !cleanPartnerFinanceLines(entryForm.lines).length
            ) {
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
        if (!entryUsesLineItems(entry.entry_type)) return []
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
            entryType: row.entry_type,
            subtitle: `${displayRefCode(row)} · ${row.entry_date} · ${formatFinAmount(row.amount_uzs, row.currency)}`,
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
                if (deletePinModal.entryType === 'sale_out') {
                    const toRestore = linesByEntryId[entryId] || []
                    try {
                        await restoreSaleOutStockFromLines(supabase, toRestore)
                    } catch (re) {
                        console.error(re)
                        await showAlert(re.message || String(re), { variant: 'error' })
                        return
                    }
                }
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
                        onClick={openPartnerReportModal}
                        disabled={schemaMissing || partners.length === 0}
                        title={
                            partners.length === 0 ? t('finances.noPartnersYet') : t('finances.partnerReport')
                        }
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    <div className="mt-2 space-y-1 min-h-[3.5rem]">
                        {totals.ourDebtUzs > 0.01 ? (
                            <p className="text-xl font-bold text-red-600 tabular-nums">
                                {formatOurDebtFin(totals.ourDebtUzs, 'UZS')}
                            </p>
                        ) : null}
                        {totals.ourDebtUsd > 0.01 ? (
                            <p className="text-xl font-bold text-red-600 tabular-nums">
                                {formatOurDebtFin(totals.ourDebtUsd, 'USD')}
                            </p>
                        ) : null}
                        {totals.ourDebtUzs < 0.01 && totals.ourDebtUsd < 0.01 ? (
                            <p className="text-2xl font-bold text-gray-400">—</p>
                        ) : null}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{t('finances.partnerBalanceOurDebt')}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        {t('finances.totalTheyOweUs')}
                    </p>
                    <div className="mt-2 space-y-1 min-h-[3.5rem]">
                        {totals.theyOweUzs > 0.01 ? (
                            <p className="text-xl font-bold text-emerald-600 tabular-nums">
                                {formatTheyOweUsFin(totals.theyOweUzs, 'UZS')}
                            </p>
                        ) : null}
                        {totals.theyOweUsd > 0.01 ? (
                            <p className="text-xl font-bold text-emerald-600 tabular-nums">
                                {formatTheyOweUsFin(totals.theyOweUsd, 'USD')}
                            </p>
                        ) : null}
                        {totals.theyOweUzs < 0.01 && totals.theyOweUsd < 0.01 ? (
                            <p className="text-2xl font-bold text-gray-400">—</p>
                        ) : null}
                    </div>
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
                                    const bal = balanceByPartner[p.id] || { UZS: 0, USD: 0 }
                                    const st = statusForDualBalance(bal.UZS, bal.USD, t)
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
                                                <div className="flex items-start justify-between mt-2 gap-2">
                                                    <div className="flex flex-col gap-0.5 text-xs font-mono tabular-nums font-semibold min-w-0">
                                                        {bal.UZS > 0.01 || bal.UZS < -0.01 ? (
                                                            <span
                                                                className={
                                                                    active
                                                                        ? bal.UZS > 0.01
                                                                            ? 'text-red-200'
                                                                            : 'text-emerald-200'
                                                                        : bal.UZS > 0.01
                                                                          ? 'text-red-600'
                                                                          : 'text-emerald-600'
                                                                }
                                                            >
                                                                {bal.UZS > 0.01
                                                                    ? formatOurDebtFin(bal.UZS, 'UZS')
                                                                    : formatFinAmount(-bal.UZS, 'UZS')}
                                                            </span>
                                                        ) : null}
                                                        {bal.USD > 0.01 || bal.USD < -0.01 ? (
                                                            <span
                                                                className={
                                                                    active
                                                                        ? bal.USD > 0.01
                                                                            ? 'text-red-200'
                                                                            : 'text-emerald-200'
                                                                        : bal.USD > 0.01
                                                                          ? 'text-red-600'
                                                                          : 'text-emerald-600'
                                                                }
                                                            >
                                                                {bal.USD > 0.01
                                                                    ? formatOurDebtFin(bal.USD, 'USD')
                                                                    : formatFinAmount(-bal.USD, 'USD')}
                                                            </span>
                                                        ) : null}
                                                        {Math.abs(bal.UZS) < 0.01 && Math.abs(bal.USD) < 0.01 ? (
                                                            <span className={active ? 'text-slate-300' : 'text-gray-500'}>—</span>
                                                        ) : null}
                                                    </div>
                                                    <span
                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                                                            active ? statusBadgeActiveClassDual(bal.UZS, bal.USD) : st.className
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
                                        onClick={() => openEntry('sale_out')}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50/80 text-sm font-semibold text-amber-950 hover:bg-amber-100"
                                    >
                                        <PackageMinus size={18} />
                                        {t('finances.partnerAddSaleOut')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEntry('payment_in')}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50/90 text-sm font-semibold text-emerald-950 hover:bg-emerald-100"
                                    >
                                        <ArrowDownToLine size={18} />
                                        {t('finances.partnerAddPaymentIn')}
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
                                    <div className="mt-1 space-y-1">
                                        {selectedBalances.UZS > 0.01 ? (
                                            <p className="text-lg font-bold text-red-600 tabular-nums">
                                                {formatOurDebtFin(selectedBalances.UZS, 'UZS')}
                                            </p>
                                        ) : null}
                                        {selectedBalances.USD > 0.01 ? (
                                            <p className="text-lg font-bold text-red-600 tabular-nums">
                                                {formatOurDebtFin(selectedBalances.USD, 'USD')}
                                            </p>
                                        ) : null}
                                        {selectedBalances.UZS < 0.01 && selectedBalances.USD < 0.01 ? (
                                            <p className="text-lg font-bold text-gray-400">—</p>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="rounded-xl bg-gray-50 p-4">
                                    <p className="text-xs font-bold text-gray-500 uppercase">
                                        {t('finances.partnerBalanceTheyOwe')}
                                    </p>
                                    <div className="mt-1 space-y-1">
                                        {selectedBalances.UZS < -0.01 ? (
                                            <p className="text-lg font-bold text-emerald-600 tabular-nums">
                                                {formatFinAmount(-selectedBalances.UZS, 'UZS')}
                                            </p>
                                        ) : null}
                                        {selectedBalances.USD < -0.01 ? (
                                            <p className="text-lg font-bold text-emerald-600 tabular-nums">
                                                {formatFinAmount(-selectedBalances.USD, 'USD')}
                                            </p>
                                        ) : null}
                                        {selectedBalances.UZS >= -0.01 && selectedBalances.USD >= -0.01 ? (
                                            <p className="text-lg font-bold text-gray-400">—</p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-bold text-gray-500 uppercase">
                                    {t('finances.partnerLastOp')}
                                </p>
                                <span
                                    className={`text-xs font-bold px-2 py-1 rounded-lg ${statusForDualBalance(selectedBalances.UZS, selectedBalances.USD, t).className}`}
                                >
                                    {statusForDualBalance(selectedBalances.UZS, selectedBalances.USD, t).label}
                                </span>
                            </div>
                            <p className="text-sm text-gray-800 mb-6">
                                {lastOpSummary(lastEntry(selectedEntries), t, language)}
                            </p>

                            <div className="h-48 w-full mb-8">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <p className="text-xs font-bold text-gray-500 uppercase">
                                        {t('finances.chartLast7Days')}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10px] font-semibold text-gray-500">
                                            {t('finances.partnerChartCurrency')}:
                                        </span>
                                        {['UZS', 'USD'].map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setChartCurrency(c)}
                                                className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                                                    normalizeFinCurrency(chartCurrency) === c
                                                        ? 'bg-slate-900 text-white border-slate-900'
                                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                            >
                                                {c === 'UZS' ? t('finances.finCurrencyUzs') : t('finances.finCurrencyUsd')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                                        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                                        <Tooltip formatter={(v) => formatFinAmount(v, chartCurrency)} />
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
                                            <th className="px-4 py-3 text-right whitespace-nowrap">
                                                {t('finances.amountWithCurrency')}
                                            </th>
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
                                                                row.entry_type === 'supply' ||
                                                                row.entry_type === 'payment_in'
                                                                    ? 'text-emerald-700 font-medium'
                                                                    : row.entry_type === 'sale_out'
                                                                      ? 'text-amber-800 font-medium'
                                                                      : 'text-blue-700 font-medium'
                                                            }
                                                        >
                                                            {entryTypeLabel(row.entry_type, t)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                                                        {formatFinAmount(row.amount_uzs, row.currency)}
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
                <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4 bg-black/50">
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
                <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
                    <input
                        ref={supplyExcelInputRef}
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        onChange={(ev) => handleSupplyExcelFile(ev, supplyExcelModeRef.current)}
                    />
                    <div
                        className={`bg-white rounded-2xl shadow-xl w-full p-6 my-8 ${
                            entryModal.type === 'supply' || entryModal.type === 'sale_out'
                                ? 'max-w-5xl max-h-[92vh] overflow-y-auto'
                                : 'max-w-md'
                        }`}
                    >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {entryModal.type === 'supply'
                                        ? t('finances.partnerAddSupply')
                                        : entryModal.type === 'sale_out'
                                          ? t('finances.partnerAddSaleOut')
                                          : entryModal.type === 'payment_in'
                                            ? t('finances.partnerAddPaymentIn')
                                            : t('finances.partnerAddPayment')}
                                </h3>
                                {entryModal.type === 'supply' ? (
                                    <p className="text-xs font-semibold text-slate-600 mt-0.5">
                                        {t('finances.supplyWizardTitle')}
                                    </p>
                                ) : null}
                                {entryModal.type === 'sale_out' ? (
                                    <p className="text-xs font-semibold text-amber-900/90 mt-0.5">
                                        {t('finances.saleOutWizardTitle')}
                                    </p>
                                ) : null}
                                <p className="text-xs text-gray-500 mt-1">
                                    {pickLocalizedName(selectedPartner, language)}
                                </p>
                            </div>
                            {entryModal.type === 'supply' || entryModal.type === 'sale_out' ? (
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
                                if (entryIsSingleAmount(entryModal.type)) saveEntry(e)
                                else if (supplyStep === 3) saveEntry(e)
                            }}
                        >
                            {entryIsSingleAmount(entryModal.type) ? (
                                <>
                                    {entryModal.type === 'payment_in' ? (
                                        <p className="text-xs text-emerald-900/90 leading-relaxed rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2">
                                            {t('finances.paymentInHint')}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-gray-600 leading-relaxed rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                                            {t('finances.paymentOutHint')}
                                        </p>
                                    )}
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">
                                            {t('finances.currencyLabel')}
                                        </label>
                                        <div className="flex flex-wrap gap-3 py-1">
                                            {['UZS', 'USD'].map((c) => (
                                                <label key={c} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="pay-currency"
                                                        checked={normalizeFinCurrency(entryForm.currency) === c}
                                                        onChange={() => setEntryForm((f) => ({ ...f, currency: c }))}
                                                        className="rounded-full border-gray-300 text-slate-900 focus:ring-slate-500"
                                                    />
                                                    {c === 'UZS' ? t('finances.finCurrencyUzs') : t('finances.finCurrencyUsd')}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        placeholder={t('finances.amountInSelectedCurrency')}
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
                                        {entryModal.type === 'sale_out'
                                            ? t('finances.saleOutStep1Hint')
                                            : t('finances.supplyStep1Hint')}
                                    </p>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">
                                            {t('finances.currencyLabel')}
                                        </label>
                                        <div className="flex flex-wrap gap-3 py-1">
                                            {['UZS', 'USD'].map((c) => (
                                                <label key={c} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="supply-currency"
                                                        checked={normalizeFinCurrency(entryForm.currency) === c}
                                                        onChange={() => setEntryForm((f) => ({ ...f, currency: c }))}
                                                        className="rounded-full border-gray-300 text-slate-900 focus:ring-slate-500"
                                                    />
                                                    {c === 'UZS' ? t('finances.finCurrencyUzs') : t('finances.finCurrencyUsd')}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
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
                                    {entryModal.type === 'supply' ? (
                                        <>
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
                                        </>
                                    ) : (
                                        <p className="text-[11px] text-amber-900/80">
                                            {t('finances.saleOutLineStockHint')}
                                        </p>
                                    )}
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
                                                                onChange={(e) => {
                                                                    const quantity_display = e.target.value
                                                                    setEntryForm((f) => ({
                                                                        ...f,
                                                                        lines: f.lines.map((x, j) =>
                                                                            j === idx
                                                                                ? {
                                                                                      ...x,
                                                                                      quantity_display,
                                                                                      line_total_uzs:
                                                                                          lineTotalFromQtyAndUnitPrice(
                                                                                              quantity_display,
                                                                                              x.unit_price_uzs
                                                                                          ),
                                                                                  }
                                                                                : x
                                                                        ),
                                                                    }))
                                                                }}
                                                            />
                                                        </td>
                                                        <td className="px-2 py-1.5 align-top">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                className="w-full min-w-0 px-2 py-1 rounded border border-gray-200 text-sm text-right tabular-nums"
                                                                placeholder={t('finances.trxColUnitPrice')}
                                                                value={ln.unit_price_uzs}
                                                                onChange={(e) => {
                                                                    const unit_price_uzs = e.target.value
                                                                    setEntryForm((f) => ({
                                                                        ...f,
                                                                        lines: f.lines.map((x, j) =>
                                                                            j === idx
                                                                                ? {
                                                                                      ...x,
                                                                                      unit_price_uzs,
                                                                                      line_total_uzs:
                                                                                          lineTotalFromQtyAndUnitPrice(
                                                                                              x.quantity_display,
                                                                                              unit_price_uzs
                                                                                          ),
                                                                                  }
                                                                                : x
                                                                        ),
                                                                    }))
                                                                }}
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
                                                            {formatFinAmount(ln.unit_price_uzs, entryForm.currency)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                                            {formatFinAmount(ln.line_total_uzs, entryForm.currency)}
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
                                            {formatFinAmount(supplyPreviewSum, entryForm.currency)}
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
                                {entryIsSingleAmount(entryModal.type) ? (
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
                        className="fixed inset-0 z-[8100] flex items-center justify-center p-4 bg-black/50"
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
                                                : detailModal.entry.entry_type === 'sale_out'
                                                  ? 'text-xs font-bold px-3 py-1 rounded-full bg-amber-600 text-white'
                                                  : detailModal.entry.entry_type === 'payment_in'
                                                    ? 'text-xs font-bold px-3 py-1 rounded-full bg-emerald-600 text-white'
                                                    : 'text-xs font-bold px-3 py-1 rounded-full bg-slate-700 text-white'
                                        }
                                    >
                                        {detailModal.entry.entry_type === 'supply'
                                            ? t('finances.trxBadgeSupply')
                                            : detailModal.entry.entry_type === 'sale_out'
                                              ? t('finances.trxBadgeSaleOut')
                                              : detailModal.entry.entry_type === 'payment_in'
                                                ? t('finances.trxBadgePaymentIn')
                                                : t('finances.trxBadgePayment')}
                                    </span>
                                </div>
                            </div>

                            <div className="p-5">
                                {entryUsesLineItems(detailModal.entry.entry_type) ? (
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
                                                                    : formatFinAmount(
                                                                          line.unit_price_uzs,
                                                                          detailModal.entry.currency
                                                                      )}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                                                                {formatFinAmount(line.line_total_uzs, detailModal.entry.currency)}
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
                                            {detailModal.entry.entry_type === 'payment_in'
                                                ? t('finances.trxPaymentInSummary')
                                                : t('finances.trxPaymentSummary')}
                                        </p>
                                        <p
                                            className={`text-2xl font-bold tabular-nums mt-2 ${
                                                detailModal.entry.entry_type === 'payment_in'
                                                    ? 'text-emerald-800'
                                                    : 'text-blue-800'
                                            }`}
                                        >
                                            {formatFinAmount(
                                                detailModal.entry.amount_uzs,
                                                detailModal.entry.currency
                                            )}
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
                                            {formatFinAmount(
                                                detailModal.entry.amount_uzs,
                                                detailModal.entry.currency
                                            )}
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

            {reportModalOpen ? (
                <div
                    className="fixed inset-0 z-[8200] flex items-center justify-center p-4 bg-black/50 overflow-y-auto"
                    role="presentation"
                    onClick={() => setReportModalOpen(false)}
                    onKeyDown={(ev) => ev.key === 'Escape' && setReportModalOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="partner-report-title"
                        className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 my-8 border border-gray-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <h3 id="partner-report-title" className="text-lg font-bold text-gray-900">
                                {t('finances.partnerReportModalTitle')}
                            </h3>
                            <button
                                type="button"
                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                                aria-label={t('common.cancel')}
                                onClick={() => setReportModalOpen(false)}
                            >
                                <X size={22} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed mb-4">{t('finances.partnerReportHint')}</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    {t('finances.partnerReportDateFrom')}
                                </label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                    value={reportFilter.dateFrom}
                                    onChange={(e) => setReportFilter((f) => ({ ...f, dateFrom: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    {t('finances.partnerReportDateTo')}
                                </label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                    value={reportFilter.dateTo}
                                    onChange={(e) => setReportFilter((f) => ({ ...f, dateTo: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                            <button
                                type="button"
                                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800"
                                onClick={() => {
                                    const d = new Date()
                                    setReportFilter((f) => ({
                                        ...f,
                                        dateFrom: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
                                        dateTo: localCalendarISODate(d),
                                    }))
                                }}
                            >
                                {t('finances.partnerReportQuickThisMonth')}
                            </button>
                            <button
                                type="button"
                                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800"
                                onClick={() => setReportFilter((f) => ({ ...f, dateFrom: '', dateTo: '' }))}
                            >
                                {t('finances.partnerReportQuickAllTime')}
                            </button>
                        </div>

                        <div className="space-y-3 mb-5">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    {t('finances.partnerReportPartner')}
                                </label>
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                    value={reportFilter.partnerId}
                                    onChange={(e) => setReportFilter((f) => ({ ...f, partnerId: e.target.value }))}
                                >
                                    <option value="">{t('finances.partnerReportPartnerAll')}</option>
                                    {partners.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {pickLocalizedName(p, language)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        {t('finances.partnerReportType')}
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                        value={reportFilter.entryType}
                                        onChange={(e) =>
                                            setReportFilter((f) => ({ ...f, entryType: e.target.value }))
                                        }
                                    >
                                        <option value="all">{t('finances.partnerReportTypeAll')}</option>
                                        <option value="supply">{t('finances.entryTypeSupply')}</option>
                                        <option value="payment">{t('finances.entryTypePayment')}</option>
                                        <option value="payment_in">{t('finances.entryTypePaymentIn')}</option>
                                        <option value="sale_out">{t('finances.entryTypeSaleOut')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        {t('finances.partnerReportCurrency')}
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                        value={reportFilter.currency}
                                        onChange={(e) =>
                                            setReportFilter((f) => ({ ...f, currency: e.target.value }))
                                        }
                                    >
                                        <option value="all">{t('finances.partnerReportCurrencyAll')}</option>
                                        <option value="UZS">{t('finances.finCurrencyUzs')}</option>
                                        <option value="USD">{t('finances.finCurrencyUsd')}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-end pt-2 border-t border-gray-100">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                                onClick={() => void handlePartnerReportPrint()}
                            >
                                <Printer size={18} />
                                {t('finances.partnerReportPrint')}
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                                onClick={() => void handlePartnerReportXlsx()}
                            >
                                <Download size={18} />
                                {t('finances.partnerReportDownloadXlsx')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {deletePinModal ? (
                <div
                    className="fixed inset-0 z-[8300] flex items-center justify-center p-4 bg-black/50"
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
