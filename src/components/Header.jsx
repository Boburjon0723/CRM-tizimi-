import { Bell, Search, User, Menu, X, ShoppingBag, Globe } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useNotifications } from '@/context/NotificationContext'
import { useLanguage } from '@/context/LanguageContext'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

export default function Header({ title, toggleSidebar: propToggleSidebar }) {
    const { toggleSidebar: contextToggleSidebar } = useLayout()
    const toggleSidebar = propToggleSidebar || contextToggleSidebar
    const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification } = useNotifications()
    const { language, changeLanguage, t } = useLanguage()
    const [showNotifications, setShowNotifications] = useState(false)
    const [showLangMenu, setShowLangMenu] = useState(false)
    const dropdownRef = useRef(null)
    const langRef = useRef(null)

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowNotifications(false)
            }
            if (langRef.current && !langRef.current.contains(event.target)) {
                setShowLangMenu(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    function formatTimeAgo(timestamp) {
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000)

        if (language === 'uz') {
            if (seconds < 60) return 'hozirgina'
            if (seconds < 3600) return `${Math.floor(seconds / 60)} daqiqa oldin`
            if (seconds < 86400) return `${Math.floor(seconds / 3600)} soat oldin`
            return `${Math.floor(seconds / 86400)} kun oldin`
        } else if (language === 'ru') {
            if (seconds < 60) return 'только что'
            if (seconds < 3600) return `${Math.floor(seconds / 60)} мин. назад`
            if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. назад`
            return `${Math.floor(seconds / 86400)} дн. назад`
        } else {
            if (seconds < 60) return 'just now'
            if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
            if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
            return `${Math.floor(seconds / 86400)} d ago`
        }
    }

    return (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-gray-100 px-4 md:px-6 py-3 md:py-4 mb-6 md:mb-8 transition-all duration-300">
            <div className="flex justify-between items-center max-w-7xl mx-auto w-full">
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleSidebar}
                        className="lg:hidden p-2 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors"
                    >
                        <Menu size={24} />
                    </button>
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">{title}</h2>
                        <p className="hidden md:block text-sm text-gray-500 font-medium">
                            {new Date().toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Language Switcher */}
                    <div className="relative" ref={langRef}>
                        <button
                            onClick={() => setShowLangMenu(!showLangMenu)}
                            className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-all font-medium uppercase text-sm"
                        >
                            <Globe size={20} className="text-blue-600" />
                            <span>{language}</span>
                        </button>

                        {showLangMenu && (
                            <div className="absolute right-0 mt-2 w-32 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fade-in">
                                <button
                                    onClick={() => { changeLanguage('uz'); setShowLangMenu(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${language === 'uz' ? 'text-blue-600 font-bold' : 'text-gray-600'}`}
                                >
                                    O'zbekcha
                                </button>
                                <button
                                    onClick={() => { changeLanguage('ru'); setShowLangMenu(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${language === 'ru' ? 'text-blue-600 font-bold' : 'text-gray-600'}`}
                                >
                                    Русский
                                </button>
                                <button
                                    onClick={() => { changeLanguage('en'); setShowLangMenu(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${language === 'en' ? 'text-blue-600 font-bold' : 'text-gray-600'}`}
                                >
                                    English
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="relative p-2.5 hover:bg-gray-100 rounded-xl text-gray-500 transition-all hover:text-blue-600"
                        >
                            <Bell size={22} />
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {showNotifications && (
                            <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fade-in">
                                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                                    <h3 className="font-bold text-gray-800">{t('common.notifications')}</h3>
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllAsRead}
                                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                        >
                                            {t('common.markAllRead')}
                                        </button>
                                    )}
                                </div>

                                <div className="max-h-[400px] overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                            <Bell size={40} className="mb-3 opacity-20" />
                                            <p className="text-sm">{t('common.noNotifications')}</p>
                                        </div>
                                    ) : (
                                        notifications.map(notification => (
                                            <div
                                                key={notification.id}
                                                className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${!notification.read ? 'bg-blue-50/30' : ''
                                                    }`}
                                                onClick={() => {
                                                    markAsRead(notification.id)
                                                    setShowNotifications(false)
                                                    window.location.href = '/buyurtmalar'
                                                }}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                                        <ShoppingBag size={20} className="text-blue-600" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <h4 className="font-bold text-gray-800 text-sm">
                                                                {notification.title}
                                                            </h4>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    clearNotification(notification.id)
                                                                }}
                                                                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            {notification.message}
                                                        </p>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            {formatTimeAgo(notification.timestamp)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {notifications.length > 0 && (
                                    <Link
                                        href="/buyurtmalar"
                                        onClick={() => setShowNotifications(false)}
                                        className="block w-full py-3 text-center text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                                    >
                                        {t('common.viewAllOrders')}
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="h-8 w-[1px] bg-gray-200 mx-1"></div>

                    <button className="flex items-center gap-3 pl-2 pr-4 py-1.5 hover:bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 transition-all">
                        <div className="w-9 h-9 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white shadow-md">
                            <User size={18} />
                        </div>
                        <div className="hidden sm:block text-left">
                            <p className="text-sm font-bold text-gray-700 leading-none">{t('common.admin')}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{t('common.manager')}</p>
                        </div>
                    </button>
                </div>
            </div>
        </header>
    )
}