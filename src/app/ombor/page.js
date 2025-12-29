'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Filter, AlertTriangle, TrendingUp, Package, RefreshCcw, Minus } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Ombor() {
    const { toggleSidebar } = useLayout()
    const [mahsulotlar, setMahsulotlar] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterKategoriya, setFilterKategoriya] = useState('Hammasi')

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('mahsulotlar')
                .select('*')
                .order('nomi', { ascending: true })

            if (error) throw error
            setMahsulotlar(data || [])
        } catch (error) {
            console.error('Error loading inventory:', error)
        } finally {
            setLoading(false)
        }
    }

    async function updateStock(id, currentMiqdor, change) {
        const newMiqdor = Math.max(0, currentMiqdor + change)
        try {
            const { error } = await supabase
                .from('mahsulotlar')
                .update({ miqdor: newMiqdor })
                .eq('id', id)

            if (error) throw error
            // Update local state for immediate feedback
            setMahsulotlar(prev => prev.map(m => m.id === id ? { ...m, miqdor: newMiqdor } : m))
        } catch (error) {
            console.error('Error updating stock:', error)
            alert('Xatolik yuz berdi!')
        }
    }

    const kategoriyalar = ['Hammasi', ...new Set(mahsulotlar.map(m => m.kategoriya).filter(Boolean))]

    const filteredInventory = mahsulotlar.filter(m => {
        const matchesSearch = m.nomi?.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesCategory = filterKategoriya === 'Hammasi' || m.kategoriya === filterKategoriya
        return matchesSearch && matchesCategory
    })

    const lowStockItems = mahsulotlar.filter(m => (m.miqdor || 0) < 10)
    const outOfStockItems = mahsulotlar.filter(m => (m.miqdor || 0) === 0)
    const totalInventoryValue = mahsulotlar.reduce((sum, m) => sum + ((m.miqdor || 0) * (m.narx || 0)), 0)

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
            <Header title="Ombor Boshqaruvi" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-sm text-gray-500">Jami Mahsulotlar</p>
                    <p className="text-2xl font-bold mt-1">{mahsulotlar.length} tur</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-yellow-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-500">Kam qolgan</p>
                            <p className="text-2xl font-bold mt-1 text-yellow-600">{lowStockItems.length}</p>
                        </div>
                        <AlertTriangle className="text-yellow-500" size={20} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-500">Tugagan</p>
                            <p className="text-2xl font-bold mt-1 text-red-600">{outOfStockItems.length}</p>
                        </div>
                        <AlertTriangle className="text-red-500" size={20} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                    <p className="text-sm text-gray-500">Ombor Qiymati</p>
                    <p className="text-2xl font-bold mt-1 text-green-600">{(totalInventoryValue / 1000000).toFixed(1)}M so'm</p>
                </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Mahsulot qidirish..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={20} className="text-gray-500" />
                    <select
                        value={filterKategoriya}
                        onChange={(e) => setFilterKategoriya(e.target.value)}
                        className="border border-gray-300 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                        {kategoriyalar.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={loadData}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                    title="Yangilash"
                >
                    <RefreshCcw size={20} />
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 text-left border-b border-gray-100">
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Mahsulot</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Kategoriya</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Zaxira (Soni)</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Narxi</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Holat</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Zaxira Boshqaruvi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredInventory.length > 0 ? (
                            filteredInventory.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {item.rasm_url ? (
                                                <img src={item.rasm_url} alt={item.nomi} className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                                    <Package size={20} />
                                                </div>
                                            )}
                                            <span className="font-medium text-gray-800">{item.nomi}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{item.kategoriya || '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`font-bold ${item.miqdor < 10 ? 'text-red-600 scale-110' : 'text-gray-800'}`}>
                                            {item.miqdor}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {item.narx?.toLocaleString()} so'm
                                    </td>
                                    <td className="px-6 py-4">
                                        {item.miqdor === 0 ? (
                                            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full">Tugagan</span>
                                        ) : item.miqdor < 10 ? (
                                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full">Kam qolgan</span>
                                        ) : (
                                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">Yetarli</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => updateStock(item.id, item.miqdor, -1)}
                                                className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"
                                                title="Sotildi / Chiqim"
                                            >
                                                <Minus size={18} />
                                            </button>
                                            <button
                                                onClick={() => updateStock(item.id, item.miqdor, 1)}
                                                className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition"
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
                                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                    Mahsulotlar topilmadi
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Recommendations */}
            {lowStockItems.length > 0 && (
                <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-xl">
                    <h4 className="text-yellow-800 font-bold mb-2 flex items-center gap-2">
                        <AlertTriangle size={20} />
                        Tez orada tugashi mumkin bo'lgan mahsulotlar:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {lowStockItems.map(item => (
                            <span key={item.id} className="bg-white px-3 py-1 rounded-full text-sm border border-yellow-200 text-yellow-700">
                                {item.nomi} ({item.miqdor} ta)
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
