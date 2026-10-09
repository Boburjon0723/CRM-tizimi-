'use client'
import React, { useEffect, useRef, useState } from 'react'
import {
  Search,
  Repeat,
  ListChecks,
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
  Briefcase,
} from 'lucide-react'
import { formatUsd, formatOrderQtyPlain } from '../utils'

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
  listTotalSumma = 0,
  listTotalQty = 0,
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
  filterPartnerId = '',
  setFilterPartnerId,
  partnerFilterOptions = [],
  partnerStatus = 'all',
  setPartnerStatus,
  partnerStatusStats = {
    fresh: { count: 0, sum: 0 },
    progress: { count: 0, sum: 0 },
    completed: { count: 0, sum: 0 },
  },
}) {
  const printDetailsRef = useRef(null)
  const partnerMenuRef = useRef(null)
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false)

  useEffect(() => {
    if (!partnerMenuOpen) return
    function onDoc(e) {
      if (partnerMenuRef.current && !partnerMenuRef.current.contains(e.target)) setPartnerMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [partnerMenuOpen])

  const selectedPartner = partnerFilterOptions.find((p) => String(p.id) === String(filterPartnerId))
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

  const btnH = 'h-[32px]'

  return (
    <div className="flex flex-col gap-2 mb-3">
      <div className="sticky top-0 z-20 rounded-lg border border-gray-100 bg-gray-50/95 px-2.5 py-2 shadow-sm backdrop-blur-md space-y-2">
        {/* Qidiruv + asosiy amallar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
          <div className="relative w-full sm:w-52 lg:w-56 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="search"
              autoComplete="off"
              placeholder={t('orders.searchPlaceholder')}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-xs h-[32px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label={t('orders.searchPlaceholder')}
            />
          </div>

          <div className="relative shrink-0" ref={partnerMenuRef}>
            <button
              type="button"
              onClick={() => setPartnerMenuOpen((v) => !v)}
              className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md font-semibold text-[11px] border max-w-[14rem] ${btnH} ${
                filterPartnerId
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-50'
              }`}
              title={t('orders.partnerOrdersFilterTitle')}
              aria-expanded={partnerMenuOpen}
            >
              <Briefcase size={14} className="shrink-0" />
              <span className="truncate">
                {selectedPartner ? selectedPartner.name : t('orders.partnerOrdersFilter')}
              </span>
              <ChevronDown size={12} className="shrink-0 opacity-80" />
            </button>
            {partnerMenuOpen ? (
              <div className="absolute left-0 top-full z-40 mt-1 w-[min(100vw-2rem,18rem)] max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-gray-500 hover:bg-gray-50"
                  onClick={() => {
                    setFilterPartnerId?.('')
                    setPartnerStatus?.('all')
                    setPartnerMenuOpen(false)
                  }}
                >
                  <span>{t('orders.partnerOrdersAll')}</span>
                </button>
                {partnerFilterOptions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">{t('orders.partnerOrdersEmpty')}</p>
                ) : (
                  partnerFilterOptions.map((p) => {
                    const on = String(p.id) === String(filterPartnerId)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold ${
                          on ? 'bg-indigo-50 text-indigo-800' : 'text-gray-800 hover:bg-indigo-50'
                        }`}
                        onClick={() => {
                          setFilterPartnerId?.(on ? '' : p.id)
                          setPartnerStatus?.('all')
                          setPartnerMenuOpen(false)
                        }}
                      >
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] font-black tabular-nums text-gray-600">
                          {p.count}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={repeatLastOrder}
              className={`inline-flex items-center justify-center gap-1 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 px-2 py-1 rounded-md transition-all font-semibold text-[11px] ${btnH}`}
              title={t('orders.repeatLastTitle')}
            >
              <Repeat size={14} />
              <span className="hidden sm:inline">{t('orders.repeatLast')}</span>
            </button>

            <details ref={printDetailsRef} className="relative">
              <summary
                className={`inline-flex list-none cursor-pointer items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-md transition-all font-semibold text-[11px] ${btnH} [&::-webkit-details-marker]:hidden`}
                title={`${t('orders.printListMenuTitle')} · ${t('orders.exportPdfHint')}`}
                aria-label={t('orders.printListMenuTitle')}
              >
                <Printer size={14} />
                <span className="hidden sm:inline">{t('orders.printListMenu')}</span>
                <ChevronDown size={12} className="opacity-90" />
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

            {ordersListView !== 'trash' && (
              <>
                <details ref={selectedDetailsRef} className="relative">
                  <summary
                    className={`inline-flex list-none items-center justify-center gap-1 px-2 py-1 rounded-md transition-all font-semibold text-[11px] ${btnH} [&::-webkit-details-marker]:hidden ${
                      selectedMergeCount > 0 || selectedOrdersCount > 0
                        ? 'cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'cursor-pointer bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                    title={t('orders.selectedActionsTitle')}
                  >
                    <ListChecks size={14} />
                    <span className="hidden sm:inline">{t('orders.selectedActions')}</span>
                    {(selectedMergeCount > 0 || selectedOrdersCount > 0) && (
                      <span className="min-w-[1.1rem] rounded-full bg-white/20 px-1 text-center text-[10px] font-bold tabular-nums leading-none py-0.5">
                        {Math.max(selectedMergeCount, selectedOrdersCount)}
                      </span>
                    )}
                    <ChevronDown size={12} className="opacity-90" />
                  </summary>
                  <div className="absolute right-0 top-full z-40 mt-1 min-w-[min(100vw-2rem,16rem)] rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
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
                    {selectedMergeCount > 0 && (
                      <>
                        <div className="my-1 border-t border-gray-100" />
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
                      </>
                    )}
                  </div>
                </details>

                {ordersListView === 'active' && (
                  <>
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
                      className={`inline-flex items-center justify-center gap-1 border px-2 py-1 rounded-md transition-all font-semibold text-[11px] ${btnH} ${
                        excelImportBusy
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                      title={t('orders.excelImportTitle')}
                    >
                      <Upload size={14} />
                      <span className="hidden sm:inline">{t('orders.excelImport')}</span>
                    </button>
                  </>
                )}
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
              className={`inline-flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-md transition-all font-bold text-[11px] shadow-sm ${btnH}`}
            >
              {isAdding ? <X size={16} /> : <Plus size={16} />}
              <span className="hidden sm:inline">
                {isAdding ? t('common.cancel') : t('orders.newOrder')}
              </span>
            </button>
          </div>
        </div>

        {filterPartnerId ? (
          <div className="flex flex-wrap items-stretch gap-2">
            {[
              {
                id: 'new',
                label: t('orders.partnerOrdersNew'),
                hint: t('orders.partnerOrdersNewHint'),
                stat: partnerStatusStats.fresh,
                active: 'bg-sky-600 text-white border-sky-600',
                idle: 'bg-sky-50 text-sky-900 border-sky-200 hover:bg-sky-100',
              },
              {
                id: 'progress',
                label: t('orders.partnerOrdersProgress'),
                hint: t('orders.partnerOrdersProgressHint'),
                stat: partnerStatusStats.progress,
                active: 'bg-amber-600 text-white border-amber-600',
                idle: 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100',
              },
              {
                id: 'completed',
                label: t('orders.partnerOrdersDone'),
                hint: t('orders.partnerOrdersDoneHint'),
                stat: partnerStatusStats.completed,
                active: 'bg-emerald-600 text-white border-emerald-600',
                idle: 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100',
              },
            ].map((card) => {
              const on = partnerStatus === card.id
              return (
                <button
                  key={card.id}
                  type="button"
                  title={card.hint}
                  onClick={() => setPartnerStatus?.(on ? 'all' : card.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors ${on ? card.active : card.idle}`}
                >
                  <span className="text-[11px] font-bold">{card.label}</span>
                  <span className={`rounded-full px-1.5 text-[10px] font-black tabular-nums ${on ? 'bg-white/20' : 'bg-white'}`}>
                    {card.stat?.count || 0}
                  </span>
                  <span className={`text-[11px] font-semibold tabular-nums ${on ? 'text-white/90' : 'text-gray-600'}`}>
                    ${formatUsd(card.stat?.sum || 0)}
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}

        {/* Filtrlar qatori */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-gray-200/80">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 mr-0.5">
            <Filter size={11} />
            {t('orders.filtersLabel')}
          </span>

          <div className="flex items-center gap-1 bg-white px-1.5 rounded-md border border-gray-200 h-[28px]">
            <ListTree size={12} className="text-gray-500 shrink-0" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-transparent py-0.5 pr-0.5 outline-none text-gray-700 text-[11px] font-medium cursor-pointer max-w-[10rem]"
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

          <div className="flex items-center gap-1 bg-white px-1.5 rounded-md border border-gray-200 h-[28px]">
            <Store size={12} className="text-gray-500 shrink-0" />
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="bg-transparent py-0.5 pr-0.5 outline-none text-gray-700 text-[11px] font-medium cursor-pointer max-w-[9rem]"
              aria-label={t('orders.filterAllSources')}
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`orders.${opt.labelKey}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-white px-1.5 rounded-md border border-gray-200 h-[28px]">
            <Calendar size={12} className="text-gray-500 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent py-0.5 outline-none text-gray-700 text-[11px] font-medium max-w-[7.5rem]"
              aria-label={t('orders.dateFrom')}
              title={t('orders.dateFrom')}
            />
            <span className="text-gray-300 text-[10px]">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent py-0.5 outline-none text-gray-700 text-[11px] font-medium max-w-[7.5rem]"
              aria-label={t('orders.dateTo')}
              title={t('orders.dateTo')}
            />
          </div>

          {hasExtraFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 h-[28px]"
              title={t('orders.clearFiltersTitle')}
            >
              <X size={12} />
              {t('orders.clearFilters')}
            </button>
          )}

          <span className="ml-auto inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-gray-400 tabular-nums">
            <span>{t('orders.filteredCountHint').replace('{n}', String(filteredOrders.length))}</span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-black text-emerald-700">
              {t('orders.listTotalSum') || 'Jami'}: ${formatUsd(listTotalSumma)}
            </span>
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-black text-indigo-700">
              {t('orders.listTotalQty') || 'Miqdor'}: {formatOrderQtyPlain(listTotalQty)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
