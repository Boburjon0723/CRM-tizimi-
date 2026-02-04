import { Inter } from 'next/font/google'
import './globals.css'
import AuthWrapper from '@/components/AuthWrapper'
import { LayoutProvider } from '@/context/LayoutContext'
import { NotificationProvider } from '@/context/NotificationContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'CRM Boshqaruv Tizimi',
  description: 'Sex boshligi uchun to\'liq CRM tizimi',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CRM Dashboard',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#000000',
}

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
        <LayoutProvider>
          <NotificationProvider>
            <AuthWrapper>
              {children}
            </AuthWrapper>
          </NotificationProvider>
        </LayoutProvider>
      </body>
    </html>
  )
}