'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Filter, AlertTriangle, TrendingUp, Package, RefreshCcw, Minus } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Ombor() {
    const { toggleSidebar } = useLayout()
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterCategory, setFilterCategory] = useState('Hammasi')

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('name', { ascending: true })

            if (error) throw error
            setProducts(data || [])
        } catch (error) {
            console.error('Error loading inventory:', error)
        } finally {
            setLoading(false)
        }
    }

    async function updateStock(id, currentStock, change) {
        const newStock = Math.max(0, currentStock + change)
        try {
            const { error } = await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', id)

            if (error) throw error
            // Update local state for immediate feedback
            setProducts(prev => prev.map(m => m.id === id ? { ...m, stock: newStock } : m))
        } catch (error) {
            console.error('Error updating stock:', error)
            alert('Xatolik yuz berdi!')
        }
    }

    const categories = ['Hammasi', ...new Set(products.map(m => m.category).filter(Boolean))]

    const filteredInventory = products.filter(m => {
        const matchesSearch = m.name?.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesCategory = filterCategory === 'Hammasi' || m.category === filterCategory
        return matchesSearch && matchesCategory
    })

    const lowStockItems = products.filter(m => (m.stock || 0) < 10)
    const outOfStockItems = products.filter(m => (m.stock || 0) === 0)
    const totalInventoryValue = products.reduce((sum, m) => sum + ((m.stock || 0) * (m.price || 0)), 0)

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
            <Header title="Ombor Boshqaruvi" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">Jami Mahsulotlar</p>
                            <p className="text-3xl font-bold mt-2">{products.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Package className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white p-6 rounded-2xl shadow-lg shadow-yellow-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-yellow-100">Kam qolgan</p>
                            <p className="text-3xl font-bold mt-2">{lowStockItems.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <TrendingUp className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-2xl shadow-lg shadow-red-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-red-100">Tugagan</p>
                            <p className="text-3xl font-bold mt-2">{outOfStockItems.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <AlertTriangle className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-2xl shadow-lg shadow-green-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-green-100">Ombor Qiymati</p>
                            <p className="text-3xl font-bold mt-2">${(totalInventoryValue).toLocaleString()}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <TrendingUp className="text-white" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Mahsulot qidirish..."
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-gray-50 px-4 rounded-xl border border-transparent focus-within:bg-white focus-within:border-blue-500 transition-all flex-1 md:flex-none">
                        <Filter size={20} className="text-gray-500" />
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="bg-transparent py-3 outline-none text-gray-700 font-medium cursor-pointer w-full"
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={loadData}
                        className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition-colors border border-transparent hover:border-gray-200"
                        title="Yangilash"
                    >
                        <RefreshCcw size={20} />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                <th className="px-6 py-4 rounded-tl-2xl">Mahsulot</th>
                                <th className="px-6 py-4">Kategoriya</th>
                                <th className="px-6 py-4">Zaxira (Soni)</th>
                                <th className="px-6 py-4">Narxi</th>
                                <th className="px-6 py-4">Holat</th>
                                <th className="px-6 py-4 rounded-tr-2xl text-right">Zaxira Boshqaruvi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredInventory.length > 0 ? (
                                filteredInventory.map((item) => (
                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {item.image_url ? (
                                                    <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover bg-gray-100 border border-gray-200" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200">
                                                        <Package size={20} />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-bold text-gray-900">{item.name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-3 py-1 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold uppercase tracking-wide border border-gray-200">
                                                {item.category || '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`font-bold text-lg ${item.stock < 10 ? 'text-red-500' : 'text-gray-900'}`}>
                                                {item.stock}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono font-bold text-gray-700">
                                            ${item.price?.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.stock === 0 ? (
                                                <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg uppercase">Tugagan</span>
                                            ) : item.stock < 10 ? (
                                                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg uppercase">Kam qolgan</span>
                                            ) : (
                                                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg uppercase">Yetarli</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => updateStock(item.id, item.stock, -1)}
                                                    className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-bold"
                                                    title="Sotildi / Chiqim"
                                                >
                                                    <Minus size={18} />
                                                </button>
                                                <button
                                                    onClick={() => updateStock(item.id, item.stock, 1)}
                                                    className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-bold"
                                                    title="Kirdi / Kirib keldi"
                                                >
                                                    <Plus size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="px-6 py-16 text-center text-gray-400">
                                        <div className="flex flex-col items-center">
                                            <Package size={48} className="mb-4 opacity-20" />
                                            <p className="font-medium">Mahsulotlar topilmadi</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Recommendations */}
            {lowStockItems.length > 0 && (
                <div className="mt-8 bg-gradient-to-r from-yellow-50 to-white border-l-4 border-yellow-400 p-6 rounded-r-xl shadow-sm">
                    <h4 className="text-yellow-800 font-bold mb-3 flex items-center gap-2 text-lg">
                        <AlertTriangle size={24} className="text-yellow-500" />
                        Tez orada tugashi mumkin bo'lgan mahsulotlar:
                    </h4>
                    <div className="flex flex-wrap gap-3">
                        {lowStockItems.map(item => (
                            <span key={item.id} className="bg-white pl-3 pr-4 py-1.5 rounded-full text-sm border border-yellow-200 text-yellow-700 font-semibold shadow-sm flex items-center gap-2">
                                {item.name}
                                <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs">{item.stock} ta</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
