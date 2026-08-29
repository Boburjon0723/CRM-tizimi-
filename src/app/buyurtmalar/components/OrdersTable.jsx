'use client'

import React, { memo } from 'react'
import { Archive, ShoppingCart, Trash2 } from 'lucide-react'
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
    handlePrintShippedPortion,
    handlePrintRemainingPortion,
    handleDuplicateOrder,
    handleEdit,
    handleDelete,
    handleRestoreOrder,
    handleUnarchiveOrder,
    handlePermanentDelete,
    handleLinkCustomer,
    handleOpenPartialShip,
    filterCategory = 'all',
}) {
    if (filteredOrders.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    {ordersListView === 'trash' ? (
                        <Trash2 size={48} className="mb-4 opacity-20" />
                    ) : ordersListView === 'archive' ? (
                        <Archive size={48} className="mb-4 opacity-20" />
                    ) : (
                        <ShoppingCart size={48} className="mb-4 opacity-20" />
                    )}
                    <p className="font-medium text-lg">
                        {ordersListView === 'trash'
                            ? t('orders.trashEmpty')
                            : ordersListView === 'archive'
                              ? t('orders.archiveEmpty')
                              : t('orders.noOrders')}
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
                        <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                            {(ordersListView === 'active' || ordersListView === 'archive') && (
                                <th
                                    className="w-8 shrink-0 px-1.5 py-2.5 rounded-tl-2xl text-center"
                                    title={t('orders.mergeSelectColumn')}
                                >
                                    <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
                                className={`w-[11%] min-w-[6.5rem] px-2 py-2.5 ${
                                    ordersListView === 'trash' ? 'rounded-tl-2xl' : ''
                                }`}
                            >
                                {t('orders.idDate')}
                            </th>
                            <th className="w-[14%] min-w-[8rem] px-2 py-2.5">{t('orders.customer')}</th>
                            <th className="min-w-[11rem] px-2 py-2.5 xl:min-w-[14rem]">{t('orders.products')}</th>
                            <th className="w-[7%] min-w-[4rem] whitespace-nowrap px-1.5 py-2.5">
                                {t('orders.total')}
                            </th>
                            <th className="w-[8%] min-w-[4.5rem] px-1.5 py-2.5">{t('orders.payment')}</th>
                            <th className="w-[9%] min-w-[5.5rem] px-1.5 py-2.5">{t('orders.status')}</th>
                            <th className="w-[6%] min-w-[3.5rem] px-1.5 py-2.5">{t('orders.source')}</th>
                            <th className="min-w-[9rem] px-1.5 py-2.5 rounded-tr-2xl text-right xl:min-w-[11rem]">
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
                                    handlePrintShippedPortion={handlePrintShippedPortion}
                                    handlePrintRemainingPortion={handlePrintRemainingPortion}
                                    handleDuplicateOrder={handleDuplicateOrder}
                                    handleEdit={handleEdit}
                                    handleDelete={handleDelete}
                                    handleRestoreOrder={handleRestoreOrder}
                                    handleUnarchiveOrder={handleUnarchiveOrder}
                                    handlePermanentDelete={handlePermanentDelete}
                                    handleLinkCustomer={handleLinkCustomer}
                                    handleOpenPartialShip={handleOpenPartialShip}
                                    filterCategory={filterCategory}
                                />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default memo(OrdersTable)
