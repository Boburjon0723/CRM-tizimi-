'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { UserPlus, Edit, Trash2, Save, X, Search, Calendar } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Xodimlar() {
    const { toggleSidebar } = useLayout()
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [form, setForm] = useState({
        name: '',
        position: '',
        monthly_salary: '',
        bonus_percent: '0',
        worked_days: '0',
        rest_days: '0'
    })

    useEffect(() => {
        loadEmployees()
    }, [])

    async function loadEmployees() {
        try {
            const { data, error } = await supabase
                .from('employees')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setEmployees(data || [])
        } catch (error) {
            console.error('Error loading employees:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.name || !form.position || !form.salary) {
            alert('Ism, lavozim va maosh majburiy!')
            return
        }

        try {
            const employeeData = {
                name: form.name,
                position: form.position,
                monthly_salary: parseFloat(form.monthly_salary),
                bonus_percent: parseFloat(form.bonus_percent) || 0,
                worked_days: parseInt(form.worked_days) || 0,
                rest_days: parseInt(form.rest_days) || 0
            }

            if (editId) {
                const { error } = await supabase
                    .from('employees')
                    .update(employeeData)
                    .eq('id', editId)

                if (error) throw error
                setEditId(null)
            } else {
                const { error } = await supabase
                    .from('employees')
                    .insert([employeeData])

                if (error) throw error
            }

            setForm({ name: '', position: '', salary: '', bonus: '0', worked_days: '0', rest_days: '0' })
            setIsAdding(false)
            loadEmployees()
        } catch (error) {
            console.error('Error saving employee:', error)
            alert('Xatolik yuz berdi!')
        }
    }

    async function handleDelete(id) {
        if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

        try {
            const { error } = await supabase
                .from('employees')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadEmployees()
        } catch (error) {
            console.error('Error deleting employee:', error)
            alert('O\'chirishda xatolik!')
        }
    }

    function handleEdit(item) {
        setForm({
            name: item.name,
            position: item.position,
            monthly_salary: item.monthly_salary.toString(),
            bonus_percent: item.bonus_percent?.toString() || '0',
            worked_days: item.worked_days?.toString() || '0',
            rest_days: item.rest_days?.toString() || '0'
        })
        setEditId(item.id)
        setIsAdding(true)
    }

    function handleCancel() {
        setForm({ name: '', position: '', monthly_salary: '', bonus_percent: '0', worked_days: '0', rest_days: '0' })
        setEditId(null)
        setIsAdding(false)
    }

    const filteredEmployees = employees.filter(x =>
        x.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        x.position?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalSalary = employees.reduce((sum, x) => sum + (x.monthly_salary || 0), 0)
    const totalBonus = employees.reduce((sum, x) => sum + (x.bonus_percent || 0), 0)
    const totalPayout = totalSalary + totalBonus

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
            <Header title="Xodimlar (Employees)" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-500 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Jami Xodimlar</p>
                    <p className="text-3xl font-bold mt-2">{employees.length}</p>
                </div>
                <div className="bg-green-500 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Jami Maoshlar</p>
                    <p className="text-3xl font-bold mt-2">{(totalSalary / 1000000).toFixed(1)}M</p>
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
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Lavozim *"
                                value={form.position}
                                onChange={(e) => setForm({ ...form, position: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                            />
                            <input
                                type="number"
                                placeholder="Maosh (so'm) *"
                                value={form.monthly_salary}
                                onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                                min="0"
                            />
                            <input
                                type="number"
                                placeholder="Bonus (so'm)"
                                value={form.bonus_percent}
                                onChange={(e) => setForm({ ...form, bonus_percent: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                min="0"
                            />
                            <input
                                type="number"
                                placeholder="Ishlagan kunlar"
                                value={form.worked_days}
                                onChange={(e) => setForm({ ...form, worked_days: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                min="0"
                                max="31"
                            />
                            <input
                                type="number"
                                placeholder="Dam olgan kunlar"
                                value={form.rest_days}
                                onChange={(e) => setForm({ ...form, rest_days: e.target.value })}
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
                {filteredEmployees.length === 0 ? (
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
                            {filteredEmployees.map((xodim) => {
                                const totalPayment = (xodim.monthly_salary || 0) + (xodim.bonus_percent || 0)
                                return (
                                    <tr key={xodim.id} className="border-t hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 font-medium">{xodim.name}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                                                {xodim.position}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">{xodim.monthly_salary?.toLocaleString()} so'm</td>
                                        <td className="px-6 py-4">{xodim.bonus_percent?.toLocaleString()} so'm</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={16} className="text-gray-400" />
                                                <span className="text-green-600 font-medium">{xodim.worked_days}</span>
                                                <span className="text-gray-400">/</span>
                                                <span className="text-red-600 font-medium">{xodim.rest_days}</span>
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