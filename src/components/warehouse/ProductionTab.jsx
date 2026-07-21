'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Search,
    RefreshCcw,
    Factory,
    AlertTriangle,
    CheckCircle2,
    Package,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import {
    numStock,
    listProductColors,
    buildStockByColorMap,
} from '@/lib/stockByColor'
import {
    mergeProductInventoryRow,
    deriveInventoryStatusFromQty,
} from '@/lib/productInventoryMerge'

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

export default function ProductionTab() {
    const { t, language } = useLanguage()
    const { showAlert, showToast, showConfirm } = useDialog()

    const [products, setProducts] = useState([])
    const [materials, setMaterials] = useState([])
    const [bomRows, setBomRows] = useState([])
    const [runs, setRuns] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)

    const [productId, setProductId] = useState('')
    const [productSearch, setProductSearch] = useState('')
    const [qty, setQty] = useState('1')
    const [colorKey, setColorKey] = useState('')
    const [note, setNote] = useState('')
    const [allowShortfall, setAllowShortfall] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const materialsById = useMemo(
        () => Object.fromEntries(materials.map((m) => [m.id, m])),
        [materials]
    )

    const productsWithBom = useMemo(() => {
        const ids = new Set(bomRows.map((b) => b.product_id))
        return products.filter((p) => ids.has(p.id) && p.is_active !== false)
    }, [products, bomRows])

    const filteredProductOptions = useMemo(() => {
        const q = productSearch.trim().toLowerCase()
        if (!q) return productsWithBom
        return productsWithBom.filter((p) => {
            const hay = `${p.name_uz || ''} ${p.name || ''} ${p.size || ''}`.toLowerCase()
            return hay.includes(q)
        })
    }, [productsWithBom, productSearch])

    const selectedProduct = useMemo(
        () => products.find((p) => p.id === productId) || null,
        [products, productId]
    )

    const productColors = useMemo(
        () => (selectedProduct ? listProductColors(selectedProduct) : []),
        [selectedProduct]
    )

    const bomForProduct = useMemo(
        () => bomRows.filter((b) => b.product_id === productId),
        [bomRows, productId]
    )

    const produceQty = Math.max(0, numQty(qty))

    const requirementRows = useMemo(() => {
        return bomForProduct.map((line) => {
            const m = materialsById[line.material_id]
            const need = numQty(line.qty_per_unit) * produceQty
            const have = numQty(m?.stock_quantity)
            const short = Math.max(0, need - have)
            return {
                material_id: line.material_id,
                material: m,
                qty_per_unit: numQty(line.qty_per_unit),
                need,
                have,
                short,
                ok: short <= 0.000001,
            }
        })
    }, [bomForProduct, materialsById, produceQty])

    const hasShortfall = requirementRows.some((r) => !r.ok)
    const canSubmit =
        !!selectedProduct &&
        produceQty > 0 &&
        bomForProduct.length > 0 &&
        (!productColors.length || !!colorKey) &&
        (!hasShortfall || allowShortfall)

    const loadAll = useCallback(async () => {
        setLoadError(null)
        setLoading(true)
        try {
            const [prRes, matRes, bomRes, runRes] = await Promise.all([
                supabase
                    .from('products')
                    .select(
                        'id, name, name_uz, size, colors, color, is_active, product_inventory(quantity, stock_by_color, status)'
                    )
                    .order('name', { ascending: true }),
                supabase
                    .from('raw_materials')
                    .select(
                        'id, name_uz, name_ru, name_en, unit, sku, stock_quantity, track_stock, is_active'
                    )
                    .eq('is_active', true)
                    .eq('track_stock', true)
                    .order('name_uz', { ascending: true }),
                supabase.from('product_bom').select('id, product_id, material_id, qty_per_unit'),
                supabase
                    .from('production_runs')
                    .select('id, product_id, qty, color_key, status, note, produced_at')
                    .eq('status', 'done')
                    .order('produced_at', { ascending: false })
                    .limit(30),
            ])

            if (prRes.error) throw prRes.error
            if (matRes.error) throw matRes.error
            if (bomRes.error) throw bomRes.error
            if (runRes.error) throw runRes.error

            setProducts((prRes.data || []).map(mergeProductInventoryRow))
            setMaterials(matRes.data || [])
            setBomRows(bomRes.data || [])
            setRuns(runRes.data || [])
        } catch (error) {
            console.error('ProductionTab load:', error)
            setLoadError(error?.message || String(error))
            setProducts([])
            setMaterials([])
            setBomRows([])
            setRuns([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadAll()
    }, [loadAll])

    useEffect(() => {
        if (!productColors.length) {
            setColorKey('')
            return
        }
        if (colorKey && productColors.includes(colorKey)) return
        setColorKey(productColors[0])
    }, [productId, productColors, colorKey])

    const submitProduction = async (e) => {
        e.preventDefault()
        if (!canSubmit || !selectedProduct) return

        if (hasShortfall && allowShortfall) {
            const ok = await showConfirm(t('warehouse.production.forceConfirm'), { variant: 'warning' })
            if (!ok) return
        } else {
            const ok = await showConfirm(
                t('warehouse.production.confirmMsg')
                    .replace('{qty}', formatQty(produceQty))
                    .replace('{name}', productLabel(selectedProduct)),
                { variant: 'default' }
            )
            if (!ok) return
        }

        setSubmitting(true)
        try {
            // 1) Materiallarni yangilab qayta tekshirish
            const matIds = requirementRows.map((r) => r.material_id)
            const { data: freshMats, error: fmErr } = await supabase
                .from('raw_materials')
                .select('id, stock_quantity, name_uz, unit')
                .in('id', matIds)
            if (fmErr) throw fmErr

            const freshById = Object.fromEntries((freshMats || []).map((m) => [m.id, m]))
            const shortNow = []
            for (const req of requirementRows) {
                const have = numQty(freshById[req.material_id]?.stock_quantity)
                if (have + 0.000001 < req.need) {
                    shortNow.push({
                        name: pickMaterialName(freshById[req.material_id] || req.material, language),
                        need: req.need,
                        have,
                    })
                }
            }
            if (shortNow.length && !allowShortfall) {
                throw new Error(
                    t('warehouse.production.shortfallBlock') +
                        ': ' +
                        shortNow.map((s) => `${s.name} (${formatQty(s.have)}/${formatQty(s.need)})`).join(', ')
                )
            }

            // 2) production_runs
            const { data: run, error: runErr } = await supabase
                .from('production_runs')
                .insert([
                    {
                        product_id: selectedProduct.id,
                        qty: produceQty,
                        color_key: colorKey || null,
                        status: 'done',
                        note: note.trim() || null,
                        produced_at: new Date().toISOString(),
                    },
                ])
                .select('id')
                .single()
            if (runErr) throw runErr

            // 3) Material consume
            for (const req of requirementRows) {
                const current = numQty(freshById[req.material_id]?.stock_quantity)
                const newBal = Math.max(0, current - req.need)
                const delta = newBal - current // manfiy yoki 0

                const { error: moveErr } = await supabase.from('material_stock_movements').insert([
                    {
                        raw_material_id: req.material_id,
                        qty: -req.need,
                        type: 'consume',
                        balance_after: newBal,
                        ref_type: 'production_run',
                        ref_id: run.id,
                        note: `Tayyorlash: ${productLabel(selectedProduct)} × ${formatQty(produceQty)}`,
                    },
                ])
                if (moveErr) throw moveErr

                const { error: updErr } = await supabase
                    .from('raw_materials')
                    .update({ stock_quantity: newBal, track_stock: true })
                    .eq('id', req.material_id)
                if (updErr) throw updErr

                // delta unused intentionally — balance is absolute
                void delta
            }

            // 4) Tayyor mahsulot +N
            const prevStock = numStock(selectedProduct.stock)
            const nextStock = prevStock + Math.floor(produceQty)
            let stockByColor = null

            if (productColors.length && colorKey) {
                const map = buildStockByColorMap(selectedProduct)
                map[colorKey] = Math.max(0, Math.floor(numQty(map[colorKey]) + produceQty))
                stockByColor = map
            }

            const { error: invErr } = await supabase.from('product_inventory').upsert(
                {
                    product_id: selectedProduct.id,
                    quantity: nextStock,
                    stock_by_color: stockByColor,
                    status: deriveInventoryStatusFromQty(nextStock),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'product_id' }
            )
            if (invErr) throw invErr

            const { error: smErr } = await supabase.from('stock_movements').insert([
                {
                    product_id: selectedProduct.id,
                    change_amount: Math.floor(produceQty),
                    previous_stock: prevStock,
                    new_stock: nextStock,
                    reason: `Ishlab chiqarish${colorKey ? ` (${colorKey})` : ''}: +${formatQty(produceQty)}`,
                    type: 'production',
                    color_key: colorKey || null,
                },
            ])
            if (smErr) {
                // type=production qo'llab-quvvatlanmasa — restock
                const { error: sm2 } = await supabase.from('stock_movements').insert([
                    {
                        product_id: selectedProduct.id,
                        change_amount: Math.floor(produceQty),
                        previous_stock: prevStock,
                        new_stock: nextStock,
                        reason: `Ishlab chiqarish${colorKey ? ` (${colorKey})` : ''}: +${formatQty(produceQty)}`,
                        type: 'restock',
                    },
                ])
                if (sm2) console.warn('stock_movements log failed:', sm2)
            }

            showToast(t('warehouse.production.success'))
            setQty('1')
            setNote('')
            void loadAll()
        } catch (error) {
            console.error('submitProduction:', error)
            void showAlert(error?.message || String(error), { variant: 'error' })
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-orange-200 bg-orange-50/90 px-4 py-3 text-sm text-orange-950">
                <p className="font-semibold">{t('warehouse.production.introTitle')}</p>
                <p className="mt-1 text-orange-900/85 leading-relaxed">{t('warehouse.production.introDetail')}</p>
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

            {productsWithBom.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {t('warehouse.production.needBom')}
                </div>
            )}

            <form
                onSubmit={submitProduction}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-4"
            >
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800 flex items-center gap-2">
                        <Factory size={16} className="text-orange-600" />
                        {t('warehouse.production.formTitle')}
                    </h3>
                    <button
                        type="button"
                        onClick={() => void loadAll()}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                    >
                        <RefreshCcw size={16} />
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder={t('warehouse.production.searchProduct')}
                        className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-500"
                    />
                </div>

                <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                >
                    <option value="">{t('warehouse.production.selectProduct')}</option>
                    {filteredProductOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                            {productLabel(p)}
                        </option>
                    ))}
                </select>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                            {t('warehouse.production.qtyLabel')}
                        </label>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            required
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono"
                        />
                    </div>
                    {productColors.length > 0 && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                {t('warehouse.production.colorLabel')}
                            </label>
                            <select
                                value={colorKey}
                                onChange={(e) => setColorKey(e.target.value)}
                                required
                                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                            >
                                {productColors.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('warehouse.production.note')}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />

                {selectedProduct && bomForProduct.length > 0 && (
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-500">
                            {t('warehouse.production.requirementsTitle')}
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-black border-b border-slate-50">
                                    <th className="px-4 py-2 text-left">{t('warehouse.production.colMaterial')}</th>
                                    <th className="px-4 py-2 text-right">{t('warehouse.production.colNeed')}</th>
                                    <th className="px-4 py-2 text-right">{t('warehouse.production.colHave')}</th>
                                    <th className="px-4 py-2 text-left">{t('warehouse.production.colStatus')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requirementRows.map((r) => (
                                    <tr key={r.material_id} className="border-b border-slate-50">
                                        <td className="px-4 py-2.5 font-medium">
                                            {pickMaterialName(r.material, language)}
                                            <span className="ml-1 text-xs text-slate-400">
                                                {r.material?.unit || ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono font-bold">
                                            {formatQty(r.need)}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                                            {formatQty(r.have)}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {r.ok ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                                    <CheckCircle2 size={14} />
                                                    {t('warehouse.production.statusOk')}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">
                                                    <AlertTriangle size={14} />
                                                    {t('warehouse.production.statusShort').replace(
                                                        '{n}',
                                                        formatQty(r.short)
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {hasShortfall && (
                    <label className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <input
                            type="checkbox"
                            checked={allowShortfall}
                            onChange={(e) => setAllowShortfall(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>{t('warehouse.production.allowShortfall')}</span>
                    </label>
                )}

                <button
                    type="submit"
                    disabled={!canSubmit || submitting}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-orange-700 disabled:opacity-40"
                >
                    <Factory size={16} />
                    {submitting ? '…' : t('warehouse.production.submit')}
                </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-900">{t('warehouse.production.historyTitle')}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{t('warehouse.production.historyHint')}</p>
                </div>
                {runs.length === 0 ? (
                    <p className="px-5 py-10 text-sm text-slate-400 text-center">
                        {t('warehouse.production.historyEmpty')}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-black border-b border-slate-200">
                                    <th className="text-left px-4 py-3">{t('warehouse.production.colDate')}</th>
                                    <th className="text-left px-4 py-3">{t('warehouse.production.colProduct')}</th>
                                    <th className="text-right px-4 py-3">{t('warehouse.production.colQty')}</th>
                                    <th className="text-left px-4 py-3">{t('warehouse.production.colorLabel')}</th>
                                    <th className="text-left px-4 py-3">{t('warehouse.production.note')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map((r) => {
                                    const p = products.find((x) => x.id === r.product_id)
                                    return (
                                        <tr key={r.id} className="border-b border-slate-100">
                                            <td className="px-4 py-3 text-slate-500 text-xs">
                                                {new Date(r.produced_at).toLocaleString(
                                                    language === 'uz'
                                                        ? 'uz-UZ'
                                                        : language === 'ru'
                                                          ? 'ru-RU'
                                                          : 'en-US'
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-semibold">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Package size={13} className="text-orange-500" />
                                                    {p ? productLabel(p) : r.product_id}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                                                +{formatQty(r.qty)}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">{r.color_key || '—'}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{r.note || '—'}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
