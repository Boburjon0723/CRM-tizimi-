'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification, formatOrderNotification } from '@/utils/telegram'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Filter, ShoppingCart, Clock, CheckCircle, FileText } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'

export default function Buyurtmalar() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const [orders, setOrders] = useState([])
    const [customers, setCustomers] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterStatus, setFilterStatus] = useState('Hammasi')
    const [form, setForm] = useState({
        customer_id: '',
        product_id: '',
        quantity: '1',
        total: '',
        status: 'Yangi',
        note: '',
        source: 'admin'
    })

    useEffect(() => {
        loadData()

        // Subscribe to changes
        const channel = supabase
            .channel('orders_changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'orders' },
                (payload) => {
                    playNotificationSound()
                    loadData() // Reload to get joins
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    function playNotificationSound() {
        if (typeof window !== 'undefined') {
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj')
                audio.play().catch(e => console.log('Audio play failed:', e))
            } catch (error) {
                console.error('Audio init failed:', error)
            }
        }
    }

    async function loadData() {
        try {
            setLoading(true)

            // Load Orders with Item details (including product_name)
            const { data: ordersData, error: ordersError } = await supabase
                .from('orders')
                .select(`
                    *,
                    customers (id, name, phone),
                    order_items (
                        id, quantity, price, product_name,
                        products (id, name)
                    )
                `)
                .order('created_at', { ascending: false })

            if (ordersError) throw ordersError

            // DEBUG: Check if receipt_url is in the data
            console.log('Orders data sample:', ordersData?.[0])
            console.log('First order receipt_url:', ordersData?.[0]?.receipt_url)

            // Load Customers for dropdown
            const { data: customersData } = await supabase.from('customers').select('id, name').order('name')

            // Load Products for dropdown
            const { data: productsData } = await supabase.from('products').select('id, name, sale_price').eq('is_active', true).order('name')

            setOrders(ordersData || [])
            setCustomers(customersData || [])
            setProducts(productsData || [])
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.customer_id || !form.product_id || !form.total) {
            alert(t('orders.requiredMessage') || 'Mijoz, mahsulot va summa majburiy!')
            return
        }

        try {
            const customer = customers.find(c => c.id === form.customer_id)
            const orderPayload = {
                customer_id: form.customer_id,
                customer_name: customer?.name || '',
                customer_phone: customer?.phone || '',
                total: parseFloat(form.total),
                status: form.status === 'Yangi' ? 'new' : form.status === 'Jarayonda' ? 'pending' : form.status === 'Tugallandi' ? 'completed' : form.status === 'Bekor qilindi' ? 'cancelled' : form.status,
                note: form.note,
                source: form.source
            }

            let orderId = editId

            if (editId) {
                // Update Order
                const { error } = await supabase
                    .from('orders')
                    .update(orderPayload)
                    .eq('id', editId)

                if (error) throw error
            } else {
                // Insert Order
                const { data: newOrder, error } = await supabase
                    .from('orders')
                    .insert([orderPayload])
                    .select()
                    .single()

                if (error) throw error
                orderId = newOrder.id

                // Add Order Item
                const product = products.find(p => p.id === form.product_id)
                const itemPayload = {
                    order_id: orderId,
                    product_id: form.product_id,
                    product_name: product?.name || '',
                    quantity: parseInt(form.quantity),
                    price: product ? product.sale_price : 0, // Snapshot price
                    subtotal: (parseInt(form.quantity) || 0) * (product ? product.sale_price : 0)
                }

                const { error: itemError } = await supabase
                    .from('order_items')
                    .insert([itemPayload])

                if (itemError) throw itemError

                // Notification
                const message = `🛍 Yangi Buyurtma!\n\n👤 Mijoz: ${customers.find(c => c.id === form.customer_id)?.name}\n💰 Summa: ${form.total}`
                await sendTelegramNotification(message)
            }

            setForm({ customer_id: '', product_id: '', quantity: '1', total: '', status: 'Yangi', note: '', source: 'admin' })
            setIsAdding(false)
            setEditId(null)
            loadData()
        } catch (error) {
            console.error('Error saving order:', error)
            alert(t('common.saveError'))
        }
    }

    async function handleDelete(id) {
        if (!confirm(t('common.deleteConfirm'))) return

        try {
            const { error } = await supabase
                .from('orders')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadData()
        } catch (error) {
            console.error('Error deleting order:', error)
            alert(t('common.deleteError'))
        }
    }

    async function handleStatusChange(id, newStatus) {
        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: newStatus })
                .eq('id', id)

            if (error) throw error
            // Optimistic update
            const mappedStatus = newStatus === 'Yangi' ? 'new' : newStatus === 'Jarayonda' ? 'pending' : newStatus === 'Tugallandi' ? 'completed' : newStatus === 'Bekor qilindi' ? 'cancelled' : newStatus;
            setOrders(orders.map(o => o.id === id ? { ...o, status: mappedStatus } : o))
        } catch (error) {
            console.error('Error updating status:', error)
        }
    }

    function handleEdit(item) {
        // Simplified edit: load main details. 
        // Complex because one order might have multiple items, but we simplified UI to 1 item creation.
        // For now just edit status/customer/amount. Product editing is tricky without full complexity.

        setForm({
            customer_id: item.customer_id,
            product_id: item.order_items?.[0]?.product_id || '',
            quantity: item.order_items?.[0]?.quantity || '1',
            total: item.total,
            status: item.status,
            note: item.note || '',
            source: item.source
        })
        setEditId(item.id)
        setIsAdding(true)
    }

    function handleCancel() {
        setForm({ customer_id: '', product_id: '', quantity: '1', total: '', status: 'Yangi', source: 'admin' })
        setEditId(null)
        setIsAdding(false)
    }

    // Product selection handler to auto-calculate price
    function handleProductSelect(e) {
        const pId = e.target.value
        const qty = parseInt(form.quantity) || 1
        const product = products.find(p => p.id === parseInt(pId) || p.id === pId)

        setForm(prev => ({
            ...prev,
            product_id: pId,
            total: product ? product.sale_price * qty : ''
        }))
    }

    function handleQuantityChange(e) {
        const qty = parseInt(e.target.value) || 1
        const product = products.find(p => p.id === form.product_id)

        setForm(prev => ({
            ...prev,
            quantity: qty,
            total: product ? product.sale_price * qty : prev.total
        }))
    }

    const filteredOrders = orders.filter(b => {
        const customerName = b.customer_name || b.customers?.name || t('common.unknown') || 'Noma\'lum'
        const matchesSearch = customerName.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesStatus = filterStatus === 'Hammasi' || filterStatus === t('orders.allStatuses') || b.status === filterStatus ||
            (filterStatus === 'Yangi' && b.status === 'new') ||
            (filterStatus === 'Jarayonda' && b.status === 'pending') ||
            (filterStatus === 'Tugallandi' && b.status === 'completed') ||
            (filterStatus === 'Bekor qilindi' && b.status === 'cancelled')
        return matchesSearch && matchesStatus
    })

    const totalSumma = filteredOrders.reduce((sum, b) => sum + (b.total || 0), 0)
    const statusCounts = {
        Yangi: orders.filter(b => b.status === 'Yangi' || b.status === 'new').length,
        Jarayonda: orders.filter(b => b.status === 'Jarayonda' || b.status === 'pending').length,
        Tugallandi: orders.filter(b => b.status === 'Tugallandi' || b.status === 'completed').length
    }

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
                </div>
            </div>
        )
    }


    return (
        <div className="max-w-7xl mx-auto px-6">
            <Header title={t('common.orders')} toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">{t('dashboard.newOrders')}</p>
                            <p className="text-3xl font-bold mt-2">{orders.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <ShoppingCart className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500">{t('orders.statusNew')}</p>
                            <p className="text-3xl font-bold mt-2 text-blue-600">{statusCounts.Yangi}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                            <Clock size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500">{t('orders.statusCompleted')}</p>
                            <p className="text-3xl font-bold mt-2 text-green-600">{statusCounts.Tugallandi}</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-xl text-green-600">
                            <CheckCircle size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500">{t('common.totalRevenue')}</p>
                            <p className="text-3xl font-bold mt-2 text-gray-800">${(totalSumma).toLocaleString()}</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl text-amber-600 font-bold text-xl">
                            $
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder={t('orders.searchPlaceholder')}
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-gray-50 px-4 rounded-xl border border-transparent focus-within:bg-white focus-within:border-blue-500 transition-all">
                        <Filter size={20} className="text-gray-500" />
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-transparent py-3 outline-none text-gray-700 font-medium cursor-pointer"
                        >
                            <option>{t('orders.allStatuses')}</option>
                            <option>{t('orders.statusNew')}</option>
                            <option>{t('orders.statusProcessing')}</option>
                            <option>{t('orders.statusCompleted')}</option>
                            <option>{t('orders.statusCancelled')}</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 font-bold"
                    >
                        {isAdding ? <X size={20} /> : <Plus size={20} />}
                        <span className="hidden sm:inline">{isAdding ? t('common.cancel') : t('orders.newOrder')}</span>
                    </button>
                </div>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 mb-8 fade-in">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">
                        {editId ? t('orders.editOrder') : t('orders.newOrder')}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.customer')}</label>
                                <select
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={form.customer_id}
                                    onChange={e => setForm({ ...form, customer_id: e.target.value })}
                                    required
                                >
                                    <option value="">Tanlang...</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('common.products')}</label>
                                <select
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:bg-gray-100"
                                    value={form.product_id}
                                    onChange={handleProductSelect}
                                    required={!editId}
                                    disabled={!!editId}
                                >
                                    <option value="">Tanlang...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} (${p.sale_price?.toLocaleString()})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.quantity')}</label>
                                <input
                                    type="number"
                                    value={form.quantity}
                                    onChange={handleQuantityChange}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    min="1"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.summa')} ($)</label>
                                <input
                                    type="number"
                                    value={form.total}
                                    onChange={e => setForm({ ...form, total: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.status')}</label>
                                <select
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                >
                                    <option value="new">{t('orders.statusNew')}</option>
                                    <option value="pending">{t('orders.statusProcessing')}</option>
                                    <option value="completed">{t('orders.statusCompleted')}</option>
                                    <option value="cancelled">{t('orders.statusCancelled')}</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.source')}</label>
                                <select
                                    value={form.source}
                                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                >
                                    <option value="admin">{t('orders.adminPanel')}</option>
                                    <option value="website">{t('orders.website')}</option>
                                </select>
                            </div>
                            <div className="md:col-span-2 lg:col-span-3 space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.note')}</label>
                                <textarea
                                    value={form.note}
                                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    rows="2"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/30 font-bold transition-all"
                            >
                                <Save size={20} />
                                {t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <ShoppingCart size={48} className="mb-4 opacity-20" />
                        <p className="font-medium text-lg">{t('orders.noOrders')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                    <th className="px-6 py-4 rounded-tl-2xl">{t('orders.idDate')}</th>
                                    <th className="px-6 py-4">{t('orders.customer')}</th>
                                    <th className="px-6 py-4">{t('orders.products')}</th>
                                    <th className="px-6 py-4">{t('orders.total')}</th>
                                    <th className="px-6 py-4">{t('orders.payment')}</th>
                                    <th className="px-6 py-4">{t('orders.status')}</th>
                                    <th className="px-6 py-4">{t('orders.source')}</th>
                                    <th className="px-6 py-4 rounded-tr-2xl text-right">{t('customers.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredOrders.map((item) => (
                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded inline-block mb-1">#{item.id.slice(0, 8)}</div>
                                            <div className="text-sm font-medium text-gray-700">{new Date(item.created_at).toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US')}</div>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            <div className="font-bold">{item.customer_name || item.customers?.name || 'Noma\'lum'}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5">{item.customer_phone || item.customers?.phone}</div>
                                            {item.note && <div className="text-xs text-amber-600 italic mt-1 bg-amber-50 px-2 py-0.5 rounded inline-block">{item.note}</div>}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {item.order_items && item.order_items.length > 0 ? (
                                                <div className="space-y-1">
                                                    {item.order_items.map((oi, idx) => (
                                                        <div key={oi.id || idx} className="text-sm flex items-center gap-2">
                                                            <span className="font-bold text-gray-800">{oi.quantity}x</span>
                                                            <span className="truncate max-w-[150px]">{oi.product_name || oi.products?.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic text-xs">Bo'sh</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-900 font-mono">
                                            ${item.total?.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 text-xs">
                                                <span className="font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded inline-block text-center">
                                                    {item.payment_method_detail || t('orders.cash')}
                                                </span>
                                                {item.receipt_url && (
                                                    <a
                                                        href={item.receipt_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-700 hover:underline flex items-center justify-center gap-1 mt-1 font-bold"
                                                    >
                                                        <FileText size={12} />
                                                        Chek
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={item.status}
                                                onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer outline-none transition-colors ${item.status === 'new' || item.status === 'Yangi' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                                                    item.status === 'pending' || item.status === 'Jarayonda' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                                                        item.status === 'completed' || item.status === 'Tugallandi' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                                                            'bg-red-100 text-red-700 hover:bg-red-200'
                                                    }`}
                                            >
                                                <option value="new">{t('orders.statusNew')}</option>
                                                <option value="pending">{t('orders.statusProcessing')}</option>
                                                <option value="completed">{t('orders.statusCompleted')}</option>
                                                <option value="cancelled">{t('orders.statusCancelled')}</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-lg ${item.source === 'website' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {item.source === 'website' ? 'Web' : 'Admin'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}