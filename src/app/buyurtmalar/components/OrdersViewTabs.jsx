'use client'

import { ShoppingCart, Archive } from 'lucide-react'

export default function OrdersViewTabs({ t, ordersListView, trashOrderCount, onSwitchView }) {
    return (
        <div className="flex flex-wrap gap-1.5 mb-4">
            <button
                type="button"
                onClick={() => onSwitchView('active')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    ordersListView === 'active'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
            >
                <ShoppingCart size={16} />
                {t('orders.activeList')}
            </button>
            <button
                type="button"
                onClick={() => onSwitchView('trash')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    ordersListView === 'trash'
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
            >
                <Archive size={16} />
                {t('orders.trashBin')}
                {trashOrderCount > 0 ? (
                    <span className="min-w-[1.5rem] rounded-full bg-white/20 px-1.5 text-center text-xs tabular-nums">
                        {trashOrderCount}
                    </span>
                ) : null}
            </button>
        </div>
    )
}
