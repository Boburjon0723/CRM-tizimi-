'use client'

import { LayoutGrid, BarChart2, Users, Wallet, ShoppingCart } from 'lucide-react'

export default function BottomNav({ activeTab, setActiveTab, role }) {
    const navItems = [
        { id: 'dashboard', label: 'Asosiy', icon: LayoutGrid, roles: ['admin', 'manager', 'finance', 'staff'] },
        { id: 'orders', label: 'Buyurtmalar', icon: ShoppingCart, roles: ['admin', 'manager', 'staff'] },
        { id: 'stats', label: 'Statistika', icon: BarChart2, roles: ['admin', 'manager'] },
        { id: 'employees', label: 'Xodimlar', icon: Users, roles: ['admin', 'manager', 'finance'] },
        { id: 'finance', label: 'Moliya', icon: Wallet, roles: ['admin', 'finance'] },
    ]

    // Filter items based on the active role
    const visibleItems = navItems.filter((item) => item.roles.includes(role))

    if (visibleItems.length === 0) return null

    return (
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-slate-900/80 backdrop-blur-xl border-t border-slate-800/50 pb-safe shadow-[0_-8px_30px_rgb(0,0,0,0.4)] z-50">
            <div className="flex items-center justify-around px-2 min-h-[64px]">
                {visibleItems.map((item) => {
                    const Icon = item.icon
                    const isActive = activeTab === item.id
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`flex flex-col items-center justify-center w-full py-2 space-y-1 transition-colors ${
                                isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <div className="relative">
                                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                                {isActive && (
                                    <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400" />
                                )}
                            </div>
                            <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'text-indigo-400' : ''}`}>
                                {item.label}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
