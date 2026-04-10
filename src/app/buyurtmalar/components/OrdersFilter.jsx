'use client';
import React from 'react';
import { 
  Search, 
  Repeat, 
  GitMerge, 
  Filter, 
  ListTree, 
  Receipt, 
  List, 
  Plus, 
  X 
} from 'lucide-react';

export default function OrdersFilter({
  t,
  searchTerm,
  setSearchTerm,
  repeatLastOrder,
  ordersListView,
  handleMergeSelectedOrders,
  selectedMergeCount,
  clearMergeSelection,
  filterStatus,
  setFilterStatus,
  filterCategory,
  setFilterCategory,
  orderCategoryOptions,
  handlePrintOrderList,
  filteredOrders,
  handlePrintSelectedByCategory,
  selectedOrders,
  isAdding,
  handleCancel,
  clearNewOrderDraft,
  setDraftBanner,
  setEditId,
  setOrderLines,
  setForm,
  setMergeSourceAgg,
  setMergeSourceOrderIds,
  setIsAdding,
  createEmptyOrderLine
}) {
  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={t('orders.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-start">
          <button
            type="button"
            onClick={repeatLastOrder}
            className="inline-flex items-center justify-center gap-1 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px]"
            title={t('orders.repeatLastTitle')}
          >
            <Repeat size={15} />
            <span className="hidden sm:inline">{t('orders.repeatLast')}</span>
          </button>

          {ordersListView === 'active' && (
            <>
              <button
                type="button"
                onClick={handleMergeSelectedOrders}
                disabled={selectedMergeCount < 2}
                className={`inline-flex items-center justify-center gap-1 border px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px] ${
                  selectedMergeCount >= 2
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                    : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
                title={t('orders.mergeButtonTitle')}
              >
                <GitMerge size={15} />
                <span className="hidden sm:inline">{t('orders.mergeButton')}</span>
                {selectedMergeCount > 0 && (
                  <span className="min-w-[1.1rem] rounded-full bg-white/20 px-1 text-center text-[10px] font-bold tabular-nums leading-none py-0.5">
                    {selectedMergeCount}
                  </span>
                )}
              </button>
              {selectedMergeCount > 0 && (
                <button
                  type="button"
                  onClick={clearMergeSelection}
                  className="inline-flex items-center justify-center bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-2 py-1.5 rounded-lg transition-all font-medium text-[11px] h-[38px]"
                  title={t('orders.mergeClearTitle')}
                >
                  {t('orders.mergeClear')}
                </button>
              )}
            </>
          )}


          <div className="flex items-center gap-1.5 bg-gray-50 px-2 rounded-lg border border-gray-100 h-[38px]">
            <ListTree size={15} className="text-gray-500 shrink-0" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-transparent py-1.5 pr-1 outline-none text-gray-700 text-xs font-medium cursor-pointer max-w-[12rem]"
            >
              <option value="all">Barcha kategoriya</option>
              {orderCategoryOptions.map((cat) => (
                <option key={cat.label} value={cat.label}>
                  {cat.label} ({cat.count})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => handlePrintOrderList(filteredOrders, true)}
            className="inline-flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px]"
            title={`${t('orders.listPrintWithPrices')} · ${t('orders.exportPdfHint')}`}
          >
            <Receipt size={15} />
            <span className="hidden sm:inline">{t('orders.listPrintShortWithPrices')}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePrintOrderList(filteredOrders, false)}
            className="inline-flex items-center justify-center gap-1 bg-slate-600 hover:bg-slate-700 text-white px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px]"
            title={t('orders.listPrintWithoutPrices')}
          >
            <List size={15} />
            <span className="hidden sm:inline">{t('orders.listPrintShortNoPrices')}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePrintSelectedByCategory(selectedOrders, filterCategory)}
            disabled={selectedOrders.length === 0}
            className={`inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px] ${
              selectedOrders.length > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            title="Tanlangan buyurtmalarni kategoriya bo'yicha birlashtirib chop etish"
          >
            <GitMerge size={15} />
            <span className="hidden sm:inline">Tanlanganni kategoriya bo'yicha</span>
            {selectedOrders.length > 0 && (
              <span className="min-w-[1.1rem] rounded-full bg-white/20 px-1 text-center text-[10px] font-bold tabular-nums leading-none py-0.5 ml-1">
                {selectedOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (isAdding) {
                handleCancel();
              } else {
                clearNewOrderDraft();
                setDraftBanner(false);
                setEditId(null);
                setOrderLines([createEmptyOrderLine()]);
                setForm({
                  customer_id: '',
                  customer_name: '',
                  customer_phone: '',
                  total: '',
                  status: 'new',
                  note: '',
                  source: 'dokon'
                });
                setMergeSourceAgg(null);
                setMergeSourceOrderIds(null);
                setIsAdding(true);
              }
            }}
            className="inline-flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-all font-bold text-xs shadow-sm h-[38px]"
          >
            {isAdding ? <X size={16} /> : <Plus size={16} />}
            <span className="hidden sm:inline">
              {isAdding ? t('common.cancel') : t('orders.newOrder')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
