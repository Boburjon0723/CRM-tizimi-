'use client';
import React from 'react';
import { LayoutGrid, Clock, Timer, CheckCircle, XCircle } from 'lucide-react';

export default function StatusTabs({ t, filterStatus, setFilterStatus, statusStats }) {
    const tabs = [
        { 
            id: 'all', 
            label: t('orders.allStatuses'), 
            icon: LayoutGrid, 
            color: 'bg-slate-100 text-slate-600',
            activeColor: 'bg-slate-600 text-white shadow-slate-200'
        },
        { 
            id: 'new', 
            label: t('orders.statusNew'), 
            icon: Clock, 
            count: statusStats.new.count,
            color: 'bg-blue-50 text-blue-600',
            activeColor: 'bg-blue-600 text-white shadow-blue-200'
        },
        { 
            id: 'pending', 
            label: t('orders.statusProcessing'), 
            icon: Timer, 
            count: statusStats.pending.count,
            color: 'bg-amber-50 text-amber-600',
            activeColor: 'bg-amber-600 text-white shadow-amber-200'
        },
        { 
            id: 'completed', 
            label: t('orders.statusCompleted'), 
            icon: CheckCircle, 
            count: statusStats.completed.count,
            color: 'bg-emerald-50 text-emerald-600',
            activeColor: 'bg-emerald-600 text-white shadow-emerald-200'
        },
        { 
            id: 'cancelled', 
            label: t('orders.statusCancelled'), 
            icon: XCircle, 
            color: 'bg-rose-50 text-rose-600',
            activeColor: 'bg-rose-600 text-white shadow-rose-200'
        }
    ];

    return (
        <div className="flex flex-wrap gap-2 mb-6 p-1 bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm w-fit">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = filterStatus === tab.id;
                
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilterStatus(tab.id)}
                        className={`
                            relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                            ${isActive 
                                ? `${tab.activeColor} shadow-lg scale-[1.02] z-10` 
                                : `text-gray-500 hover:bg-white hover:text-gray-700`
                            }
                        `}
                    >
                        <Icon size={18} className={isActive ? 'text-white' : ''} />
                        <span>{tab.label}</span>
                        {(tab.count !== undefined) && (
                            <span className={`
                                ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums
                                ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}
                            `}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
