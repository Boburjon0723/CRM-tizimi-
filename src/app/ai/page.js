'use client'

import Header from '@/components/Header'
import AIAgent from '@/components/AIAgent'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'

export default function AiPage() {
    const { toggleSidebar } = useLayout()
    const { t } = useLanguage()

    return (
        <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-orange-50/30 to-amber-50/40">
            <Header title={t('common.ai') || 'AI'} toggleSidebar={toggleSidebar} />
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-3 pb-4 pt-0 sm:px-6 lg:px-8">
                <p className="mb-3 text-sm text-slate-600">
                    Buyurtmalar, hamkorlar moliyasi va bo‘lim xarajatlarini to‘liq ekranda so‘rang —
                    jadvallar kengroq va aniqroq ko‘rinadi.
                </p>
                <div className="min-h-0 flex-1" style={{ height: 'calc(100vh - 11rem)' }}>
                    <AIAgent variant="page" />
                </div>
            </div>
        </div>
    )
}
