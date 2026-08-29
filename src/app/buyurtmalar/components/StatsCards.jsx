'use client';
import React from 'react';
import { Clock, Timer, CheckCircle, TrendingUp, ShoppingCart } from 'lucide-react';
import { formatUsd } from '../utils';

/** Status filtri faqat pastdagi StatusTabs orqali — kartochkalar faqat KPI */
export default function StatsCards({ t, statusStats, totalSumma, filteredOrdersCount }) {
  const cell = 'rounded-xl border bg-white px-3 py-2.5 shadow-sm min-w-0'
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 mb-3">
      <div className="rounded-xl border border-blue-400/30 bg-gradient-to-br from-blue-500 to-blue-600 text-white px-3 py-2.5 shadow-sm shadow-blue-200/50">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-100 truncate">
              {t('orders.statsVisibleCount')}
            </p>
            <p className="text-xl font-bold tabular-nums leading-tight mt-0.5">{filteredOrdersCount}</p>
          </div>
          <ShoppingCart className="shrink-0 opacity-80" size={18} />
        </div>
      </div>

      <div className={`${cell} border-gray-100`}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-gray-500 truncate">{t('orders.statusNew')}</p>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-bold tabular-nums text-blue-600">{statusStats.new.count}</span>
              <span className="text-xs font-bold font-mono text-gray-700 tabular-nums">
                ${formatUsd(statusStats.new.sum)}
              </span>
            </div>
          </div>
          <Clock size={16} className="shrink-0 text-blue-500 mt-0.5" />
        </div>
      </div>

      <div className={`${cell} border-gray-100`}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-gray-500 truncate">{t('orders.statusProcessing')}</p>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-bold tabular-nums text-amber-600">{statusStats.pending.count}</span>
              <span className="text-xs font-bold font-mono text-gray-700 tabular-nums">
                ${formatUsd(statusStats.pending.sum)}
              </span>
            </div>
          </div>
          <Timer size={16} className="shrink-0 text-amber-500 mt-0.5" />
        </div>
      </div>

      <div className={`${cell} border-gray-100`}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-gray-500 truncate">{t('orders.statusCompleted')}</p>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-bold tabular-nums text-green-600">{statusStats.completed.count}</span>
              <span className="text-xs font-bold font-mono text-gray-700 tabular-nums">
                ${formatUsd(statusStats.completed.sum)}
              </span>
            </div>
          </div>
          <CheckCircle size={16} className="shrink-0 text-green-500 mt-0.5" />
        </div>
      </div>

      <div className={`${cell} border-gray-100 col-span-2 sm:col-span-1`}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-gray-500 truncate">{t('dashboard.totalRevenue')}</p>
            <p className="text-lg font-bold mt-0.5 text-gray-800 font-mono tabular-nums leading-tight">
              ${formatUsd(totalSumma)}
            </p>
          </div>
          <TrendingUp size={16} className="shrink-0 text-amber-500 mt-0.5" />
        </div>
      </div>
    </div>
  );
}
