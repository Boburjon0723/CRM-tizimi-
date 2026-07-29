'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { deductStockForCompletedOrder, reverseStockForOrder } from '@/services/inventoryService'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { parseOrderItemQty, updateOrderStatusWithCompletedAt } from '../utils'
import {
    loadOrderShippedMap,
    buildPartialShipRows,
} from '../lib/partialShipUtils'

export default function PartialShipModal({ order, products, onClose, onSuccess }) {
    const { t } = useLanguage()
    const { showAlert, showConfirm, showToast } = useDialog()
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!order?.id) return
        let cancelled = false
        setLoading(true)
        setRows([])
        const orderSnapshot = order
        const productsSnapshot = products
        ;(async () => {
            try {
                const shippedMap = await loadOrderShippedMap(orderSnapshot.id)
                if (cancelled) return
                setRows(
                    buildPartialShipRows(orderSnapshot, productsSnapshot, shippedMap).map((r) => ({
                        ...r,
                        selected: false,
                        ship_qty: 0,
                    }))
                )
            } catch (error) {
                console.error('PartialShipModal load:', error)
                if (!cancelled) {
                    await showAlert(error?.message || String(error), {
                        title: t('orders.partialLoadError'),
                        variant: 'error',
                    })
                    onClose()
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
        // Faqat order.id — parent re-render confirm paytida tanlovni nolga tashlamasligi uchun
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order?.id])

    const summary = useMemo(() => {
        let ordered = 0
        let shipped = 0
        let remaining = 0
        let now = 0
        let selectedCount = 0
        for (const r of rows) {
            ordered += Number(r.ordered_qty) || 0
            shipped += Number(r.shipped_qty) || 0
            remaining += Number(r.remaining_qty) || 0
            now += Number(r.ship_qty) || 0
            if (r.selected && r.remaining_qty > 0) selectedCount += 1
        }
        const nextShipped = shipped + now
        const percent = ordered > 0 ? Math.min(100, Math.round((nextShipped / ordered) * 100)) : 0
        const remainingAfter = Math.max(0, remaining - now)
        return { ordered, shipped, remaining, now, percent, selectedCount, remainingAfter }
    }, [rows])

    const selectableRows = useMemo(() => rows.filter((r) => r.remaining_qty > 0), [rows])
    const allSelectableSelected =
        selectableRows.length > 0 && selectableRows.every((r) => r.selected)

    function toggleRowSelected(key, checked) {
        setRows((prev) =>
            prev.map((r) => {
                if (r.key !== key) return r
                if (r.remaining_qty <= 0) return { ...r, selected: false, ship_qty: 0 }
                if (checked) {
                    return { ...r, selected: true, ship_qty: r.remaining_qty }
                }
                return { ...r, selected: false, ship_qty: 0 }
            })
        )
    }

    function toggleSelectAll(checked) {
        setRows((prev) =>
            prev.map((r) => {
                if (r.remaining_qty <= 0) return { ...r, selected: false, ship_qty: 0 }
                if (checked) {
                    return { ...r, selected: true, ship_qty: r.remaining_qty }
                }
                return { ...r, selected: false, ship_qty: 0 }
            })
        )
    }

    async function reloadRows() {
        const shippedMap = await loadOrderShippedMap(order.id)
        setRows(
            buildPartialShipRows(order, products, shippedMap).map((r) => ({
                ...r,
                selected: false,
                ship_qty: 0,
            }))
        )
    }

    async function clearErroneousShipProgress() {
        if (!order?.id || summary.shipped <= 0) return
        const ok = await showConfirm(
            'Bu buyurtmadagi «chiqqan» yozuvlar tozalanadi va ombor qoldig‘i qaytariladi. Davom etasizmi?',
            {
                title: 'Noto‘g‘ri chiqimni tozalash',
                variant: 'warning',
            }
        )
        if (!ok) return
        setSaving(true)
        try {
            const shippedMap = await loadOrderShippedMap(order.id)
            const toReverse = []
            for (const [key, qty] of shippedMap.entries()) {
                const n = Number(qty) || 0
                if (n <= 0) continue
                const sep = key.indexOf('::')
                const product_id = sep >= 0 ? key.slice(0, sep) : key
                const colorRaw = sep >= 0 ? key.slice(sep + 2) : '—'
                toReverse.push({
                    product_id,
                    color: !colorRaw || colorRaw === '—' ? null : colorRaw,
                    quantity: n,
                })
            }
            if (!toReverse.length) {
                await showAlert('Tozalash uchun chiqim topilmadi', { variant: 'info' })
                return
            }
            const res = await reverseStockForOrder(
                order.id,
                order.order_number || order.id,
                toReverse
            )
            if (!res?.success) {
                const errText = (res?.errors || [])
                    .map((e) => `${e.product_id}: ${e.error}`)
                    .join('\n')
                await showAlert(errText || t('common.saveError'), { variant: 'error' })
                return
            }
            showToast('Chiqim yozuvlari tozalandi', { type: 'success' })
            await reloadRows()
            await onSuccess?.({
                orderId: order.id,
                status: order.status,
                willComplete: false,
                orderSnapshot: order,
            })
        } catch (error) {
            console.error('clearErroneousShipProgress:', error)
            await showAlert(error?.message || String(error), { variant: 'error' })
        } finally {
            setSaving(false)
        }
    }

    async function submitPartialShipment() {
        if (!order) return
        const toShip = rows
            .filter((r) => r.selected && r.remaining_qty > 0)
            .map((r) => ({
                product_id: r.product_id,
                color: r.color || null,
                quantity: Math.max(0, Math.min(r.remaining_qty, parseOrderItemQty(r.ship_qty || 0))),
                product_name: r.product_name,
            }))
            .filter((r) => r.quantity > 0)
        if (!toShip.length) {
            await showAlert(t('orders.partialNothingToShip'), { variant: 'warning' })
            return
        }
        const shipNowTotal = toShip.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
        const remainingAfter = Math.max(0, summary.remaining - shipNowTotal)
        const ok = await showConfirm(
            t('orders.partialConfirmSubmit') ||
                `Tanlangan ${toShip.length} qatorni tugallaysizmi?`,
            {
                title: t('orders.partialModalTitle'),
                variant: 'info',
            }
        )
        if (!ok) return

        setSaving(true)
        try {
            const orderNum = order.order_number || order.id
            const res = await deductStockForCompletedOrder(order.id, orderNum, toShip)
            if (!res?.success) {
                const errText = (res?.errors || [])
                    .map((e) => `${e.product_id}: ${e.error}`)
                    .join('\n')
                await showAlert(errText || t('common.saveError'), {
                    title: t('orders.partialSaveError'),
                    variant: 'error',
                })
                return
            }

            const willComplete = remainingAfter <= 0
            const newStatus = willComplete ? 'completed' : 'pending'
            const { error: stErr } = await updateOrderStatusWithCompletedAt(
                supabase,
                order.id,
                newStatus,
                order.status
            )
            if (stErr) throw stErr

            showToast(
                willComplete
                    ? t('orders.partialCompletedFull') || t('orders.partialSavedOk')
                    : t('orders.partialSavedOk'),
                { type: 'success' }
            )
            const payload = {
                orderId: order.id,
                status: newStatus,
                willComplete,
                orderSnapshot: order,
            }
            onClose()
            await onSuccess?.(payload)
        } catch (error) {
            console.error('submitPartialShipment:', error)
            await showAlert(error?.message || String(error), {
                title: t('orders.partialSaveError'),
                variant: 'error',
            })
        } finally {
            setSaving(false)
        }
    }

    if (!order) return null

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                onClick={() => !saving && onClose()}
            />
            <div
                className="relative w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-black text-slate-900">{t('orders.partialModalTitle')}</h3>
                            <p className="text-xs text-slate-600 mt-1">{t('orders.partialModalHint')}</p>
                            <p className="text-xs text-emerald-700 mt-2 font-bold">
                                {(t('orders.partialModalOrderPrefix') || 'Buyurtma')}{' '}
                                {order.order_number
                                    ? `№${order.order_number}`
                                    : `#${String(order.id).slice(0, 8)}`}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => !saving && onClose()}
                            className="rounded-full p-2 text-slate-400 hover:bg-white/80 hover:text-slate-700"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('orders.qtyLabel')}</p>
                            <p className="font-mono font-black text-slate-900 text-lg">{summary.ordered}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                {t('orders.partialShippedCol')}
                            </p>
                            <p className="font-mono font-black text-emerald-700 text-lg">{summary.shipped}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                {t('orders.partialRemainingCol')}
                            </p>
                            <p className="font-mono font-black text-amber-700 text-lg">{summary.remaining}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                {t('orders.partialShipQtyLabel')}
                            </p>
                            <p className="font-mono font-black text-cyan-700 text-lg">{summary.now}</p>
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
                                style={{ width: `${summary.percent}%` }}
                            />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">
                            {t('orders.partialShippedCol')}: {summary.percent}%
                            {summary.remainingAfter === 0 && summary.now > 0
                                ? ` · ${t('orders.partialWillCompleteHint') || "Saqlanganda status «Tugallangan» bo‘ladi"}`
                                : ''}
                        </p>
                    </div>
                </div>
                {loading ? (
                    <div className="px-6 py-14 text-sm text-slate-500">{t('common.loading')}</div>
                ) : rows.length === 0 ? (
                    <div className="px-6 py-14 text-sm text-slate-500">{t('orders.partialNoItems')}</div>
                ) : (
                    <>
                        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    checked={allSelectableSelected}
                                    disabled={selectableRows.length === 0}
                                    onChange={(e) => toggleSelectAll(e.target.checked)}
                                />
                                {t('orders.partialSelectAllRemaining') || 'Qolganlarini tanlash'}
                                {selectableRows.length > 0 && (
                                    <span className="rounded-full bg-slate-200 px-1.5 text-[10px] tabular-nums text-slate-700">
                                        {selectableRows.length}
                                    </span>
                                )}
                            </label>
                        <div className="flex items-center gap-2">
                                {summary.shipped > 0 ? (
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void clearErroneousShipProgress()}
                                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                        title="Agar chiqim qilmagan bo‘lsangiz — noto‘g‘ri yozuvlarni tozalaydi"
                                    >
                                        Noto‘g‘ri chiqimni tozalash
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => toggleSelectAll(true)}
                                    disabled={selectableRows.length === 0}
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                    {t('orders.partialSelectMax') || "Maksimalni qo'yish"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toggleSelectAll(false)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                >
                                    {t('orders.partialClear') || 'Tozalash'}
                                </button>
                            </div>
                        </div>
                        <div className="max-h-[56vh] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 z-10">
                                    <tr>
                                        <th className="px-4 py-3 text-center w-12">{t('orders.partialSelectCol') || 'Tanla'}</th>
                                        <th className="px-5 py-3 text-left">{t('orders.products')}</th>
                                        <th className="px-4 py-3 text-right">{t('orders.qtyLabel')}</th>
                                        <th className="px-4 py-3 text-right">{t('orders.partialShippedCol')}</th>
                                        <th className="px-4 py-3 text-right">{t('orders.partialRemainingCol')}</th>
                                        <th className="px-5 py-3 text-right">{t('orders.partialShipQtyLabel')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => {
                                        const done = row.remaining_qty <= 0
                                        return (
                                            <tr
                                                key={row.key}
                                                className={`border-t border-slate-100 ${
                                                    done
                                                        ? 'bg-emerald-50/50 opacity-80'
                                                        : row.selected
                                                          ? 'bg-emerald-50/70'
                                                          : 'hover:bg-emerald-50/40'
                                                }`}
                                            >
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                        checked={!!row.selected && !done}
                                                        disabled={done || saving}
                                                        onChange={(e) =>
                                                            toggleRowSelected(row.key, e.target.checked)
                                                        }
                                                        aria-label={row.product_name}
                                                    />
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-start gap-2.5 min-w-0">
                                                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                                            {row.image_url ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    src={row.image_url}
                                                                    alt=""
                                                                    className="h-full w-full object-cover object-center"
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-slate-400">
                                                                    —
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-900 leading-snug">
                                                                {row.product_name}
                                                            </p>
                                                            <p className="text-xs text-slate-500 mt-0.5">
                                                                {row.size || '—'} {row.color ? `• ${row.color}` : ''}
                                                                {done ? (
                                                                    <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                                                        <CheckCircle2 size={10} />
                                                                        {t('orders.partialLineDone') || 'Chiqqan'}
                                                                    </span>
                                                                ) : null}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">{row.ordered_qty}</td>
                                                <td className="px-4 py-3 text-right font-mono text-emerald-700">
                                                    {row.shipped_qty}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700">
                                                    {row.remaining_qty}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        autoComplete="off"
                                                        disabled={done || saving}
                                                        value={row.ship_qty === 0 || row.ship_qty === '0' ? '0' : String(row.ship_qty ?? '')}
                                                        onChange={(e) => {
                                                            const raw = e.target.value.replace(/[^\d]/g, '')
                                                            const n = Math.max(
                                                                0,
                                                                Math.min(
                                                                    row.remaining_qty,
                                                                    Math.floor(Number(raw || 0))
                                                                )
                                                            )
                                                            setRows((prev) =>
                                                                prev.map((x) =>
                                                                    x.key === row.key
                                                                        ? {
                                                                              ...x,
                                                                              ship_qty: n,
                                                                              selected: n > 0,
                                                                          }
                                                                        : x
                                                                )
                                                            )
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        className="no-spinner w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-mono font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                                                    />
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50">
                            <p className="text-xs text-slate-500">
                                {t('orders.partialSelectedCount') || 'Tanlangan'}:{' '}
                                <span className="font-black text-emerald-700">{summary.selectedCount}</span>
                                {' · '}
                                {t('orders.partialShipQtyLabel')}:{' '}
                                <span className="font-black text-emerald-700">{summary.now}</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={saving}
                                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void submitPartialShipment()}
                                    disabled={saving || summary.now <= 0}
                                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    <CheckCircle2 size={16} />
                                    {saving
                                        ? '...'
                                        : summary.remainingAfter <= 0
                                          ? t('orders.partialCompleteFullAction') || t('orders.partialShipAction')
                                          : t('orders.partialShipAction')}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
