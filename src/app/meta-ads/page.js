'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import { useLanguage } from '@/context/LanguageContext'
import { useLayout } from '@/context/LayoutContext'
import { listAdAccounts, getCampaignInsights, META_GRAPH_API_VERSION } from '@/lib/metaMarketing'

const TOKEN_KEY = 'meta_marketing_token_v1'

export default function MetaAdsPage() {
    const { t } = useLanguage()
    const { toggleSidebar } = useLayout()
    const [token, setToken] = useState('')
    const [remember, setRemember] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [accounts, setAccounts] = useState(null)
    const [campaignId, setCampaignId] = useState('')
    const [insights, setInsights] = useState(null)

    useEffect(() => {
        try {
            const s = sessionStorage.getItem(TOKEN_KEY)
            if (s) {
                setToken(s)
                setRemember(true)
            }
        } catch (_) {
            /* ignore */
        }
    }, [])

    function persistToken(next) {
        try {
            if (remember) sessionStorage.setItem(TOKEN_KEY, next)
            else sessionStorage.removeItem(TOKEN_KEY)
        } catch (_) {
            /* ignore */
        }
    }

    async function handleLoadAccounts() {
        setError('')
        setAccounts(null)
        setLoading(true)
        try {
            const data = await listAdAccounts(token.trim())
            setAccounts(data)
            persistToken(token.trim())
        } catch (e) {
            setError(e.message || String(e))
        } finally {
            setLoading(false)
        }
    }

    async function handleLoadInsights() {
        setError('')
        setInsights(null)
        const id = campaignId.trim()
        if (!id) return
        setLoading(true)
        try {
            const data = await getCampaignInsights(token.trim(), id)
            setInsights(data)
            persistToken(token.trim())
        } catch (e) {
            setError(e.message || String(e))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <Header title={t('metaAdsPage.title')} toggleSidebar={toggleSidebar} />
            <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
                <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    {t('metaAdsPage.security')}
                </p>
                <p className="text-xs text-slate-500">
                    Graph API: {META_GRAPH_API_VERSION}
                </p>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-sm">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                        {t('metaAdsPage.tokenLabel')}
                    </label>
                    <textarea
                        className="w-full min-h-[80px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                        placeholder={t('metaAdsPage.tokenPlaceholder')}
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => {
                                setRemember(e.target.checked)
                                if (!e.target.checked) {
                                    try {
                                        sessionStorage.removeItem(TOKEN_KEY)
                                    } catch (_) {
                                        /* ignore */
                                    }
                                }
                            }}
                        />
                        {t('metaAdsPage.saveSession')}
                    </label>
                    <button
                        type="button"
                        onClick={handleLoadAccounts}
                        disabled={loading || !token.trim()}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
                    >
                        {loading ? t('metaAdsPage.loading') : t('metaAdsPage.btnAccounts')}
                    </button>
                </div>

                {error && (
                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
                        {t('metaAdsPage.error')}: {error}
                    </div>
                )}

                {accounts?.data?.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm overflow-x-auto">
                        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
                            {t('metaAdsPage.adAccountsTitle')}
                        </h2>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                                    <th className="pb-2 pr-2">{t('metaAdsPage.accountName')}</th>
                                    <th className="pb-2 pr-2">{t('metaAdsPage.adAccountId')}</th>
                                    <th className="pb-2">{t('metaAdsPage.currency')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.data.map((a) => (
                                    <tr key={a.id || a.account_id} className="border-b border-slate-100 dark:border-slate-800">
                                        <td className="py-2 pr-2">{a.name}</td>
                                        <td className="py-2 pr-2 font-mono text-xs">{a.id || `act_${a.account_id}`}</td>
                                        <td className="py-2">{a.currency}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {t('metaAdsPage.insightsBlockTitle')}
                    </h2>
                    <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                        placeholder={t('metaAdsPage.campaignIdPlaceholder')}
                        value={campaignId}
                        onChange={(e) => setCampaignId(e.target.value)}
                    />
                    <button
                        type="button"
                        onClick={handleLoadInsights}
                        disabled={loading || !token.trim() || !campaignId.trim()}
                        className="px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 dark:text-slate-900 text-white text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? t('metaAdsPage.loading') : t('metaAdsPage.btnInsights')}
                    </button>
                </div>

                {insights?.data?.length > 0 && (
                    <pre className="text-xs bg-slate-900 text-green-100 p-4 rounded-xl overflow-x-auto">
                        {JSON.stringify(insights.data, null, 2)}
                    </pre>
                )}

                {insights?.data?.length === 0 && insights !== null && !error && (
                    <p className="text-sm text-slate-500">{t('metaAdsPage.noInsights')}</p>
                )}
            </div>
        </div>
    )
}
