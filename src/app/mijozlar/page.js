'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatUsd } from '@/utils/formatters'
import Header from '@/components/Header'
import {
    Plus, Edit, Trash2, Save, X, Search, Phone, MapPin, Mail,
    Users, TrendingUp, Package, BarChart3, Calendar, UserCheck, ShoppingBag,
    FileSpreadsheet, Printer
} from 'lucide-react'
import {
    buildCrmQatorlarExcelRows,
    exportOrdersExcelRowsToFile,
    buildPrintDocumentHtml,
    openPrintTab,
    labelColorCanonical,
    DEFAULT_TABLE_CONFIG
} from '@/app/buyurtmalar/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { isDeletedAtMissingError } from '@/lib/orderTrash'

export default function Mijozlar() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert, showConfirm, showToast } = useDialog()
    const [customers, setCustomers] = useState([])
    const [registeredUsers, setRegisteredUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [products, setProducts] = useState([])
    const [productColors, setProductColors] = useState([])
    const [allOrders, setAllOrders] = useState([])
    const [activeCustomerOperations, setActiveCustomerOperations] = useState(null)
    const [actionLoadingOrderId, setActionLoadingOrderId] = useState(null)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [activeTab, setActiveTab] = useState('customers') // 'customers' or 'registered'
    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
        country: '',
        address: '',
        notes: ''
    })

    useEffect(() => {
        loadData()
    }, [])

    /** `silent: true` — saqlash/o‘chirishdan keyin to‘liq sahifa yuklovchisiz */
    async function loadData(opts = {}) {
        const silent = opts.silent === true
        try {
            if (!silent) setLoading(true)

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
                        name: u.display_name || u.phone || 'Foydalanuvchi',
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
                    name: user.display_name || user.phone || 'Foydalanuvchi',
                    phone: user.phone || '-',
                    totalOrders: Number(user.total_orders) || 0,
                    totalSpend: Number(user.total_spend) || 0,
                    created_at: user.created_at,
                    lastOrder: user.last_sign_in_at
                }))
                setRegisteredUsers(formattedUsers)
            }

            let allOrdersRes = await supabase.from('orders').select('*').is('deleted_at', null)
            if (allOrdersRes.error && isDeletedAtMissingError(allOrdersRes.error)) {
                allOrdersRes = await supabase.from('orders').select('*')
            }
            const allOrders = allOrdersRes.error ? [] : allOrdersRes.data
            setAllOrders(allOrders || [])

            // Fetch products
            const { data: productsData } = await supabase
                .from('products')
                .select('*, categories(id, name, name_uz)')
                .order('name')
            setProducts(productsData || [])

            // Fetch product colors
            const { data: colorsData } = await supabase
                .from('product_colors')
                .select('*')
                .order('name')
            setProductColors(colorsData || [])

            // Enrich customers with order stats and website account matches
            const enrichedCustomers = (customersData || []).map(cust => {
                const phoneNorm = (cust.phone || '').trim()
                const websiteUser = registeredData?.find(u => (u.phone || '').trim() === phoneNorm)
                
                const custOrders = (allOrders || []).filter(o =>
                    o.customer_phone === cust.phone ||
                    o.customer_id === cust.id
                )
                const totalSpend = custOrders.reduce((sum, o) => sum + (o.total || 0), 0)
                const lastOrder = custOrders.length > 0
                    ? custOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at
                    : null

                return {
                    ...cust,
                    totalOrders: (custOrders.length || 0) + (Number(websiteUser?.total_orders) || 0),
                    totalSpend: totalSpend + (Number(websiteUser?.total_spend) || 0),
                    lastOrder: lastOrder || websiteUser?.created_at,
                    websiteAccount: websiteUser || null
                }
            })


            setCustomers(enrichedCustomers)
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            if (!silent) setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.name || !form.phone) {
            await showAlert(t('customers.requiredError'), { variant: 'warning' })
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
                showToast(t('customers.successUpdate'), { type: 'success' })
            } else {
                // Add new
                const { error } = await supabase
                    .from('customers')
                    .insert([form])

                if (error) throw error
                showToast(t('customers.successAdd'), { type: 'success' })
            }

            setIsAdding(false)
            setEditId(null)
            setForm({ name: '', email: '', phone: '', country: '', address: '', notes: '' })
            loadData({ silent: true })
        } catch (error) {
            console.error('Error saving customer:', error)
            await showAlert(t('common.saveError'), { variant: 'error' })
        }
    }

    async function handleDelete(id) {
        if (!(await showConfirm(t('common.deleteConfirm'), { variant: 'warning' }))) return

        try {
            const { error } = await supabase
                .from('customers')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadData({ silent: true })
            showToast(t('customers.successDelete'), { type: 'success' })
        } catch (error) {
            console.error('Error deleting customer:', error)
            await showAlert(t('common.deleteError'), { variant: 'error' })
        }
    }

    function handleEdit(customer) {
        setEditId(customer.id)
        setForm({
            name: customer.name,
            email: customer.email || '',
            phone: customer.phone,
            country: customer.country || '',
            address: customer.address || '',
            notes: customer.notes || ''
        })
        setIsAdding(true)
    }

    function handleCancel() {
        setIsAdding(false)
        setEditId(null)
        setForm({ name: '', email: '', phone: '', country: '', address: '', notes: '' })
    }

    async function handleExportOrderExcel(order) {
        setActionLoadingOrderId(order.id)
        try {
            const { data: items, error } = await supabase
                .from('order_items')
                .select(`*, products (id, name, size, category_id, is_kg, categories (id, name, name_uz))`)
                .eq('order_id', order.id)

            if (error) throw error

            const enrichedOrder = {
                ...order,
                order_items: items || []
            }

            const rows = buildCrmQatorlarExcelRows([enrichedOrder], products, {
                onlyCompleted: false,
                includePhotoColumn: true
            })

            const stamp = new Date(order.created_at).toISOString().slice(0, 10)
            await exportOrdersExcelRowsToFile(rows, `buyurtma-${order.order_number || order.id.slice(0, 8)}-${stamp}.xlsx`, 'CRM_qatorlar', {
                includeEmbeddedImages: true
            })

            showToast("Excel muvaffaqiyatli yuklandi!", { type: 'success' })
        } catch (err) {
            console.error(err)
            await showAlert("Excel yuklashda xatolik yuz berdi: " + (err.message || err), { variant: 'error' })
        } finally {
            setActionLoadingOrderId(null)
        }
    }

    async function handlePrintOrder(order, showPrices = true) {
        setActionLoadingOrderId(order.id)
        try {
            const { data: items, error } = await supabase
                .from('order_items')
                .select(`*, products (id, name, size, category_id, is_kg, categories (id, name, name_uz))`)
                .eq('order_id', order.id)

            if (error) throw error

            const enrichedOrder = {
                ...order,
                order_items: items || []
            }

            const labelColorFn = (c) => labelColorCanonical(c, productColors, language)

            const html = buildPrintDocumentHtml({
                documentTitle: `Buyurtma № ${order.order_number || order.id}`,
                listTitle: `Mijoz: ${order.customer_name || 'Noma\'lum'} · Telefon: ${order.customer_phone || '—'}`,
                orders: [enrichedOrder],
                showPrices,
                labelColorFn,
                productsList: products,
                tableConfig: DEFAULT_TABLE_CONFIG
            })

            if (!openPrintTab(html)) {
                showToast("Popup bloklangan bo'lishi mumkin.", { type: 'info' })
            }
        } catch (err) {
            console.error(err)
            await showAlert("Chop etishda xatolik yuz berdi: " + (err.message || err), { variant: 'error' })
        } finally {
            setActionLoadingOrderId(null)
        }
    }

    const filteredCustomers = customers.filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const filteredUsers = registeredUsers.filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.phone?.toLowerCase().includes(searchTerm.toLowerCase())
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
                            <p className="text-sm font-medium text-gray-600">{t('dashboard.totalRevenue')}</p>
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
                            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Davlat</label>
                            <select
                                value={form.country}
                                onChange={(e) => setForm({ ...form, country: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Tanlang</option>
                                <option value="uzbekistan">{t('common.countries.uzbekistan')}</option>
                                <option value="kazakhstan">{t('common.countries.kazakhstan')}</option>
                                <option value="kyrgyzstan">{t('common.countries.kyrgyzstan')}</option>
                                <option value="tajikistan">{t('common.countries.tajikistan')}</option>
                                <option value="turkmenistan">{t('common.countries.turkmenistan')}</option>
                                <option value="turkey">{t('common.countries.turkey')}</option>
                                <option value="uae">{t('common.countries.uae')}</option>
                                <option value="saudi_arabia">{t('common.countries.saudi_arabia')}</option>
                                <option value="qatar">{t('common.countries.qatar')}</option>
                                <option value="kuwait">{t('common.countries.kuwait')}</option>
                                <option value="oman">{t('common.countries.oman')}</option>
                                <option value="azerbaijan">{t('common.countries.azerbaijan')}</option>
                                <option value="russia">{t('common.countries.russia')}</option>
                                <option value="china">{t('common.countries.china')}</option>
                                <option value="afghanistan">{t('common.countries.afghanistan')}</option>
                                <option value="armenia">{t('common.countries.armenia')}</option>
                                <option value="belarus">{t('common.countries.belarus')}</option>
                                <option value="georgia">{t('common.countries.georgia')}</option>
                                <option value="india">{t('common.countries.india')}</option>
                                <option value="iran">{t('common.countries.iran')}</option>
                                <option value="iraq">{t('common.countries.iraq')}</option>
                                <option value="israel">{t('common.countries.israel')}</option>
                                <option value="jordan">{t('common.countries.jordan')}</option>
                                <option value="lebanon">{t('common.countries.lebanon')}</option>
                                <option value="mongolia">{t('common.countries.mongolia')}</option>
                                <option value="pakistan">{t('common.countries.pakistan')}</option>
                                <option value="palestine">{t('common.countries.palestine')}</option>
                                <option value="syria">{t('common.countries.syria')}</option>
                                <option value="yemen">{t('common.countries.yemen')}</option>
                                <option value="south_korea">{t('common.countries.south_korea')}</option>
                                <option value="japan">{t('common.countries.japan')}</option>
                                <option value="vietnam">{t('common.countries.vietnam')}</option>
                                <option value="thailand">{t('common.countries.thailand')}</option>
                                <option value="malaysia">{t('common.countries.malaysia')}</option>
                                <option value="singapore">{t('common.countries.singapore')}</option>
                                <option value="indonesia">{t('common.countries.indonesia')}</option>
                                <option value="uk">{t('common.countries.uk')}</option>
                                <option value="germany">{t('common.countries.germany')}</option>
                                <option value="france">{t('common.countries.france')}</option>
                                <option value="italy">{t('common.countries.italy')}</option>
                                <option value="spain">{t('common.countries.spain')}</option>
                                <option value="netherlands">{t('common.countries.netherlands')}</option>
                                <option value="switzerland">{t('common.countries.switzerland')}</option>
                                <option value="poland">{t('common.countries.poland')}</option>
                                <option value="ukraine">{t('common.countries.ukraine')}</option>
                                <option value="bangladesh">{t('common.countries.bangladesh')}</option>
                                <option value="philippines">{t('common.countries.philippines')}</option>
                            </select>
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
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">Hisob holati</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700 text-center">{t('customers.orders')}</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700 text-right">{t('customers.totalSpend')}</th>
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
                                                            <span>{customer.email}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                {customer.websiteAccount ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold ring-1 ring-inset ring-blue-600/10">
                                                        <UserCheck size={14} strokeWidth={2.5} />
                                                        Veb-sayt
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 text-gray-500 text-xs font-bold ring-1 ring-inset ring-gray-900/5">
                                                        Faqat CRM
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-bold">
                                                    {customer.totalOrders}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-emerald-600">
                                                        ${formatUsd(customer.totalSpend)}
                                                    </span>
                                                    {customer.lastOrder && (
                                                        <span className="text-[10px] text-gray-400 mt-0.5">
                                                            Oxirgi: {new Date(customer.lastOrder).toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="py-4 px-6">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setActiveCustomerOperations(customer)}
                                                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                        title="Operatsiyalar"
                                                    >
                                                        <ShoppingBag size={18} />
                                                    </button>
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
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">{t('customers.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-gray-500">
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
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-bold">
                                                    {user.totalOrders}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="font-bold text-green-600">
                                                    ${formatUsd(user.totalSpend)}
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
                                            <td className="py-4 px-6">
                                                <button
                                                    onClick={() => setActiveCustomerOperations({ ...user, name: user.name || user.phone })}
                                                    className="flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
                                                    title="Operatsiyalar"
                                                >
                                                    <ShoppingBag size={14} />
                                                    <span>Operatsiyalar</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Customer Operations Modal */}
            {activeCustomerOperations && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {activeCustomerOperations.name} — Operatsiyalar tarixi
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Mijozga tegishli barcha buyurtmalar ro'yxati va ularni yuklash/chop etish
                                </p>
                            </div>
                            <button
                                onClick={() => setActiveCustomerOperations(null)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            {(() => {
                                const phone = (activeCustomerOperations.phone || '').trim()
                                const id = activeCustomerOperations.id
                                const customerOrders = allOrders.filter(o => 
                                    (o.customer_phone && o.customer_phone.trim() === phone) ||
                                    (o.customer_id && o.customer_id === id)
                                )
                                const totalSpend = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0)

                                if (customerOrders.length === 0) {
                                    return (
                                        <div className="text-center py-12 text-gray-500">
                                            <ShoppingBag size={48} className="mx-auto mb-4 text-gray-300" />
                                            <p className="font-medium">Ushbu mijozda hali hech qanday operatsiya (buyurtma) mavjud emas.</p>
                                        </div>
                                    )
                                }

                                return (
                                    <div className="space-y-6">
                                        {/* Summary Cards */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="bg-purple-50/60 border border-purple-100/80 p-5 rounded-2xl flex items-center gap-4 transition-all hover:shadow-sm">
                                                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-700 shrink-0">
                                                    <ShoppingBag size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Jami Buyurtmalar Soni</p>
                                                    <p className="text-2xl font-black text-slate-800 mt-0.5">{customerOrders.length} ta</p>
                                                </div>
                                            </div>
                                            
                                            <div className="bg-emerald-50/60 border border-emerald-100/80 p-5 rounded-2xl flex items-center gap-4 transition-all hover:shadow-sm">
                                                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700 shrink-0">
                                                    <span className="text-2xl font-extrabold text-emerald-600">$</span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Umumiy Xarid Summasi</p>
                                                    <p className="text-2xl font-black text-emerald-700 mt-0.5">
                                                        ${formatUsd(totalSpend)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Table */}
                                        <div className="overflow-x-auto border border-gray-100 rounded-xl">
                                            <table className="min-w-full divide-y divide-gray-100">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="text-left py-3 px-4 text-xs font-bold text-gray-600">Sana</th>
                                                        <th className="text-left py-3 px-4 text-xs font-bold text-gray-600">Buyurtma №</th>
                                                        <th className="text-left py-3 px-4 text-xs font-bold text-gray-600">Jami Summa</th>
                                                        <th className="text-left py-3 px-4 text-xs font-bold text-gray-600">Status</th>
                                                        <th className="text-right py-3 px-4 text-xs font-bold text-gray-600">Harakatlar</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 bg-white">
                                                    {customerOrders.map((order) => {
                                                        const isProcessing = actionLoadingOrderId === order.id
                                                        const dateStr = new Date(order.created_at).toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US')
                                                        
                                                        // Status badge classes
                                                        let statusBadge = "bg-blue-50 text-blue-700 ring-blue-600/20"
                                                        let statusText = order.status
                                                        if (order.status === 'completed' || order.status === 'tugallandi') {
                                                            statusBadge = "bg-green-50 text-green-700 ring-green-600/20"
                                                            statusText = "Yakunlandi"
                                                        } else if (order.status === 'pending' || order.status === 'jarayonda') {
                                                            statusBadge = "bg-amber-50 text-amber-700 ring-amber-600/20"
                                                            statusText = "Jarayonda"
                                                        } else if (order.status === 'cancelled' || order.status === 'bekor qilindi') {
                                                            statusBadge = "bg-red-50 text-red-700 ring-red-600/20"
                                                            statusText = "Bekor qilindi"
                                                        }

                                                        return (
                                                            <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                                                                <td className="py-3 px-4 text-sm text-gray-600 font-medium">{dateStr}</td>
                                                                <td className="py-3 px-4 text-sm text-gray-900 font-bold mono">
                                                                    #{order.order_number || order.id.slice(0, 8)}
                                                                </td>
                                                                <td className="py-3 px-4 text-sm text-emerald-600 font-bold">
                                                                    ${formatUsd(order.total || 0)}
                                                                </td>
                                                                <td className="py-3 px-4 text-xs font-medium">
                                                                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold ring-1 ring-inset ${statusBadge}`}>
                                                                        {statusText}
                                                                    </span>
                                                                </td>
                                                                <td className="py-3 px-4 text-right">
                                                                    <div className="flex gap-2 justify-end">
                                                                        <button
                                                                            disabled={isProcessing}
                                                                            onClick={() => handleExportOrderExcel(order)}
                                                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                                                                isProcessing 
                                                                                    ? 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed'
                                                                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                                                            }`}
                                                                            title="Excel yuklash"
                                                                        >
                                                                            <FileSpreadsheet size={14} />
                                                                            <span>Excel</span>
                                                                        </button>
                                                                        <button
                                                                            disabled={isProcessing}
                                                                            onClick={() => handlePrintOrder(order)}
                                                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                                                                isProcessing 
                                                                                    ? 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed'
                                                                                    : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200'
                                                                            }`}
                                                                            title="Chop etish (PDF)"
                                                                        >
                                                                            <Printer size={14} />
                                                                            <span>PDF</span>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setActiveCustomerOperations(null)}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold transition-all text-sm"
                            >
                                Yopish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}