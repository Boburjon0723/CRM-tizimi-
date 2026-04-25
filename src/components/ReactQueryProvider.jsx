'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export default function ReactQueryProvider({ children }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // 60 soniya davomida ma'lumot "yangi" hisoblanadi — har sahifa o'tishda qayta so'rov yuborilmaydi
                        staleTime: 60 * 1000,
                        // Foydalanuvchi boshqa tabdan qaytganda avtomatik yangilanmasin (Supabase realtime bor)
                        refetchOnWindowFocus: false,
                        // Tarmoq xatosida 2 marta qayta urinish
                        retry: 2,
                        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
                    },
                },
            })
    )

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}
