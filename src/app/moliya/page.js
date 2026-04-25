'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import MoliyaTopNav from '@/components/MoliyaTopNav'
import { Building2, FileSpreadsheet, ChevronRight, Users } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'

export default function MoliyaHubPage() {
    const { toggleSidebar } = useLayout()
    const { t } = useLanguage()

    return (
        <div className="max-w-3xl mx-auto px-6 pb-16">
            <Header title={t('finances.moliyaSectionTitle')} toggleSidebar={toggleSidebar} />
            <MoliyaTopNav />

            <p className="text-gray-600 text-sm mb-6 leading-relaxed">{t('finances.moliyaRootIntro')}</p>

            <div className="flex flex-wrap items-center gap-2 text-sm mb-8 pb-6 border-b border-gray-100">
                <span className="text-gray-500 font-medium">{t('finances.hubQuickLinks')}:</span>
                <Link
                    href="/moliya/boshqaruv"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    {t('finances.financeBranchPartners')}
                    <ChevronRight size={14} className="opacity-60" />
                </Link>
                <Link
                    href="/moliya/bolimlar"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    {t('finances.financeBranchDepartments')}
                    <ChevronRight size={14} className="opacity-60" />
                </Link>
                <Link
                    href="/moliya/hisobotlar"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    {t('finances.financeBranchReports')}
                    <ChevronRight size={14} className="opacity-60" />
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link
                    href="/moliya/boshqaruv"
                    className="group flex flex-col items-center justify-center gap-4 p-10 rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-900 text-white shadow-xl transition-transform duration-200 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-300 min-h-[200px]"
                >
                    <div className="p-4 rounded-2xl bg-white/10 ring-1 ring-white/20 group-hover:bg-white/15 transition-colors">
                        <Users size={44} className="opacity-95" />
                    </div>
                    <span className="text-xl font-bold text-center">{t('finances.financeBranchPartners')}</span>
                    <span className="text-sm text-emerald-100 text-center max-w-[240px] leading-snug">
                        {t('finances.partnersManageSubtitle')}
                    </span>
                </Link>

                <Link
                    href="/moliya/bolimlar"
                    className="group flex flex-col items-center justify-center gap-4 p-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-xl transition-transform duration-200 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white min-h-[200px]"
                >
                    <div className="p-4 rounded-2xl bg-white/10 ring-1 ring-white/20 group-hover:bg-white/15 transition-colors">
                        <Building2 size={44} className="opacity-95" />
                    </div>
                    <span className="text-xl font-bold text-center">{t('finances.financeBranchDepartments')}</span>
                    <span className="text-sm text-slate-300 text-center max-w-[240px] leading-snug">
                        {t('finances.moliyaCardDepartmentsHint')}
                    </span>
                </Link>

                <Link
                    href="/moliya/hisobotlar"
                    className="group flex flex-col items-center justify-center gap-4 p-10 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-800 text-white shadow-xl transition-transform duration-200 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-cyan-300 min-h-[200px]"
                >
                    <div className="p-4 rounded-2xl bg-white/10 ring-1 ring-white/20 group-hover:bg-white/15 transition-colors">
                        <FileSpreadsheet size={44} className="opacity-95" />
                    </div>
                    <span className="text-xl font-bold text-center">{t('finances.financeBranchReports')}</span>
                    <span className="text-sm text-cyan-100 text-center max-w-[240px] leading-snug">{t('finances.moliyaCardReportsHint')}</span>
                </Link>
            </div>
        </div>
    )
}
