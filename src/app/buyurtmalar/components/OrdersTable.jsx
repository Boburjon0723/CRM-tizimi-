'use client'

import React, { memo } from 'react'
import { Archive, ShoppingCart } from 'lucide-react'
import OrderTableRow from './OrderTableRow'

function OrdersTable({
    t,
    filteredOrders,
    ordersListView,
    mergeSelection,
    toggleMergeSelectAllFiltered,
    toggleMergeSelectOrder,
    language,
    products,
    productColors,
    orderListExpandedById,
    setOrderListExpandedById,
    handleStatusChange,
    handlePrintOrder,
    handleDuplicateOrder,
    handleEdit,
    handleDelete,
    handleRestoreOrder,
    handlePermanentDelete,
    handleLinkCustomer,
}) {
    if (filteredOrders.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    {ordersListView === 'trash' ? (
                        <Archive size={48} className="mb-4 opacity-20" />
                    ) : (
                        <ShoppingCart size={48} className="mb-4 opacity-20" />
                    )}
                    <p className="font-medium text-lg">
                        {ordersListView === 'trash' ? t('orders.trashEmpty') : t('orders.noOrders')}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[860px] text-left border-collapse table-auto">
                    <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                            {ordersListView === 'active' && (
                                <th
                                    className="w-10 shrink-0 px-2 py-3 sm:px-3 rounded-tl-2xl text-center"
                                    title={t('orders.mergeSelectColumn')}
                                >
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={
                                            filteredOrders.length > 0 &&
                                            filteredOrders.every((o) => mergeSelection[o.id])
                                        }
                                        onChange={toggleMergeSelectAllFiltered}
                                        aria-label={t('orders.mergeSelectAll')}
                                    />
                                </th>
                            )}
                            <th
                                className={`w-[11%] min-w-[7.5rem] px-3 py-3 sm:px-4 ${ordersListView === 'trash' ? 'rounded-tl-2xl' : ''}`}
                            >
                                {t('orders.idDate')}
                            </th>
                            <th className="w-[14%] min-w-[9rem] px-3 py-3 sm:px-4">{t('orders.customer')}</th>
                            <th className="min-w-[12rem] px-3 py-3 sm:px-4 xl:min-w-[16rem]">{t('orders.products')}</th>
                            <th className="w-[7%] min-w-[4.5rem] whitespace-nowrap px-2 py-3 sm:px-3">
                                {t('orders.total')}
                            </th>
                            <th className="w-[9%] min-w-[5.5rem] px-2 py-3 sm:px-3">{t('orders.payment')}</th>
                            <th className="w-[10%] min-w-[6.5rem] px-2 py-3 sm:px-3">{t('orders.status')}</th>
                            <th className="w-[7%] min-w-[4rem] px-2 py-3 sm:px-3">{t('orders.source')}</th>
                            <th className="min-w-[13.5rem] px-2 py-3 sm:px-3 rounded-tr-2xl text-right xl:min-w-[15rem]">
                                {t('customers.actions')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredOrders.map((item) => (
                                <OrderTableRow
                                    key={item.id}
                                    item={item}
                                    t={t}
                                    ordersListView={ordersListView}
                                    isMergeSelected={!!mergeSelection[item.id]}
                                    onToggleMerge={() => toggleMergeSelectOrder(item.id)}
                                    language={language}
                                    products={products}
                                    productColors={productColors}
                                    isExpanded={!!orderListExpandedById[item.id]}
                                    onToggleExpand={() =>
                                        setOrderListExpandedById((prev) => ({
                                            ...prev,
                                            [item.id]: !prev[item.id],
                                        }))
                                    }
                                    handleStatusChange={handleStatusChange}
                                    handlePrintOrder={handlePrintOrder}
                                    handleDuplicateOrder={handleDuplicateOrder}
                                    handleEdit={handleEdit}
                                    handleDelete={handleDelete}
                                    handleRestoreOrder={handleRestoreOrder}
                                    handlePermanentDelete={handlePermanentDelete}
                                    handleLinkCustomer={handleLinkCustomer}
                                />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default memo(OrdersTable)
