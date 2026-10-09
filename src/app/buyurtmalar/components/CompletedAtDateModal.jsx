'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, Briefcase, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { pickLocalizedName } from '@/utils/localizedName'
import { todayDateInputValue } from '../utils'
import { loadActiveFinancePartners } from '../lib/partnerSaleFromOrder'

/**
 * Buyurtmani «Tugallangan» qilishda chiqish sanasi va (ixtiyoriy) hamkorni tanlash.
 */
export default function CompletedAtDateModal({
    open,
    orderLabel = '',
    initialDate = '',
    initialPartnerId = '',
    onConfirm,
    onCancel,
}) {
    const { t, language } = useLanguage()
    const [dateValue, setDateValue] = useState(initialDate || todayDateInputValue())
    const [partnerId, setPartnerId] = useState('')
    const [partners, setPartners] = useState([])
    const [partnersState, setPartnersState] = useState('idle')
    const inputRef = useRef(null)

    useEffect(() => {
        if (!open) return
        setDateValue(initialDate || todayDateInputValue())
        setPartnerId(initialPartnerId || '')
        const tmr = setTimeout(() => inputRef.current?.focus?.(), 50)
        return () => clearTimeout(tmr)
    }, [open, initialDate, initialPartnerId])

    useEffect(() => {
        if (!open) return
        let cancelled = false
        setPartnersState('loading')
        loadActiveFinancePartners(supabase).then(({ partners: list, missing, error }) => {
            if (cancelled) return
            if (error) console.error('finance_partners load:', error)
            setPartners(list)
            setPartnersState(missing ? 'missing' : 'ready')
        })
        return () => {
            cancelled = true
        }
    }, [open])

    const partnerOptions = useMemo(
        () =>
            partners
                .map((p) => ({ id: p.id, name: pickLocalizedName(p, language) || '—' }))
                .sort((a, b) => a.name.localeCompare(b.name, 'uz')),
        [partners, language]
    )

    if (!open) return null

    function submit(e) {
        e?.preventDefault?.()
        if (!dateValue) return
        onConfirm?.(dateValue, partnerId || null)
    }

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" onClick={onCancel} />
            <div
                className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-5 py-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-xl bg-emerald-100 p-2 text-emerald-700">
                            <CalendarCheck size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-900">
                                {t('orders.completedAtPromptTitle') || 'Chiqish sanasi'}
                            </h3>
                            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                                {t('orders.completedAtPromptHint') ||
                                    'Buyurtma tugallangan (chiqqan) sanani kiriting. Chop etishda shu sana chiqadi.'}
                            </p>
                            {orderLabel ? (
                                <p className="mt-2 text-xs font-bold text-emerald-700">{orderLabel}</p>
                            ) : null}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={submit} className="px-5 py-5 space-y-4">
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            {t('orders.completedAtPromptLabel') || 'Sana'}
                        </span>
                        <input
                            ref={inputRef}
                            type="date"
                            required
                            value={dateValue}
                            onChange={(e) => setDateValue(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                    </label>

                    {partnersState !== 'missing' ? (
                        <label className="block">
                            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                                <Briefcase size={14} />
                                {t('orders.completedAtPartnerLabel') || 'Hamkor'}
                            </span>
                            <select
                                value={partnerId}
                                onChange={(e) => setPartnerId(e.target.value)}
                                disabled={partnersState === 'loading'}
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50"
                            >
                                <option value="">
                                    {partnersState === 'loading'
                                        ? t('common.loading') || 'Yuklanmoqda...'
                                        : t('orders.completedAtPartnerNone') || '— Hamkorsiz —'}
                                </option>
                                {partnerOptions.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                            <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-500">
                                {partnerId
                                    ? t('orders.completedAtPartnerHint') ||
                                      'Tugallanganda hamkorlar moliyasiga shu hamkorga «Mahsulot sotuvi» bo‘lib yoziladi.'
                                    : t('orders.completedAtPartnerNoneHint') ||
                                      'Hamkor tanlanmasa, moliyaga hech narsa yozilmaydi.'}
                            </span>
                        </label>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                            {t('common.cancel') || 'Bekor'}
                        </button>
                        <button
                            type="submit"
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
                        >
                            {t('orders.completedAtPromptConfirm') || 'Tugallash'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
