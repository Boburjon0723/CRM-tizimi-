'use client'

import React, { memo } from 'react'
import {
    ChevronUp,
    ChevronDown,
    FileText,
    Receipt,
    List,
    Copy,
    Edit,
    Trash2,
    RotateCcw,
    UserPlus,
    PackageCheck,
    Printer,
    PackageOpen,
} from 'lucide-react'
import {
    normalizeOrderItemsForList,
    dedupeOrderItemsKeepNewest,
    labelColorCanonical,
    orderItemLineNoteText,
    formatUsd,
    normalizeStatusForSelect,
    ORDER_LIST_ITEMS_PREVIEW,
    orderItemQtyDisplay,
    orderSourceDisplay,
    filterOrderItemsByCategoryLabel,
    sumOrderItemsQty,
    formatOrderQtyPlain,
} from '../utils'

const formImageCellClass = 'w-8 h-8 sm:w-9 sm:h-9'

function OrderTableRow({
    item,
    t,
    ordersListView,
    isMergeSelected,
    onToggleMerge,
    language,
    products,
    productColors,
    isExpanded,
    onToggleExpand,
    handleStatusChange,
    handlePrintOrder,
    handlePrintShippedPortion,
    handlePrintRemainingPortion,
    handleDuplicateOrder,
    handleEdit,
    handleDelete,
    handleRestoreOrder,
    handleUnarchiveOrder,
    handlePermanentDelete,
    handleLinkCustomer,
    handleOpenPartialShip,
    filterCategory = 'all',
}) {
    const itemStatus = normalizeStatusForSelect(item.status)
    const fulfillment = item.fulfillment
    // Status tugallangan bo‘lsa «Qisman chiqqan» ko‘rsatilmaydi (chiqim qoldig‘i alohida sinxronlanadi)
    const isPartial = itemStatus !== 'completed' && fulfillment?.state === 'partial'
    const isFullShipped =
        fulfillment?.state === 'full' ||
        (itemStatus === 'completed' && (fulfillment?.ordered || 0) > 0)
    const canPartialShip =
        ordersListView === 'active' &&
        itemStatus !== 'cancelled' &&
        itemStatus !== 'completed'
    const canPrintShipped =
        Number(fulfillment?.shipped) > 0 && itemStatus !== 'cancelled'
    const canPrintRemaining =
        Number(fulfillment?.remaining) > 0 && itemStatus !== 'cancelled'

    const categoryActive = filterCategory && filterCategory !== 'all'
    const listItemsRaw = normalizeOrderItemsForList(
        dedupeOrderItemsKeepNewest(item.order_items || [], products)
    )
    const listItems = categoryActive
        ? filterOrderItemsByCategoryLabel(listItemsRaw, filterCategory, '—', products)
        : listItemsRaw

    return (
        <tr
            id={`order-row-${item.id}`}
            className="hover:bg-blue-50/30 transition-colors scroll-mt-24"
        >
            {(ordersListView === 'active' || ordersListView === 'archive') && (
                <td className="px-1.5 py-2.5 sm:px-2 sm:py-3 align-top text-center">
                    <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-0.5"
                        checked={isMergeSelected}
                        onChange={onToggleMerge}
                        aria-label={t('orders.mergeSelectColumn')}
                    />
                </td>
            )}
            <td className="px-2 py-2.5 sm:px-2.5 sm:py-3 align-top">
                {item.order_number ? (
                    <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded inline-block mb-0.5">
                        № {item.order_number}
                    </div>
                ) : (
                    <div className="font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded inline-block mb-0.5">
                        #{String(item.id).slice(0, 8)}
                    </div>
                )}
                <div className="text-xs font-medium text-gray-700">
                    {new Date(item.created_at).toLocaleDateString(
                        language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US'
                    )}
                </div>
                {itemStatus === 'completed' && (item.completed_at || item.updated_at) ? (
                    <div
                        className="mt-0.5 inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5"
                        title={t('orders.completedAtTitle') || 'Chiqib ketgan sana'}
                    >
                        <span className="text-[8px] font-black uppercase tracking-wide text-emerald-800">
                            {t('orders.completedAtLabel') || 'Chiqqan'}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-900 tabular-nums">
                            {new Date(item.completed_at || item.updated_at).toLocaleDateString(
                                language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US'
                            )}
                        </span>
                    </div>
                ) : null}
                {item.order_number && (
                    <div
                        className="font-mono text-[9px] text-gray-400 mt-0.5"
                        title={String(item.id)}
                    >
                        #{String(item.id).slice(0, 8)}
                    </div>
                )}
            </td>
            <td className="px-2 py-2.5 sm:px-2.5 sm:py-3 font-medium text-gray-900 align-top min-w-0">
                <div className="font-bold text-sm leading-snug">{item.customer_name || item.customers?.name || t('common.unknown')}</div>
                <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                    {item.customer_phone || item.customers?.phone}
                </div>
                {item.note && (
                    <div className="text-[10px] text-amber-600 italic mt-0.5 bg-amber-50 px-1.5 py-0.5 rounded inline-block line-clamp-2 max-w-[14rem]">
                        {item.note}
                    </div>
                )}
            </td>
            <td className="px-2 py-2.5 sm:px-2.5 sm:py-3 text-gray-600 align-top min-w-0 max-w-md xl:max-w-xl 2xl:max-w-2xl">
                {listItems.length > 0 ? (
                    (() => {
                        const ois = listItems
                        const hasMore = ois.length > ORDER_LIST_ITEMS_PREVIEW
                        const visible = isExpanded ? ois : ois.slice(0, ORDER_LIST_ITEMS_PREVIEW)
                        const hiddenCount = ois.length - ORDER_LIST_ITEMS_PREVIEW
                        return (
                            <div className="space-y-0.5">
                                {visible.map((oi, idx) => (
                                    <div
                                        key={oi.id || idx}
                                        className="text-sm border-b border-gray-50 last:border-0 pb-0.5 last:pb-0"
                                    >
                                        <div className="flex items-start gap-1.5 min-w-0">
                                            {oi.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={oi.image_url}
                                                    alt=""
                                                    className={`${formImageCellClass} rounded object-cover object-center border border-gray-100 bg-gray-50 shrink-0`}
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <div
                                                    className={`${formImageCellClass} rounded border border-dashed border-gray-200 bg-gray-50 shrink-0 flex items-center justify-center text-[8px] text-gray-400`}
                                                >
                                                    —
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="font-semibold text-gray-900 truncate text-xs sm:text-sm leading-snug">
                                                    {oi.product_name || oi.products?.name || '—'}
                                                </div>
                                                <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-1.5 gap-y-0">
                                                    <span className="font-mono font-bold text-indigo-700">
                                                        {oi.size || '—'}
                                                    </span>
                                                    <span>
                                                        {orderItemQtyDisplay(oi, products)}
                                                    </span>
                                                    {oi.color ? (
                                                        <span>
                                                            {labelColorCanonical(
                                                                oi.color,
                                                                productColors,
                                                                language
                                                            )}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {orderItemLineNoteText(oi) ? (
                                                    <div className="text-[10px] text-amber-700 italic truncate">
                                                        {orderItemLineNoteText(oi)}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {hasMore && (
                                    <button
                                        type="button"
                                        onClick={onToggleExpand}
                                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600 hover:text-blue-700 mt-0.5"
                                    >
                                        {isExpanded ? (
                                            <>
                                                <ChevronUp size={12} className="shrink-0" />
                                                {t('orders.orderListCollapse')}
                                            </>
                                        ) : (
                                            <>
                                                <ChevronDown size={12} className="shrink-0" />
                                                {t('orders.orderListExpand')}
                                                <span className="font-normal text-gray-500">
                                                    ({t('orders.orderListHiddenCount').replace('{n}', String(hiddenCount))})
                                                </span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        )
                    })()
                ) : (
                    <span className="text-gray-400 italic text-xs">{t('orders.tableLineEmpty')}</span>
                )}
            </td>
            <td className="px-1.5 py-2.5 sm:px-2 sm:py-3 font-bold text-gray-900 font-mono align-top whitespace-nowrap tabular-nums text-sm">
                ${formatUsd(item.total)}
                <div
                    className="mt-0.5 text-[10px] font-bold text-indigo-700 font-sans"
                    title={t('orders.orderTotalQtyTitle') || 'Buyurtmadagi jami miqdor'}
                >
                    {t('orders.listTotalQty') || 'Miqdor'}: {formatOrderQtyPlain(sumOrderItemsQty(listItems))}
                </div>
            </td>
            <td className="px-1.5 py-2.5 sm:px-2 sm:py-3 align-top">
                <div className="flex flex-col gap-0.5 text-[10px]">
                    <span className="font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded inline-block text-center">
                        {item.payment_method_detail || t('orders.cash')}
                    </span>
                    {item.receipt_url && (
                        <a
                            href={item.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 hover:underline flex items-center justify-center gap-0.5 font-bold"
                        >
                            <FileText size={11} />
                            {t('orders.receiptLink')}
                        </a>
                    )}
                </div>
            </td>
            <td className="px-1.5 py-2.5 sm:px-2 sm:py-3 align-top">
                <div className="flex flex-col gap-1 items-stretch min-w-[5.5rem]">
                    <select
                        value={itemStatus}
                        onChange={(e) => handleStatusChange(item.id, e.target.value)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold border-0 cursor-pointer outline-none transition-colors ${
                            item.status === 'new' || item.status === 'Yangi'
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : item.status === 'pending' || item.status === 'Jarayonda'
                                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                  : item.status === 'completed' ||
                                      item.status === 'Tugallandi' ||
                                      item.status === 'Tugallangan'
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                    >
                        <option value="new">{t('orders.statusNew')}</option>
                        <option value="pending">{t('orders.statusProcessing')}</option>
                        <option value="completed">{t('orders.statusCompleted')}</option>
                        <option value="cancelled">{t('orders.statusCancelled')}</option>
                    </select>
                    {isPartial ? (
                        <div
                            className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-center"
                            title={`${t('orders.partialBadgePartialTitle') || 'Qisman chiqqan'}: ${fulfillment.shipped}/${fulfillment.ordered}`}
                        >
                            <div className="text-[9px] font-black uppercase tracking-wide text-amber-800">
                                {t('orders.partialBadgePartial') || 'Qisman chiqqan'}
                            </div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-amber-200">
                                <div
                                    className="h-full rounded-full bg-amber-500"
                                    style={{ width: `${fulfillment.percent || 0}%` }}
                                />
                            </div>
                            <div className="mt-0.5 font-mono text-[9px] font-bold tabular-nums text-amber-900">
                                {fulfillment.shipped}/{fulfillment.ordered} · {fulfillment.percent}%
                            </div>
                        </div>
                    ) : null}
                    {isFullShipped && itemStatus !== 'completed' ? (
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-center text-[9px] font-black uppercase tracking-wide text-emerald-800">
                            {t('orders.partialBadgeFull') || "To'liq chiqqan"}
                        </div>
                    ) : null}
                </div>
            </td>
            <td className="px-1.5 py-2.5 sm:px-2 sm:py-3 align-top">
                {(() => {
                    const src = orderSourceDisplay(item.source, t)
                    return (
                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md ${src.className}`}>
                            {src.label}
                        </span>
                    )
                })()}
            </td>
            <td className="px-1.5 py-2.5 sm:px-2 sm:py-3 text-right align-top">
                <div className="flex items-center justify-end gap-0.5 flex-wrap">
                    {ordersListView === 'active' ? (
                        <>
                            {canPartialShip ? (
                                <button
                                    type="button"
                                    onClick={() => handleOpenPartialShip?.(item)}
                                    className={`shrink-0 p-1 rounded-lg transition-colors ${
                                        isPartial
                                            ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200'
                                            : 'text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                    title={t('orders.partialShipShort') || 'Qisman tugallash'}
                                >
                                    <PackageCheck size={15} />
                                </button>
                            ) : null}
                            {canPrintShipped ? (
                                <button
                                    type="button"
                                    onClick={() => handlePrintShippedPortion?.(item, false)}
                                    className="shrink-0 p-1 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 ring-1 ring-cyan-200 rounded-lg transition-colors"
                                    title={
                                        t('orders.partialPrintShort') ||
                                        'Chiqqan qismni chop etish'
                                    }
                                >
                                    <Printer size={15} />
                                </button>
                            ) : null}
                            {canPrintRemaining ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handlePrintRemainingPortion?.(item, true)}
                                        className="shrink-0 p-1 text-amber-700 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200 rounded-lg transition-colors"
                                        title={
                                            t('orders.remainingPrintWithPrice') ||
                                            'Chiqmagan qismni narxli chop etish'
                                        }
                                    >
                                        <Receipt size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePrintRemainingPortion?.(item, false)}
                                        className="shrink-0 p-1 text-amber-700 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200 rounded-lg transition-colors"
                                        title={
                                            t('orders.remainingPrintWithoutPrice') ||
                                            'Chiqmagan qismni narxsiz chop etish'
                                        }
                                    >
                                        <PackageOpen size={15} />
                                    </button>
                                </>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => handlePrintOrder(item, true)}
                                className="shrink-0 p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title={t('orders.printWithPrices')}
                            >
                                <Receipt size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePrintOrder(item, false)}
                                className="shrink-0 p-1 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                title={t('orders.printNoPrices')}
                            >
                                <List size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleDuplicateOrder(item)}
                                className="shrink-0 p-1 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                title={`${t('orders.duplicateOrder')} — ${t('orders.duplicateOrderTitle')}`}
                            >
                                <Copy size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleLinkCustomer?.(item)}
                                className="shrink-0 p-1 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title={t('orders.linkCustomerTitle')}
                            >
                                <UserPlus size={15} />
                            </button>
                            <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-gray-200 sm:inline-block" />
                            <button
                                type="button"
                                onClick={() => handleEdit(item)}
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-blue-600 px-1.5 py-1 text-[10px] font-bold text-white shadow-sm shadow-blue-600/25 transition-colors hover:bg-blue-700"
                                title={t('orders.editOrder')}
                            >
                                <Edit size={13} className="shrink-0" />
                                <span className="hidden xl:inline">{t('common.edit')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="shrink-0 p-1 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                                title={t('orders.moveToTrashTitle')}
                            >
                                <Trash2 size={15} />
                            </button>
                        </>
                    ) : ordersListView === 'archive' ? (
                        <>
                            <button
                                type="button"
                                onClick={() => handlePrintOrder(item, true)}
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-1 text-[10px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
                                title={t('orders.printWithPrices')}
                            >
                                <Receipt size={13} className="shrink-0" />
                                <span className="hidden sm:inline">{t('orders.printWithPricesShort')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePrintOrder(item, false)}
                                className="shrink-0 p-1 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                title={t('orders.printNoPrices')}
                            >
                                <List size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleUnarchiveOrder?.(item.id)}
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-slate-700 px-1.5 py-1 text-[10px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
                                title={t('orders.unarchiveOrderTitle')}
                            >
                                <RotateCcw size={13} className="shrink-0" />
                                <span className="hidden sm:inline">{t('orders.unarchiveOrder')}</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => handlePrintOrder(item, true)}
                                className="shrink-0 p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title={t('orders.printWithPrices')}
                            >
                                <Receipt size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleRestoreOrder(item.id)}
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-green-600 px-1.5 py-1 text-[10px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
                                title={t('orders.restoreOrderTitle')}
                            >
                                <RotateCcw size={13} className="shrink-0" />
                                <span className="hidden sm:inline">{t('orders.restoreOrder')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePermanentDelete(item.id)}
                                className="shrink-0 p-1 text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                title={t('orders.permanentDeleteTitle')}
                            >
                                <Trash2 size={15} />
                            </button>
                        </>
                    )}
                </div>
            </td>
        </tr>
    )
}

function rowPropsAreEqual(prev, next) {
    if (prev.item !== next.item) return false
    if (prev.item?.fulfillment?.state !== next.item?.fulfillment?.state) return false
    if (prev.item?.fulfillment?.percent !== next.item?.fulfillment?.percent) return false
    if (prev.isMergeSelected !== next.isMergeSelected) return false
    if (prev.isExpanded !== next.isExpanded) return false
    if (prev.ordersListView !== next.ordersListView) return false
    if (prev.language !== next.language) return false
    if (prev.filterCategory !== next.filterCategory) return false
    return true
}

export default memo(OrderTableRow, rowPropsAreEqual)
