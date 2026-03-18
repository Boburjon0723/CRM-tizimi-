import { Inter } from 'next/font/google'
import { LanguageProvider } from '@/context/LanguageContext'
import { LayoutProvider } from '@/context/LayoutContext'
import { NotificationProvider } from '@/context/NotificationContext'
import AuthWrapper from '@/components/AuthWrapper'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <head>
        <title>Nuur_Home_Collection</title>
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Nuur_Home_Collection" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/favicon.svg" />

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