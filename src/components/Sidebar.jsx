'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Package, Users, ShoppingCart, UserCircle, DollarSign, Home, LogOut, Settings, Globe, X, BarChart3, Warehouse, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLayout } from '@/context/LayoutContext'

export default function Sidebar({ isOpen: propIsOpen, setIsOpen: propSetIsOpen }) {
  const { sidebarOpen, setSidebarOpen } = useLayout()
  const isOpen = propIsOpen !== undefined ? propIsOpen : sidebarOpen
  const setIsOpen = propSetIsOpen || setSidebarOpen

  const pathname = usePathname()
  const router = useRouter()

  const menuItems = [
    { href: '/', icon: Home, label: 'Dashboard' },
    { href: '/mahsulotlar', icon: Package, label: 'Mahsulotlar' },
    { href: '/ombor', icon: Warehouse, label: 'Ombor' },
    { href: '/buyurtmalar', icon: ShoppingCart, label: 'Buyurtmalar' },
    { href: '/mijozlar', icon: UserCircle, label: 'Mijozlar' },
    { href: '/xabarlar', icon: MessageSquare, label: 'Xabarlar' },
    { href: '/xodimlar', icon: Users, label: 'Xodimlar' },
    { href: '/moliya', icon: DollarSign, label: 'Moliya' },
    { href: '/statistika', icon: BarChart3, label: 'Statistika' },
    { href: '/vebsayt', icon: Globe, label: 'Web Sayt' },
  ]
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      router.push('/login')
    } else {
      alert('Chiqishda xatolik yuz berdi')
    }
  }

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div className={`w-72 bg-gradient-to-b from-blue-900 via-slate-900 to-slate-900 text-white min-h-screen p-6 fixed left-0 top-0 z-50 transition-all duration-300 shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="font-bold text-xl">CRM</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">TechGear</h1>
              <p className="text-xs text-blue-200">Boshqaruv Tizimi</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 group ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-[1.02]'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white hover:pl-5'
                  }`}
              >
                <Icon size={22} className={`transition-colors ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-blue-400'}`} />
                <span className="font-medium tracking-wide">{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/50" />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3.5 rounded-xl text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-all border border-transparent hover:border-red-500/20"
          >
            <LogOut size={20} />
            <span className="font-medium">Chiqish</span>
          </button>
        </div>
      </div>
    </>
  )
}
