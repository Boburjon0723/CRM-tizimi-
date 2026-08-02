'use client'

import { TrendingUp } from 'lucide-react'
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts'

/**
 * Statistika grafiklar — alohida chunk (recharts faqat shu modul bilan yuklanadi).
 */
export default function StatsCharts({
    t,
    locale,
    formatUsd,
    colors,
    topProductsBarData,
    topCustomersBarData,
    salesChartData,
    financeChartData,
    categoryData,
    emptyLabel,
}) {
    const noData = emptyLabel || '—'

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-4 text-gray-800">{t('statistics.topProductsBar')}</h3>
                    <div className="h-[320px]">
                        {topProductsBarData.length === 0 ? (
                            <p className="text-sm text-gray-400 py-12 text-center">{noData}</p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={topProductsBarData}
                                    margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                    <XAxis type="number" tick={{ fontSize: 10 }} />
                                    <YAxis type="category" dataKey="label" width={108} tick={{ fontSize: 9 }} />
                                    <Tooltip
                                        formatter={(v) => [v, t('statistics.chartQtyShort')]}
                                        labelFormatter={(_, p) => (p?.[0]?.payload?.full ? String(p[0].payload.full) : '')}
                                    />
                                    <Bar dataKey="qty" fill="#6366f1" radius={[0, 4, 4, 0]} name={t('statistics.chartQtyShort')} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-4 text-gray-800">{t('statistics.topCustomersBar')}</h3>
                    <div className="h-[320px]">
                        {topCustomersBarData.length === 0 ? (
                            <p className="text-sm text-gray-400 py-12 text-center">{noData}</p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={topCustomersBarData}
                                    margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                                    <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 9 }} />
                                    <Tooltip
                                        formatter={(v) => [`$${formatUsd(v)}`, t('statistics.colTotalSpent')]}
                                        labelFormatter={(_, p) => (p?.[0]?.payload?.full ? String(p[0].payload.full) : '')}
                                    />
                                    <Bar dataKey="total" fill="#059669" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-800">
                        <TrendingUp size={20} className="text-blue-500" />
                        {t('statistics.salesTrend')}
                    </h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={salesChartData}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10 }}
                                    interval="preserveStartEnd"
                                    tickFormatter={(v) => {
                                        try {
                                            return new Date(v + 'T12:00:00').toLocaleDateString(locale, {
                                                month: 'short',
                                                day: 'numeric',
                                            })
                                        } catch {
                                            return v
                                        }
                                    }}
                                />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={48} />
                                <Tooltip
                                    formatter={(val) => [`$${formatUsd(val)}`, t('statistics.totalSalesPeriod')]}
                                    labelFormatter={(l) => l}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#3b82f6"
                                    fillOpacity={1}
                                    fill="url(#colorSales)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">{t('statistics.incomeExpense')}</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={financeChartData} barSize={20}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 9 }} hide={financeChartData.length > 18} />
                                <YAxis tick={{ fontSize: 10 }} width={44} />
                                <Tooltip
                                    formatter={(val) => `$${formatUsd(val)}`}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    }}
                                    cursor={{ fill: 'transparent' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '12px' }} />
                                <Bar
                                    dataKey="income"
                                    name={t('statistics.chartIncomeFromOrders')}
                                    fill="#10b981"
                                    radius={[4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="expense"
                                    name={t('statistics.chartExpenseFromFinance')}
                                    fill="#ef4444"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </>
    )
}

export function StatsCategoryPie({ categoryData, colors, formatUsd }) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={5}
                    dataKey="value"
                >
                    {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} strokeWidth={0} />
                    ))}
                </Pie>
                <Tooltip formatter={(val) => `$${formatUsd(val)}`} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
        </ResponsiveContainer>
    )
}
