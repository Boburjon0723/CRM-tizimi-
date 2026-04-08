'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ShoppingCart, Search, X, Package, Phone, Calendar, SearchX, Loader2 } from 'lucide-react'

export default function OrdersView() {
    const [loading, setLoading] = useState(true)
    const [orders, setOrders] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedOrder, setSelectedOrder] = useState(null)

    useEffect(() => {
        fetchOrders()

        const channel = supabase
            .channel('mobile_orders_view')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => fetchOrders() // silently refetch
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    async function fetchOrders() {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`*, customers(name, phone), order_items(*, products(*))`)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(50)

            // Fallback if deleted_at column is missing
            if (error && error.message.includes('deleted_at')) {
                const retry = await supabase
                    .from('orders')
                    .select(`*, customers(name, phone), order_items(*, products(*))`)
                    .order('created_at', { ascending: false })
                    .limit(50)
                
                if (retry.data) setOrders(retry.data)
            } else if (data) {
                setOrders(data)
            }
        } catch (err) {
            console.error('Error fetching orders:', err)
        } finally {
            setLoading(false)
        }
    }

    const filteredOrders = orders.filter(o => {
        const cName = o.customer_name || o.customers?.name || ''
        const cPhone = o.customer_phone || o.customers?.phone || ''
        return (o.id && String(o.id).includes(searchQuery)) ||
               (cName && cName.toLowerCase().includes(searchQuery.toLowerCase())) ||
               (cPhone && cPhone.includes(searchQuery))
    })

    const formatCurrency = (amount) => {
        return "$" + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    const getStatusStyle = (status) => {
        const s = String(status).toLowerCase()
        if (s === 'yangi' || s === 'new') return 'bg-blue-500/10 border-blue-500/20 text-blue-400'
        if (s === 'jarayonda' || s === 'pending') return 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        if (s === 'tugallangan' || s === 'tugallandi' || s === 'completed') return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        return 'bg-rose-500/10 border-rose-500/20 text-rose-400'
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-400 font-medium animate-pulse">Buyurtmalar yuklanmoqda...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <div className="p-6 pb-2 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Buyurtmalar</h1>
                    <p className="text-sm font-medium text-slate-400">Jami topilgan: {filteredOrders.length} ta</p>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Mijoz ismi, ID yoki raqam..."
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-3">
                {filteredOrders.length > 0 ? (
                    filteredOrders.map(order => (
                        <div 
                            key={order.id} 
                            onClick={() => setSelectedOrder(order)}
                            className="bg-slate-900 border border-white/5 rounded-3xl p-5 shadow-lg active:scale-[0.98] transition-all cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2 text-slate-400 text-xs font-bold font-mono">
                                    <span className="px-2 py-1 bg-white/5 rounded-md">#{String(order.id).slice(0, 8)}</span>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${getStatusStyle(order.status)}`}>
                                    {order.status}
                                </span>
                            </div>

                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-white mb-1">
                                    {order.customer_name || order.customers?.name || "Noma'lum"}
                                </h3>
                                {(order.customer_phone || order.customers?.phone) && (
                                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-400">
                                        <Phone size={14} />
                                        {order.customer_phone || order.customers?.phone}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                    <Calendar size={14} />
                                    {new Date(order.created_at).toLocaleDateString('uz-UZ')}
                                </div>
                                <div className="text-base font-bold text-indigo-400">
                                    {formatCurrency(order.total)}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <SearchX className="w-16 h-16 text-slate-700 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">Hech narsa topilmadi</h3>
                        <p className="text-sm font-medium text-slate-500">Boshqa so'z bilan qidirib ko'ring</p>
                    </div>
                )}
            </div>

            {/* Bottom Sheet for Order Details */}
            {selectedOrder && (
                <div className="fixed inset-0 z-[100] flex flex-col justify-end items-center">
                    <div 
                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" 
                        onClick={() => setSelectedOrder(null)} 
                    />
                    <div className="relative w-full max-w-lg bg-slate-900 border-t border-white/10 rounded-t-3xl shadow-2xl p-6 pb-safe flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-300">
                        <button 
                            onClick={() => setSelectedOrder(null)}
                            className="absolute top-4 right-4 p-2 bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors z-10"
                        >
                            <X size={20} />
                        </button>

                        <div className="mb-6 pr-8">
                            <h2 className="text-xl font-bold text-white tracking-tight mb-2">
                                Buyurtma tafsiloti
                            </h2>
                            <p className="text-sm font-medium text-slate-400 font-mono">
                                ID: #{String(selectedOrder.id)}
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-6">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
                                    Mahsulotlar Ro'yxati
                                </h3>
                                <div className="space-y-3">
                                    {selectedOrder.order_items && selectedOrder.order_items.length > 0 ? (
                                        selectedOrder.order_items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-start gap-3 pb-3 border-b border-white/5 last:border-0 last:pb-0">
                                                <div className="flex gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                                                        <Package size={20} className="text-indigo-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white mb-1 leading-tight">
                                                            {item.product_name || item.products?.name || "Noma'lum"}
                                                        </p>
                                                        <p className="text-xs font-medium text-slate-400">
                                                            Soni: <span className="text-white">{item.quantity} ta</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-xs font-bold text-white">
                                                        {formatCurrency(item.price || item.products?.price)}
                                                    </p>
                                                    <p className="text-[10px] font-medium text-slate-500 mt-1">
                                                        (dona narx)
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-slate-500">Mahsulotlar topilmadi</p>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-indigo-600 border border-indigo-500 shadow-lg shadow-indigo-600/20">
                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200 mb-1">
                                            Jami Summa
                                        </p>
                                        <p className="text-xl font-bold text-white">
                                            {formatCurrency(selectedOrder.total)}
                                        </p>
                                    </div>
                                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded bg-white/20 text-white`}>
                                        {selectedOrder.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
