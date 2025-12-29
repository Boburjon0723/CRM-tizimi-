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
        <div>
            <Header title="Mijozlar (Customers)" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                            <Users size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Jami Mijozlar</p>
                            <p className="text-2xl font-bold">{customers.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center mb-6">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Ism yoki telefon..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                    <UserPlus size={20} />
                    Yangi Mijoz
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-xl shadow-sm mb-6 max-w-2xl">
                    <h3 className="font-semibold mb-4">Yangi Mijoz Qo'shish</h3>
                    <form onSubmit={handleAddCustomer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input className="border p-2 rounded" placeholder="Ismi" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                        <input className="border p-2 rounded" placeholder="Telefon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                        <input className="border p-2 rounded" placeholder="Manzil" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                        <input className="border p-2 rounded" placeholder="Izoh" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded md:col-span-2">Saqlash</button>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 text-left">
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Client Info</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Contact</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Orders</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Total Spent</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredCustomers.length > 0 ? (
                                filteredCustomers.map((customer) => (
                                    <tr key={customer.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                                    {customer.name[0]}
                                                </div>
                                                <span className="font-medium text-gray-800">{customer.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <Phone size={14} className="text-gray-400" />
                                                {customer.phone || '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{customer.totalOrders}</td>
                                        <td className="px-6 py-4 font-semibold text-blue-600">
                                            {customer.totalSpend.toLocaleString()} so'm
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => {
                                                    setSelectedCustomer(customer)
                                                    setShowChat(true)
                                                }}
                                                className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 transition"
                                            >
                                                <MessageCircle size={18} />
                                                SMS
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                                        Mijozlar topilmadi
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Chat Modal */}
            {showChat && selectedCustomer && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="p-4 bg-blue-600 text-white flex justify-between items-center rounded-t-2xl">
                            <h3 className="font-semibold">{selectedCustomer.name}</h3>
                            <button onClick={() => setShowChat(false)}><X size={20} /></button>
                        </div>
                        <div className="p-4">
                            <textarea
                                className="w-full border p-2 rounded-lg mb-4"
                                rows="4"
                                placeholder="Xabar matni..."
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                            ></textarea>
                            <button onClick={handleSendMessage} className="w-full bg-blue-600 text-white py-2 rounded-lg flex items-center justify-center gap-2">
                                <Send size={18} /> Yuborish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}