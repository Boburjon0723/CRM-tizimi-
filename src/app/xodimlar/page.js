'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { UserPlus, Edit, Trash2, Save, X, Search, Calendar } from 'lucide-react'

export default function Xodimlar({ toggleSidebar }) {
    const [xodimlar, setXodimlar] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [form, setForm] = useState({
        ism: '',
        lavozim: '',
        maosh: '',
        bonus: '0',
        ishlagan: '0',
        damolgan: '0'
    })

    useEffect(() => {
        loadXodimlar()
    }, [])

    async function loadXodimlar() {
        try {
            const { data, error } = await supabase
                .from('xodimlar')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setXodimlar(data || [])
        } catch (error) {
            console.error('Error loading employees:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.ism || !form.lavozim || !form.maosh) {
            alert('Ism, lavozim va maosh majburiy!')
            return
        }

        try {
            const employeeData = {
                ism: form.ism,
                lavozim: form.lavozim,
                maosh: parseInt(form.maosh),
                bonus: parseInt(form.bonus) || 0,
                ishlagan: parseInt(form.ishlagan) || 0,
                damolgan: parseInt(form.damolgan) || 0
            }

            if (editId) {
                const { error } = await supabase
                    .from('xodimlar')
                    .update(employeeData)
                    .eq('id', editId)

                if (error) throw error
                setEditId(null)
            } else {
                const { error } = await supabase
                    .from('xodimlar')
                    .insert([employeeData])

                if (error) throw error
            }

            setForm({ ism: '', lavozim: '', maosh: '', bonus: '0', ishlagan: '0', damolgan: '0' })
            setIsAdding(false)
            loadXodimlar()
        } catch (error) {
            console.error('Error saving employee:', error)
            alert('Xatolik yuz berdi!')
        }
    }

    async function handleDelete(id) {
        if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

        try {
            const { error } = await supabase
                .from('xodimlar')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadXodimlar()
        } catch (error) {
            console.error('Error deleting employee:', error)
            alert('O\'chirishda xatolik!')
        }
    }

    function handleEdit(item) {
        setForm({
            ism: item.ism,
            lavozim: item.lavozim,
            maosh: item.maosh.toString(),
            bonus: item.bonus.toString(),
            ishlagan: item.ishlagan.toString(),
            damolgan: item.damolgan.toString()
        })
        setEditId(item.id)
        setIsAdding(true)
    }

    function handleCancel() {
        setForm({ ism: '', lavozim: '', maosh: '', bonus: '0', ishlagan: '0', damolgan: '0' })
        setEditId(null)
        setIsAdding(false)
    }

    const filteredXodimlar = xodimlar.filter(x =>
        x.ism?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        x.lavozim?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalMaosh = xodimlar.reduce((sum, x) => sum + (x.maosh || 0), 0)
    const totalBonus = xodimlar.reduce((sum, x) => sum + (x.bonus || 0), 0)
    const totalPayout = totalMaosh + totalBonus

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
            <Header title="Xodimlar" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-500 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Jami Xodimlar</p>
                    <p className="text-3xl font-bold mt-2">{xodimlar.length}</p>
                </div>
                <div className="bg-green-500 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Jami Maoshlar</p>
                    <p className="text-3xl font-bold mt-2">{(totalMaosh / 1000000).toFixed(1)}M</p>
                </div>
                <div className="bg-purple-500 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Jami To'lovlar</p>
                    <p className="text-3xl font-bold mt-2">{(totalPayout / 1000000).toFixed(1)}M</p>
                </div>
            </div>

            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Xodim qidirish..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition w-full sm:w-auto"
                >
                    {isAdding ? <X size={20} /> : <UserPlus size={20} />}
                    {isAdding ? 'Bekor qilish' : 'Yangi xodim'}
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-xl shadow-sm mb-6 fade-in">
                    <h3 className="text-lg font-semibold mb-4">
                        {editId ? 'Xodimni tahrirlash' : 'Yangi xodim qo\'shish'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <input
                                type="text"
                                placeholder="Ism Familiya *"
                                value={form.ism}
                                onChange={(e) => setForm({ ...form, ism: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Lavozim *"
                                value={form.lavozim}
                                onChange={(e) => setForm({ ...form, lavozim: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                            />
                            <input
                                type="number"
                                placeholder="Maosh (so'm) *"
                                value={form.maosh}
                                onChange={(e) => setForm({ ...form, maosh: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                                min="0"
                            />
                            <input
                                type="number"
                                placeholder="Bonus (so'm)"
                                value={form.bonus}
                                onChange={(e) => setForm({ ...form, bonus: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                min="0"
                            />
                            <input
                                type="number"
                                placeholder="Ishlagan kunlar"
                                value={form.ishlagan}
                                onChange={(e) => setForm({ ...form, ishlagan: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                min="0"
                                max="31"
                            />
                            <input
                                type="number"
                                placeholder="Dam olgan kunlar"
                                value={form.damolgan}
                                onChange={(e) => setForm({ ...form, damolgan: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                min="0"
                                max="31"
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
                {filteredXodimlar.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Xodimlar topilmadi</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left">Ism</th>
                                <th className="px-6 py-4 text-left">Lavozim</th>
                                <th className="px-6 py-4 text-left">Maosh</th>
                                <th className="px-6 py-4 text-left">Bonus</th>
                                <th className="px-6 py-4 text-left">Ishlagan/Dam</th>
                                <th className="px-6 py-4 text-left">Jami To'lov</th>
                                <th className="px-6 py-4 text-left">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredXodimlar.map((xodim) => {
                                const totalPayment = (xodim.maosh || 0) + (xodim.bonus || 0)
                                return (
                                    <tr key={xodim.id} className="border-t hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 font-medium">{xodim.ism}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                                                {xodim.lavozim}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">{xodim.maosh?.toLocaleString()} so'm</td>
                                        <td className="px-6 py-4">{xodim.bonus?.toLocaleString()} so'm</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={16} className="text-gray-400" />
                                                <span className="text-green-600 font-medium">{xodim.ishlagan}</span>
                                                <span className="text-gray-400">/</span>
                                                <span className="text-red-600 font-medium">{xodim.damolgan}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-green-600">
                                            {totalPayment.toLocaleString()} so'm
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleEdit(xodim)}
                                                    className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded transition"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(xodim.id)}
                                                    className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded transition"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}