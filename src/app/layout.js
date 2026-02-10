import { Inter } from 'next/font/google'
import { LanguageProvider } from '@/context/LanguageContext'
import { LayoutProvider } from '@/context/LayoutContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { AuthWrapper } from '@/components/AuthWrapper'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <head>
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CRM Dashboard" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className={inter.className}>
        <LanguageProvider>
          <LayoutProvider>
            <NotificationProvider>
              <AuthWrapper>
                {children}
              </AuthWrapper>
            </NotificationProvider>
          </LayoutProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}