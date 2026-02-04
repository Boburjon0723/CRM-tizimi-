import { Bell, Search, User, Menu, X, ShoppingBag } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useNotifications } from '@/context/NotificationContext'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

export default function Header({ title, toggleSidebar: propToggleSidebar }) {
    const { toggleSidebar: contextToggleSidebar } = useLayout()
    const toggleSidebar = propToggleSidebar || contextToggleSidebar
    const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification } = useNotifications()
    const [showNotifications, setShowNotifications] = useState(false)
    const dropdownRef = useRef(null)

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowNotifications(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    function formatTimeAgo(timestamp) {
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000)
        if (seconds < 60) return 'hozirgina'
        if (seconds < 3600) return `${Math.floor(seconds / 60)} daqiqa oldin`
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} soat oldin`
        return `${Math.floor(seconds / 86400)} kun oldin`
    }

    return (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-gray-100 px-6 py-4 mb-8 transition-all duration-300">
            <div className="flex justify-between items-center max-w-7xl mx-auto w-full">
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleSidebar}
                        className="lg:hidden p-2 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors"
                    >
                        <Menu size={24} />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">{title}</h2>
                        <p className="hidden md:block text-sm text-gray-500 font-medium">
                            {new Date().toLocaleDateString('uz-UZ', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
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
                            <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fade-in">
                                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                                    <h3 className="font-bold text-gray-800">Bildirishnomalar</h3>
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllAsRead}
                                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                        >
                                            Hammasini o'qilgan qilish
                                        </button>
                                    )}
                                </div>

                                <div className="max-h-[400px] overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                            <Bell size={40} className="mb-3 opacity-20" />
                                            <p className="text-sm">Bildirishnomalar yo'q</p>
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
                                        Barcha buyurtmalarni ko'rish
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
                            <p className="text-sm font-bold text-gray-700 leading-none">Admin</p>
                            <p className="text-xs text-gray-500 mt-0.5">Boshqaruvchi</p>
                        </div>
                    </button>
                </div>
            </div>
        </header>
    )
}