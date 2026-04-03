'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import MoliyaTopNav from '@/components/MoliyaTopNav'
import { MoliyaCardSkeleton } from '@/components/MoliyaSkeletons'
import { Award, Building2, FileSpreadsheet } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { pickLocalizedName } from '@/utils/localizedName'

function todayISO() {
    return new Date().toISOString().split('T')[0]
}

function startOfMonth(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function endOfMonth(d = new Date()) {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return last.toISOString().split('T')[0]
}

function prevMonthRange() {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return { from: startOfMonth(d), to: endOfMonth(d) }
}

function thisMonthRange() {
    const d = new Date()
    return { from: startOfMonth(d), to: todayISO() }
}

function thisYearRange() {
    const y = new Date().getFullYear()
    return { from: `${y}-01-01`, to: todayISO() }
}

function last90DaysRange() {
    const t = new Date()
    const f = new Date(t)
    f.setDate(f.getDate() - 89)
    return { from: f.toISOString().split('T')[0], to: todayISO() }
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

    const load = useCallback(async () => {
        setLoading(true)
        const dRes = await supabase.from('departments').select('*').eq('is_active', true).order('sort_order')
        const enRes = await supabase
            .from('material_movements')
            .select('id, department_id, raw_material_id, unit_price_snapshot, total_cost, movement_date, note')
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
                }))
            )
        }
        setLoading(false)
    }, [from, to])

    useEffect(() => {
        load()
    }, [load])

    const applyRange = (range) => {
        setFrom(range.from)
        setTo(range.to)
    }

    const entriesGrandTotal = useMemo(
        () => entries.reduce((s, e) => s + Number(e.amount || 0), 0),
        [entries]
    )

    const deptRanking = useMemo(() => {
        const direct = {}
        for (const e of entries) {
            const id = e.department_id
            if (!id) continue
            direct[id] = (direct[id] || 0) + Number(e.amount || 0)
        }
        const rolled = computeDeptRollups(departments, direct)
        return departments
            .map((d) => ({
                id: d.id,
                path: buildDeptPath(d.id, departments, language),
                total: rolled[d.id] || 0,
            }))
            .filter((r) => r.total > 0)
            .sort((a, b) => b.total - a.total)
    }, [departments, entries, language])

    const dailySeries = useMemo(() => {
        const day = {}
        for (const e of entries) {
            const k = e.expense_date
            day[k] = (day[k] || 0) + Number(e.amount || 0)
        }
        return Object.entries(day)
            .map(([date, total]) => ({ date, total }))
            .sort((a, b) => b.date.localeCompare(a.date))
    }, [entries])

    const monthlySeries = useMemo(() => {
        const mon = {}
        for (const e of entries) {
            const k = String(e.expense_date).slice(0, 7)
            mon[k] = (mon[k] || 0) + Number(e.amount || 0)
        }
        return Object.entries(mon)
            .map(([month, total]) => ({ month, total }))
            .sort((a, b) => b.month.localeCompare(a.month))
    }, [entries])

    const ledgerRows = useMemo(() => {
        return [...entries]
            .map((e) => ({
                id: e.id,
                date: e.expense_date,
                deptPath: buildDeptPath(e.department_id, departments, language),
                amount: Number(e.amount || 0),
                note: e.note || '',
            }))
            .sort((a, b) => {
                const c = String(b.date).localeCompare(String(a.date))
                return c !== 0 ? c : a.id.localeCompare(b.id)
            })
    }, [entries, departments, language])

    const hasAnyData = deptRanking.length > 0 || dailySeries.length > 0

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
                {(['dept', 'daily', 'monthly', 'ledger']).map((v) => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => setView(v)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            view === v ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {v === 'dept' && t('finances.reportsByDept')}
                        {v === 'daily' && t('finances.reportsDaily')}
                        {v === 'monthly' && t('finances.reportsMonthly')}
                        {v === 'ledger' && t('finances.reportsAllEntries')}
                    </button>
                ))}
            </div>

            {!loading && !hasAnyData && (
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
            ) : view === 'dept' ? (
                <div className={`bg-white shadow-sm ${tableScrollClass}`}>
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-gray-100 text-left text-gray-800 shadow-[0_1px_0_0_rgb(229,231,235)]">
                                <th className="px-4 py-3 font-semibold w-14" />
                                <th className="px-4 py-3 font-semibold">{t('finances.reportsColDeptPath')}</th>
                                <th className="px-4 py-3 font-semibold text-right">{t('finances.reportsTotalCol')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deptRanking.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-10 text-center text-gray-400 bg-white">
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
                                    <td className="px-4 py-3 text-right font-semibold tabular-nums">${r.total.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                        {deptRanking.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-50 border-t-2 border-slate-200 text-slate-900">
                                    <td className="px-4 py-3" />
                                    <td className="px-4 py-3 font-semibold">{t('finances.reportsGrandTotal')}</td>
                                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                                        ${entriesGrandTotal.toLocaleString()}
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
                                <th className="px-4 py-3 font-semibold text-right">{t('finances.reportsTotalCol')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailySeries.length === 0 && (
                                <tr>
                                    <td colSpan={2} className="px-4 py-10 text-center text-gray-400 bg-white">
                                        {t('finances.noTransactions')}
                                    </td>
                                </tr>
                            )}
                            {dailySeries.map((r) => (
                                <tr key={r.date} className="border-t border-gray-100 bg-white hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap">{r.date}</td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums">${r.total.toLocaleString()}</td>
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
                                <th className="px-4 py-3 font-semibold text-right">{t('finances.reportsTotalCol')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {monthlySeries.length === 0 && (
                                <tr>
                                    <td colSpan={2} className="px-4 py-10 text-center text-gray-400 bg-white">
                                        {t('finances.noTransactions')}
                                    </td>
                                </tr>
                            )}
                            {monthlySeries.map((r) => (
                                <tr key={r.month} className="border-t border-gray-100 bg-white hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">{r.month}</td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums">${r.total.toLocaleString()}</td>
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
                                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">{t('finances.amount')}</th>
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
                                        ${r.amount.toLocaleString()}
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
