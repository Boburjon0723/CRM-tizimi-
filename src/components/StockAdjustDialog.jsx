'use client'

import React, { useState } from 'react'
import { X, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

export default function StockAdjustDialog({ product, onClose, onConfirm }) {
    const { t } = useLanguage()
    const [amount, setAmount] = useState('')
    const [reason, setReason] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        const num = parseFloat(amount)
        if (isNaN(num)) return

        setIsSubmitting(true)
        try {
            await onConfirm(num, reason)
            onClose()
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!product) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                onClick={onClose}
            />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900">
                        {t('warehouse.adjustStockTitle') || 'Zaxirani tahrirlash'}
                    </h3>
                    <button 
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <p className="text-sm font-semibold text-blue-900 mb-1">{product.name}</p>
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                            <Info size={16} />
                            <span>{t('warehouse.currentStock') || 'Hozirgi miqdor'}: <strong>{product.stock}</strong></span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">
                                {t('warehouse.changeAmount') || 'O\'zgarish miqdori'}
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="any"
                                    required
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="+10 yoki -5"
                                    className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all font-mono font-bold text-lg"
                                    autoFocus
                                />
                                <div className="absolute right-4 top-3.5">
                                    {parseFloat(amount) > 0 ? (
                                        <ArrowUpRight className="text-green-500" size={20} />
                                    ) : parseFloat(amount) < 0 ? (
                                        <ArrowDownRight className="text-red-500" size={20} />
                                    ) : null}
                                </div>
                            </div>
                            <p className="mt-1.5 text-xs text-gray-500">
                                {t('warehouse.changeHint') || 'Musbat son qo\'shadi, manfiy son ayiradi.'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">
                                {t('warehouse.reason') || 'Sabab'}
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder={t('warehouse.reasonPlaceholder') || 'Masalan: Restok, inventarizatsiya...'}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all resize-none h-24 text-sm"
                            />
                        </div>
                    </div>

                    <div className="mt-8 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all"
                        >
                            {t('common.cancel') || 'Bekor qilish'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !amount}
                            className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none transition-all"
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                            ) : (
                                t('common.save') || 'Saqlash'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
