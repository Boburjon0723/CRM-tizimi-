'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Package, Users, ShoppingCart, UserCircle, DollarSign, Home, LogOut, Settings, Globe, X, BarChart3, Warehouse, MessageSquare, ChevronDown, Image as ImageIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'

const LANGUAGES = [
  { code: 'uz', label: "O'zbekcha" },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' }
]

export default function Sidebar({ isOpen: propIsOpen, setIsOpen: propSetIsOpen }) {
  const { sidebarOpen, setSidebarOpen } = useLayout()
  const { t, language, changeLanguage } = useLanguage()
  const [showLangDropdown, setShowLangDropdown] = useState(false)
  const langDropdownRef = useRef(null)
  const isOpen = propIsOpen !== undefined ? propIsOpen : sidebarOpen
  const setIsOpen = propSetIsOpen || setSidebarOpen

  const pathname = usePathname()
  const router = useRouter()
  const [siteName, setSiteName] = useState('Nuur Home')

  useEffect(() => {
    async function getSettings() {
      const { data } = await supabase.from('settings').select('site_name').limit(1).single()
      if (data?.site_name) setSiteName(data.site_name)
    }
    getSettings()
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setShowLangDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const menuItems = [
    { href: '/', icon: Home, label: t('common.dashboard') },
    { href: '/media-library', icon: ImageIcon, label: t('common.mediaLibraryMenu') },
    { href: '/mahsulotlar', icon: Package, label: t('common.products') },
    { href: '/buyurtmalar', icon: ShoppingCart, label: t('common.orders') },
    { href: '/mijozlar', icon: UserCircle, label: t('common.customers') },
    { href: '/xabarlar', icon: MessageSquare, label: t('common.messages') },
    { href: '/xodimlar', icon: Users, label: t('common.employees') },
    { href: '/moliya', icon: DollarSign, label: t('common.finance') },
    { href: '/statistika', icon: BarChart3, label: t('common.statistics') },
    { href: '/vebsayt', icon: Globe, label: t('common.website') },
  ]
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      router.push('/login')
    } else {
      await showAlert(t('common.logoutError'), { variant: 'error' })
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

      <div className={`w-72 bg-gradient-to-b from-blue-900 via-slate-900 to-slate-900 text-white h-screen p-6 fixed left-0 top-0 z-50 transition-all duration-300 shadow-2xl flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex justify-between items-center mb-8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shadow-lg backdrop-blur-sm border border-white/10">
              <img src="/favicon.svg" alt="CRM Logo" className="w-8 h-8 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">{siteName}</h1>
              <p className="text-xs text-blue-200">{t('common.managementSystem')}</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-1.5 flex-1 overflow-y-auto pr-2 custom-scrollbar pb-6">
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

        <div className="pt-6 border-t border-white/5 flex-shrink-0 space-y-2">
          {/* Til tanlash - dropdown */}
          <div className="relative" ref={langDropdownRef}>
            <button
              onClick={() => setShowLangDropdown(!showLangDropdown)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-gray-300 hover:bg-white/5 hover:text-white transition-all border border-white/5"
            >
              <div className="flex items-center gap-3">
                <Globe size={20} className="text-blue-300" />
                <span className="font-medium">{LANGUAGES.find(l => l.code === language)?.label || language}</span>
              </div>
              <ChevronDown size={18} className={`text-gray-400 transition-transform ${showLangDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showLangDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 rounded-xl border border-white/10 overflow-hidden shadow-xl z-50">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { changeLanguage(lang.code); setShowLangDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${language === lang.code ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3.5 rounded-xl text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-all border border-transparent hover:border-red-500/20"
          >
            <LogOut size={20} />
            <span className="font-medium">{t('common.logout')}</span>
          </button>
        </div>
      </div>
    </>
  )
}
