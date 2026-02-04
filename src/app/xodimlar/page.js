'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { UserPlus, Edit, Trash2, Save, X, Search, Calendar, Users, DollarSign, CreditCard } from 'lucide-react'
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
        if (!form.name || !form.position || !form.monthly_salary) {
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

            setForm({ name: '', position: '', monthly_salary: '', bonus_percent: '0', worked_days: '0', rest_days: '0' })
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
        <div className="max-w-7xl mx-auto px-6">
            <Header title="Xodimlar" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">Jami Xodimlar</p>
                            <p className="text-3xl font-bold mt-2">{employees.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Users className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg shadow-green-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-green-100">Jami Maoshlar</p>
                            <p className="text-3xl font-bold mt-2">${(totalSalary).toLocaleString()}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <DollarSign className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg shadow-purple-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-purple-100">Jami To'lovlar</p>
                            <p className="text-3xl font-bold mt-2">${(totalPayout).toLocaleString()}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <CreditCard className="text-white" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Xodim qidirish..."
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
                    <span className="hidden sm:inline">{isAdding ? 'Bekor' : 'Yangi xodim'}</span>
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 mb-8 fade-in">
                    <h3 className="text-xl font-bold text-gray-800 mb-6">
                        {editId ? 'Xodimni tahrirlash' : 'Yangi xodim qo\'shish'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Ism Familiya *</label>
                                <input
                                    type="text"
                                    placeholder="Ism Familiya"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Lavozim *</label>
                                <input
                                    type="text"
                                    placeholder="Lavozim"
                                    value={form.position}
                                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Maosh ($) *</label>
                                <input
                                    type="number"
                                    placeholder="Maosh miqdori"
                                    value={form.monthly_salary}
                                    onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    required
                                    min="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Bonus ($)</label>
                                <input
                                    type="number"
                                    placeholder="Bonus miqdori"
                                    value={form.bonus_percent}
                                    onChange={(e) => setForm({ ...form, bonus_percent: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    min="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Ishlagan kunlar</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={form.worked_days}
                                    onChange={(e) => setForm({ ...form, worked_days: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    min="0"
                                    max="31"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Dam olgan kunlar</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={form.rest_days}
                                    onChange={(e) => setForm({ ...form, rest_days: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    min="0"
                                    max="31"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                Bekor qilish
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/30 font-bold transition-all"
                            >
                                <Save size={20} />
                                Saqlash
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filteredEmployees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <Users size={48} className="mb-4 opacity-20" />
                        <p className="font-medium text-lg">Xodimlar topilmadi</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                    <th className="px-6 py-4 rounded-tl-2xl">Ism</th>
                                    <th className="px-6 py-4">Lavozim</th>
                                    <th className="px-6 py-4">Maosh</th>
                                    <th className="px-6 py-4">Bonus</th>
                                    <th className="px-6 py-4">Ishlagan/Dam</th>
                                    <th className="px-6 py-4">Jami To'lov</th>
                                    <th className="px-6 py-4 rounded-tr-2xl text-right">Amallar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredEmployees.map((xodim) => {
                                    const totalPayment = (xodim.monthly_salary || 0) + (xodim.bonus_percent || 0)
                                    return (
                                        <tr key={xodim.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4 font-bold text-gray-900">{xodim.name}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold uppercase tracking-wide border border-blue-100">
                                                    {xodim.position}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-700">${xodim.monthly_salary?.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-green-600 font-medium">
                                                {xodim.bonus_percent ? `+$${xodim.bonus_percent?.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-xs text-gray-400 font-bold uppercase">Ish</span>
                                                        <span className="text-green-600 font-bold">{xodim.worked_days || 0}</span>
                                                    </div>
                                                    <div className="h-8 w-px bg-gray-200"></div>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-xs text-gray-400 font-bold uppercase">Dam</span>
                                                        <span className="text-red-500 font-bold">{xodim.rest_days || 0}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-gray-900 text-lg">
                                                ${totalPayment.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleEdit(xodim)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(xodim.id)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                    </div>
                )}
            </div>
        </div>
    )
}