'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification, formatOrderNotification } from '@/utils/telegram'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Filter, ShoppingCart, Clock, CheckCircle } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Buyurtmalar() {
    const { toggleSidebar } = useLayout()
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

            // Load Orders with Customer and Items
            const { data: ordersData, error: ordersError } = await supabase
                .from('orders')
                .select(`
                    *,
                    customers (id, name, phone),
                    order_items (
                        id, quantity, price,
                        products (id, name)
                    )
                `)
                .order('created_at', { ascending: false })

            if (ordersError) throw ordersError

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
            alert('Mijoz, mahsulot va summa majburiy!')
            return
        }

        try {
            const orderPayload = {
                customer_id: form.customer_id,
                total: parseFloat(form.total),
                status: form.status,
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
                    quantity: parseInt(form.quantity),
                    price: product ? product.sale_price : 0 // Snapshot price
                }

                const { error: itemError } = await supabase
                    .from('order_items')
                    .insert([itemPayload])

                if (itemError) throw itemError

                // Notification
                const message = `🛍 Yangi Buyurtma!\n\n👤 Mijoz: ${customers.find(c => c.id === form.customer_id)?.name}\n💰 Summa: ${form.total}`
                await sendTelegramNotification(message)
            }

            setForm({ customer_id: '', product_id: '', quantity: '1', total: '', status: 'Yangi', source: 'admin' })
            setIsAdding(false)
            setEditId(null)
            loadData()
        } catch (error) {
            console.error('Error saving order:', error)
            alert('Xatolik yuz berdi!')
        }
    }

    async function handleDelete(id) {
        if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

        try {
            const { error } = await supabase
                .from('orders')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadData()
        } catch (error) {
            console.error('Error deleting order:', error)
            alert('O\'chirishda xatolik!')
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
            setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o))
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
        const customerName = b.customers?.name || 'Noma\'lum'
        const matchesSearch = customerName.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesStatus = filterStatus === 'Hammasi' || b.status === filterStatus
        return matchesSearch && matchesStatus
    })

    const totalSumma = filteredOrders.reduce((sum, b) => sum + (b.total || 0), 0)
    const statusCounts = {
        Yangi: orders.filter(b => b.status === 'Yangi').length,
        Jarayonda: orders.filter(b => b.status === 'Jarayonda').length,
        Tugallandi: orders.filter(b => b.status === 'Tugallandi').length
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
        <div>
            <Header title="Buyurtmalar (Orders)" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm opacity-80">Jami Buyurtmalar</p>
                            <p className="text-3xl font-bold mt-2">{orders.length}</p>
                        </div>
                        <ShoppingCart className="opacity-50" size={32} />
                    </div>
                </div>
                <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm opacity-80">Yangi</p>
                            <p className="text-3xl font-bold mt-2">{statusCounts.Yangi}</p>
                        </div>
                        <Clock className="opacity-50" size={32} />
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm opacity-80">Tugallandi</p>
                            <p className="text-3xl font-bold mt-2">{statusCounts.Tugallandi}</p>
                        </div>
                        <CheckCircle className="opacity-50" size={32} />
                    </div>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm opacity-80">Jami Summa</p>
                            <p className="text-2xl font-bold mt-2">{(totalSumma / 1000000).toFixed(1)}M</p>
                        </div>
                        <div className="text-sm opacity-50 font-mono">UZS</div>
                    </div>
                </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Mijoz bo'yicha qidirish..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={20} className="text-gray-500" />
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="border border-gray-300 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option>Hammasi</option>
                        <option>Yangi</option>
                        <option>Jarayonda</option>
                        <option>Tugallandi</option>
                        <option>Bekor qilindi</option>
                    </select>
                </div>

                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    {isAdding ? <X size={20} /> : <Plus size={20} />}
                    {isAdding ? 'Bekor qilish' : 'Yangi buyurtma'}
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-xl shadow-sm mb-6 fade-in">
                    <h3 className="text-lg font-semibold mb-4">
                        {editId ? 'Buyurtmani tahrirlash' : 'Yangi buyurtma qo\'shish'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mijoz</label>
                                <select
                                    className="w-full border p-2 rounded-lg"
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

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mahsulot</label>
                                <select
                                    className="w-full border p-2 rounded-lg"
                                    value={form.product_id}
                                    onChange={handleProductSelect}
                                    required={!editId} // Only required for new orders for now
                                    disabled={!!editId} // Disable product edit for simplicity in this version
                                >
                                    <option value="">Tanlang...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.sale_price?.toLocaleString()})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Miqdor</label>
                                <input
                                    type="number"
                                    value={form.quantity}
                                    onChange={handleQuantityChange}
                                    className="w-full border p-2 rounded-lg"
                                    min="1"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Jami Summa</label>
                                <input
                                    type="number"
                                    value={form.total}
                                    onChange={e => setForm({ ...form, total: e.target.value })}
                                    className="w-full border p-2 rounded-lg"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <select
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    className="w-full border p-2 rounded-lg"
                                >
                                    <option>Yangi</option>
                                    <option>Jarayonda</option>
                                    <option>Tugallandi</option>
                                    <option>Bekor qilindi</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Manba</label>
                                <select
                                    value={form.source}
                                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                                    className="w-full border p-2 rounded-lg"
                                >
                                    <option value="admin">Admin Panel</option>
                                    <option value="website">Websayt</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition"
                            >
                                <Save size={20} />
                                Saqlash
                            </button>
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="flex items-center gap-2 bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition"
                            >
                                <X size={20} />
                                Bekor qilish
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {filteredOrders.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Buyurtmalar topilmadi</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left">ID & Sana</th>
                                    <th className="px-6 py-4 text-left">Mijoz</th>
                                    <th className="px-6 py-4 text-left">Mahsulotlar</th>
                                    <th className="px-6 py-4 text-left">Summa</th>
                                    <th className="px-6 py-4 text-left">Status</th>
                                    <th className="px-6 py-4 text-left">Manba</th>
                                    <th className="px-6 py-4 text-left">Amallar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredOrders.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4">
                                            <div className="font-mono text-xs text-gray-500">#{item.id.slice(0, 8)}</div>
                                            <div className="text-sm text-gray-900">{new Date(item.created_at).toLocaleDateString()}</div>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            {item.customers?.name || 'Noma\'lum'}
                                            <div className="text-xs text-gray-500">{item.customers?.phone}</div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {item.order_items && item.order_items.length > 0 ? (
                                                <div className="space-y-1">
                                                    {item.order_items.map((oi, idx) => (
                                                        <div key={oi.id || idx} className="text-sm">
                                                            {oi.quantity}x {oi.products?.name}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic">Bo'sh</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-semibold text-green-600">
                                            {item.total?.toLocaleString()} so'm
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={item.status}
                                                onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                                className={`px-3 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${item.status === 'Yangi' ? 'bg-blue-100 text-blue-800' :
                                                    item.status === 'Jarayonda' ? 'bg-yellow-100 text-yellow-800' :
                                                        item.status === 'Tugallandi' ? 'bg-green-100 text-green-800' :
                                                            'bg-gray-100 text-gray-800'
                                                    }`}
                                            >
                                                <option>Yangi</option>
                                                <option>Qabul qilindi</option>
                                                <option>Jarayonda</option>
                                                <option>Yetkazilmoqda</option>
                                                <option>Tugallandi</option>
                                                <option>Bekor qilindi</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-xs px-2 py-1 rounded ${item.source === 'website' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {item.source === 'website' ? 'Web' : 'Admin'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded transition"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded transition"
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