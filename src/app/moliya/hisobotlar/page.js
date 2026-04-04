'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import MoliyaTopNav from '@/components/MoliyaTopNav'
import { MoliyaCardSkeleton } from '@/components/MoliyaSkeletons'
import { Award, Building2, FileSpreadsheet, ShoppingBag } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { pickLocalizedName } from '@/utils/localizedName'
import {
    aggregateCompletedOrderSales,
    filterCompletedOrdersInDateRange,
} from '@/utils/completedOrderSales'
import { formatFinAmount, normalizeFinCurrency, rollupDepartmentTotals } from '@/utils/financeCurrency'

function localCalendarISODate(d) {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${day}`
}

function todayLocalISO() {
    return localCalendarISODate(new Date())
}

function startOfMonth(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function endOfMonth(d = new Date()) {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return localCalendarISODate(last)
}

function prevMonthRange() {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return { from: startOfMonth(d), to: endOfMonth(d) }
}

function thisMonthRange() {
    const d = new Date()
    return { from: startOfMonth(d), to: todayLocalISO() }
}

function thisYearRange() {
    const y = new Date().getFullYear()
    return { from: `${y}-01-01`, to: todayLocalISO() }
}

function last90DaysRange() {
    const t = new Date()
    const f = new Date(t)
    f.setDate(f.getDate() - 89)
    return { from: localCalendarISODate(f), to: todayLocalISO() }
}

function buildDeptPath(deptId, depts, lang) {
    const parts = []
    let cur = depts.find((d) => d.id === deptId)
    let guard = 0
    while (cur && guard++ < 32) {
        parts.unshift(pickLocalizedName(cur, lang))
        cur = cur.parent_id ? depts.find((d) => d.id === cur.parent_id) : null
    }
    return parts.join(' / ')
}

function computeDeptRollups(departments, directByDeptId) {
    const children = {}
    for (const d of departments) {
        const pid = d.parent_id
        if (pid == null || pid === undefined) continue
        if (!children[pid]) children[pid] = []
        children[pid].push(d.id)
    }
    const memo = {}
    function rollup(id) {
        if (memo[id] !== undefined) return memo[id]
        let s = directByDeptId[id] || 0
        const ch = children[id] || []
        for (const c of ch) s += rollup(c)
        memo[id] = s
        return s
    }
    for (const d of departments) rollup(d.id)
    return memo
}

async function fetchOrdersForSalesReport() {
    const itemShapes = [
        'quantity, subtotal, price, product_name, product_id, products (name)',
        'quantity, subtotal, price, product_name, product_id',
    ]
    const orderShapes = [
        'id, status, created_at, updated_at, total, order_items ( QUANTITY )',
        'id, status, created_at, total, order_items ( QUANTITY )',
    ]
    for (const itemSel of itemShapes) {
        for (const base of orderShapes) {
            const sel = base.replace('QUANTITY', itemSel)
            let r = await supabase
                .from('orders')
                .select(sel)
                .order('created_at', { ascending: false })
                .limit(5000)
                .is('deleted_at', null)
            if (!r.error) return r.data || []
            const msg = String(r.error?.message || '')
            if (/deleted_at|deleted at/i.test(msg)) {
                r = await supabase
                    .from('orders')
                    .select(sel)
                    .order('created_at', { ascending: false })
                    .limit(5000)
                if (!r.error) return r.data || []
            }
            if (!/schema|column|does not exist|42703|PGRST/i.test(msg)) break
        }
    }
    return []
}

function RankMedal({ place }) {
    if (place === 0) {
        return (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 border border-amber-200" title="1">
                <Award size={16} strokeWidth={2.5} />
            </span>
        )
    }
    if (place === 1) {
        return (
            <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300"
                title="2"
            >
                2
            </span>
        )
    }
    if (place === 2) {
        return (
            <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-800 text-xs font-bold border border-orange-200"
                title="3"
            >
                3
            </span>
        )
    }
    return <span className="inline-flex w-8 justify-center text-gray-400 text-sm tabular-nums">{place + 1}</span>
}

export default function MoliyaHisobotlarPage() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const [from, setFrom] = useState(() => thisMonthRange().from)
    const [to, setTo] = useState(() => thisMonthRange().to)
    const [view, setView] = useState('dept')
    const [departments, setDepartments] = useState([])
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [salesOrders, setSalesOrders] = useState([])
    const [salesLoading, setSalesLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const dRes = await supabase.from('departments').select('*').eq('is_active', true).order('sort_order')
        const enRes = await supabase
            .from('material_movements')
            .select('id, department_id, raw_material_id, unit_price_snapshot, total_cost, movement_date, note, currency')
            .gte('movement_date', from)
            .lte('movement_date', to)

        if (dRes.error) console.error(dRes.error)
        else setDepartments(dRes.data || [])
        if (enRes.error) {
            console.error(enRes.error)
            setEntries([])
        } else {
            setEntries(
                (enRes.data || []).map((m) => ({
                    ...m,
                    expense_date: m.movement_date,
                    amount: Number(m.total_cost || 0),
                    currency: normalizeFinCurrency(m.currency),
                }))
            )
        }
        setLoading(false)
    }, [from, to])

    useEffect(() => {
        load()
    }, [load])

    /** Har safar «Sotish» tabiga kirganda buyurtmalarni qayta yuklash — tugallangan yangilanadi */
    useEffect(() => {
        if (view !== 'sales') return undefined
        let alive = true
        setSalesLoading(true)
        fetchOrdersForSalesReport()
            .then((rows) => {
                if (alive) setSalesOrders(rows || [])
            })
            .catch((err) => {
                console.error('fetchOrdersForSalesReport:', err)
                if (alive) setSalesOrders([])
            })
            .finally(() => {
                if (alive) setSalesLoading(false)
            })
        return () => {
            alive = false
        }
    }, [view])

    const applyRange = (range) => {
        setFrom(range.from)
        setTo(range.to)
    }

    const entriesGrandTotals = useMemo(() => {
        let uz = 0
        let us = 0
        for (const e of entries) {
            const a = Number(e.amount || 0)
            if (normalizeFinCurrency(e.currency) === 'USD') us += a
            else uz += a
        }
        return { UZS: uz, USD: us }
    }, [entries])

    const deptRanking = useMemo(() => {
        const directUzs = {}
        const directUsd = {}
        for (const e of entries) {
            const id = e.department_id
            if (!id) continue
            const a = Number(e.amount || 0)
            if (normalizeFinCurrency(e.currency) === 'USD') directUsd[id] = (directUsd[id] || 0) + a
            else directUzs[id] = (directUzs[id] || 0) + a
        }
        const rolledUzs = rollupDepartmentTotals(departments, directUzs)
        const rolledUsd = rollupDepartmentTotals(departments, directUsd)
        return departments
            .map((d) => ({
                id: d.id,
                path: buildDeptPath(d.id, departments, language),
                totalUZS: rolledUzs[d.id] || 0,
                totalUSD: rolledUsd[d.id] || 0,
            }))
            .filter((r) => r.totalUZS > 0.01 || r.totalUSD > 0.01)
            .sort((a, b) => b.totalUZS - a.totalUZS || b.totalUSD - a.totalUSD)
    }, [departments, entries, language])

    const dailySeries = useMemo(() => {
        const day = {}
        for (const e of entries) {
            const k = e.expense_date
            if (!day[k]) day[k] = { date: k, uzs: 0, usd: 0 }
            const a = Number(e.amount || 0)
            if (normalizeFinCurrency(e.currency) === 'USD') day[k].usd += a
            else day[k].uzs += a
        }
        return Object.values(day).sort((a, b) => b.date.localeCompare(a.date))
    }, [entries])

    const monthlySeries = useMemo(() => {
        const mon = {}
        for (const e of entries) {
            const k = String(e.expense_date).slice(0, 7)
            if (!mon[k]) mon[k] = { month: k, uzs: 0, usd: 0 }
            const a = Number(e.amount || 0)
            if (normalizeFinCurrency(e.currency) === 'USD') mon[k].usd += a
            else mon[k].uzs += a
        }
        return Object.values(mon).sort((a, b) => b.month.localeCompare(a.month))
    }, [entries])

    const ledgerRows = useMemo(() => {
        return [...entries]
            .map((e) => ({
                id: e.id,
                date: e.expense_date,
                deptPath: buildDeptPath(e.department_id, departments, language),
                amount: Number(e.amount || 0),
                currency: normalizeFinCurrency(e.currency),
                note: e.note || '',
            }))
            .sort((a, b) => {
                const c = String(b.date).localeCompare(String(a.date))
                return c !== 0 ? c : a.id.localeCompare(b.id)
            })
    }, [entries, departments, language])

    const hasAnyData =
        deptRanking.length > 0 ||
        dailySeries.some((r) => r.uzs > 0.01 || r.usd > 0.01) ||
        monthlySeries.some((r) => r.uzs > 0.01 || r.usd > 0.01) ||
        ledgerRows.length > 0

    const salesInRange = useMemo(
        () => filterCompletedOrdersInDateRange(salesOrders, from, to),
        [salesOrders, from, to]
    )
    const salesAgg = useMemo(() => aggregateCompletedOrderSales(salesInRange), [salesInRange])
    const hasSalesData = salesAgg.orderCount > 0

    const showExpenseEmptyBanner =
        !loading && !hasAnyData && ['dept', 'daily', 'monthly', 'ledger'].includes(view)

    const tableScrollClass = 'max-h-[min(70vh,560px)] overflow-auto rounded-2xl border border-gray-100'

    return (
        <div className="max-w-6xl mx-auto px-6 pb-16">
            <Header title={t('finances.financeBranchReports')} toggleSidebar={toggleSidebar} />
            <MoliyaTopNav />

            <p className="text-gray-600 text-sm mb-6 leading-relaxed">{t('finances.moliyaReportsIntro')}</p>

            <div className="flex flex-col lg:flex-row lg:items-end gap-4 mb-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('finances.panelDateFrom')}</label>
                        <input
                            type="date"
                            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('finances.panelDateTo')}</label>
                        <input
                            type="date"
                            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => applyRange(thisMonthRange())}
                        className="px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors"
                    >
                        {t('finances.quickRangeThisMonth')}
                    </button>
                    <button
                        type="button"
                        onClick={() => applyRange(prevMonthRange())}
                        className="px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors"
                    >
                        {t('finances.quickRangeLastMonth')}
                    </button>
                    <button
                        type="button"
                        onClick={() => applyRange(thisYearRange())}
                        className="px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors"
                    >
                        {t('finances.quickRangeThisYear')}
                    </button>
                    <button
                        type="button"
                        onClick={() => applyRange(last90DaysRange())}
                        className="px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors"
                    >
                        {t('finances.quickRangeLast90Days')}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
                {['dept', 'sales', 'daily', 'monthly', 'ledger'].map((v) => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => setView(v)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-2 ${
                            view === v ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {v === 'dept' && t('finances.reportsByDept')}
                        {v === 'sales' && (
                            <>
                                <ShoppingBag size={16} />
                                {t('finances.reportsSalesTab')}
                            </>
                        )}
                        {v === 'daily' && t('finances.reportsDaily')}
                        {v === 'monthly' && t('finances.reportsMonthly')}
                        {v === 'ledger' && t('finances.reportsAllEntries')}
                    </button>
                ))}
            </div>

            {!loading && showExpenseEmptyBanner && (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-4 sm:px-6 sm:flex sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3 mb-3 sm:mb-0">
                        <FileSpreadsheet size={22} className="text-amber-700 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-amber-950">{t('finances.noTransactions')}</p>
                            <p className="text-sm text-amber-900/80 mt-0.5">{t('finances.reportsEmptyHint')}</p>
                        </div>
                    </div>
                    <Link
                        href="/moliya/bolimlar"
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-600"
                    >
                        <Building2 size={18} />
                        {t('finances.reportsEmptyCta')}
                    </Link>
                </div>
            )}

            {loading ? (
                <MoliyaCardSkeleton />
            ) : view === 'sales' && salesLoading ? (
                <MoliyaCardSkeleton />
            ) : view === 'sales' ? (
                <div className="space-y-6">
                    <p className="text-xs text-gray-500 leading-relaxed max-w-3xl">{t('finances.reportsSalesDateHint')}</p>
                    <p className="text-xs text-gray-500">{t('finances.reportsSalesRankHint')}</p>

                    {!hasSalesData ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <p className="font-semibold text-amber-950">{t('finances.reportsSalesEmpty')}</p>
                                <p className="text-sm text-amber-900/80 mt-1">{t('finances.reportsSalesDateHint')}</p>
                            </div>
                            <Link
                                href="/buyurtmalar"
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 whitespace-nowrap"
                            >
                                <ShoppingBag size={18} />
                                {t('finances.reportsSalesGoOrders')}
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <p className="text-xs font-bold text-gray-500 uppercase">
                                        {t('finances.reportsSalesOrdersCount')}
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                                        {salesAgg.orderCount}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <p className="text-xs font-bold text-gray-500 uppercase">
                                        {t('finances.reportsSalesPiecesTotal')}
                                    </p>
                                    <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
                                        {salesAgg.totalQty.toLocaleString()}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <p className="text-xs font-bold text-gray-500 uppercase">
                                        {t('finances.reportsSalesRevenueTotal')}
                                    </p>
                                    <p className="text-2xl font-bold text-blue-700 mt-1 tabular-nums">
                                        ${salesAgg.totalRevenue.toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div className={`bg-white shadow-sm ${tableScrollClass}`}>
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-gray-100 text-left text-gray-800 shadow-[0_1px_0_0_rgb(229,231,235)]">
                                            <th className="px-4 py-3 font-semibold w-14" />
                                            <th className="px-4 py-3 font-semibold">{t('finances.reportsSalesProductCol')}</th>
                                            <th className="px-4 py-3 font-semibold text-right">{t('finances.reportsSalesQtyCol')}</th>
                                            <th className="px-4 py-3 font-semibold text-right">{t('finances.reportsSalesRevenueCol')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {salesAgg.byProduct.map((r, i) => (
                                            <tr
                                                key={r.key}
                                                className="border-t border-gray-100 bg-white hover:bg-blue-50/40 transition-colors"
                                            >
                                                <td className="px-4 py-3 align-middle">
                                                    <RankMedal place={i} />
                                                </td>
                                                <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                    {r.qty.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium tabular-nums">
                                                    ${r.revenue.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            ) : view === 'dept' ? (
                <div className={`bg-white shadow-sm ${tableScrollClass}`}>
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-gray-100 text-left text-gray-800 shadow-[0_1px_0_0_rgb(229,231,235)]">
                                <th className="px-4 py-3 font-semibold w-14" />
                                <th className="px-4 py-3 font-semibold">{t('finances.reportsColDeptPath')}</th>
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                                    {t('finances.reportsTotalUzsCol')}
                                </th>
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                                    {t('finances.reportsTotalUsdCol')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {deptRanking.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400 bg-white">
                                        {t('finances.noTransactions')}
                                    </td>
                                </tr>
                            )}
                            {deptRanking.map((r, i) => (
                                <tr key={r.id} className="border-t border-gray-100 bg-white hover:bg-blue-50/40 transition-colors">
                                    <td className="px-4 py-3 align-middle">
                                        <RankMedal place={i} />
                                    </td>
                                    <td className="px-4 py-3 font-medium text-gray-900">{r.path}</td>
                                    <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                                        {r.totalUZS > 0.01 ? formatFinAmount(r.totalUZS, 'UZS') : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                                        {r.totalUSD > 0.01 ? formatFinAmount(r.totalUSD, 'USD') : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {deptRanking.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-50 border-t-2 border-slate-200 text-slate-900">
                                    <td className="px-4 py-3" />
                                    <td className="px-4 py-3 font-semibold">{t('finances.reportsGrandTotal')}</td>
                                    <td className="px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                                        {entriesGrandTotals.UZS > 0.01 ? formatFinAmount(entriesGrandTotals.UZS, 'UZS') : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                                        {entriesGrandTotals.USD > 0.01 ? formatFinAmount(entriesGrandTotals.USD, 'USD') : '—'}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            ) : view === 'daily' ? (
                <div className={`bg-white shadow-sm ${tableScrollClass}`}>
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-gray-100 text-left text-gray-800 shadow-[0_1px_0_0_rgb(229,231,235)]">
                                <th className="px-4 py-3 font-semibold">{t('finances.reportsDateCol')}</th>
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                                    {t('finances.reportsTotalUzsCol')}
                                </th>
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                                    {t('finances.reportsTotalUsdCol')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailySeries.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-10 text-center text-gray-400 bg-white">
                                        {t('finances.noTransactions')}
                                    </td>
                                </tr>
                            )}
                            {dailySeries.map((r) => (
                                <tr key={r.date} className="border-t border-gray-100 bg-white hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap">{r.date}</td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                                        {r.uzs > 0.01 ? formatFinAmount(r.uzs, 'UZS') : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                                        {r.usd > 0.01 ? formatFinAmount(r.usd, 'USD') : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : view === 'monthly' ? (
                <div className={`bg-white shadow-sm ${tableScrollClass}`}>
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-gray-100 text-left text-gray-800 shadow-[0_1px_0_0_rgb(229,231,235)]">
                                <th className="px-4 py-3 font-semibold">{t('finances.reportsDateCol')}</th>
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                                    {t('finances.reportsTotalUzsCol')}
                                </th>
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                                    {t('finances.reportsTotalUsdCol')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {monthlySeries.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-10 text-center text-gray-400 bg-white">
                                        {t('finances.noTransactions')}
                                    </td>
                                </tr>
                            )}
                            {monthlySeries.map((r) => (
                                <tr key={r.month} className="border-t border-gray-100 bg-white hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">{r.month}</td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                                        {r.uzs > 0.01 ? formatFinAmount(r.uzs, 'UZS') : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                                        {r.usd > 0.01 ? formatFinAmount(r.usd, 'USD') : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className={`bg-white shadow-sm ${tableScrollClass} overflow-x-auto`}>
                    <table className="w-full text-sm min-w-[560px]">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-gray-100 text-left text-gray-800 shadow-[0_1px_0_0_rgb(229,231,235)]">
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">{t('finances.date')}</th>
                                <th className="px-4 py-3 font-semibold">{t('finances.reportsColDeptPath')}</th>
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                                    {t('finances.amountWithCurrency')}
                                </th>
                                <th className="px-4 py-3 font-semibold">{t('finances.costNote')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledgerRows.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400 bg-white">
                                        {t('finances.noTransactions')}
                                    </td>
                                </tr>
                            )}
                            {ledgerRows.map((r) => (
                                <tr key={r.id} className="border-t border-gray-100 bg-white hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap align-top">{r.date}</td>
                                    <td className="px-4 py-3 align-top text-gray-800">{r.deptPath}</td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums align-top whitespace-nowrap">
                                        {formatFinAmount(r.amount, r.currency)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 max-w-[280px] align-top" title={r.note || undefined}>
                                        <span className="line-clamp-2">{r.note || '—'}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
