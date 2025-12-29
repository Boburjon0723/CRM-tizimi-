'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Search, User, MessageCircle, TrendingUp, BarChart3, Users, Phone, Package, Send, X } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

export default function Mijozlar({ toggleSidebar }) {
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [message, setMessage] = useState('')
    const [showChat, setShowChat] = useState(false)

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            // Get all orders to aggregate customer data
            const { data: orders, error } = await supabase
                .from('buyurtmalar')
                .select('*')

            if (error) throw error

            // Aggregate customers from orders
            const customerMap = {}
            orders.forEach(order => {
                const name = order.mijoz || 'Noma\'lum'
                if (!customerMap[name]) {
                    customerMap[name] = {
                        name: name,
                        totalOrders: 0,
                        totalSpend: 0,
                        lastOrder: order.sana,
                        products: {},
                        phone: order.telefon || 'Noma\'lum'
                    }
                }
                customerMap[name].totalOrders += 1
                customerMap[name].totalSpend += order.summa || 0
                if (new Date(order.sana) > new Date(customerMap[name].lastOrder)) {
                    customerMap[name].lastOrder = order.sana
                }

                // Track products for this customer
                const product = order.mahsulot || 'Boshqa'
                customerMap[name].products[product] = (customerMap[name].products[product] || 0) + (order.miqdor || 1)
            })

            setCustomers(Object.values(customerMap))
        } catch (error) {
            console.error('Error loading customers:', error)
        } finally {
            setLoading(false)
        }
    }

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Stats for charts
    const productStats = {}
    customers.forEach(c => {
        Object.entries(c.products).forEach(([prod, count]) => {
            productStats[prod] = (productStats[prod] || 0) + count
        })
    })

    const pieData = Object.entries(productStats)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)

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
            <Header title="Mijozlar va Statistika" toggleSidebar={toggleSidebar} />

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
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-50 rounded-lg text-green-600">
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Eng Yuqori Savdo</p>
                            <p className="text-2xl font-bold">
                                {(Math.max(...customers.map(c => c.totalSpend), 0) / 1000000).toFixed(1)}M
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-purple-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                            <Package size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">O'rtacha Buyurtma</p>
                            <p className="text-2xl font-bold">
                                {(customers.reduce((acc, c) => acc + c.totalOrders, 0) / (customers.length || 1)).toFixed(1)}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-yellow-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-yellow-50 rounded-lg text-yellow-600">
                            <BarChart3 size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Faol Davr</p>
                            <p className="text-2xl font-bold">30 kun</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">Top Mahsulotlar (Statistika)</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">Eng Faol Mijozlar (Top 5)</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topCustomers} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} />
                                <Tooltip formatter={(val) => val.toLocaleString() + " so'm"} />
                                <Bar dataKey="totalSpend" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-800">Mijozlar Ro'yxati</h3>
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Ism yoki telefon..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 text-left">
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Mijoz</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Aloqa</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Buyurtmalar</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Jami Summa</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Oxirgi Buyurtma</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-center">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredCustomers.length > 0 ? (
                                filteredCustomers.map((customer, index) => (
                                    <tr key={index} className="hover:bg-gray-50 transition">
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
                                                {customer.phone}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{customer.totalOrders} ta</td>
                                        <td className="px-6 py-4 font-semibold text-blue-600">
                                            {customer.totalSpend.toLocaleString()} so'm
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 text-sm">{customer.lastOrder}</td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => {
                                                    setSelectedCustomer(customer)
                                                    setShowChat(true)
                                                }}
                                                className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 transition"
                                            >
                                                <MessageCircle size={18} />
                                                Xabar
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                        Mijozlar topilmadi
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Chat Modal */}
            {showChat && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                                    {selectedCustomer?.name[0]}
                                </div>
                                <div>
                                    <p className="font-semibold">{selectedCustomer?.name}</p>
                                    <p className="text-xs text-blue-100">{selectedCustomer?.phone}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowChat(false)} className="hover:bg-white/10 p-1 rounded-lg">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-4 h-64 overflow-y-auto bg-gray-50 flex flex-col gap-3">
                            <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm max-w-[80%]">
                                <p className="text-sm text-gray-800">Assalomu alaykum, {selectedCustomer?.name}! Sizga qanday yordam bera olamiz?</p>
                                <p className="text-[10px] text-gray-400 mt-1">14:00</p>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex gap-2">
                            <input
                                type="text"
                                placeholder="Xabar yozing..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleSendMessage}
                                className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition"
                            >
                                <Send size={24} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}