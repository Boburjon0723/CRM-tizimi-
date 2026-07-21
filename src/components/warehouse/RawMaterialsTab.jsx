'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Plus,
    Search,
    RefreshCcw,
    Download,
    ArrowDownCircle,
    ArrowUpCircle,
    SlidersHorizontal,
    History,
    Pencil,
    AlertTriangle,
    Beaker,
    X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import * as XLSX from 'xlsx'

const UNIT_OPTIONS = [
    { value: 'pcs', labelKey: 'unitPcs' },
    { value: 'l', labelKey: 'unitL' },
    { value: 'kg', labelKey: 'unitKg' },
    { value: 'm', labelKey: 'unitM' },
]

const KIND_OPTIONS = [
    { value: 'raw', labelKey: 'kindRaw' },
    { value: 'semi', labelKey: 'kindSemi' },
]

function pickName(row, lang) {
    if (!row) return ''
    if (lang === 'ru') return row.name_ru || row.name_uz || row.name_en || ''
    if (lang === 'en') return row.name_en || row.name_uz || row.name_ru || ''
    return row.name_uz || row.name_ru || row.name_en || ''
}

function numQty(v) {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

function formatQty(v) {
    const n = numQty(v)
    return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}

function unitLabel(t, unit) {
    const opt = UNIT_OPTIONS.find((o) => o.value === unit)
    return opt ? t(`warehouse.materials.${opt.labelKey}`) : unit
}

function stockStatus(material) {
    const stock = numQty(material.stock_quantity)
    const min = numQty(material.min_stock)
    if (material.track_stock === false) return { key: 'notTracked', cls: 'text-slate-400' }
    if (stock <= 0) return { key: 'out', cls: 'text-rose-600' }
    if (stock <= min) return { key: 'low', cls: 'text-amber-600' }
    return { key: 'ok', cls: 'text-emerald-600' }
}

const EMPTY_FORM = {
    name_uz: '',
    unit: 'pcs',
    sku: '',
    item_kind: 'raw',
    min_stock: '',
    unit_price: '',
    unit_price_uzs: '',
    note: '',
}

export default function RawMaterialsTab() {
    const { t, language } = useLanguage()
    const { showAlert, showToast } = useDialog()

    const [materials, setMaterials] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [lowStockOnly, setLowStockOnly] = useState(false)

    const [formOpen, setFormOpen] = useState(false)
    const [editId, setEditId] = useState(null)
    const [form, setForm] = useState(EMPTY_FORM)
    const [saving, setSaving] = useState(false)

    const [stockModal, setStockModal] = useState(null)
    const [stockQty, setStockQty] = useState('')
    const [stockNote, setStockNote] = useState('')
    const [stockSaving, setStockSaving] = useState(false)

    const [journalMaterial, setJournalMaterial] = useState(null)
    const [journalRows, setJournalRows] = useState([])
    const [journalLoading, setJournalLoading] = useState(false)

    const locale = language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US'

    const loadMaterials = useCallback(async () => {
        setLoadError(null)
        setLoading(true)
        try {
            // Faqat ombor materiallari (track_stock=true).
            // Moliya xarajat yorliqlari (track_stock=false) bu ro'yxatga kirmaydi.
            const { data, error } = await supabase
                .from('raw_materials')
                .select(
                    'id, name_uz, name_ru, name_en, unit, unit_price, unit_price_uzs, track_stock, stock_quantity, sku, item_kind, min_stock, note, is_active, created_at'
                )
                .eq('is_active', true)
                .eq('track_stock', true)
                .order('name_uz', { ascending: true })

            if (error) throw error
            setMaterials(data || [])
        } catch (error) {
            console.error('loadMaterials:', error)
            setMaterials([])
            setLoadError(error?.message || String(error))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadMaterials()
    }, [loadMaterials])

    const filtered = useMemo(() => {
        const q = searchTerm.trim().toLowerCase()
        let rows = materials
        if (lowStockOnly) {
            rows = rows.filter((m) => {
                if (m.track_stock === false) return false
                return numQty(m.stock_quantity) <= numQty(m.min_stock)
            })
        }
        if (!q) return rows
        return rows.filter((m) => {
            const name = pickName(m, language).toLowerCase()
            const sku = String(m.sku || '').toLowerCase()
            return name.includes(q) || sku.includes(q)
        })
    }, [materials, searchTerm, language, lowStockOnly])

    const stats = useMemo(() => {
        let low = 0
        let out = 0
        for (const m of materials) {
            if (m.track_stock === false) continue
            const stock = numQty(m.stock_quantity)
            const min = numQty(m.min_stock)
            if (stock <= 0) out += 1
            else if (stock <= min) low += 1
        }
        return { total: materials.length, low, out }
    }, [materials])

    const openCreate = () => {
        setEditId(null)
        setForm(EMPTY_FORM)
        setFormOpen(true)
    }

    const openEdit = (m) => {
        setEditId(m.id)
        setForm({
            name_uz: m.name_uz || '',
            unit: m.unit || 'pcs',
            sku: m.sku || '',
            item_kind: m.item_kind || 'raw',
            min_stock: numQty(m.min_stock) > 0 ? String(m.min_stock) : '',
            unit_price: numQty(m.unit_price) > 0 ? String(m.unit_price) : '',
            unit_price_uzs: numQty(m.unit_price_uzs) > 0 ? String(m.unit_price_uzs) : '',
            note: m.note || '',
        })
        setFormOpen(true)
    }

    const saveMaterial = async (e) => {
        e.preventDefault()
        if (!form.name_uz.trim()) {
            void showAlert(t('warehouse.materials.nameRequired'), { variant: 'error' })
            return
        }
        setSaving(true)
        try {
            // Ombor materiali doim miqdorda hisoblanadi (track_stock=true).
            const payload = {
                name_uz: form.name_uz.trim(),
                unit: form.unit,
                sku: form.sku.trim() || null,
                item_kind: form.item_kind,
                min_stock: numQty(form.min_stock),
                unit_price: numQty(form.unit_price),
                unit_price_uzs: numQty(form.unit_price_uzs),
                note: form.note.trim() || null,
                track_stock: true,
                is_active: true,
            }
            if (editId) {
                const { error } = await supabase.from('raw_materials').update(payload).eq('id', editId)
                if (error) throw error
                showToast(t('warehouse.materials.updated'))
            } else {
                const { error } = await supabase.from('raw_materials').insert([
                    { ...payload, stock_quantity: 0 },
                ])
                if (error) throw error
                showToast(t('warehouse.materials.created'))
            }
            setFormOpen(false)
            void loadMaterials()
        } catch (error) {
            void showAlert(error?.message || String(error), { variant: 'error' })
        } finally {
            setSaving(false)
        }
    }

    const openStockModal = (material, type) => {
        setStockModal({ material, type })
        setStockQty(type === 'adjust' ? String(numQty(material.stock_quantity)) : '')
        setStockNote('')
    }

    const submitStock = async (e) => {
        e.preventDefault()
        if (!stockModal) return
        const qty = numQty(stockQty)
        if (stockModal.type !== 'adjust' && qty <= 0) {
            void showAlert(t('warehouse.materials.qtyPositive'), { variant: 'error' })
            return
        }
        if (stockModal.type === 'adjust' && qty < 0) {
            void showAlert(t('warehouse.materials.qtyNonNegative'), { variant: 'error' })
            return
        }
        setStockSaving(true)
        try {
            const material = stockModal.material
            const current = numQty(material.stock_quantity)
            let delta = 0
            if (stockModal.type === 'in') delta = qty
            else if (stockModal.type === 'out') delta = -qty
            else delta = qty - current

            const newBalance = Math.max(0, current + delta)

            const { error: moveErr } = await supabase.from('material_stock_movements').insert([
                {
                    raw_material_id: material.id,
                    qty: delta,
                    type: stockModal.type,
                    balance_after: newBalance,
                    note: stockNote.trim() || null,
                },
            ])
            if (moveErr) throw moveErr

            const { error: updErr } = await supabase
                .from('raw_materials')
                .update({ stock_quantity: newBalance, track_stock: true })
                .eq('id', material.id)
            if (updErr) throw updErr

            const min = numQty(material.min_stock)
            if (newBalance <= 0) {
                showToast(t('warehouse.materials.alertOut'), { type: 'error' })
            } else if (min > 0 && newBalance <= min) {
                showToast(t('warehouse.materials.alertLow').replace('{min}', formatQty(min)), {
                    type: 'warning',
                })
            } else {
                showToast(t('warehouse.materials.stockSaved'), { type: 'success' })
            }
            setStockModal(null)
            void loadMaterials()
        } catch (error) {
            void showAlert(error?.message || String(error), { variant: 'error' })
        } finally {
            setStockSaving(false)
        }
    }

    const openJournal = async (material) => {
        setJournalMaterial(material)
        setJournalRows([])
        setJournalLoading(true)
        try {
            const { data, error } = await supabase
                .from('material_stock_movements')
                .select('id, qty, type, balance_after, note, created_at')
                .eq('raw_material_id', material.id)
                .order('created_at', { ascending: false })
                .limit(200)
            if (error) throw error
            setJournalRows(data || [])
        } catch (error) {
            void showAlert(error?.message || String(error), { variant: 'error' })
        } finally {
            setJournalLoading(false)
        }
    }

    const exportExcel = () => {
        const rows = filtered.map((m) => ({
            [t('warehouse.materials.colName')]: pickName(m, language),
            [t('warehouse.materials.colSku')]: m.sku || '—',
            [t('warehouse.materials.colKind')]: t(
                `warehouse.materials.${m.item_kind === 'semi' ? 'kindSemi' : 'kindRaw'}`
            ),
            [t('warehouse.materials.colUnit')]: unitLabel(t, m.unit),
            [t('warehouse.materials.colStock')]: formatQty(m.stock_quantity),
            [t('warehouse.materials.colMin')]: formatQty(m.min_stock),
            [t('warehouse.materials.colStatus')]: t(`warehouse.materials.status_${stockStatus(m).key}`),
        }))
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ [t('warehouse.materials.colName')]: '—' }])
        XLSX.utils.book_append_sheet(wb, ws, t('warehouse.materials.excelSheet'))
        XLSX.writeFile(wb, `Xomashyo_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {loadError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="break-words">{loadError}</p>
                    <button
                        type="button"
                        onClick={() => void loadMaterials()}
                        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold"
                    >
                        {t('warehouse.refresh')}
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700/70">
                        {t('warehouse.materials.statTotal')}
                    </p>
                    <p className="text-3xl font-black text-emerald-900 mt-1">{stats.total}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-700/70">
                        {t('warehouse.materials.statLow')}
                    </p>
                    <p className="text-3xl font-black text-amber-900 mt-1">{stats.low}</p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-rose-700/70">
                        {t('warehouse.materials.statOut')}
                    </p>
                    <p className="text-3xl font-black text-rose-900 mt-1">{stats.out}</p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={t('warehouse.materials.searchPlaceholder')}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setLowStockOnly((v) => !v)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${
                            lowStockOnly
                                ? 'border-amber-400 bg-amber-50 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <AlertTriangle size={14} />
                        {t('warehouse.materials.lowStockFilter')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void loadMaterials()}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                        title={t('warehouse.refresh')}
                    >
                        <RefreshCcw size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={exportExcel}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                        title="Excel"
                    >
                        <Download size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                        <Plus size={14} />
                        {t('warehouse.materials.addButton')}
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-black border-b border-slate-200">
                                <th className="text-left px-4 py-3">{t('warehouse.materials.colName')}</th>
                                <th className="text-left px-4 py-3">{t('warehouse.materials.colSku')}</th>
                                <th className="text-left px-4 py-3">{t('warehouse.materials.colUnit')}</th>
                                <th className="text-right px-4 py-3">{t('warehouse.materials.colStock')}</th>
                                <th className="text-right px-4 py-3">{t('warehouse.materials.colMin')}</th>
                                <th className="text-left px-4 py-3">{t('warehouse.materials.colStatus')}</th>
                                <th className="text-right px-4 py-3">{t('warehouse.materials.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                                        {t('warehouse.materials.empty')}
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((m) => {
                                    const st = stockStatus(m)
                                    const min = numQty(m.min_stock)
                                    const rowBg =
                                        st.key === 'out'
                                            ? 'bg-rose-50/70 hover:bg-rose-50'
                                            : st.key === 'low'
                                              ? 'bg-amber-50/70 hover:bg-amber-50'
                                              : 'hover:bg-slate-50/80'
                                    return (
                                        <tr key={m.id} className={`border-b border-slate-100 ${rowBg}`}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <Beaker size={14} className="text-emerald-600 shrink-0" />
                                                    <span className="font-semibold text-slate-900">
                                                        {pickName(m, language)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                                {m.sku || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{unitLabel(t, m.unit)}</td>
                                            <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                                                {formatQty(m.stock_quantity)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">
                                                {min > 0 ? formatQty(min) : '—'}
                                            </td>
                                            <td className={`px-4 py-3 text-xs font-bold ${st.cls}`}>
                                                {st.key === 'low' && min > 0
                                                    ? `${t('warehouse.materials.status_low')} (≤${formatQty(min)})`
                                                    : t(`warehouse.materials.status_${st.key}`)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        title={t('warehouse.materials.actionIn')}
                                                        onClick={() => openStockModal(m, 'in')}
                                                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                    >
                                                        <ArrowDownCircle size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title={t('warehouse.materials.actionOut')}
                                                        onClick={() => openStockModal(m, 'out')}
                                                        className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100"
                                                    >
                                                        <ArrowUpCircle size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title={t('warehouse.materials.actionAdjust')}
                                                        onClick={() => openStockModal(m, 'adjust')}
                                                        className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                    >
                                                        <SlidersHorizontal size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title={t('warehouse.materials.actionJournal')}
                                                        onClick={() => void openJournal(m)}
                                                        className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                    >
                                                        <History size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title={t('common.edit')}
                                                        onClick={() => openEdit(m)}
                                                        className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {formOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50" onClick={() => setFormOpen(false)} />
                    <form
                        onSubmit={saveMaterial}
                        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-3"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black text-slate-900">
                                {editId ? t('warehouse.materials.editTitle') : t('warehouse.materials.addTitle')}
                            </h3>
                            <button type="button" onClick={() => setFormOpen(false)} className="p-1 text-slate-400">
                                <X size={20} />
                            </button>
                        </div>
                        <input
                            required
                            value={form.name_uz}
                            onChange={(e) => setForm((f) => ({ ...f, name_uz: e.target.value }))}
                            placeholder={t('warehouse.materials.nameUz')}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <select
                                value={form.unit}
                                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                                className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                            >
                                {UNIT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {t(`warehouse.materials.${o.labelKey}`)}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={form.item_kind}
                                onChange={(e) => setForm((f) => ({ ...f, item_kind: e.target.value }))}
                                className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                            >
                                {KIND_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {t(`warehouse.materials.${o.labelKey}`)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <input
                            value={form.sku}
                            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                            placeholder={t('warehouse.materials.sku')}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                        />
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                            <label className="block text-xs font-bold text-amber-900">
                                {t('warehouse.materials.minStock')}
                            </label>
                            <input
                                type="number"
                                min={0}
                                step="any"
                                value={form.min_stock}
                                onChange={(e) => setForm((f) => ({ ...f, min_stock: e.target.value }))}
                                placeholder={t('warehouse.materials.minStockPh')}
                                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                            />
                            <p className="text-[11px] leading-snug text-amber-800/80">
                                {t('warehouse.materials.minStockHint')}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">
                                    {t('warehouse.materials.unitPriceUsd')}
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={form.unit_price}
                                    onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                                    placeholder={t('warehouse.materials.unitPriceUsdPh')}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">
                                    {t('warehouse.materials.unitPriceUzs')}
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={form.unit_price_uzs}
                                    onChange={(e) => setForm((f) => ({ ...f, unit_price_uzs: e.target.value }))}
                                    placeholder={t('warehouse.materials.unitPriceUzsPh')}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                                />
                            </div>
                        </div>
                        <textarea
                            value={form.note}
                            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                            placeholder={t('warehouse.materials.note')}
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm resize-none"
                        />
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setFormOpen(false)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                                {t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {stockModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50" onClick={() => setStockModal(null)} />
                    <form
                        onSubmit={submitStock}
                        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-3"
                    >
                        <h3 className="text-base font-black text-slate-900">
                            {stockModal.type === 'in' && t('warehouse.materials.modalIn')}
                            {stockModal.type === 'out' && t('warehouse.materials.modalOut')}
                            {stockModal.type === 'adjust' && t('warehouse.materials.modalAdjust')}
                        </h3>
                        <p className="text-sm text-slate-600">{pickName(stockModal.material, language)}</p>
                        <p className="text-xs font-mono text-emerald-700">
                            {t('warehouse.materials.currentStock')}:{' '}
                            {formatQty(stockModal.material.stock_quantity)}{' '}
                            {unitLabel(t, stockModal.material.unit)}
                        </p>
                        <input
                            required
                            type="number"
                            min={0}
                            step="any"
                            value={stockQty}
                            onChange={(e) => setStockQty(e.target.value)}
                            placeholder={
                                stockModal.type === 'adjust'
                                    ? t('warehouse.materials.newStockQty')
                                    : t('warehouse.materials.moveQty')
                            }
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                        />
                        <input
                            value={stockNote}
                            onChange={(e) => setStockNote(e.target.value)}
                            placeholder={t('warehouse.materials.note')}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setStockModal(null)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={stockSaving}
                                className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                                {t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {journalMaterial && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50" onClick={() => setJournalMaterial(null)} />
                    <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-base font-black text-slate-900">
                                    {t('warehouse.materials.journalTitle')}
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    {pickName(journalMaterial, language)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setJournalMaterial(null)}
                                className="p-2 rounded-full hover:bg-slate-100 text-slate-400"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {journalLoading ? (
                                <div className="flex justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                                </div>
                            ) : journalRows.length === 0 ? (
                                <p className="text-center text-slate-400 py-12 text-sm">
                                    {t('warehouse.materials.journalEmpty')}
                                </p>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-black border-b border-slate-100">
                                            <th className="py-2 text-left">{t('warehouse.materials.journalDate')}</th>
                                            <th className="py-2 text-left">{t('warehouse.materials.journalType')}</th>
                                            <th className="py-2 text-right">{t('warehouse.materials.journalQty')}</th>
                                            <th className="py-2 text-right">
                                                {t('warehouse.materials.journalBalance')}
                                            </th>
                                            <th className="py-2 text-left">{t('warehouse.materials.note')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {journalRows.map((row) => (
                                            <tr key={row.id} className="border-b border-slate-50">
                                                <td className="py-2 text-slate-500">
                                                    {new Date(row.created_at).toLocaleString(locale)}
                                                </td>
                                                <td className="py-2">
                                                    {t(`warehouse.materials.moveType_${row.type}`)}
                                                </td>
                                                <td
                                                    className={`py-2 text-right font-mono font-bold ${
                                                        numQty(row.qty) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                                    }`}
                                                >
                                                    {numQty(row.qty) >= 0 ? '+' : ''}
                                                    {formatQty(row.qty)}
                                                </td>
                                                <td className="py-2 text-right font-mono text-slate-600">
                                                    {formatQty(row.balance_after)}
                                                </td>
                                                <td className="py-2 text-slate-400">{row.note || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
