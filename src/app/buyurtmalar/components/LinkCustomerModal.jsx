'use client'

import { useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDialog } from '@/context/DialogContext'

export default function LinkCustomerModal({ order, customers, onClose, onSuccess }) {
    const { showAlert, showToast } = useDialog()
    const [selectedCustomerId, setSelectedCustomerId] = useState(order?.customer_id || '')
    const [saving, setSaving] = useState(false)

    if (!order) return null

    async function handleSave() {
        if (!selectedCustomerId) {
            await showAlert('Iltimos, mijozni tanlang!', { variant: 'warning' })
            return
        }
        const selectedCustomer = customers.find((c) => String(c.id) === String(selectedCustomerId))
        if (!selectedCustomer) {
            await showAlert('Tanlangan mijoz topilmadi!', { variant: 'error' })
            return
        }
        setSaving(true)
        try {
            const { error } = await supabase
                .from('orders')
                .update({
                    customer_id: selectedCustomer.id,
                    customer_phone: selectedCustomer.phone,
                    customer_name: selectedCustomer.name,
                })
                .eq('id', order.id)
            if (error) throw error
            showToast('Buyurtma mijozga muvaffaqiyatli biriktirildi!', { type: 'success' })
            onClose()
            await onSuccess?.()
        } catch (err) {
            console.error(err)
            await showAlert('Biriktirishda xatolik yuz berdi: ' + (err.message || err), {
                variant: 'error',
            })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-purple-50 px-6 py-5 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Buyurtmani mijozga biriktirish</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Buyurtma egasini mavjud CRM mijozlaridan biriga bog&apos;lash
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Buyurtma ma&apos;lumotlari
                        </span>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Buyurtma №:</span>
                            <span className="text-sm font-bold text-indigo-700 font-mono">
                                #{order.order_number || order.id.slice(0, 8)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Joriy mijoz:</span>
                            <span className="text-sm font-medium text-slate-700">
                                {order.customer_name || "Noma'lum"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Joriy telefon:</span>
                            <span className="text-sm font-medium text-slate-700 font-mono">
                                {order.customer_phone || '—'}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                            CRM Mijozini tanlang
                        </label>
                        <select
                            value={selectedCustomerId}
                            onChange={(e) => setSelectedCustomerId(e.target.value)}
                            disabled={saving}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer disabled:opacity-60"
                        >
                            <option value="" disabled>
                                -- Mijozni tanlang --
                            </option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({c.phone || "telefon yo'q"})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
                    >
                        Bekor qilish
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 disabled:opacity-60"
                    >
                        <UserPlus size={16} />
                        {saving ? '...' : 'Biriktirish'}
                    </button>
                </div>
            </div>
        </div>
    )
}
