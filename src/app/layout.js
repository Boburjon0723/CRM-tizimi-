import { Inter } from 'next/font/google'
import { LanguageProvider } from '@/context/LanguageContext'
import { LayoutProvider } from '@/context/LayoutContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { DialogProvider } from '@/context/DialogContext'
import { ThemeProvider } from '@/context/ThemeContext'
import AuthWrapper from '@/components/AuthWrapper'
import AIAgent from '@/components/AIAgent'
import ReactQueryProvider from '@/components/ReactQueryProvider'
import ChunkErrorRecovery from '@/components/ChunkErrorRecovery'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const viewport = {
    themeColor: '#031c24',
}

/** Brauzer yorlig‘i, PWA va Apple — barchasi yangi ERP `favicon.svg` */
export const metadata = {
    title: 'Nuur_Home_Collection',
    manifest: '/manifest.json',
    icons: {
        icon: [{ url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' }],
        shortcut: '/favicon.svg',
        apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Nuur Home CRM',
    },
}

export default function RootLayout({ children }) {
    return (
        <html lang="uz">
            <body className={inter.className}>
                <ReactQueryProvider>
                    <LanguageProvider>
                        <ThemeProvider>
                            <LayoutProvider>
                                <NotificationProvider>
                                    <DialogProvider>
                                        <ChunkErrorRecovery />
                                        <AuthWrapper>{children}</AuthWrapper>
                                        <AIAgent />
                                    </DialogProvider>
                                </NotificationProvider>
                            </LayoutProvider>
                        </ThemeProvider>
                    </LanguageProvider>
                </ReactQueryProvider>
            </body>
        </html>
    )
}
