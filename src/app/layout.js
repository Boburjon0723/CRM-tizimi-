import { Inter } from 'next/font/google'
import './globals.css'
import AuthWrapper from '@/components/AuthWrapper'
import { LayoutProvider } from '@/context/LayoutContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'CRM Boshqaruv Tizimi',
  description: 'Sex boshligi uchun to\'liq CRM tizimi',
  manifest: '/manifest.json',
  themeColor: '#000000',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CRM Dashboard',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <body className={inter.className}>
        <LayoutProvider>
          <AuthWrapper>
            {children}
          </AuthWrapper>
        </LayoutProvider>
      </body>
    </html>
  )
}