'use client'

import React, { memo } from 'react'

function OrderFormCustomerFields({ t, form, setForm, customers }) {
    return (
        <>
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
                            const id = e.target.value
                            if (!id) {
                                setForm({ ...form, customer_id: '' })
                                return
                            }
                            const c = customers.find((x) => String(x.id) === String(id))
                            if (c) {
                                setForm({
                                    ...form,
                                    customer_id: id,
                                    customer_name: c.name || '',
                                    customer_phone: c.phone || '',
                                })
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
        </>
    )
}

function customerFieldsPropsAreEqual(prev, next) {
    return (
        prev.form.customer_id === next.form.customer_id &&
        prev.form.customer_name === next.form.customer_name &&
        prev.form.customer_phone === next.form.customer_phone &&
        prev.form.note === next.form.note &&
        prev.customers === next.customers
    )
}

export default memo(OrderFormCustomerFields, customerFieldsPropsAreEqual)
