'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Smartphone } from 'lucide-react'
import {
    applyDesktopViewport,
    goToMobileSite,
    prefersDesktopView,
} from '@/lib/viewPreference'

/**
 * Tanlangan «kompyuter versiyasi» ni telefonlarda ham saqlaydi:
 * viewport + CSS class (Tailwind md/lg breakpointlari ishlashi uchun).
 * Chiqish tugmasi viewport kengayganda ham ko‘rinadi.
 */
export default function DesktopViewBootstrap() {
    const pathname = usePathname()
    const [showExit, setShowExit] = useState(false)

    useEffect(() => {
        const onMobileRoute = pathname?.startsWith('/mobile')
        const wantDesktop = prefersDesktopView() && !onMobileRoute
        applyDesktopViewport(wantDesktop)
        setShowExit(wantDesktop)
    }, [pathname])

    if (!showExit) return null

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2 pointer-events-none">
            <button
                type="button"
                onClick={() => goToMobileSite()}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-xl shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 transition-all"
            >
                <Smartphone size={18} />
                Mobil versiya
            </button>
        </div>
    )
}
