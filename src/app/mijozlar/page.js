'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Phone, MapPin, UserPlus, Users, TrendingUp, Package, BarChart3, MessageCircle, Send } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useLayout } from '@/context/LayoutContext'

export default function Mijozlar() {
    const { toggleSidebar } = useLayout()
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [message, setMessage] = useState('')
    const [showChat, setShowChat] = useState(false)
    const [isAdding, setIsAdding] = useState(false)
    const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' })

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)
            // Fetch customers
            const { data: customersData, error: custError } = await supabase
                .from('customers')
                .select('*')
                .order('created_at', { ascending: false })

            if (custError) throw custError

            // Fetch orders for stats (using new 'orders' table)
            const { data: ordersData, error: ordError } = await supabase
                .from('orders')
                .select('customer_id, total, created_at')

            if (ordError) {
                console.error("Error loading orders for stats:", ordError)
                // Continue without stats if orders fail, or if table empty
            }

            // Map stats to customers
            const enrichedCustomers = (customersData || []).map(cust => {
                const custOrders = (ordersData || []).filter(o => o.customer_id === cust.id)
                const totalSpend = custOrders.reduce((sum, o) => sum + (o.total || 0), 0)
                const lastOrder = custOrders.length > 0
                    ? custOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at
                    : null

                return {
                    ...cust,
                    totalOrders: custOrders.length,
                    totalSpend: totalSpend,
                    lastOrder: lastOrder ? new Date(lastOrder).toLocaleDateString() : 'Yo\'q'
                }
            })

            setCustomers(enrichedCustomers)
        } catch (error) {
            console.error('Error loading customers:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleAddCustomer(e) {
        e.preventDefault()
        try {
            const { error } = await supabase.from('customers').insert([form])
            if (error) throw error

            setIsAdding(false)
            setForm({ name: '', phone: '', address: '', notes: '' })
            loadData()
            alert('Mijoz qo\'shildi!')
        } catch (error) {
            console.error('Error adding customer:', error)
            alert('Xatolik!')
        }
    }

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone && c.phone.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    // Top customers for chart
    const topCustomers = [...customers]
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 5)

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

    function handleSendMessage() {
        if (!message.trim()) return
        alert(`${selectedCustomer.name}ga xabar yuborildi: ${message}`)
        setMessage('')
        setShowChat(false)
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
            <Header title="Mijozlar" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">Jami Mijozlar</p>
                            <p className="text-3xl font-bold mt-2">{customers.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Users className="text-white" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">Top Mijozlar (Xarajat bo'yicha)</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topCustomers}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                                <Tooltip
                                    cursor={{ fill: '#f3f4f6' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="totalSpend" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Ism yoki telefon..."
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 font-bold"
                >
                    {isAdding ? <X size={20} /> : <UserPlus size={20} />}
                    <span className="hidden sm:inline">{isAdding ? 'Bekor' : 'Yangi Mijoz'}</span>
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 mb-8 max-w-2xl fade-in">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">Yangi Mijoz Qo'shish</h3>
                    <form onSubmit={handleAddCustomer} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">Ismi</label>
                            <input
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="To'liq ismi"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">Telefon</label>
                            <input
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="+998..."
                                value={form.phone}
                                onChange={e => setForm({ ...form, phone: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">Manzil</label>
                            <input
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="Shahar, Ko'cha..."
                                value={form.address}
                                onChange={e => setForm({ ...form, address: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">Izoh</label>
                            <input
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="Qo'shimcha ma'lumot"
                                value={form.notes}
                                onChange={e => setForm({ ...form, notes: e.target.value })}
                            />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                            <button
                                type="submit"
                                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-600/30 transition-all flex items-center gap-2"
                            >
                                <Save size={20} /> Saqlash
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                <th className="px-6 py-4 rounded-tl-2xl">Mijoz</th>
                                <th className="px-6 py-4">Aloqa</th>
                                <th className="px-6 py-4">Buyurtmalar</th>
                                <th className="px-6 py-4">Jami Xarajat</th>
                                <th className="px-6 py-4">Oxirgi Buyurtma</th>
                                <th className="px-6 py-4 rounded-tr-2xl text-center">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredCustomers.length > 0 ? (
                                filteredCustomers.map((customer) => (
                                    <tr key={customer.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold shadow-sm">
                                                    {customer.name[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900">{customer.name}</div>
                                                    <div className="text-xs text-gray-500">{customer.address || 'Manzil yo\'q'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg inline-block text-sm font-medium">
                                                <Phone size={14} className="text-blue-500" />
                                                {customer.phone || '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded-md text-sm">{customer.totalOrders} ta</span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-900 font-mono">
                                            ${customer.totalSpend.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {customer.lastOrder}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => {
                                                    setSelectedCustomer(customer)
                                                    setShowChat(true)
                                                }}
                                                className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors font-bold text-sm"
                                            >
                                                <MessageCircle size={18} />
                                                SMS
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="px-6 py-16 text-center text-gray-400">
                                        <div className="flex flex-col items-center">
                                            <Users size={48} className="mb-4 opacity-20" />
                                            <p className="font-medium">Mijozlar topilmadi</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Chat Modal */}
            {showChat && selectedCustomer && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                                    {selectedCustomer.name[0]}
                                </div>
                                <h3 className="font-bold">{selectedCustomer.name}</h3>
                            </div>
                            <button onClick={() => setShowChat(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
                        </div>
                        <div className="p-6">
                            <textarea
                                className="w-full border border-gray-200 p-4 rounded-xl mb-4 focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-gray-50"
                                rows="4"
                                placeholder="Xabar matni..."
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                            ></textarea>
                            <button onClick={handleSendMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30">
                                <Send size={18} /> Yuborish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}