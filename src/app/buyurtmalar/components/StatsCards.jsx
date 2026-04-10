'use client';
import React from 'react';
import { Clock, Timer, CheckCircle, TrendingUp, ShoppingCart } from 'lucide-react';
import { formatUsd } from '../utils';

export default function StatsCards({ t, statusStats, totalSumma, filteredOrdersCount, onStatusClick, activeStatus }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-5 mb-8">
      {/* Visible Count */}
      <button 
        onClick={() => onStatusClick?.('all')}
        className={`bg-gradient-to-br from-blue-500 to-blue-600 text-white p-5 sm:p-6 rounded-2xl shadow-lg transition-all text-left group border-4 ${activeStatus === 'all' ? 'border-white/30 scale-105 shadow-blue-400/50' : 'border-transparent shadow-blue-200 hover:scale-[1.02]'}`}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-blue-100">{t('orders.statsVisibleCount')}</p>
            <p className="text-3xl font-bold mt-2 tabular-nums">{filteredOrdersCount}</p>
          </div>
          <div className="p-3 bg-white/20 rounded-xl shrink-0 group-hover:scale-110 transition-transform">
            <ShoppingCart className="text-white" size={24} />
          </div>
        </div>
      </button>

      {/* New Orders */}
      <button 
        onClick={() => onStatusClick?.('new')}
        className={`bg-white p-5 sm:p-6 rounded-2xl shadow-sm border-4 transition-all text-left flex flex-col group ${activeStatus === 'new' ? 'border-blue-500 scale-105 shadow-md' : 'border-gray-100 hover:shadow-md hover:scale-[1.02]'}`}
      >
        <div className="flex justify-between items-start gap-3 w-full">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-500">{t('orders.statusNew')}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                  {t('orders.statsCountShort')}
                </p>
                <p className="text-2xl font-bold tabular-nums text-blue-600">
                  {statusStats.new.count}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                  {t('orders.statsSumShort')}
                </p>
                <p className="text-lg font-bold tabular-nums font-mono text-gray-900 leading-tight">
                  ${formatUsd(statusStats.new.sum)}
                </p>
              </div>
            </div>
          </div>
          <div className={`p-3 rounded-xl shrink-0 group-hover:scale-110 transition-transform ${activeStatus === 'new' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
            <Clock size={24} />
          </div>
        </div>
      </button>

      {/* Processing Orders */}
      <button 
        onClick={() => onStatusClick?.('pending')}
        className={`bg-white p-5 sm:p-6 rounded-2xl shadow-sm border-4 transition-all text-left flex flex-col group ${activeStatus === 'pending' ? 'border-amber-500 scale-105 shadow-md' : 'border-gray-100 hover:shadow-md hover:scale-[1.02]'}`}
      >
        <div className="flex justify-between items-start gap-3 w-full">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-500">{t('orders.statusProcessing')}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                  {t('orders.statsCountShort')}
                </p>
                <p className="text-2xl font-bold tabular-nums text-amber-600">
                  {statusStats.pending.count}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                  {t('orders.statsSumShort')}
                </p>
                <p className="text-lg font-bold tabular-nums font-mono text-gray-900 leading-tight">
                  ${formatUsd(statusStats.pending.sum)}
                </p>
              </div>
            </div>
          </div>
          <div className={`p-3 rounded-xl shrink-0 group-hover:scale-110 transition-transform ${activeStatus === 'pending' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-600'}`}>
            <Timer size={24} />
          </div>
        </div>
      </button>

      {/* Completed Orders */}
      <button 
        onClick={() => onStatusClick?.('completed')}
        className={`bg-white p-5 sm:p-6 rounded-2xl shadow-sm border-4 transition-all text-left flex flex-col group ${activeStatus === 'completed' ? 'border-green-500 scale-105 shadow-md' : 'border-gray-100 hover:shadow-md hover:scale-[1.02]'}`}
      >
        <div className="flex justify-between items-start gap-3 w-full">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-500">{t('orders.statusCompleted')}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                  {t('orders.statsCountShort')}
                </p>
                <p className="text-2xl font-bold tabular-nums text-green-600">
                  {statusStats.completed.count}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                  {t('orders.statsSumShort')}
                </p>
                <p className="text-lg font-bold tabular-nums font-mono text-gray-900 leading-tight">
                  ${formatUsd(statusStats.completed.sum)}
                </p>
              </div>
            </div>
          </div>
          <div className={`p-3 rounded-xl shrink-0 group-hover:scale-110 transition-transform ${activeStatus === 'completed' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600'}`}>
            <CheckCircle size={24} />
          </div>
        </div>
      </button>

      {/* Total Revenue */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 sm:col-span-2 lg:col-span-1 xl:col-span-1 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-500">{t('dashboard.totalRevenue')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-800 font-mono tabular-nums">
              ${formatUsd(totalSumma)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t('orders.statsFilteredHint')}
            </p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600 font-bold text-xl shrink-0 flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
        </div>
      </div>
    </div>
  );
}
