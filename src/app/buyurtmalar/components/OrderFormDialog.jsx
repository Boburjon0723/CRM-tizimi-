'use client'

import React, { memo, useMemo, useState } from 'react'
import { Save, ScanLine, Plus } from 'lucide-react'
import { formatUsd } from '../utils'

function formatKg(n) {
    const r = Math.round((Number(n) || 0) * 1000) / 1000
    return r.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

function formatWeightSpoken(kg, tonLabel) {
    const n = Math.round((Number(kg) || 0) * 1000) / 1000
    if (n >= 1000) {
        const tons = Math.floor(n / 1000)
        const rest = Math.round((n - tons * 1000) * 1000) / 1000
        if (rest <= 0) return `${tons} ${tonLabel}`
        return `${tons} ${tonLabel} ${formatKg(rest)} kg`
    }
    return `${formatKg(n)} kg`
}
import OrderFormCustomerFields from './OrderFormCustomerFields'
import OrderFormLineRow from './OrderFormLineRow'

function OrderFormDialog({
    t,
    isAdding,
    editId,
    orderFormPanelRef,
    handleSubmit,
    form,
    setForm,
    customers,
    tableConfig,
    setTableConfig,
    orderFormTableRows,
    firstCodeLineId,
    firstModelCodeRef,
    updateOrderLine,
    resolveOrderLine,
    applyVariantToLine,
    updateOrderLineColorQty,
    removeOrderLine,
    commitLineToSortOrder,
    addOrderLine,
    isSavingOrder,
    handleCancel,
    productColors,
    language,
    productsById,
    grandTotal,
    weightTotals,
}) {
    const [weightAllowancePct, setWeightAllowancePct] = useState('10')
    const [manualBoxCount, setManualBoxCount] = useState('')
    const [manualBoxKg, setManualBoxKg] = useState('')
    if (!isAdding) return null

    const formImageCellClass = 'w-10 h-10 sm:w-12 sm:h-12'
    const formColumnCount = 8 + (tableConfig.showFormImageColumn ? 1 : 0) + (tableConfig.showFormColorColumn ? 1 : 0)
    const subtotalLeftCols = 6 + (tableConfig.showFormImageColumn ? 1 : 0) + (tableConfig.showFormColorColumn ? 1 : 0)

    const lineRowProps = useMemo(
        () => ({
            formColumnCount,
            subtotalLeftCols,
            tableConfig,
            formImageCellClass,
            t,
            language,
            productColors,
            productsById,
            firstCodeLineId,
            firstModelCodeRef,
            updateOrderLine,
            resolveOrderLine,
            applyVariantToLine,
            updateOrderLineColorQty,
            removeOrderLine,
            commitLineToSortOrder,
        }),
        [
            formColumnCount,
            subtotalLeftCols,
            tableConfig,
            t,
            language,
            productColors,
            productsById,
            firstCodeLineId,
            firstModelCodeRef,
            updateOrderLine,
            resolveOrderLine,
            applyVariantToLine,
            updateOrderLineColorQty,
            removeOrderLine,
            commitLineToSortOrder,
        ]
    )

    const needsManualMaster = Boolean(weightTotals?.needsManualMaster)
    const manualBoxCountN = needsManualMaster
        ? Math.max(0, Math.floor(Number(String(manualBoxCount).replace(',', '.')) || 0))
        : 0
    const productBoxKg = typeof weightTotals?.uncertainBoxKg === 'number' ? weightTotals.uncertainBoxKg : null
    const manualBoxKgN = productBoxKg != null ? productBoxKg : Number(String(manualBoxKg).replace(',', '.'))
    const manualTare = manualBoxCountN > 0 && Number.isFinite(manualBoxKgN) && manualBoxKgN > 0
        ? manualBoxCountN * manualBoxKgN
        : 0

    return (
        <div
            ref={orderFormPanelRef}
            className={`bg-white p-6 rounded-2xl shadow-md mb-8 fade-in scroll-mt-4 ${
                editId
                    ? 'border-2 border-blue-500 ring-2 ring-blue-200 shadow-lg shadow-blue-500/10'
                    : 'border border-gray-100'
            }`}
        >
            <h3 className="text-xl font-bold text-gray-800 mb-2">
                {editId ? t('orders.editOrder') : t('orders.newOrder')}
            </h3>
            {editId && (
                <p className="text-sm text-gray-600 mb-6 leading-relaxed border-l-4 border-blue-500 pl-3 py-1 bg-blue-50/30 rounded-r">
                    {t('orders.editOrderLinesHint')}
                </p>
            )}
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                    <OrderFormCustomerFields t={t} form={form} setForm={setForm} customers={customers} />

                    <div className="space-y-3 md:col-span-2 lg:col-span-3">
                        <label className="block text-sm font-bold text-gray-700">{t('common.products')}</label>
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span>{t('orders.orderLinesIntro')}</span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 font-medium">
                                    <ScanLine size={12} />
                                    {t('orders.barcodeHint')}
                                </span>
                            </div>
                            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-snug">
                                {t('orders.modelCodeFormatHint')}
                            </p>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                            <div className="text-xs font-bold text-gray-700 mb-2">Jadval sozlamalari</div>
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                                <label className="flex items-center gap-2">
                                    <span className="text-gray-600">Rasm hajmi</span>
                                    <select
                                        value={tableConfig.imageSize}
                                        onChange={(e) =>
                                            setTableConfig((prev) => ({ ...prev, imageSize: e.target.value }))
                                        }
                                        className="px-2 py-1 border border-gray-200 rounded-md bg-white outline-none"
                                    >
                                        <option value="sm">Kichik</option>
                                        <option value="md">O&apos;rta</option>
                                        <option value="lg">Katta</option>
                                    </select>
                                </label>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={tableConfig.showFormImageColumn}
                                        onChange={(e) =>
                                            setTableConfig((prev) => ({
                                                ...prev,
                                                showFormImageColumn: e.target.checked,
                                            }))
                                        }
                                        className="rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>Rasm ustuni</span>
                                </label>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={tableConfig.showFormColorColumn}
                                        onChange={(e) =>
                                            setTableConfig((prev) => ({
                                                ...prev,
                                                showFormColorColumn: e.target.checked,
                                            }))
                                        }
                                        className="rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>Rang ustuni</span>
                                </label>
                            </div>
                        </div>

                        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-base min-w-[720px]">
                                    <thead>
                                        <tr className="bg-gray-50 text-left text-sm uppercase text-gray-500 font-bold">
                                            <th className="px-3 py-2 w-36">{t('orders.modelCode')}</th>
                                            <th className="px-3 py-2 w-28" />
                                            {tableConfig.showFormImageColumn && (
                                                <th className="px-3 py-2 w-28">Rasm</th>
                                            )}
                                            <th className="px-3 py-2">{t('orders.lineProduct')}</th>
                                            <th className="px-3 py-2 min-w-[8rem] max-w-[16rem]">
                                                {t('orders.lineItemNote')}
                                            </th>
                                            {tableConfig.showFormColorColumn && (
                                                <th className="px-3 py-2 min-w-[200px]">{t('orders.lineColor')}</th>
                                            )}
                                            <th className="px-3 py-2 w-24">{t('orders.lineUnitPrice')}</th>
                                            <th className="px-3 py-2 w-24">
                                                <span className="block">{t('orders.quantity')}</span>
                                                <span className="block text-[9px] font-normal normal-case text-gray-400 leading-tight">
                                                    dona / kg
                                                </span>
                                            </th>
                                            <th className="px-3 py-2 w-24">{t('orders.lineSubtotal')}</th>
                                            <th className="px-3 py-2 w-10 text-center">
                                                <Plus size={14} className="inline opacity-40" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {orderFormTableRows.map((row) => (
                                            <OrderFormLineRow key={row.key} row={row} {...lineRowProps} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                            <button
                                type="button"
                                onClick={addOrderLine}
                                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                            >
                                <Plus size={18} />
                                {t('orders.addLine')}
                            </button>

                            <div className="flex flex-wrap items-center gap-3">
                                {(() => {
                                    const boxCount = manualBoxCountN
                                    const packed = (weightTotals?.gross || 0) + manualTare
                                    const showGoods = Boolean(weightTotals?.any)
                                    const hasExact = (weightTotals?.exactGross || 0) > 0 || (weightTotals?.exactMasters || 0) > 0
                                    const exactOnly = hasExact && !needsManualMaster
                                    const totalBoxes = (weightTotals?.exactMasters || 0) + (needsManualMaster ? boxCount : 0)
                                    const showTotalBoxes = exactOnly || (needsManualMaster && boxCount > 0)
                                    return showGoods || manualTare > 0 ? (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
                                        <p className="text-[10px] font-bold uppercase tracking-tight text-slate-500">
                                            {t('orders.weightHint')}
                                        </p>
                                        {hasExact ? (
                                            <p className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums">
                                                <span className="mr-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
                                                    {t('orders.weightExact')}
                                                </span>
                                                {t('orders.weightNetto')} {formatKg(weightTotals.exactNetto)} kg
                                                <span className="mx-2 text-slate-300">·</span>
                                                {t('orders.weightBrutto')} {formatKg(weightTotals.exactSmall)} kg
                                                <span className="mx-2 text-slate-300">·</span>
                                                {t('orders.weightMaster')} {weightTotals.exactMasters}
                                                <span className="mx-2 text-slate-300">·</span>
                                                {t('orders.weightGross')} {formatWeightSpoken(weightTotals.exactGross, t('orders.weightTon'))}
                                            </p>
                                        ) : null}
                                        {needsManualMaster ? (
                                            <p className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums">
                                                <span className="mr-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 ring-1 ring-amber-200">
                                                    {t('orders.weightUncertain')}
                                                </span>
                                                {t('orders.weightBrutto')} {formatKg(weightTotals.uncertainSmall || 0)} kg
                                                <span className="mx-2 text-slate-300">·</span>
                                                {t('orders.weightMaster')} {boxCount}
                                                <span className="mx-2 text-slate-300">·</span>
                                                {t('orders.weightGross')} {formatWeightSpoken((weightTotals.uncertainSmall || 0) + manualTare, t('orders.weightTon'))}
                                            </p>
                                        ) : null}
                                        {showTotalBoxes ? (
                                            <p className="mt-1 font-mono text-sm font-bold text-emerald-800 tabular-nums">
                                                {t('orders.totalMasterBoxes')}: {totalBoxes}
                                            </p>
                                        ) : null}
                                        {(hasExact && needsManualMaster) || manualTare > 0 ? (
                                            <p className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums">
                                                {t('orders.weightGross')} {formatWeightSpoken(packed, t('orders.weightTon'))}
                                            </p>
                                        ) : null}
                                    </div>
                                    ) : null
                                })()}
                                {(() => {
                                    const base = (weightTotals?.gross || 0) + manualTare
                                    const pct = Number(String(weightAllowancePct).replace(',', '.'))
                                    const extra = Number.isFinite(pct) && pct > 0 && base > 0 ? base * (pct / 100) : 0
                                    return (
                                        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 shadow-sm max-w-sm">
                                            {needsManualMaster ? (
                                                <>
                                                    <div className="flex flex-wrap items-end gap-2">
                                                        <label className="text-xs font-bold text-amber-950">
                                                            {t('orders.manualMasterCount')}
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                value={manualBoxCount}
                                                                onChange={(e) => setManualBoxCount(e.target.value)}
                                                                placeholder="0"
                                                                className="mt-1 block w-20 rounded-lg border border-amber-300 bg-white px-2 py-1 text-right font-mono text-sm"
                                                            />
                                                        </label>
                                                        {productBoxKg != null ? (
                                                            <p className="pb-1 text-xs font-bold text-amber-950 tabular-nums">
                                                                {t('orders.manualMasterKg')}: {formatKg(productBoxKg)}
                                                            </p>
                                                        ) : (
                                                        <label className="text-xs font-bold text-amber-950">
                                                            {t('orders.manualMasterKg')}
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.001"
                                                                value={manualBoxKg}
                                                                onChange={(e) => setManualBoxKg(e.target.value)}
                                                                placeholder="1.2"
                                                                className="mt-1 block w-24 rounded-lg border border-amber-300 bg-white px-2 py-1 text-right font-mono text-sm"
                                                            />
                                                        </label>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 text-[11px] leading-snug text-amber-800/80">{t('orders.manualMasterHint')}</p>
                                                </>
                                            ) : null}
                                            <label className="mt-2 flex items-center gap-2 text-sm font-bold text-amber-950">
                                                {t('orders.weightAllowance')}
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={weightAllowancePct}
                                                    onChange={(e) => setWeightAllowancePct(e.target.value)}
                                                    className="w-16 rounded-lg border border-amber-300 bg-white px-2 py-1 text-right font-mono"
                                                />
                                                <span>%</span>
                                            </label>
                                            {extra > 0 ? (
                                                <p className="mt-1 font-mono text-sm font-bold text-amber-950 tabular-nums">
                                                    {t('orders.weightAround')}: {formatWeightSpoken(base, t('orders.weightTon'))}
                                                    {' – '}
                                                    {formatWeightSpoken(base + extra, t('orders.weightTon'))}
                                                </p>
                                            ) : (
                                                <p className="mt-1 text-xs text-amber-800/80">{t('orders.weightAllowanceNeed')}</p>
                                            )}
                                        </div>
                                    )
                                })()}
                                <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 flex items-center gap-4 shadow-sm">
                                    <span className="text-sm font-bold text-blue-700 tracking-tight">
                                        {t('orders.grandTotal')}:
                                    </span>
                                    <span className="text-2xl font-bold text-blue-900 font-mono tabular-nums">
                                        ${formatUsd(grandTotal)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 md:col-span-2 lg:col-span-3">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">{t('orders.status')}</label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm bg-white"
                            >
                                <option value="new">{t('orders.statusNew')}</option>
                                <option value="pending">{t('orders.statusProcessing')}</option>
                                <option value="completed">{t('orders.statusCompleted')}</option>
                                <option value="cancelled">{t('orders.statusCancelled')}</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">{t('orders.source')}</label>
                            <select
                                value={form.source}
                                onChange={(e) => setForm({ ...form, source: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm bg-white"
                            >
                                <option value="dokon">{t('orders.adminPanel')}</option>
                                <option value="website">{t('orders.website')}</option>
                                <option value="website_optom">Optom sayt</option>
                                <option value="website_chakana">Chakana sayt</option>
                                <option value="telefon">{t('orders.sourcePhone')}</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-8 md:col-span-2 lg:col-span-3">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-all"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isSavingOrder}
                            className={`flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl shadow-lg shadow-blue-600/30 font-bold transition-all ${
                                isSavingOrder
                                    ? 'opacity-70 cursor-not-allowed pointer-events-none'
                                    : 'hover:bg-blue-700 hover:shadow-blue-600/40'
                            }`}
                        >
                            <Save size={20} />
                            {isSavingOrder ? t('common.loading') : t('common.save')}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    )
}

export default memo(OrderFormDialog)
