import { Inter } from 'next/font/google'
import './globals.css'
import AuthWrapper from '@/components/AuthWrapper'
import { LayoutProvider } from '@/context/LayoutContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'CRM Boshqaruv Tizimi',
  description: 'Sex boshligi uchun to\'liq CRM tizimi',
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