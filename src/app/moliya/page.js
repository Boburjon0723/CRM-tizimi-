'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

export default function Moliya({ toggleSidebar }) {
    const [moliya, setMoliya] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterTur, setFilterTur] = useState('Hammasi')
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    })
    const [form, setForm] = useState({
        tur: 'Kirim',
        summa: '',
        sana: new Date().toISOString().split('T')[0],
        izoh: ''
    })

    useEffect(() => {
        loadMoliya()
    }, [])

    async function loadMoliya() {
        try {
            const { data, error } = await supabase
                .from('moliya')
                .select('*')
                .order('sana', { ascending: false })

            if (error) throw error
            setMoliya(data || [])
        } catch (error) {
            console.error('Error loading finance:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.summa || !form.sana) {
            alert('Summa va sana majburiy!')
            return
        }

        try {
            const financeData = {
                tur: form.tur,
                summa: parseInt(form.summa),
                sana: form.sana,
                izoh: form.izoh
            }

            if (editId) {
                const { error } = await supabase
                    .from('moliya')
                    .update(financeData)
                    .eq('id', editId)

                if (error) throw error
                setEditId(null)
            } else {
                const { error } = await supabase
                    .from('moliya')
                    .insert([financeData])

                if (error) throw error
            }

            setForm({ tur: 'Kirim', summa: '', sana: new Date().toISOString().split('T')[0], izoh: '' })
            setIsAdding(false)
            loadMoliya()
        } catch (error) {
            console.error('Error saving finance:', error)
            alert('Xatolik yuz berdi!')
        }
    }

    async function handleDelete(id) {
        if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

        try {
            const { error } = await supabase
                .from('moliya')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadMoliya()
        } catch (error) {
            console.error('Error deleting finance:', error)
            alert('O\'chirishda xatolik!')
        }
    }

    function handleEdit(item) {
        setForm({
            tur: item.tur,
            summa: item.summa.toString(),
            sana: item.sana,
            izoh: item.izoh || ''
        })
        setEditId(item.id)
        setIsAdding(true)
    }

    function handleCancel() {
        setForm({ tur: 'Kirim', summa: '', sana: new Date().toISOString().split('T')[0], izoh: '' })
        setEditId(null)
        setIsAdding(false)
    }

    const filteredMoliya = moliya.filter(m => {
        const matchesSearch = m.izoh?.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesTur = filterTur === 'Hammasi' || m.tur === filterTur
        const inDateRange = (!dateRange.start || m.sana >= dateRange.start) &&
            (!dateRange.end || m.sana <= dateRange.end)
        return matchesSearch && matchesTur && inDateRange
    })

    const totalKirim = filteredMoliya.filter(m => m.tur === 'Kirim').reduce((sum, m) => sum + (m.summa || 0), 0)
    const totalChiqim = filteredMoliya.filter(m => m.tur === 'Chiqim').reduce((sum, m) => sum + (m.summa || 0), 0)
    const foyda = totalKirim - totalChiqim

    const pieData = [
        { name: 'Kirim', value: totalKirim, color: '#10b981' },
        { name: 'Chiqim', value: totalChiqim, color: '#ef4444' }
    ]

    // Monthly chart data
    const monthlyData = {}
    filteredMoliya.forEach(item => {
        const month = item.sana.substring(0, 7) // YYYY-MM
        if (!monthlyData[month]) {
            monthlyData[month] = { month, kirim: 0, chiqim: 0 }
        }
        if (item.tur === 'Kirim') {
            monthlyData[month].kirim += item.summa
        } else {
            monthlyData[month].chiqim += item.summa
        }
    })
    const chartData = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month))

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
            <Header title="Moliya" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp size={20} />
                        <p className="text-sm opacity-80">Jami Kirim</p>
                    </div>
                    <p className="text-3xl font-bold">{(totalKirim / 1000000).toFixed(2)}M</p>
                    <p className="text-sm opacity-80 mt-1">{totalKirim.toLocaleString()} so'm</p>
                </div>

                <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingDown size={20} />
                        <p className="text-sm opacity-80">Jami Chiqim</p>
                    </div>
                    <p className="text-3xl font-bold">{(totalChiqim / 1000000).toFixed(2)}M</p>
                    <p className="text-sm opacity-80 mt-1">{totalChiqim.toLocaleString()} so'm</p>
                </div>

                <div className={`${foyda >= 0 ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-orange-500 to-orange-600'} text-white p-6 rounded-xl shadow-lg`}>
                    <div className="flex items-center gap-2 mb-2">
                        {foyda >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        <p className="text-sm opacity-80">Foyda / Zarar</p>
                    </div>
                    <p className="text-3xl font-bold">{(foyda / 1000000).toFixed(2)}M</p>
                    <p className="text-sm opacity-80 mt-1">{foyda.toLocaleString()} so'm</p>
                </div>

                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Calendar size={20} />
                        <p className="text-sm opacity-80">Tranzaksiyalar</p>
                    </div>
                    <p className="text-3xl font-bold">{filteredMoliya.length}</p>
                    <p className="text-sm opacity-80 mt-1">Tanlangan davr</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-semibold mb-4">Kirim/Chiqim Nisbati</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={(entry) => `${entry.name}: ${(entry.value / 1000000).toFixed(1)}M`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-semibold mb-4">Oylik Statistika</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="kirim" fill="#10b981" name="Kirim" />
                            <Bar dataKey="chiqim" fill="#ef4444" name="Chiqim" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="mb-6 flex flex-col xl:flex-row gap-4 items-start xl:items-center">
                <div className="relative w-full xl:max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Izoh bo'yicha qidirish..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <select
                    value={filterTur}
                    onChange={(e) => setFilterTur(e.target.value)}
                    className="border border-gray-300 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                    <option>Hammasi</option>
                    <option>Kirim</option>
                    <option>Chiqim</option>
                </select>

                <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="border border-gray-300 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-500">-</span>
                <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="border border-gray-300 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500"
                />

                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    {isAdding ? <X size={20} /> : <Plus size={20} />}
                    {isAdding ? 'Bekor qilish' : 'Yangi yozuv'}
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-xl shadow-sm mb-6 fade-in">
                    <h3 className="text-lg font-semibold mb-4">
                        {editId ? 'Yozuvni tahrirlash' : 'Yangi moliyaviy yozuv'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <select
                                value={form.tur}
                                onChange={(e) => setForm({ ...form, tur: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                            >
                                <option>Kirim</option>
                                <option>Chiqim</option>
                            </select>
                            <input
                                type="number"
                                placeholder="Summa (so'm) *"
                                value={form.summa}
                                onChange={(e) => setForm({ ...form, summa: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                                min="0"
                            />
                            <input
                                type="date"
                                value={form.sana}
                                onChange={(e) => setForm({ ...form, sana: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Izoh"
                                value={form.izoh}
                                onChange={(e) => setForm({ ...form, izoh: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                            />
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

            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
                {filteredMoliya.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Moliyaviy yozuvlar topilmadi</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left">Tur</th>
                                <th className="px-6 py-4 text-left">Summa</th>
                                <th className="px-6 py-4 text-left">Sana</th>
                                <th className="px-6 py-4 text-left">Izoh</th>
                                <th className="px-6 py-4 text-left">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMoliya.map((item) => (
                                <tr key={item.id} className="border-t hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${item.tur === 'Kirim' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                            {item.tur === 'Kirim' ? '↑' : '↓'} {item.tur}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 font-bold ${item.tur === 'Kirim' ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                        {item.summa?.toLocaleString()} so'm
                                    </td>
                                    <td className="px-6 py-4">{item.sana}</td>
                                    <td className="px-6 py-4 text-gray-600">{item.izoh || '-'}</td>
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
                )}
            </div>
        </div>
    )
}