'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import {
    Plus, Edit, Trash2, Save, X, Search, Phone, MapPin, Mail,
    Users, TrendingUp, Package, BarChart3, Calendar, UserCheck, ShoppingBag
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'

export default function Mijozlar() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const [customers, setCustomers] = useState([])
    const [registeredUsers, setRegisteredUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [activeTab, setActiveTab] = useState('customers') // 'customers' or 'registered'
    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: ''
    })

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)

            // Fetch customers from customers table
            const { data: customersData, error: custError } = await supabase
                .from('customers')
                .select('*')
                .order('created_at', { ascending: false })

            if (custError) throw custError

            // Fetch registered users using database function
            const { data: registeredData, error: regError } = await supabase
                .rpc('get_registered_users')

            if (regError) {
                console.error('Error loading registered users:', regError)
                // Fallback: try to fetch directly from profiles if exists
                const { data: profilesData } = await supabase
                    .from('user_profiles')
                    .select('*')

                if (profilesData && profilesData.length > 0) {
                    setRegisteredUsers(profilesData.map(u => ({
                        id: u.id,
                        name: u.display_name || u.email?.split('@')[0] || u.phone || 'Foydalanuvchi',
                        email: u.email || '-',
                        phone: u.phone || '-',
                        totalOrders: 0,
                        totalSpend: 0,
                        created_at: u.created_at,
                        lastOrder: u.last_login
                    })))
                }
            } else {
                // Format registered users data  
                const formattedUsers = (registeredData || []).map(user => ({
                    id: user.id,
                    name: user.display_name || user.email?.split('@')[0] || user.phone || 'Foydalanuvchi',
                    email: user.email || '-',
                    phone: user.phone || '-',
                    totalOrders: Number(user.total_orders) || 0,
                    totalSpend: Number(user.total_spend) || 0,
                    created_at: user.created_at,
                    lastOrder: user.last_sign_in_at
                }))
                setRegisteredUsers(formattedUsers)
            }

            // Fetch orders for customer stats
            const { data: allOrders } = await supabase
                .from('orders')
                .select('*')

            // Enrich customers with order stats
            const enrichedCustomers = (customersData || []).map(cust => {
                const custOrders = (allOrders || []).filter(o =>
                    o.customer_email === cust.email ||
                    o.customer_phone === cust.phone ||
                    o.customer_id === cust.id
                )
                const totalSpend = custOrders.reduce((sum, o) => sum + (o.total || 0), 0)
                const lastOrder = custOrders.length > 0
                    ? custOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at
                    : null

                return {
                    ...cust,
                    totalOrders: custOrders.length,
                    totalSpend: totalSpend,
                    lastOrder: lastOrder
                }
            })

            setCustomers(enrichedCustomers)
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.name || !form.phone) {
            alert(t('customers.requiredError'))
            return
        }

        try {
            if (editId) {
                // Update existing
                const { error } = await supabase
                    .from('customers')
                    .update(form)
                    .eq('id', editId)

                if (error) throw error
                alert(t('customers.successUpdate'))
            } else {
                // Add new
                const { error } = await supabase
                    .from('customers')
                    .insert([form])

                if (error) throw error
                alert(t('customers.successAdd'))
            }

            setIsAdding(false)
            setEditId(null)
            setForm({ name: '', email: '', phone: '', address: '', notes: '' })
            loadData()
        } catch (error) {
            console.error('Error saving customer:', error)
            alert(t('common.saveError'))
        }
    }

    async function handleDelete(id) {
        if (!confirm(t('common.deleteConfirm'))) return

        try {
            const { error } = await supabase
                .from('customers')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadData()
            alert(t('customers.successDelete'))
        } catch (error) {
            console.error('Error deleting customer:', error)
            alert(t('common.deleteError'))
        }
    }

    function handleEdit(customer) {
        setEditId(customer.id)
        setForm({
            name: customer.name,
            email: customer.email || '',
            phone: customer.phone,
            address: customer.address || '',
            notes: customer.notes || ''
        })
        setIsAdding(true)
    }

    function handleCancel() {
        setIsAdding(false)
        setEditId(null)
        setForm({ name: '', email: '', phone: '', address: '', notes: '' })
    }

    const filteredCustomers = customers.filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const filteredUsers = registeredUsers.filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Top customers for chart
    const topCustomers = [...customers]
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 5)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">{t('common.loading')}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-6">
            <Header title={t('common.customers')} toggleSidebar={toggleSidebar} />

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">{t('customers.base')}</p>
                            <p className="text-3xl font-bold mt-2">{customers.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Users size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-600">{t('customers.registered')}</p>
                            <p className="text-3xl font-bold text-green-600 mt-2">{registeredUsers.length}</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-xl">
                            <UserCheck className="text-green-600" size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-600">{t('customers.orders')}</p>
                            <p className="text-3xl font-bold text-purple-600 mt-2">
                                {customers.reduce((sum, c) => sum + c.totalOrders, 0)}
                            </p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-xl">
                            <ShoppingBag className="text-purple-600" size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-600">{t('common.totalRevenue')}</p>
                            <p className="text-2xl font-bold text-amber-600 mt-2">
                                {(customers.reduce((sum, c) => sum + c.totalSpend, 0) / 1000000).toFixed(1)}M
                            </p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl">
                            <TrendingUp className="text-amber-600" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6 md:mb-8">
                <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <BarChart3 className="text-blue-600" size={20} />
                    {t('customers.top5')}
                </h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topCustomers}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 12 }}
                                angle={-45}
                                textAnchor="end"
                                height={80}
                            />
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

            {/* Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                <button
                    onClick={() => setActiveTab('customers')}
                    className={`px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap ${activeTab === 'customers'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                        }`}
                >
                    <Users className="inline mr-2" size={20} />
                    {t('customers.base')} ({customers.length})
                </button>
                <button
                    onClick={() => setActiveTab('registered')}
                    className={`px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap ${activeTab === 'registered'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                        }`}
                >
                    <UserCheck className="inline mr-2" size={20} />
                    {t('customers.registered')} ({registeredUsers.length})
                </button>
            </div>

            {/* Search and Add */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder={t('customers.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                {activeTab === 'customers' && !isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-md shadow-blue-200 font-bold whitespace-nowrap"
                    >
                        <Plus size={20} />
                        {t('customers.addCustomer')}
                    </button>
                )}
            </div>

            {/* Add/Edit Form */}
            {isAdding && activeTab === 'customers' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                        {editId ? t('customers.editCustomer') : t('customers.newCustomer')}
                    </h3>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.name')} *</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                required
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.phone')} *</label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                required
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.email')}</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.address')}</label>
                            <input
                                type="text"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.notes')}</label>
                            <textarea
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                rows={3}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="md:col-span-2 flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                            >
                                <X className="inline mr-2" size={18} />
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                            >
                                <Save className="inline mr-2" size={18} />
                                {t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Customers Table */}
            {activeTab === 'customers' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.customer')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.contact')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.address')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.orders')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.totalSpend')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.lastOrder')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-gray-500">
                                            <Users size={48} className="mx-auto mb-4 text-gray-300" />
                                            <p className="font-medium">{t('customers.noCustomers')}</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCustomers.map((customer) => (
                                        <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <Users className="text-blue-600" size={20} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-gray-900">{customer.name}</p>
                                                        {customer.notes && (
                                                            <p className="text-xs text-gray-500 truncate">{customer.notes}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="space-y-1">
                                                    {customer.phone && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                                            <Phone size={14} className="flex-shrink-0" />
                                                            <span>{customer.phone}</span>
                                                        </div>
                                                    )}
                                                    {customer.email && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                                            <Mail size={14} className="flex-shrink-0" />
                                                            <span className="truncate max-w-[200px]">{customer.email}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                {customer.address ? (
                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        <MapPin size={14} className="flex-shrink-0" />
                                                        <span className="truncate max-w-[200px]">{customer.address}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-bold">
                                                    {customer.totalOrders}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="font-bold text-green-600">
                                                    {customer.totalSpend.toLocaleString()} {language === 'uz' ? 'so\'m' : language === 'ru' ? 'сум' : 'UZS'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                {customer.lastOrder ? (
                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        <Calendar size={14} />
                                                        {new Date(customer.lastOrder).toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US')}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">Yo'q</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleEdit(customer)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Tahrirlash"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(customer.id)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="O'chirish"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Registered Users Table */}
            {activeTab === 'registered' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <p className="text-sm text-gray-600">
                            <UserCheck className="inline mr-2" size={18} />
                            {t('customers.websiteOrders')}
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.user')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.contact')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.orders')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.totalSpend')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.lastActivity')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center text-gray-500">
                                            <UserCheck size={48} className="mx-auto mb-4 text-gray-300" />
                                            <p className="font-medium">{t('customers.noRegistered')}</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((user, index) => (
                                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <UserCheck className="text-green-600" size={20} />
                                                    </div>
                                                    <p className="font-bold text-gray-900">{user.name}</p>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="space-y-1">
                                                    {user.phone && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                                            <Phone size={14} className="flex-shrink-0" />
                                                            <span>{user.phone}</span>
                                                        </div>
                                                    )}
                                                    {user.email && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                                            <Mail size={14} className="flex-shrink-0" />
                                                            <span className="truncate max-w-[200px]">{user.email}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-bold">
                                                    {user.totalOrders}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="font-bold text-green-600">
                                                    {user.totalSpend.toLocaleString()} {language === 'uz' ? 'so\'m' : language === 'ru' ? 'сум' : 'UZS'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                    {user.lastOrder && new Date(user.lastOrder).getFullYear() > 1970 ? (
                                                        <>
                                                            <Calendar size={14} />
                                                            {new Date(user.lastOrder).toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US')}
                                                        </>
                                                    ) : (
                                                        <span className="text-gray-400 italic">Hali faol emas</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}