'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
    ArrowRight,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Database,
    ExternalLink,
    FilterX,
    PencilLine,
    PlusCircle,
    RefreshCw,
    ScrollText,
    Search,
    Trash2,
    User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import {
    buildDiffRows,
    formatLogTimestamp,
    formatLogValue,
    groupedTableOptions,
    tableHref,
    tableLabel,
} from './labels'

const PAGE_SIZE = 50

const ACTION_META = {
    INSERT: {
        icon: PlusCircle,
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        tKey: 'auditLog.actionInsert',
    },
    UPDATE: {
        icon: PencilLine,
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
        tKey: 'auditLog.actionUpdate',
    },
    DELETE: {
        icon: Trash2,
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
        tKey: 'auditLog.actionDelete',
    },
}

/** audit_logs jadvali hali yaratilmagan bo‘lsa — sozlash ko‘rsatmasi chiqadi */
function isMissingTableError(error) {
    if (!error) return false
    if (error.code === '42P01' || error.code === 'PGRST205') return true
    const msg = String(error.message || '')
    return /audit_logs/i.test(msg) && /(does not exist|schema cache|could not find|not find)/i.test(msg)
}

function todayStartIso() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

export default function LoglarPage() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showToast } = useDialog()

    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [setupNeeded, setSetupNeeded] = useState(false)
    const [loadError, setLoadError] = useState(null)

    const [totalFiltered, setTotalFiltered] = useState(0)
    const [totalAll, setTotalAll] = useState(0)
    const [totalToday, setTotalToday] = useState(0)

    const [tableFilter, setTableFilter] = useState('all')
    const [actionFilter, setActionFilter] = useState('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [searchTerm, setSearchTerm] = useState('')

    const [page, setPage] = useState(0)
    const [expandedId, setExpandedId] = useState(null)

    // Qidiruvni sekinlashtirish — har harfda so‘rov ketmasin
    useEffect(() => {
        const tmr = setTimeout(() => setSearchTerm(searchInput.trim()), 400)
        return () => clearTimeout(tmr)
    }, [searchInput])

    const hasFilters =
        tableFilter !== 'all' ||
        actionFilter !== 'all' ||
        Boolean(dateFrom) ||
        Boolean(dateTo) ||
        Boolean(searchTerm)

    // Filtr o‘zgarsa — birinchi sahifaga qaytamiz
    useEffect(() => {
        setPage(0)
    }, [tableFilter, actionFilter, dateFrom, dateTo, searchTerm])

    const loadLogs = useCallback(
        async (opts = {}) => {
            const silent = opts.silent === true
            if (silent) setRefreshing(true)
            else setLoading(true)

            try {
                let q = supabase
                    .from('audit_logs')
                    .select('*', { count: 'exact' })
                    .order('id', { ascending: false })

                if (tableFilter !== 'all') q = q.eq('table_name', tableFilter)
                if (actionFilter !== 'all') q = q.eq('action', actionFilter)
                if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
                if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59.999`)
                if (searchTerm) {
                    // PostgREST `or` filtrida vergul/qavs ajratuvchi hisoblanadi
                    const safe = searchTerm.replace(/[,()%]/g, ' ').trim()
                    if (safe) {
                        q = q.or(
                            `record_label.ilike.%${safe}%,record_id.ilike.%${safe}%,actor_email.ilike.%${safe}%`
                        )
                    }
                }

                const from = page * PAGE_SIZE
                q = q.range(from, from + PAGE_SIZE - 1)

                const { data, error, count } = await q

                if (error) {
                    if (isMissingTableError(error)) {
                        setSetupNeeded(true)
                        setLogs([])
                        setTotalFiltered(0)
                        return
                    }
                    throw error
                }

                setSetupNeeded(false)
                setLoadError(null)
                setLogs(data || [])
                setTotalFiltered(count ?? 0)
            } catch (e) {
                console.error('loadLogs:', e)
                setLoadError(e?.message || String(e))
                if (silent) showToast(t('auditLog.loadError'), { type: 'error' })
            } finally {
                setLoading(false)
                setRefreshing(false)
            }
        },
        [tableFilter, actionFilter, dateFrom, dateTo, searchTerm, page, showToast, t]
    )

    const loadStats = useCallback(async () => {
        try {
            const [allRes, todayRes] = await Promise.all([
                supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
                supabase
                    .from('audit_logs')
                    .select('id', { count: 'exact', head: true })
                    .gte('created_at', todayStartIso()),
            ])
            if (!allRes.error) setTotalAll(allRes.count ?? 0)
            if (!todayRes.error) setTotalToday(todayRes.count ?? 0)
        } catch (e) {
            console.warn('loadStats:', e)
        }
    }, [])

    useEffect(() => {
        loadLogs()
    }, [loadLogs])

    useEffect(() => {
        loadStats()
    }, [loadStats])

    const tableOptions = useMemo(() => groupedTableOptions([], language), [language])

    const clearFilters = () => {
        setTableFilter('all')
        setActionFilter('all')
        setDateFrom('')
        setDateTo('')
        setSearchInput('')
        setSearchTerm('')
    }

    async function handleRefresh() {
        await Promise.all([loadLogs({ silent: true }), loadStats()])
    }

    const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600" />
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-6">
            <Header title={t('auditLog.title')} toggleSidebar={toggleSidebar} />

            {setupNeeded ? (
                <SetupNotice t={t} onRetry={() => loadLogs()} />
            ) : (
                <>
                    {loadError && (
                        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                            {t('auditLog.loadError')}: {loadError}
                        </div>
                    )}

                    <p className="mb-3 text-sm text-gray-500">{t('auditLog.subtitle')}</p>

                    {/* Statistika */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                        <StatBox
                            label={t('auditLog.statToday')}
                            value={totalToday}
                            className="border-blue-400/30 bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                            labelClassName="text-blue-100"
                        />
                        <StatBox label={t('auditLog.statFiltered')} value={totalFiltered} />
                        <StatBox
                            label={t('auditLog.statTotal')}
                            value={totalAll}
                            className="col-span-2 lg:col-span-1"
                        />
                    </div>

                    {/* Filtrlar */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <div className="relative flex-1 min-w-[14rem]">
                            <Search
                                size={15}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder={t('auditLog.searchPlaceholder')}
                                className="w-full h-[34px] rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </div>

                        <select
                            value={tableFilter}
                            onChange={(e) => setTableFilter(e.target.value)}
                            className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-blue-400"
                        >
                            <option value="all">{t('auditLog.allTables')}</option>
                            {tableOptions.map((group) => (
                                <optgroup key={group.key} label={group.label}>
                                    {group.tables.map((tbl) => (
                                        <option key={tbl.value} value={tbl.value}>
                                            {tbl.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>

                        <select
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-blue-400"
                        >
                            <option value="all">{t('auditLog.allActions')}</option>
                            <option value="INSERT">{t('auditLog.actionInsert')}</option>
                            <option value="UPDATE">{t('auditLog.actionUpdate')}</option>
                            <option value="DELETE">{t('auditLog.actionDelete')}</option>
                        </select>

                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-blue-400"
                        />
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-[34px] rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-blue-400"
                        />

                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                            >
                                <FilterX size={14} />
                                {t('auditLog.clearFilters')}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                        >
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                            {t('auditLog.refresh')}
                        </button>
                    </div>

                    {/* Jadval */}
                    {logs.length === 0 ? (
                        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <ScrollText size={48} className="mb-4 opacity-20" />
                                <p className="text-lg font-medium">{t('auditLog.noLogs')}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[820px] text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                                            <th className="px-3 py-2.5 w-[10.5rem]">{t('auditLog.colTime')}</th>
                                            <th className="px-3 py-2.5 w-[11rem]">{t('auditLog.colUser')}</th>
                                            <th className="px-3 py-2.5 w-[8.5rem]">{t('auditLog.colAction')}</th>
                                            <th className="px-3 py-2.5 w-[11rem]">{t('auditLog.colSection')}</th>
                                            <th className="px-3 py-2.5">{t('auditLog.colRecord')}</th>
                                            <th className="px-3 py-2.5 w-[9rem] text-right">
                                                {t('auditLog.colChanges')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {logs.map((log) => (
                                            <LogRow
                                                key={log.id}
                                                log={log}
                                                t={t}
                                                language={language}
                                                isExpanded={expandedId === log.id}
                                                onToggle={() =>
                                                    setExpandedId((prev) => (prev === log.id ? null : log.id))
                                                }
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Sahifalash */}
                    {totalFiltered > PAGE_SIZE && (
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                                <ChevronLeft size={14} />
                                {t('auditLog.prev')}
                            </button>
                            <span className="text-xs font-bold tabular-nums text-gray-500">
                                {t('auditLog.page')} {page + 1} / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                            >
                                {t('auditLog.next')}
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    )}

                    <div className="h-8" />
                </>
            )}
        </div>
    )
}

function StatBox({ label, value, className = '', labelClassName = '' }) {
    return (
        <div className={`rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm ${className}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide truncate ${labelClassName || 'text-gray-500'}`}>
                {label}
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight">
                {Number(value).toLocaleString('uz-UZ')}
            </p>
        </div>
    )
}

function LogRow({ log, t, language, isExpanded, onToggle }) {
    const meta = ACTION_META[log.action] || ACTION_META.UPDATE
    const ActionIcon = meta.icon
    const href = tableHref(log.table_name)
    const diffRows = isExpanded ? buildDiffRows(log) : []
    const changeCount =
        log.action === 'UPDATE' ? Object.keys(log.changed_fields || {}).length : null

    const actorText =
        log.actor_email ||
        (log.actor_role === 'service_role' ? t('auditLog.script') : t('auditLog.system'))

    return (
        <>
            <tr
                className="cursor-pointer align-top transition-colors hover:bg-blue-50/30"
                onClick={onToggle}
            >
                <td className="px-3 py-2.5">
                    <div className="flex items-start gap-1.5">
                        <ChevronDown
                            size={14}
                            className={`mt-0.5 shrink-0 text-gray-400 transition-transform ${
                                isExpanded ? 'rotate-0' : '-rotate-90'
                            }`}
                        />
                        <span className="text-xs font-medium tabular-nums text-gray-700">
                            {formatLogTimestamp(log.created_at)}
                        </span>
                    </div>
                </td>

                <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <User size={13} className="shrink-0 text-gray-400" />
                        <span
                            className="truncate text-xs font-medium text-gray-700"
                            title={actorText}
                        >
                            {actorText}
                        </span>
                    </div>
                </td>

                <td className="px-3 py-2.5">
                    <span
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${meta.badge}`}
                    >
                        <ActionIcon size={11} />
                        {t(meta.tKey)}
                    </span>
                </td>

                <td className="px-3 py-2.5">
                    {href ? (
                        <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            title={log.table_name}
                        >
                            {tableLabel(log.table_name, language)}
                            <ExternalLink size={11} className="opacity-60" />
                        </Link>
                    ) : (
                        <span className="text-xs font-bold text-gray-700" title={log.table_name}>
                            {tableLabel(log.table_name, language)}
                        </span>
                    )}
                </td>

                <td className="px-3 py-2.5 min-w-0">
                    <div className="truncate text-xs font-medium text-gray-800">
                        {log.record_label || <span className="text-gray-400">—</span>}
                    </div>
                    {log.record_id && (
                        <div
                            className="mt-0.5 font-mono text-[9px] text-gray-400"
                            title={log.record_id}
                        >
                            #{String(log.record_id).slice(0, 8)}
                        </div>
                    )}
                </td>

                <td className="px-3 py-2.5 text-right">
                    {changeCount !== null ? (
                        <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black tabular-nums text-gray-600">
                            {changeCount} {t('auditLog.changesCount')}
                        </span>
                    ) : (
                        <span className="text-[10px] font-bold text-gray-400">
                            {log.action === 'INSERT'
                                ? t('auditLog.fullRecordAdded')
                                : t('auditLog.fullRecordRemoved')}
                        </span>
                    )}
                </td>
            </tr>

            {isExpanded && (
                <tr className="bg-gray-50/60">
                    <td colSpan={6} className="px-3 py-3">
                        {diffRows.length === 0 ? (
                            <p className="text-xs text-gray-500">{t('auditLog.noDetails')}</p>
                        ) : (
                            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                                            <th className="px-3 py-2 w-[13rem] font-bold">
                                                {t('auditLog.fieldColumn')}
                                            </th>
                                            <th className="px-3 py-2 font-bold">{t('auditLog.oldValue')}</th>
                                            <th className="px-3 py-2 w-6" />
                                            <th className="px-3 py-2 font-bold">{t('auditLog.newValue')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {diffRows.map((row) => (
                                            <tr key={row.field} className="align-top">
                                                <td className="px-3 py-2">
                                                    <div className="font-bold text-gray-700">{row.label}</div>
                                                    <div className="font-mono text-[9px] text-gray-400">
                                                        {row.field}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className="break-words text-rose-700">
                                                        {formatLogValue(row.old, language)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-300">
                                                    <ArrowRight size={12} />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className="break-words font-medium text-emerald-700">
                                                        {formatLogValue(row.new, language)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
    )
}

function SetupNotice({ t, onRetry }) {
    return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 md:p-6">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                    <Database size={20} className="text-amber-700" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-base font-bold text-amber-900">{t('auditLog.setupTitle')}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800">
                        {t('auditLog.setupHint')}
                    </p>

                    <ol className="mt-3 space-y-1.5 text-sm text-amber-900">
                        <li className="flex gap-2">
                            <span className="font-black">1.</span>
                            <span>{t('auditLog.setupStep1')}</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="font-black">2.</span>
                            <span>
                                {t('auditLog.setupStep2')}{' '}
                                <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs font-bold">
                                    add_audit_logs.sql
                                </code>
                            </span>
                        </li>
                        <li className="flex gap-2">
                            <span className="font-black">3.</span>
                            <span>{t('auditLog.setupStep3')}</span>
                        </li>
                    </ol>

                    <button
                        type="button"
                        onClick={onRetry}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700"
                    >
                        <RefreshCw size={15} />
                        {t('auditLog.setupRetry')}
                    </button>
                </div>
            </div>
        </div>
    )
}
