'use client'

import React, { memo } from 'react'
import { Trash2, Plus, Check, AlertCircle, Layers, Square, RotateCcw } from 'lucide-react'
import {
    formatUsd,
    computeOrderLineSubtotal,
    labelColorCanonical,
    parseOrderItemQty,
    displayProductName,
} from '../utils'

function OrderFormLineRow({
    row,
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
}) {
    if (row.type === 'catHeader') {
        return (
            <tr key={row.key} className="bg-emerald-50/90">
                <td colSpan={formColumnCount} className="px-3 py-2 text-sm font-bold text-emerald-900 border-t border-emerald-100">
                    {t('products.category')}: {row.label}
                </td>
            </tr>
        )
    }

    if (row.type === 'catSubtotal') {
        return (
            <tr key={row.key} className="bg-indigo-50/80">
                <td colSpan={subtotalLeftCols} className="px-3 py-2 text-right text-sm font-bold text-indigo-900">
                    {t('orders.categorySubtotal')}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm font-bold text-indigo-950">
                    ${formatUsd(row.amount)}
                </td>
                <td className="px-3 py-2 bg-indigo-50/80" />
            </tr>
        )
    }

    const line = row.line
    const isMatrix = line.colorChoices?.length > 1
    const qtySum = isMatrix
        ? line.colorChoices.reduce((s, c) => s + parseOrderItemQty(line.colorQtyByColor?.[c] ?? '0'), 0)
        : parseOrderItemQty(line.quantity)
    const sub = computeOrderLineSubtotal(line)
    const prodRow = line.product_id ? productsById.get(String(line.product_id)) : null
    const lineIsKg = Boolean(prodRow?.is_kg)
    const stockNum = prodRow?.stock != null && prodRow.stock !== '' ? Number(prodRow.stock) : null
    const stockWarn = stockNum != null && Number.isFinite(stockNum) && stockNum >= 0 && qtySum > stockNum

    return (
        <tr className="bg-white group hover:bg-gray-50/50 transition-colors">
            <td className="px-3 py-2 align-top">
                <input
                    ref={line.id === firstCodeLineId ? firstModelCodeRef : undefined}
                    type="text"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder={t('orders.modelCodePlaceholder')}
                    value={line.codeInput}
                    onChange={(e) =>
                        updateOrderLine(line.id, {
                            codeInput: e.target.value,
                            resolveError: '',
                            variants: [],
                            colorChoices: [],
                            colorQtyByColor: {},
                            product_id: null,
                            product_name: '',
                            product_price: 0,
                            color: '',
                            image_url: '',
                            local_note: '',
                            readyForSort: false,
                        })
                    }
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            resolveOrderLine(line.id)
                        }
                    }}
                />
                {line.resolveError && (
                    <p className="text-[10px] text-red-600 mt-0.5 leading-tight">{line.resolveError}</p>
                )}
            </td>
            <td className="px-3 py-2 align-top">
                <button
                    type="button"
                    onClick={() => resolveOrderLine(line.id)}
                    className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 transition-colors text-white rounded-lg text-[11px] font-bold whitespace-nowrap shadow-sm"
                >
                    {t('orders.codeFetchButton')}
                </button>
            </td>
            {tableConfig.showFormImageColumn && (
                <td className="px-3 py-2 align-top">
                    {line.image_url ? (
                        <div
                            className={`rounded-lg bg-white flex items-center justify-center overflow-hidden ring-1 ring-gray-200/60 shadow-sm ${formImageCellClass}`}
                        >
                            <img
                                src={line.image_url}
                                alt=""
                                className="max-h-full max-w-full object-contain mix-blend-multiply"
                            />
                        </div>
                    ) : (
                        <div
                            className={`rounded-lg border border-dashed border-gray-200/90 bg-white shadow-sm ${formImageCellClass}`}
                        />
                    )}
                </td>
            )}
            <td className="px-3 py-2 align-top text-[13px] text-gray-800 leading-snug">
                {line.product_id ? (
                    <>
                        <span className="font-semibold block mt-1">{line.product_name}</span>
                        <button
                            type="button"
                            onClick={() => updateOrderLine(line.id, { keepSeparate: !line.keepSeparate })}
                            className={`mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                line.keepSeparate
                                    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            title={t('orders.keepSeparateLabel') || 'Keep this line separate'}
                        >
                            {line.keepSeparate ? <Layers className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                            {t('orders.keepSeparateShort')}
                        </button>
                    </>
                ) : (
                    <span className="text-gray-400 block mt-1">—</span>
                )}
            </td>
            <td className="px-3 py-2 align-top min-w-[8rem] max-w-[16rem]">
                <textarea
                    rows={2}
                    className="w-full min-h-[2.75rem] px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={t('orders.lineItemNotePlaceholder')}
                    value={line.local_note ?? ''}
                    onChange={(e) => updateOrderLine(line.id, { local_note: e.target.value })}
                />
            </td>
            {tableConfig.showFormColorColumn && (
                <td className="px-3 py-2 align-top text-sm min-w-[200px]">
                    {line.variants?.length >= 2 ? (
                        <select
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[13px] bg-white outline-none focus:ring-2 focus:ring-blue-500"
                            value={line.product_id ? String(line.product_id) : ''}
                            onChange={(e) => applyVariantToLine(line.id, e.target.value)}
                        >
                            <option value="">{t('orders.pickColorPlaceholder')}</option>
                            {line.variants.map((p) => (
                                <option key={String(p.id)} value={String(p.id)}>
                                    {(p.color && labelColorCanonical(p.color, productColors, language)) ||
                                        displayProductName(p) ||
                                        String(p.id).slice(0, 8)}
                                </option>
                            ))}
                        </select>
                    ) : line.colorChoices?.length >= 1 ? (
                        <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50/80 p-2 shadow-inner">
                            <p className="text-[11px] font-bold text-gray-600 uppercase tracking-tight">
                                {t('orders.colorQtyMatrixTitle')}
                            </p>
                            <div className="space-y-1.5">
                                {line.colorChoices.map((c) => (
                                    <div key={c} className="flex items-center gap-2 justify-between">
                                        <span className="truncate max-w-[120px] font-medium text-gray-800 text-[13px]">
                                            {labelColorCanonical(c, productColors, language)}
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-14 px-1.5 py-0.5 border border-gray-200 rounded-md text-[13px] font-bold text-right tabular-nums focus:ring-1 focus:ring-blue-500"
                                            step="any"
                                            value={line.colorQtyByColor?.[c] ?? '0'}
                                            onChange={(e) => updateOrderLineColorQty(line.id, c, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <span className="text-gray-400 italic text-xs">-</span>
                    )}
                </td>
            )}
            <td className="px-3 py-2 align-top pt-2">
                <div className="flex flex-col gap-1 items-end">
                    <input
                        type="number"
                        min="0"
                        step="any"
                        className="w-20 px-1.5 py-1 border border-gray-200 rounded-lg text-sm text-right tabular-nums font-bold focus:ring-2 focus:ring-blue-500"
                        value={line.product_price}
                        onChange={(e) => updateOrderLine(line.id, { product_price: e.target.value })}
                    />
                    {line.product_id && (
                        <button
                            type="button"
                            onClick={() => {
                                const prod = productsById.get(String(line.product_id))
                                if (prod) {
                                    updateOrderLine(line.id, { product_price: Number(prod.sale_price) || 0 })
                                }
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold"
                            title={t('orders.resetPrice') || 'Asl narxga qaytarish'}
                        >
                            <RotateCcw size={10} />
                            {t('orders.resetPrice')}
                        </button>
                    )}
                </div>
            </td>
            <td className="px-3 py-2 align-top pt-2">
                {!isMatrix ? (
                    <input
                        type="number"
                        min="0.001"
                        step="any"
                        className="w-16 px-1.5 py-1 border border-gray-200 rounded-lg text-sm text-right tabular-nums font-bold focus:ring-2 focus:ring-blue-500"
                        value={line.quantity}
                        onChange={(e) => updateOrderLine(line.id, { quantity: e.target.value })}
                    />
                ) : (
                    <div className="text-center pt-1">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 rounded-full text-xs font-bold tabular-nums">
                            {qtySum}
                        </span>
                    </div>
                )}
                <span
                    className={`block text-center text-[10px] font-bold mt-0.5 ${lineIsKg ? 'text-blue-700' : 'text-gray-500'}`}
                >
                    {lineIsKg ? 'kg' : 'dona'}
                </span>
                {stockWarn && (
                    <div className="flex items-center justify-center gap-1 mt-1 text-red-600" title="Omborda kam!">
                        <AlertCircle size={14} />
                        <span className="text-[10px] font-bold">-{qtySum - stockNum}</span>
                    </div>
                )}
            </td>
            <td className="px-3 py-2 align-top text-[13px] font-mono font-bold text-gray-900 pt-3 text-right tabular-nums">
                ${formatUsd(sub)}
            </td>
            <td className="px-3 py-2 align-top pt-2 text-center">
                <div className="flex flex-col gap-1 items-center">
                    <button
                        type="button"
                        onClick={() => removeOrderLine(line.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title={t('common.delete')}
                    >
                        <Trash2 size={16} />
                    </button>
                    {line.product_id && !line.readyForSort && (
                        <button
                            type="button"
                            onClick={() => commitLineToSortOrder(line.id)}
                            className="p-1.5 text-blue-500 hover:text-blue-700 transition-colors"
                            title="Tayyor (Tartiblash uchun)"
                        >
                            <Check size={18} />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    )
}

function lineRowPropsAreEqual(prev, next) {
    if (prev.row !== next.row) return false
    if (prev.tableConfig !== next.tableConfig) return false
    if (prev.formColumnCount !== next.formColumnCount) return false
    if (prev.subtotalLeftCols !== next.subtotalLeftCols) return false
    if (prev.firstCodeLineId !== next.firstCodeLineId) return false
    if (prev.language !== next.language) return false
    return true
}

export default memo(OrderFormLineRow, lineRowPropsAreEqual)
