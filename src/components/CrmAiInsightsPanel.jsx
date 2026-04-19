'use client'

import { useCallback, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

/**
 * CRM statistikalaridan AI qisqa hisobot (Google Gemini, server API).
 * summary — faqat yig‘ma raqamlar (PII minimallashtirilgan).
 */
export default function CrmAiInsightsPanel({ t, language, summary }) {
    const [text, setText] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const run = useCallback(async () => {
        setLoading(true)
        setError(null)
        setText('')
        try {
            const res = await fetch('/api/crm-ai/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locale: language === 'ru' ? 'ru' : language === 'en' ? 'en' : 'uz',
                    summary,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                if (data.error === 'missing_key' || res.status === 503) {
                    setError(t('statistics.aiErrorKey'))
                } else if (data.error === 'quota_exceeded' || res.status === 429) {
                    setError(t('statistics.aiQuotaError'))
                } else {
                    setError(data.message || t('statistics.aiError'))
                }
                return
            }
            if (data.ok && data.text) {
                setText(data.text)
            } else {
                setError(t('statistics.aiError'))
            }
        } catch (e) {
            setError(t('statistics.aiNet'))
        } finally {
            setLoading(false)
        }
    }, [summary, language, t])

    return (
        <div className="mb-8 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-base font-bold text-violet-950 flex items-center gap-2">
                        <Sparkles className="shrink-0 text-violet-600" size={20} aria-hidden />
                        {t('statistics.aiPanelTitle')}
                    </h3>
                    <p className="text-xs text-violet-800/80 mt-1 max-w-2xl leading-relaxed">{t('statistics.aiPanelHint')}</p>
                </div>
                <button
                    type="button"
                    onClick={run}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-600/25 hover:bg-violet-700 disabled:opacity-60 disabled:pointer-events-none transition-colors"
                >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    {loading ? t('statistics.aiLoading') : t('statistics.aiGenerate')}
                </button>
            </div>

            {error ? (
                <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
            ) : null}

            {text ? (
                <div className="mt-4 rounded-xl border border-violet-100 bg-white/80 px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {text}
                </div>
            ) : null}
        </div>
    )
}
