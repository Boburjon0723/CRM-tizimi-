'use client';
import React from 'react';
import { 
  Archive, 
  ShoppingCart, 
  ChevronUp, 
  ChevronDown, 
  FileText, 
  Receipt, 
  List, 
  Copy, 
  Edit, 
  Trash2, 
  RotateCcw 
} from 'lucide-react';
import { 
  normalizeOrderItemsForList, 
  dedupeOrderItemsKeepNewest, 
  labelColorCanonical, 
  orderItemLineNoteText, 
  formatUsd, 
  normalizeStatusForSelect,
  ORDER_LIST_ITEMS_PREVIEW,
  orderItemQtyDisplay,
} from '../utils';

export default function OrdersTable({
  t,
  filteredOrders,
  ordersListView,
  mergeSelection,
  toggleMergeSelectAllFiltered,
  toggleMergeSelectOrder,
  language,
  products,
  productColors,
  orderListExpandedById,
  setOrderListExpandedById,
  handleStatusChange,
  handlePrintOrder,
  handleDuplicateOrder,
  handleEdit,
  handleDelete,
  handleRestoreOrder,
  handlePermanentDelete
}) {
  const formImageCellClass = "w-10 h-10 sm:w-12 sm:h-12";

  if (filteredOrders.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          {ordersListView === 'trash' ? (
            <Archive size={48} className="mb-4 opacity-20" />
          ) : (
            <ShoppingCart size={48} className="mb-4 opacity-20" />
          )}
          <p className="font-medium text-lg">
            {ordersListView === 'trash' ? t('orders.trashEmpty') : t('orders.noOrders')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[860px] text-left border-collapse table-auto">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
              {ordersListView === 'active' && (
                <th className="w-10 shrink-0 px-2 py-3 sm:px-3 rounded-tl-2xl text-center" title={t('orders.mergeSelectColumn')}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={
                      filteredOrders.length > 0 &&
                      filteredOrders.every((o) => mergeSelection[o.id])
                    }
                    onChange={toggleMergeSelectAllFiltered}
                    aria-label={t('orders.mergeSelectAll')}
                  />
                </th>
              )}
              <th className={`w-[11%] min-w-[7.5rem] px-3 py-3 sm:px-4 ${ordersListView === 'trash' ? 'rounded-tl-2xl' : ''}`}>
                {t('orders.idDate')}
              </th>
              <th className="w-[14%] min-w-[9rem] px-3 py-3 sm:px-4">{t('orders.customer')}</th>
              <th className="min-w-[12rem] px-3 py-3 sm:px-4 xl:min-w-[16rem]">{t('orders.products')}</th>
              <th className="w-[7%] min-w-[4.5rem] whitespace-nowrap px-2 py-3 sm:px-3">{t('orders.total')}</th>
              <th className="w-[9%] min-w-[5.5rem] px-2 py-3 sm:px-3">{t('orders.payment')}</th>
              <th className="w-[10%] min-w-[6.5rem] px-2 py-3 sm:px-3">{t('orders.status')}</th>
              <th className="w-[7%] min-w-[4rem] px-2 py-3 sm:px-3">{t('orders.source')}</th>
              <th className="min-w-[13.5rem] px-2 py-3 sm:px-3 rounded-tr-2xl text-right xl:min-w-[15rem]">
                {t('customers.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredOrders.map((item) => (
              <tr
                key={item.id}
                id={`order-row-${item.id}`}
                className="hover:bg-blue-50/30 transition-colors scroll-mt-24"
              >
                {ordersListView === 'active' && (
                  <td className="px-2 py-3 sm:px-3 sm:py-4 align-top text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1"
                      checked={!!mergeSelection[item.id]}
                      onChange={() => toggleMergeSelectOrder(item.id)}
                      aria-label={t('orders.mergeSelectColumn')}
                    />
                  </td>
                )}
                <td className="px-3 py-3 sm:px-4 sm:py-4 align-top">
                  {item.order_number && (
                    <div className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded inline-block mb-1">
                      № {item.order_number}
                    </div>
                  )}
                  <div className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded inline-block mb-1">
                    #{String(item.id).slice(0, 8)}
                  </div>
                  <div className="text-sm font-medium text-gray-700">
                    {new Date(item.created_at).toLocaleDateString(
                      language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US'
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 sm:px-4 sm:py-4 font-medium text-gray-900 align-top min-w-0">
                  <div className="font-bold">{item.customer_name || item.customers?.name || 'Noma\'lum'}</div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">{item.customer_phone || item.customers?.phone}</div>
                  {item.note && (
                    <div className="text-xs text-amber-600 italic mt-1 bg-amber-50 px-2 py-0.5 rounded inline-block">
                      {item.note}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 sm:px-4 sm:py-4 text-gray-600 align-top min-w-0 max-w-md xl:max-w-xl 2xl:max-w-2xl">
                  {item.order_items && item.order_items.length > 0 ? (
                    (() => {
                      const ois = normalizeOrderItemsForList(
                        dedupeOrderItemsKeepNewest(item.order_items || [], products)
                      );
                      const expanded = !!orderListExpandedById[item.id];
                      const hasMore = ois.length > ORDER_LIST_ITEMS_PREVIEW;
                      const visible = expanded ? ois : ois.slice(0, ORDER_LIST_ITEMS_PREVIEW);
                      const hiddenCount = ois.length - ORDER_LIST_ITEMS_PREVIEW;
                      return (
                        <div className="space-y-1">
                          {visible.map((oi, idx) => (
                            <div
                              key={oi.id || idx}
                              className="text-base border-b border-gray-100 last:border-0 pb-1 mb-1 last:mb-0"
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                {oi.image_url ? (
                                  <div className={`shrink-0 rounded-lg bg-white flex items-center justify-center overflow-hidden ring-1 ring-gray-200/60 ${formImageCellClass}`}>
                                    <img
                                      src={oi.image_url}
                                      alt=""
                                      className="max-h-full max-w-full object-contain object-center mix-blend-multiply"
                                    />
                                  </div>
                                ) : (
                                  <div className={`shrink-0 rounded-lg border border-dashed border-gray-200/90 bg-white ${formImageCellClass}`} />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-gray-800 line-clamp-1">
                                    {oi.product_name || oi.products?.name}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                    <span className="font-bold text-blue-700 text-lg tabular-nums">
                                      {orderItemQtyDisplay(oi, products)}
                                    </span>
                                    <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5 font-medium">
                                      {oi.size && <span>Kod: {oi.size}</span>}
                                      {oi.color && (
                                        <span>
                                          {t('orders.lineColor')}:{' '}
                                          {labelColorCanonical(
                                            oi.color,
                                            productColors,
                                            language
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {orderItemLineNoteText(oi) && (
                                    <div className="mt-1.5 w-full text-xs text-violet-900 leading-snug break-words border-l-2 border-violet-300 pl-2 py-0.5 bg-violet-50/80 rounded-r">
                                      <span className="font-semibold text-violet-700">
                                        {t('orders.lineItemNoteShort')}
                                      </span>{' '}
                                      {orderItemLineNoteText(oi)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {hasMore && (
                            <button
                              type="button"
                              onClick={() =>
                                setOrderListExpandedById((prev) => ({
                                  ...prev,
                                  [item.id]: !prev[item.id]
                                }))
                              }
                              className="mt-1 flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {expanded ? (
                                <>
                                  <ChevronUp size={14} className="shrink-0" />
                                  {t('orders.orderListCollapse')}
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={14} className="shrink-0" />
                                  {t('orders.orderListExpand')}
                                  <span className="font-normal text-gray-500">
                                    ({t('orders.orderListHiddenCount').replace('{n}', String(hiddenCount))})
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-gray-400 italic text-xs">Bo'sh</span>
                  )}
                </td>
                <td className="px-2 py-3 sm:px-3 sm:py-4 font-bold text-gray-900 font-mono align-top whitespace-nowrap tabular-nums">
                  ${formatUsd(item.total)}
                </td>
                <td className="px-2 py-3 sm:px-3 sm:py-4 align-top">
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded inline-block text-center">
                      {item.payment_method_detail || t('orders.cash')}
                    </span>
                    {item.receipt_url && (
                      <a
                        href={item.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 hover:underline flex items-center justify-center gap-1 mt-1 font-bold"
                      >
                        <FileText size={12} />
                        Chek
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-2 py-3 sm:px-3 sm:py-4 align-top">
                  <select
                    value={normalizeStatusForSelect(item.status)}
                    onChange={(e) => handleStatusChange(item.id, e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer outline-none transition-colors ${
                      item.status === 'new' || item.status === 'Yangi' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                      item.status === 'pending' || item.status === 'Jarayonda' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                      item.status === 'completed' || item.status === 'Tugallandi' || item.status === 'Tugallangan' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                      'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    <option value="new">{t('orders.statusNew')}</option>
                    <option value="pending">{t('orders.statusProcessing')}</option>
                    <option value="completed">{t('orders.statusCompleted')}</option>
                    <option value="cancelled">{t('orders.statusCancelled')}</option>
                  </select>
                </td>
                <td className="px-2 py-3 sm:px-3 sm:py-4 align-top">
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-1 rounded-lg ${
                      item.source === 'website'
                        ? 'bg-indigo-100 text-indigo-700'
                        : item.source === 'telefon'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {item.source === 'website'
                      ? 'Web'
                      : item.source === 'telefon'
                        ? t('orders.sourcePhoneShort')
                        : t('orders.sourceStoreShort')}
                  </span>
                </td>
                <td className="px-2 py-3 sm:px-3 sm:py-4 text-right align-top">
                  <div className="flex items-center justify-end gap-0.5 sm:gap-1 flex-nowrap sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => handlePrintOrder(item, true)}
                      className="shrink-0 p-1.5 sm:p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title={t('orders.printWithPrices')}
                    >
                      <Receipt size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintOrder(item, false)}
                      className="shrink-0 p-1.5 sm:p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                      title={t('orders.printNoPrices')}
                    >
                      <List size={18} />
                    </button>
                    {ordersListView === 'active' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDuplicateOrder(item)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1.5 sm:px-2.5 sm:py-2 text-[11px] sm:text-xs font-bold text-violet-900 transition-colors hover:bg-violet-100"
                          title={t('orders.duplicateOrderTitle')}
                        >
                          <Copy size={15} className="shrink-0 sm:w-4 sm:h-4" />
                          <span className="hidden lg:inline">{t('orders.duplicateOrder')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold text-white shadow-md shadow-blue-600/25 transition-colors hover:bg-blue-700"
                          title={t('orders.editOrder')}
                        >
                          <Edit size={15} className="shrink-0 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">{t('common.edit')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="shrink-0 p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('orders.moveToTrashTitle')}
                        >
                          <Trash2 size={18} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRestoreOrder(item.id)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-green-600 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold text-white shadow-md shadow-green-600/25 transition-colors hover:bg-green-700"
                          title={t('orders.restoreOrderTitle')}
                        >
                          <RotateCcw size={15} className="shrink-0 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">{t('orders.restoreOrder')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePermanentDelete(item.id)}
                          className="shrink-0 p-1.5 sm:p-2 text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('orders.permanentDeleteTitle')}
                        >
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
