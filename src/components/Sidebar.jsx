'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Package, Users, ShoppingCart, UserCircle, DollarSign, Home, LogOut, Settings, Globe, X, BarChart3, Warehouse } from 'lucide-react'
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
    <div className={`w-64 bg-gray-900 text-white min-h-screen p-4 fixed left-0 top-0 z-50 transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="flex justify-between items-center mb-8 pt-4">
        <div>
          <h1 className="text-2xl font-bold">CRM Tizimi</h1>
          <p className="text-sm text-gray-400">Boshqaruv Paneli</p>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="lg:hidden p-2 hover:bg-gray-800 rounded-lg"
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
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${isActive
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
                }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-800 pt-4 mt-auto">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-gray-800 transition"
        >
          <LogOut size={20} />
          <span>Chiqish</span>
        </button>
      </div>
    </div>
  )
}
