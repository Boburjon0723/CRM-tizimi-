'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { deductStockForCompletedOrder } from '@/services/inventoryService'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { parseOrderItemQty } from '../utils'
import {
    loadOrderShippedMap,
    orderItemShipKey,
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
        ;(async () => {
            try {
                const shippedMap = await loadOrderShippedMap(order.id)
                if (cancelled) return
                setRows(buildPartialShipRows(order, products, shippedMap))
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
    }, [order?.id, order, products, onClose, showAlert, t])

    const summary = useMemo(() => {
        let ordered = 0
        let shipped = 0
        let remaining = 0
        let now = 0
        for (const r of rows) {
            ordered += Number(r.ordered_qty) || 0
            shipped += Number(r.shipped_qty) || 0
            remaining += Number(r.remaining_qty) || 0
            now += Number(r.ship_qty) || 0
        }
        const nextShipped = shipped + now
        const percent = ordered > 0 ? Math.min(100, Math.round((nextShipped / ordered) * 100)) : 0
        return { ordered, shipped, remaining, now, percent }
    }, [rows])

    async function submitPartialShipment() {
        if (!order) return
        const toShip = rows
            .map((r) => ({
                product_id: r.product_id,
                color: r.color || null,
                quantity: Math.max(0, Math.min(r.remaining_qty, parseOrderItemQty(r.ship_qty || 0))),
                product_name: r.product_name,
                available_qty: r.available_qty,
            }))
            .filter((r) => r.quantity > 0)
        if (!toShip.length) {
            await showAlert(t('orders.partialNothingToShip'), { variant: 'warning' })
            return
        }
        const availabilityIssues = toShip.filter(
            (r) => Number(r.quantity) > Number(r.available_qty || 0)
        )
        if (availabilityIssues.length) {
            const msg = availabilityIssues
                .map(
                    (r) =>
                        `${r.product_name}: ${t('orders.stockAvailableLabel')} ${r.available_qty}, ${t('orders.partialShipQtyLabel')} ${r.quantity}`
                )
                .join('\n')
            const ok = await showConfirm(`${msg}\n\n${t('orders.stockWarningConfirm')}`, {
                title: t('orders.stockWarningTitle'),
                variant: 'warning',
            })
            if (!ok) return
        }
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
            await supabase.from('orders').update({ status: 'pending' }).eq('id', order.id)
            showToast(t('orders.partialSavedOk'), { type: 'success' })
            onClose()
            await onSuccess?.()
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
                        </p>
                    </div>
                </div>
                {loading ? (
                    <div className="px-6 py-14 text-sm text-slate-500">{t('common.loading')}</div>
                ) : (
                    <>
                        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setRows((prev) =>
                                        prev.map((r) => ({
                                            ...r,
                                            ship_qty: Math.min(r.remaining_qty, r.available_qty),
                                        }))
                                    )
                                }
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                            >
                                Maksimalni qo&apos;yish
                            </button>
                            <button
                                type="button"
                                onClick={() => setRows((prev) => prev.map((r) => ({ ...r, ship_qty: 0 })))}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                            >
                                Tozalash
                            </button>
                        </div>
                        <div className="max-h-[56vh] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 z-10">
                                    <tr>
                                        <th className="px-5 py-3 text-left">{t('orders.products')}</th>
                                        <th className="px-4 py-3 text-right">{t('orders.qtyLabel')}</th>
                                        <th className="px-4 py-3 text-right">{t('orders.partialShippedCol')}</th>
                                        <th className="px-4 py-3 text-right">{t('orders.partialRemainingCol')}</th>
                                        <th className="px-4 py-3 text-right">{t('orders.stockAvailableLabel')}</th>
                                        <th className="px-5 py-3 text-right">{t('orders.partialShipQtyLabel')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.key} className="border-t border-slate-100 hover:bg-emerald-50/40">
                                            <td className="px-5 py-3">
                                                <p className="font-semibold text-slate-900">{row.product_name}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {row.size || '—'} {row.color ? `• ${row.color}` : ''}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">{row.ordered_qty}</td>
                                            <td className="px-4 py-3 text-right font-mono text-emerald-700">
                                                {row.shipped_qty}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700">
                                                {row.remaining_qty}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">{row.available_qty}</td>
                                            <td className="px-5 py-3 text-right">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={row.remaining_qty}
                                                    step={1}
                                                    value={row.ship_qty}
                                                    onChange={(e) => {
                                                        const n = Math.max(
                                                            0,
                                                            Math.min(
                                                                row.remaining_qty,
                                                                Math.floor(Number(e.target.value) || 0)
                                                            )
                                                        )
                                                        setRows((prev) =>
                                                            prev.map((x) =>
                                                                x.key === row.key ? { ...x, ship_qty: n } : x
                                                            )
                                                        )
                                                    }}
                                                    className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-mono font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50">
                            <p className="text-xs text-slate-500">
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
                                    <Truck size={16} />
                                    {saving ? '...' : t('orders.partialShipAction')}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
