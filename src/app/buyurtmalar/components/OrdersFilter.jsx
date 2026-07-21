'use client'
import React, { useRef } from 'react'
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
  Filter,
  Calendar,
  Store,
} from 'lucide-react'

const SOURCE_OPTIONS = [
  { value: 'all', labelKey: 'filterAllSources' },
  { value: 'dokon', labelKey: 'sourceStoreShort' },
  { value: 'telefon', labelKey: 'sourcePhoneShort' },
  { value: 'website_optom', labelKey: 'sourceWebsiteOptom' },
  { value: 'website_chakana', labelKey: 'sourceWebsiteChakana' },
  { value: 'website', labelKey: 'website' },
]

export default function OrdersFilter({
  t,
  searchTerm,
  setSearchTerm,
  repeatLastOrder,
  ordersListView,
  handleMergeSelectedOrders,
  selectedMergeCount,
  clearMergeSelection,
  filterCategory,
  setFilterCategory,
  filterSource,
  setFilterSource,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onClearFilters,
  hasExtraFilters,
  orderCategoryOptions,
  handlePrintOrderList,
  filteredOrders,
  handlePrintSelectedByCategory,
  handlePrintSelectedSpecial,
  selectedOrders,
  isAdding,
  onOpenNewOrder,
  onCancelForm,
  clearNewOrderDraft,
  setDraftBanner,
  handleExportSelectedOrdersExcel,
  selectedOrdersCount,
  excelImportInputRef,
  handleExcelImportFileChange,
  excelImportBusy,
}) {
  const printDetailsRef = useRef(null)
  const excelDetailsRef = useRef(null)
  const selectedDetailsRef = useRef(null)

  const closePrintMenu = () => {
    const el = printDetailsRef.current
    if (el && typeof el.open === 'boolean') el.open = false
  }

  const closeExcelMenu = () => {
    const el = excelDetailsRef.current
    if (el && typeof el.open === 'boolean') el.open = false
  }

  const closeSelectedMenu = () => {
    const el = selectedDetailsRef.current
    if (el && typeof el.open === 'boolean') el.open = false
  }

  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="sticky top-0 z-20 rounded-xl border border-gray-100 bg-gray-50/95 px-3 py-3 shadow-sm backdrop-blur-md space-y-3">
        {/* Qidiruv + asosiy amallar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
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

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={repeatLastOrder}
              className="inline-flex items-center justify-center gap-1 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px]"
              title={t('orders.repeatLastTitle')}
            >
              <Repeat size={15} />
              <span className="hidden sm:inline">{t('orders.repeatLast')}</span>
            </button>

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
                    handlePrintOrderList(filteredOrders, true)
                    closePrintMenu()
                  }}
                >
                  <Receipt size={14} className="shrink-0 text-emerald-600" />
                  <span>{t('orders.listPrintShortWithPrices')}</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-gray-800 hover:bg-slate-50"
                  onClick={() => {
                    handlePrintOrderList(filteredOrders, false)
                    closePrintMenu()
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
                    if (selectedOrders.length === 0) return
                    handlePrintSelectedByCategory(selectedOrders, filterCategory)
                    closePrintMenu()
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
                <button
                  type="button"
                  disabled={selectedOrders.length === 0}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                    selectedOrders.length > 0
                      ? 'text-gray-800 hover:bg-emerald-50'
                      : 'cursor-not-allowed text-gray-400'
                  }`}
                  title={t('orders.printSelectedSpecialTitle')}
                  onClick={() => {
                    if (selectedOrders.length === 0) return
                    handlePrintSelectedSpecial(selectedOrders)
                    closePrintMenu()
                  }}
                >
                  <Printer size={14} className="shrink-0 text-emerald-600" />
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    {t('orders.printSelectedSpecialShort')}
                    {selectedOrders.length > 0 && (
                      <span className="ml-auto min-w-[1.1rem] rounded-full bg-emerald-100 px-1.5 text-center text-[10px] font-bold tabular-nums text-emerald-900">
                        {selectedOrders.length}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </details>

            {ordersListView === 'active' && (
              <>
                <details ref={selectedDetailsRef} className="relative">
                  <summary
                    className={`inline-flex list-none items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs h-[38px] [&::-webkit-details-marker]:hidden ${
                      selectedMergeCount > 0 || selectedOrdersCount > 0
                        ? 'cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'cursor-pointer bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                    title={t('orders.selectedActionsTitle')}
                  >
                    <GitMerge size={15} />
                    <span className="hidden sm:inline">{t('orders.selectedActions')}</span>
                    {(selectedMergeCount > 0 || selectedOrdersCount > 0) && (
                      <span className="min-w-[1.1rem] rounded-full bg-white/20 px-1 text-center text-[10px] font-bold tabular-nums leading-none py-0.5">
                        {Math.max(selectedMergeCount, selectedOrdersCount)}
                      </span>
                    )}
                    <ChevronDown size={14} className="opacity-90" />
                  </summary>
                  <div className="absolute right-0 top-full z-40 mt-1 min-w-[min(100vw-2rem,16rem)] rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      disabled={selectedMergeCount < 2}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                        selectedMergeCount >= 2
                          ? 'text-gray-800 hover:bg-indigo-50'
                          : 'cursor-not-allowed text-gray-400'
                      }`}
                      title={t('orders.mergeButtonTitle')}
                      onClick={() => {
                        if (selectedMergeCount < 2) return
                        handleMergeSelectedOrders()
                        closeSelectedMenu()
                      }}
                    >
                      <GitMerge size={14} className="shrink-0 text-indigo-600" />
                      <span>
                        {t('orders.mergeButton')}
                        {selectedMergeCount > 0 ? ` (${selectedMergeCount})` : ''}
                      </span>
                    </button>
                    {selectedMergeCount > 0 && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        title={t('orders.mergeClearTitle')}
                        onClick={() => {
                          clearMergeSelection()
                          closeSelectedMenu()
                        }}
                      >
                        <X size={14} className="shrink-0 text-gray-500" />
                        <span>{t('orders.mergeClear')}</span>
                      </button>
                    )}
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      type="button"
                      disabled={selectedOrdersCount === 0}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                        selectedOrdersCount > 0
                          ? 'text-gray-800 hover:bg-slate-50'
                          : 'cursor-not-allowed text-gray-400'
                      }`}
                      onClick={() => {
                        if (selectedOrdersCount === 0) return
                        handleExportSelectedOrdersExcel(true)
                        closeSelectedMenu()
                      }}
                    >
                      <Image size={14} className="shrink-0 text-slate-700" />
                      <span>{t('orders.excelExportModeWithImages')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedOrdersCount === 0}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold ${
                        selectedOrdersCount > 0
                          ? 'text-gray-800 hover:bg-slate-50'
                          : 'cursor-not-allowed text-gray-400'
                      }`}
                      onClick={() => {
                        if (selectedOrdersCount === 0) return
                        handleExportSelectedOrdersExcel(false)
                        closeSelectedMenu()
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
                  onCancelForm()
                } else {
                  clearNewOrderDraft()
                  setDraftBanner(false)
                  onOpenNewOrder()
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

        {/* Filtrlar qatori */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-200/80">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 mr-1">
            <Filter size={12} />
            {t('orders.filtersLabel')}
          </span>

          <div className="flex items-center gap-1.5 bg-white px-2 rounded-lg border border-gray-200 h-[34px]">
            <ListTree size={14} className="text-gray-500 shrink-0" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-transparent py-1 pr-1 outline-none text-gray-700 text-xs font-medium cursor-pointer max-w-[11rem]"
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

          <div className="flex items-center gap-1.5 bg-white px-2 rounded-lg border border-gray-200 h-[34px]">
            <Store size={14} className="text-gray-500 shrink-0" />
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="bg-transparent py-1 pr-1 outline-none text-gray-700 text-xs font-medium cursor-pointer max-w-[10rem]"
              aria-label={t('orders.filterAllSources')}
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`orders.${opt.labelKey}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white px-2 rounded-lg border border-gray-200 h-[34px]">
            <Calendar size={14} className="text-gray-500 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent py-1 outline-none text-gray-700 text-xs font-medium max-w-[8.5rem]"
              aria-label={t('orders.dateFrom')}
              title={t('orders.dateFrom')}
            />
            <span className="text-gray-300 text-xs">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent py-1 outline-none text-gray-700 text-xs font-medium max-w-[8.5rem]"
              aria-label={t('orders.dateTo')}
              title={t('orders.dateTo')}
            />
          </div>

          {hasExtraFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-gray-50 h-[34px]"
              title={t('orders.clearFiltersTitle')}
            >
              <X size={13} />
              {t('orders.clearFilters')}
            </button>
          )}

          <span className="ml-auto text-[11px] font-semibold text-gray-400 tabular-nums">
            {t('orders.filteredCountHint').replace('{n}', String(filteredOrders.length))}
          </span>
        </div>
      </div>
    </div>
  )
}
