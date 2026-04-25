'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

export default function MoliyaTopNav() {
    const pathname = usePathname()
    const { t } = useLanguage()

    const items = [
        { href: '/moliya', labelKey: 'finances.moliyaRootNav', matchExact: true },
        { href: '/moliya/boshqaruv', labelKey: 'finances.financeBranchPartners' },
        { href: '/moliya/bolimlar', labelKey: 'finances.financeBranchDepartments' },
        { href: '/moliya/hisobotlar', labelKey: 'finances.financeBranchReports' },
    ]

    return (
        <nav className="sticky top-0 z-30 -mx-6 px-6 py-3 mb-6 flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible bg-white/90 backdrop-blur-md border-b border-gray-100 supports-[backdrop-filter]:bg-white/80 shadow-sm">
            {items.map(({ href, labelKey, matchExact }) => {
                const active = matchExact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                            active
                                ? 'bg-slate-900 text-white shadow-md ring-2 ring-slate-900/20'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                        }`}
                    >
                        {t(labelKey)}
                    </Link>
                )
            })}
        </nav>
    )
}
