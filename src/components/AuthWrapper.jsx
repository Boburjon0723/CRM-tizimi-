'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { useLayout } from '@/context/LayoutContext'
import { withTimeout } from '@/lib/withTimeout'

export default function AuthWrapper({ children }) {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [authError, setAuthError] = useState(null)
    const { sidebarOpen, setSidebarOpen } = useLayout()
    const router = useRouter()
    const pathname = usePathname()

    const runInitialAuth = useCallback(async () => {
        setAuthError(null)
        setLoading(true)
        try {
            const { data: { session: nextSession } } = await withTimeout(
                supabase.auth.getSession(),
                25000,
                'Sessiya tekshirilmadi — tarmoq juda sekin yoki server javob bermayapti. Wi‑Fi / VPN ni tekshiring.'
            )
            setSession(nextSession)
            const isLoginPage = pathname.startsWith('/login')
            if (!nextSession && !isLoginPage) {
                router.replace('/login')
            } else if (nextSession && isLoginPage) {
                router.replace('/')
            }
        } catch (e) {
            setAuthError(e?.message || 'Sessiyani tekshirishda xatolik.')
            setSession(null)
        } finally {
            setLoading(false)
        }
    }, [pathname, router])

    useEffect(() => {
        runInitialAuth()
    }, [runInitialAuth])

    useEffect(() => {
        let mounted = true
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            if (!mounted) return
            setSession(nextSession)
            const isLoginPage = pathname.startsWith('/login')
            if (!nextSession && !isLoginPage) {
                router.replace('/login')
            } else if (nextSession && isLoginPage) {
                router.replace('/')
            }
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [pathname, router])

    // Close sidebar on route change
    useEffect(() => {
        setSidebarOpen(false)
    }, [pathname, setSidebarOpen])

    if (loading) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-6">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
                <p className="text-sm text-gray-500 text-center max-w-sm">
                    Ulanmoqda… agar uzoq vaqt aylansa, tarmoq sekin yoki server band bo‘lishi mumkin.
                </p>
            </div>
        )
    }

    if (authError) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
                <p className="text-red-700 font-medium max-w-md leading-relaxed">{authError}</p>
                <div className="flex flex-wrap justify-center gap-3">
                    <button
                        type="button"
                        onClick={() => runInitialAuth()}
                        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-700"
                    >
                        Qayta urinish
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push('/login')}
                        className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50"
                    >
                        Kirish sahifasi
                    </button>
                </div>
            </div>
        )
    }

    // Login or Mobile pages don't need Sidebar and extra wrapper
    if (pathname === '/login' || pathname.startsWith('/mobile')) {
        return <>{children}</>
    }

    // Sessiya yo‘q: yo‘nalish /login — «null» oq ekran bermasligi uchun yuklanish
    if (!session) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-50 text-gray-600">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
                <p className="text-sm font-medium">Kutilmoqda…</p>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

            {/* Backdrop for mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <main className={`flex-1 transition-all duration-300 lg:ml-64 md:ml-0 overflow-x-hidden`}>
                <div className="p-4 md:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
