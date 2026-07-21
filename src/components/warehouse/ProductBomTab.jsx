'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Search,
    RefreshCcw,
    Plus,
    Trash2,
    X,
    ClipboardList,
    Package,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'

function pickMaterialName(row, lang) {
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

function productLabel(p) {
    if (!p) return ''
    const name = p.name_uz || p.name || '—'
    const code = p.size || p.sku || ''
    return code ? `${name} (${code})` : name
}

export default function ProductBomTab() {
    const { t, language } = useLanguage()
    const { showAlert, showToast, showConfirm } = useDialog()

    const [products, setProducts] = useState([])
    const [materials, setMaterials] = useState([])
    const [bomByProduct, setBomByProduct] = useState({})
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [onlyWithBom, setOnlyWithBom] = useState(false)

    const [editorProduct, setEditorProduct] = useState(null)
    const [editorLines, setEditorLines] = useState([])
    const [editorLoading, setEditorLoading] = useState(false)
    const [addMaterialId, setAddMaterialId] = useState('')
    const [addQty, setAddQty] = useState('')
    const [addNote, setAddNote] = useState('')
    const [saving, setSaving] = useState(false)

    const materialsById = useMemo(
        () => Object.fromEntries(materials.map((m) => [m.id, m])),
        [materials]
    )

    const loadAll = useCallback(async () => {
        setLoadError(null)
        setLoading(true)
        try {
            const [prRes, matRes, bomRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, name_uz, size, is_active')
                    .order('name', { ascending: true }),
                supabase
                    .from('raw_materials')
                    .select('id, name_uz, name_ru, name_en, unit, sku, is_active')
                    .eq('is_active', true)
                    .eq('track_stock', true)
                    .order('name_uz', { ascending: true }),
                supabase
                    .from('product_bom')
                    .select('id, product_id, material_id, qty_per_unit, note'),
            ])

            if (prRes.error) throw prRes.error
            if (matRes.error) throw matRes.error
            if (bomRes.error) throw bomRes.error

            setProducts(prRes.data || [])
            setMaterials(matRes.data || [])

            const map = {}
            for (const row of bomRes.data || []) {
                if (!map[row.product_id]) map[row.product_id] = []
                map[row.product_id].push(row)
            }
            setBomByProduct(map)
        } catch (error) {
            console.error('ProductBomTab load:', error)
            setProducts([])
            setMaterials([])
            setBomByProduct({})
            setLoadError(error?.message || String(error))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadAll()
    }, [loadAll])

    const filteredProducts = useMemo(() => {
        const q = searchTerm.trim().toLowerCase()
        return products.filter((p) => {
            if (p.is_active === false) return false
            const lines = bomByProduct[p.id] || []
            if (onlyWithBom && lines.length === 0) return false
            if (!q) return true
            const hay = `${p.name_uz || ''} ${p.name || ''} ${p.size || ''}`.toLowerCase()
            return hay.includes(q)
        })
    }, [products, searchTerm, onlyWithBom, bomByProduct])

    const summarizeBom = (productId) => {
        const lines = bomByProduct[productId] || []
        if (!lines.length) return t('warehouse.bom.emptySummary')
        return lines
            .map((line) => {
                const m = materialsById[line.material_id]
                const name = pickMaterialName(m, language) || '—'
                const unit = m?.unit || ''
                return `${name} ${formatQty(line.qty_per_unit)}${unit ? ` ${unit}` : ''}`
            })
            .join(', ')
    }

    const openEditor = async (product) => {
        setEditorProduct(product)
        setAddMaterialId('')
        setAddQty('')
        setAddNote('')
        setEditorLoading(true)
        try {
            const { data, error } = await supabase
                .from('product_bom')
                .select('id, product_id, material_id, qty_per_unit, note')
                .eq('product_id', product.id)
                .order('created_at', { ascending: true })
            if (error) throw error
            setEditorLines(data || [])
        } catch (error) {
            void showAlert(error?.message || String(error), { variant: 'error' })
            setEditorLines([])
        } finally {
            setEditorLoading(false)
        }
    }

    const availableMaterials = useMemo(() => {
        const used = new Set(editorLines.map((l) => l.material_id))
        return materials.filter((m) => !used.has(m.id))
    }, [materials, editorLines])

    const addLine = async (e) => {
        e.preventDefault()
        if (!editorProduct || !addMaterialId) return
        const qty = numQty(addQty)
        if (qty <= 0) {
            void showAlert(t('warehouse.bom.qtyPositive'), { variant: 'error' })
            return
        }
        setSaving(true)
        try {
            const { data, error } = await supabase
                .from('product_bom')
                .insert([
                    {
                        product_id: editorProduct.id,
                        material_id: addMaterialId,
                        qty_per_unit: qty,
                        note: addNote.trim() || null,
                    },
                ])
                .select('id, product_id, material_id, qty_per_unit, note')
                .single()
            if (error) throw error
            setEditorLines((prev) => [...prev, data])
            setBomByProduct((prev) => ({
                ...prev,
                [editorProduct.id]: [...(prev[editorProduct.id] || []), data],
            }))
            setAddMaterialId('')
            setAddQty('')
            setAddNote('')
            showToast(t('warehouse.bom.lineAdded'))
        } catch (error) {
            void showAlert(error?.message || String(error), { variant: 'error' })
        } finally {
            setSaving(false)
        }
    }

    const removeLine = async (line) => {
        const ok = await showConfirm(t('warehouse.bom.deleteConfirm'), { variant: 'error' })
        if (!ok) return
        try {
            const { error } = await supabase.from('product_bom').delete().eq('id', line.id)
            if (error) throw error
            setEditorLines((prev) => prev.filter((x) => x.id !== line.id))
            setBomByProduct((prev) => ({
                ...prev,
                [editorProduct.id]: (prev[editorProduct.id] || []).filter((x) => x.id !== line.id),
            }))
            showToast(t('warehouse.bom.lineDeleted'))
        } catch (error) {
            void showAlert(error?.message || String(error), { variant: 'error' })
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-4 py-3 text-sm text-violet-950">
                <p className="font-semibold">{t('warehouse.bom.introTitle')}</p>
                <p className="mt-1 text-violet-900/85 leading-relaxed">{t('warehouse.bom.introDetail')}</p>
            </div>

            {loadError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="break-words">{loadError}</p>
                    <button
                        type="button"
                        onClick={() => void loadAll()}
                        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold"
                    >
                        {t('warehouse.refresh')}
                    </button>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={t('warehouse.bom.searchPlaceholder')}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-500"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setOnlyWithBom((v) => !v)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${
                            onlyWithBom
                                ? 'border-violet-400 bg-violet-50 text-violet-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <ClipboardList size={14} />
                        {t('warehouse.bom.onlyWithBom')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void loadAll()}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                    >
                        <RefreshCcw size={16} />
                    </button>
                </div>
            </div>

            {materials.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {t('warehouse.bom.needMaterials')}
                </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-black border-b border-slate-200">
                                <th className="text-left px-4 py-3">{t('warehouse.bom.colProduct')}</th>
                                <th className="text-left px-4 py-3">{t('warehouse.bom.colCode')}</th>
                                <th className="text-left px-4 py-3">{t('warehouse.bom.colRecipe')}</th>
                                <th className="text-right px-4 py-3">{t('warehouse.bom.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                                        {t('warehouse.bom.emptyList')}
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((p) => {
                                    const count = (bomByProduct[p.id] || []).length
                                    return (
                                        <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <Package size={14} className="text-violet-600 shrink-0" />
                                                    <span className="font-semibold text-slate-900">
                                                        {p.name_uz || p.name || '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                                {p.size || p.sku || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 text-xs leading-relaxed max-w-xl">
                                                <span
                                                    className={
                                                        count
                                                            ? 'text-slate-700'
                                                            : 'text-slate-400 italic'
                                                    }
                                                >
                                                    {summarizeBom(p.id)}
                                                </span>
                                                {count > 0 && (
                                                    <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                                                        {count}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => void openEditor(p)}
                                                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
                                                >
                                                    <ClipboardList size={13} />
                                                    {t('warehouse.bom.editButton')}
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {editorProduct && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50" onClick={() => setEditorProduct(null)} />
                    <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-base font-black text-slate-900">
                                    {t('warehouse.bom.editorTitle')}
                                </h3>
                                <p className="text-sm text-violet-700 font-semibold mt-1">
                                    {productLabel(editorProduct)}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">{t('warehouse.bom.editorHint')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditorProduct(null)}
                                className="p-2 rounded-full hover:bg-slate-100 text-slate-400"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {editorLoading ? (
                                <div className="flex justify-center py-10">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
                                </div>
                            ) : (
                                <>
                                    {editorLines.length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-6">
                                            {t('warehouse.bom.noLines')}
                                        </p>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-black border-b border-slate-100">
                                                    <th className="py-2 text-left">{t('warehouse.bom.colMaterial')}</th>
                                                    <th className="py-2 text-right">{t('warehouse.bom.colQty')}</th>
                                                    <th className="py-2 text-left">{t('warehouse.bom.colNote')}</th>
                                                    <th className="py-2 text-right" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {editorLines.map((line) => {
                                                    const m = materialsById[line.material_id]
                                                    return (
                                                        <tr key={line.id} className="border-b border-slate-50">
                                                            <td className="py-2.5 font-medium text-slate-800">
                                                                {pickMaterialName(m, language) || '—'}
                                                                <span className="ml-2 text-xs text-slate-400">
                                                                    {m?.unit || ''}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 text-right font-mono font-bold">
                                                                {formatQty(line.qty_per_unit)}
                                                            </td>
                                                            <td className="py-2.5 text-slate-400 text-xs">
                                                                {line.note || '—'}
                                                            </td>
                                                            <td className="py-2.5 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void removeLine(line)}
                                                                    className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    )}

                                    <form
                                        onSubmit={addLine}
                                        className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
                                    >
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                            {t('warehouse.bom.addLine')}
                                        </p>
                                        <select
                                            value={addMaterialId}
                                            onChange={(e) => setAddMaterialId(e.target.value)}
                                            required
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                                        >
                                            <option value="">{t('warehouse.bom.selectMaterial')}</option>
                                            {availableMaterials.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {pickMaterialName(m, language)}
                                                    {m.sku ? ` [${m.sku}]` : ''} ({m.unit})
                                                </option>
                                            ))}
                                        </select>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input
                                                type="number"
                                                min={0.001}
                                                step="any"
                                                required
                                                value={addQty}
                                                onChange={(e) => setAddQty(e.target.value)}
                                                placeholder={t('warehouse.bom.qtyPerUnit')}
                                                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                                            />
                                            <input
                                                value={addNote}
                                                onChange={(e) => setAddNote(e.target.value)}
                                                placeholder={t('warehouse.bom.colNote')}
                                                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={saving || !addMaterialId || availableMaterials.length === 0}
                                            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                                        >
                                            <Plus size={14} />
                                            {t('warehouse.bom.addButton')}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
