'use client';
import React, { useRef } from 'react';
import {
  Search,
  Repeat,
  GitMerge,
  ListTree,
  Receipt,
  List,
  Plus,
  X,
  Printer,
  ChevronDown,
  Layers,
  FileSpreadsheet,
  Image,
  ImageOff,
  Upload,
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
  createEmptyOrderLine,
  handleExportSelectedOrdersExcel,
  selectedOrdersCount,
  excelImportInputRef,
  handleExcelImportFileChange,
  excelImportBusy,
}) {
  const printDetailsRef = useRef(null);
  const excelDetailsRef = useRef(null);

  const closePrintMenu = () => {
    const el = printDetailsRef.current;
    if (el && typeof el.open === 'boolean') el.open = false;
  };

  const closeExcelMenu = () => {
    const el = excelDetailsRef.current;
    if (el && typeof el.open === 'boolean') el.open = false;
  };

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="sticky top-0 z-20 rounded-xl border border-gray-100 bg-gray-50/95 px-3 py-3 shadow-sm backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="search"
              autoComplete="off"
              placeholder={t('orders.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label={t('orders.searchPlaceholder')}
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

            <div className="flex items-center gap-1.5 bg-white px-2 rounded-lg border border-gray-100 h-[38px]">
              <ListTree size={15} className="text-gray-500 shrink-0" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-transparent py-1.5 pr-1 outline-none text-gray-700 text-xs font-medium cursor-pointer max-w-[12rem]"
                aria-label={t('orders.filterAllCategories')}
              >
                <option value="all">{t('orders.filterAllCategories')}</option>
                {orderCategoryOptions.map((cat) => (
                  <option key={cat.label} value={cat.label}>
                    {cat.label} ({cat.count})
                  </option>
                ))}
              </select>
            </div>

            <details ref={printDetailsRef} className="relative">
              <summary
                className="inline-flex list-none cursor-pointer items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px] [&::-webkit-details-marker]:hidden"
                title={`${t('orders.printListMenuTitle')} · ${t('orders.exportPdfHint')}`}
                aria-label={t('orders.printListMenuTitle')}
              >
                <Printer size={15} />
                <span className="hidden sm:inline">{t('orders.printListMenu')}</span>
                <ChevronDown size={14} className="opacity-90" />
              </summary>
              <div className="absolute right-0 top-full z-40 mt-1 min-w-[min(100vw-2rem,17rem)] rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-gray-800 hover:bg-emerald-50"
                  onClick={() => {
                    handlePrintOrderList(filteredOrders, true);
                    closePrintMenu();
                  }}
                >
                  <Receipt size={14} className="shrink-0 text-emerald-600" />
                  <span>{t('orders.listPrintShortWithPrices')}</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-gray-800 hover:bg-slate-50"
                  onClick={() => {
                    handlePrintOrderList(filteredOrders, false);
                    closePrintMenu();
                  }}
                >
                  <List size={14} className="shrink-0 text-slate-600" />
                  <span>{t('orders.listPrintShortNoPrices')}</span>
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  type="button"
                  disabled={selectedOrders.length === 0}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                    selectedOrders.length > 0
                      ? 'text-gray-800 hover:bg-amber-50'
                      : 'cursor-not-allowed text-gray-400'
                  }`}
                  title={t('orders.printSelectedByCategoryTitle')}
                  onClick={() => {
                    if (selectedOrders.length === 0) return;
                    handlePrintSelectedByCategory(selectedOrders, filterCategory);
                    closePrintMenu();
                  }}
                >
                  <Layers size={14} className="shrink-0 text-amber-600" />
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    {t('orders.printSelectedByCategoryShort')}
                    {selectedOrders.length > 0 && (
                      <span className="ml-auto min-w-[1.1rem] rounded-full bg-amber-100 px-1.5 text-center text-[10px] font-bold tabular-nums text-amber-900">
                        {selectedOrders.length}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </details>

            {ordersListView === 'active' && (
              <>
                <details ref={excelDetailsRef} className="relative">
                  <summary
                    className={`inline-flex list-none items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px] [&::-webkit-details-marker]:hidden ${
                      selectedOrdersCount > 0
                        ? 'cursor-pointer bg-slate-700 hover:bg-slate-800 text-white'
                        : 'cursor-not-allowed bg-gray-100 text-gray-400 pointer-events-none'
                    }`}
                    title={t('orders.excelExportSelectedTitle')}
                    aria-label={t('orders.excelExportSelectedTitle')}
                  >
                    <FileSpreadsheet size={15} />
                    <span className="hidden sm:inline">{t('orders.excelExportSelected')}</span>
                    {selectedOrdersCount > 0 && (
                      <span className="min-w-[1.1rem] rounded-full bg-white/20 px-1 text-center text-[10px] font-bold tabular-nums leading-none py-0.5">
                        {selectedOrdersCount}
                      </span>
                    )}
                    <ChevronDown size={14} className="opacity-90" />
                  </summary>
                  <div className="absolute right-0 top-full z-40 mt-1 min-w-[min(100vw-2rem,17rem)] rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-gray-800 hover:bg-slate-50"
                      onClick={() => {
                        handleExportSelectedOrdersExcel(true);
                        closeExcelMenu();
                      }}
                    >
                      <Image size={14} className="shrink-0 text-slate-700" />
                      <span>{t('orders.excelExportModeWithImages')}</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-gray-800 hover:bg-slate-50"
                      onClick={() => {
                        handleExportSelectedOrdersExcel(false);
                        closeExcelMenu();
                      }}
                    >
                      <ImageOff size={14} className="shrink-0 text-slate-700" />
                      <span>{t('orders.excelExportModeWithoutImages')}</span>
                    </button>
                  </div>
                </details>
                <input
                  ref={excelImportInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={handleExcelImportFileChange}
                />
                <button
                  type="button"
                  disabled={excelImportBusy}
                  onClick={() => excelImportInputRef.current?.click()}
                  className={`inline-flex items-center justify-center gap-1 border px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px] ${
                    excelImportBusy
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                  title={t('orders.excelImportTitle')}
                >
                  <Upload size={15} />
                  <span className="hidden sm:inline">{t('orders.excelImport')}</span>
                </button>
              </>
            )}

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
                    source: 'dokon',
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
    </div>
  );
}
