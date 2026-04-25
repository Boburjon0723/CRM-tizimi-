'use client'

import { useState, useEffect } from 'react'
import BottomNav from './components/BottomNav'
import DashboardView from './views/DashboardView'
import OrdersView from './views/OrdersView'
import StatsView from './views/StatsView'
import EmployeesView from './views/EmployeesView'
import FinanceView from './views/FinanceView'
import { Settings } from 'lucide-react'

export default function MobilePage() {
    const [activeTab, setActiveTab] = useState('dashboard')
    const [role, setRole] = useState('admin') // Default to admin for dev
    const [showRoleSwitcher, setShowRoleSwitcher] = useState(false)
    const [ordersStatusFilter, setOrdersStatusFilter] = useState(null)
    const [ordersStatusFilterToken, setOrdersStatusFilterToken] = useState(0)

    // Roles for testing
    const roles = [
        { id: 'admin', label: 'Direktor (Admin)' },
        { id: 'manager', label: 'Menejer' },
        { id: 'finance', label: 'Moliya' },
        { id: 'staff', label: 'Oddiy Xodim' },
    ]

    const openOrdersByStatus = ({ statusKey, count }) => {
        const n = Number(count) || 0
        if (n <= 0) {
            alert('Bu status bo‘yicha buyurtma yo‘q.')
            return
        }
        setOrdersStatusFilter(statusKey || null)
        setOrdersStatusFilterToken((v) => v + 1)
        setActiveTab('orders')
    }

    const renderView = () => {
        switch (activeTab) {
            case 'dashboard':
                return (
                    <DashboardView
                        role={role}
                        setActiveTab={setActiveTab}
                        onOpenOrdersByStatus={openOrdersByStatus}
                    />
                )
            case 'orders':
                return (
                    <OrdersView
                        initialStatusFilter={ordersStatusFilter}
                        statusFilterToken={ordersStatusFilterToken}
                    />
                )
            case 'stats':
                return <StatsView />
            case 'employees':
                return <EmployeesView />
            case 'finance':
                return <FinanceView />
            default:
                return <DashboardView role={role} />
        }
    }

    return (
        <div className="flex flex-col min-h-screen pb-20">
            {/* Header / Top Bar */}
            <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 bg-slate-900/50 backdrop-blur-md border-b border-white/5">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                        N
                    </div>
                    <span className="font-bold tracking-tight text-white/90">Nuur Home</span>
                </div>
                
                <button 
                    onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
                    className="p-2 rounded-xl bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
                >
                    <Settings size={20} />
                </button>
            </header>

            {/* Role Switcher Overlay (Dev Tool) */}
            {showRoleSwitcher && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-full max-w-xs bg-slate-900 rounded-3xl border border-white/10 p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">Rolni tanlang (Dev)</h3>
                        <div className="grid gap-2">
                            {roles.map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => {
                                        setRole(r.id)
                                        setShowRoleSwitcher(false)
                                        setActiveTab('dashboard')
                                    }}
                                    className={`w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all ${
                                        role === r.id 
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                                    }`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={() => setShowRoleSwitcher(false)}
                            className="mt-6 w-full py-2 text-sm text-slate-500 font-medium hover:text-slate-300 transition-colors"
                        >
                            Yopish
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-x-hidden">
                {renderView()}
            </div>

            {/* Navigation */}
            <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} role={role} />
        </div>
    )
}
