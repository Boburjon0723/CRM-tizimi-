'use client'

import { ShoppingCart, Archive, Trash2 } from 'lucide-react'

export default function OrdersViewTabs({
    t,
    ordersListView,
    trashOrderCount,
    archiveOrderCount = 0,
    onSwitchView,
}) {
    return (
        <div className="flex flex-wrap gap-1 mb-2">
            <button
                type="button"
                onClick={() => onSwitchView('active')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                    ordersListView === 'active'
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
            >
                <ShoppingCart size={14} />
                {t('orders.activeList')}
            </button>
            <button
                type="button"
                onClick={() => onSwitchView('archive')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                    ordersListView === 'archive'
                        ? 'bg-slate-700 text-white shadow-sm shadow-slate-700/25'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
            >
                <Archive size={14} />
                {t('orders.archiveBin')}
                {archiveOrderCount > 0 ? (
                    <span className="min-w-[1.25rem] rounded-full bg-white/20 px-1 text-center text-[10px] tabular-nums">
                        {archiveOrderCount}
                    </span>
                ) : null}
            </button>
            <button
                type="button"
                onClick={() => onSwitchView('trash')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                    ordersListView === 'trash'
                        ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/25'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
            >
                <Trash2 size={14} />
                {t('orders.trashBin')}
                {trashOrderCount > 0 ? (
                    <span className="min-w-[1.25rem] rounded-full bg-white/20 px-1 text-center text-[10px] tabular-nums">
                        {trashOrderCount}
                    </span>
                ) : null}
            </button>
        </div>
    )
}
