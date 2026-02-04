'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { useLayout } from '@/context/LayoutContext'

export default function AuthWrapper({ children }) {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const { sidebarOpen, setSidebarOpen } = useLayout()
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        let mounted = true;

        // Check active session
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (mounted) {
                setSession(session);
                setLoading(false);

                const isLoginPage = pathname.startsWith('/login');
                if (!session && !isLoginPage) {
                    router.replace('/login');
                } else if (session && isLoginPage) {
                    router.replace('/');
                }
            }
        };

        checkSession();

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (mounted) {
                setSession(session);
                const isLoginPage = pathname.startsWith('/login');
                if (!session && !isLoginPage) {
                    router.replace('/login');
                } else if (session && isLoginPage) {
                    router.replace('/');
                }
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [pathname, router]);

    // Close sidebar on route change
    useEffect(() => {
        setSidebarOpen(false)
    }, [pathname, setSidebarOpen])

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    // Login page doesn't need Sidebar and extra wrapper
    if (pathname === '/login') {
        return <>{children}</>
    }

    // Protected pages
    if (!session) {
        return null
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
