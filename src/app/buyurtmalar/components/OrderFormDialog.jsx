'use client';
import React from 'react';
import { 
  X, 
  ScanLine, 
  Save, 
  Trash2, 
  Plus, 
  Check, 
  AlertCircle,
  Layers,
  Square,
  RotateCcw
} from 'lucide-react';
import { 
  formatUsd, 
  computeOrderLineSubtotal, 
  labelColorCanonical,
  parseOrderItemQty,
} from '../utils';

export default function OrderFormDialog({
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
  products
}) {
  if (!isAdding) return null;

  const formImageCellClass = "w-10 h-10 sm:w-12 sm:h-12";

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
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <label className="block text-sm font-bold text-gray-700">{t('orders.customer')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                  placeholder={t('orders.customerNamePlaceholder')}
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  list="crm-customer-name-hints"
                  required
                  autoComplete="off"
                />
                <datalist id="crm-customer-name-hints">
                  {customers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <input
                  type="tel"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                  placeholder={t('orders.customerPhonePlaceholder')}
                  value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">{t('orders.pickExistingCustomer')}</label>
              <select
                className="w-full sm:max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 outline-none"
                value={form.customer_id}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setForm({ ...form, customer_id: '' });
                    return;
                  }
                  const c = customers.find((x) => String(x.id) === String(id));
                  if (c) {
                    setForm({
                      ...form,
                      customer_id: id,
                      customer_name: c.name || '',
                      customer_phone: c.phone || ''
                    });
                  }
                }}
              >
                <option value="">{t('orders.existingCustomerNone')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` — ${c.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-3 space-y-2">
            <label className="block text-sm font-bold text-gray-700">{t('orders.note')}</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t('orders.notePlaceholder')}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[4.5rem] text-sm"
              rows={3}
            />
            <p className="text-xs text-gray-500">{t('orders.noteHintCreate')}</p>
          </div>

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
                    onChange={(e) => setTableConfig((prev) => ({ ...prev, imageSize: e.target.value }))}
                    className="px-2 py-1 border border-gray-200 rounded-md bg-white outline-none"
                  >
                    <option value="sm">Kichik</option>
                    <option value="md">O'rta</option>
                    <option value="lg">Katta</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tableConfig.showFormImageColumn}
                    onChange={(e) => setTableConfig((prev) => ({ ...prev, showFormImageColumn: e.target.checked }))}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Rasm ustuni</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tableConfig.showFormColorColumn}
                    onChange={(e) => setTableConfig((prev) => ({ ...prev, showFormColorColumn: e.target.checked }))}
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
                      {tableConfig.showFormImageColumn && <th className="px-3 py-2 w-28">Rasm</th>}
                      <th className="px-3 py-2">{t('orders.lineProduct')}</th>
                      <th className="px-3 py-2 min-w-[8rem] max-w-[16rem]">{t('orders.lineItemNote')}</th>
                      {tableConfig.showFormColorColumn && <th className="px-3 py-2 min-w-[200px]">{t('orders.lineColor')}</th>}
                      <th className="px-3 py-2 w-24">{t('orders.lineUnitPrice')}</th>
                      <th className="px-3 py-2 w-24">
                        <span className="block">{t('orders.quantity')}</span>
                        <span className="block text-[9px] font-normal normal-case text-gray-400 leading-tight">
                          dona / kg
                        </span>
                      </th>
                      <th className="px-3 py-2 w-24">{t('orders.lineSubtotal')}</th>
                      <th className="px-3 py-2 w-10 text-center"><Plus size={14} className="inline opacity-40" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orderFormTableRows.map((row) => {
                      const formColumnCount = 8 + (tableConfig.showFormImageColumn ? 1 : 0) + (tableConfig.showFormColorColumn ? 1 : 0);
                      
                      if (row.type === 'catHeader') {
                        return (
                          <tr key={row.key} className="bg-emerald-50/90">
                            <td colSpan={formColumnCount} className="px-3 py-2 text-sm font-bold text-emerald-900 border-t border-emerald-100">
                              {t('products.category')}: {row.label}
                            </td>
                          </tr>
                        );
                      }
                      
                      if (row.type === 'catSubtotal') {
                        const subtotalLeftCols = 6 + (tableConfig.showFormImageColumn ? 1 : 0) + (tableConfig.showFormColorColumn ? 1 : 0);
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
                        );
                      }

                      const line = row.line;
                      const isMatrix = line.colorChoices?.length > 1;
                      const qtySum = isMatrix
                        ? line.colorChoices.reduce((s, c) => s + parseOrderItemQty(line.colorQtyByColor?.[c] ?? '0'), 0)
                        : parseOrderItemQty(line.quantity);
                      const sub = computeOrderLineSubtotal(line);
                      const prodRow = line.product_id && products.find((p) => String(p.id) === String(line.product_id));
                      const lineIsKg = Boolean(prodRow?.is_kg);
                      const stockNum = prodRow?.stock != null && prodRow.stock !== '' ? Number(prodRow.stock) : null;
                      const stockWarn = stockNum != null && Number.isFinite(stockNum) && stockNum >= 0 && qtySum > stockNum;

                      return (
                        <tr key={line.id} className="bg-white group hover:bg-gray-50/50 transition-colors">
                          <td className="px-3 py-2 align-top">
                            <input
                              ref={line.id === firstCodeLineId ? firstModelCodeRef : undefined}
                              type="text"
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder={t('orders.modelCodePlaceholder')}
                              value={line.codeInput}
                              onChange={(e) => updateOrderLine(line.id, {
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
                                readyForSort: false
                              })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  resolveOrderLine(line.id);
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
                                <div className={`rounded-lg bg-white flex items-center justify-center overflow-hidden ring-1 ring-gray-200/60 shadow-sm ${formImageCellClass}`}>
                                  <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                                </div>
                              ) : (
                                <div className={`rounded-lg border border-dashed border-gray-200/90 bg-white shadow-sm ${formImageCellClass}`} />
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
                                  {line.keepSeparate ? (
                                    <Layers className="w-3 h-3" />
                                  ) : (
                                    <Square className="w-3 h-3" />
                                  )}
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
                                      {(p.color && labelColorCanonical(p.color, productColors, language)) || displayProductName(p) || String(p.id).slice(0, 8)}
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
                                    const prod = products.find(p => String(p.id) === String(line.product_id));
                                    if (prod) {
                                      updateOrderLine(line.id, { product_price: Number(prod.sale_price) || 0 });
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
                      );
                    })}
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
              
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 flex items-center gap-4 shadow-sm">
                <span className="text-sm font-bold text-blue-700 uppercase tracking-tight">{t('orders.grandTotal')}:</span>
                <span className="text-2xl font-bold text-blue-900 font-mono tabular-nums">${formatUsd(form.total || 0)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
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
                <option value="telefon">{t('orders.sourcePhone')}</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8">
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
                isSavingOrder ? 'opacity-70 cursor-not-allowed pointer-events-none' : 'hover:bg-blue-700 hover:shadow-blue-600/40'
              }`}
            >
              <Save size={20} />
              {isSavingOrder ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
