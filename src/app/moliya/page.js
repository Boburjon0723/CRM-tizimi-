'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Filter, ArrowUpCircle, ArrowDownCircle, Wallet, Calendar, TrendingUp, TrendingDown } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useLayout } from '@/context/LayoutContext'

export default function Moliya() {
    const { toggleSidebar } = useLayout()
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [amount, setAmount] = useState('')
    const [type, setType] = useState('income') // income, expense
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [filterType, setFilterType] = useState('all') // all, income, expense

    useEffect(() => {
        loadTransactions()
    }, [])

    async function loadTransactions() {
        try {
            const { data, error } = await supabase
                .from('transactions')
                .select('*')
                .order('date', { ascending: false })
                .order('created_at', { ascending: false })

            if (error) throw error
            setTransactions(data || [])
        } catch (error) {
            console.error('Error loading transactions:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!amount || !description) return

        try {
            const newTransaction = {
                type,
                amount: parseFloat(amount),
                description,
                category,
                date
            }

            const { error } = await supabase
                .from('transactions')
                .insert([newTransaction])

            if (error) throw error

            setAmount('')
            setDescription('')
            setCategory('')
            setIsAdding(false)
            loadTransactions()
        } catch (error) {
            console.error('Error adding transaction:', error)
            alert('Xatolik!')
        }
    }

    async function handleDelete(id) {
        if (!confirm('O\'chirishni tasdiqlaysizmi?')) return
        try {
            const { error } = await supabase.from('transactions').delete().eq('id', id)
            if (error) throw error
            loadTransactions()
        } catch (error) {
            console.error('Error deleting:', error)
        }
    }

    const filteredTransactions = transactions.filter(t => filterType === 'all' || t.type === filterType)

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
    const balance = totalIncome - totalExpense

    const chartData = [
        { name: 'Kirim', value: totalIncome, color: '#10b981' },
        { name: 'Chiqim', value: totalExpense, color: '#ef4444' }
    ]

    if (loading) {
        return <div className="p-8 text-center">Yuklanmoqda...</div>
    }


    return (
        <div className="max-w-7xl mx-auto px-6">
            <Header title="Moliya" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">Joriy Balans</p>
                            <h3 className="text-3xl font-bold mt-2">${balance.toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <Wallet className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-2xl shadow-lg shadow-green-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-green-100">Jami Kirim</p>
                            <h3 className="text-3xl font-bold mt-2">+${totalIncome.toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <ArrowUpCircle className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-2xl shadow-lg shadow-red-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-red-100">Jami Chiqim</p>
                            <h3 className="text-3xl font-bold mt-2">-${totalExpense.toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <ArrowDownCircle className="text-white" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-800">So'nggi O'tkazmalar</h3>
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            <button
                                onClick={() => setFilterType('all')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterType === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >Barchasi</button>
                            <button
                                onClick={() => setFilterType('income')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterType === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-green-600'}`}
                            >Kirim</button>
                            <button
                                onClick={() => setFilterType('expense')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterType === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-red-600'}`}
                            >Chiqim</button>
                        </div>
                    </div>

                    <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                        {filteredTransactions.map(t => (
                            <div key={t.id} className="flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all border border-gray-100 group">
                                <div className="flex gap-4 items-center">
                                    <div className={`p-3 rounded-xl ${t.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                        {t.type === 'income' ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 text-lg">{t.description}</p>
                                        <div className="flex gap-3 text-xs text-gray-500 font-medium">
                                            <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(t.date).toLocaleDateString()}</span>
                                            {t.category && <span className="bg-white px-2 py-0.5 rounded border border-gray-200">{t.category}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-lg font-bold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                        {t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString()}
                                    </p>
                                    <button
                                        onClick={() => handleDelete(t.id)}
                                        className="text-xs text-red-400 hover:text-red-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity font-medium flex items-center justify-end gap-1 ml-auto"
                                    >
                                        <Trash2 size={12} /> O'chirish
                                    </button>
                                </div>
                            </div>
                        ))}
                        {filteredTransactions.length === 0 && (
                            <div className="text-center py-12 text-gray-400">
                                <p>O'tkazmalar topilmadi</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
                    <div className="mb-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Moliyaviy Tahlil</h3>
                        <div className="h-48 w-full flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value) => `$${value.toLocaleString()}`}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-6 mt-auto">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Yangi O'tkazma</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setType('income')}
                                    className={`py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${type === 'income' ? 'bg-white text-green-600' : 'bg-transparent text-gray-500 hover:text-gray-700 shadow-none'}`}
                                >Kirim</button>
                                <button
                                    type="button"
                                    onClick={() => setType('expense')}
                                    className={`py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${type === 'expense' ? 'bg-white text-red-600' : 'bg-transparent text-gray-500 hover:text-gray-700 shadow-none'}`}
                                >Chiqim</button>
                            </div>

                            <div className="space-y-3">
                                <div className="relative">
                                    <span className="absolute left-4 top-3.5 text-gray-400 font-bold">$</span>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all font-medium"
                                        placeholder="Summa"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all font-medium text-gray-600"
                                        required
                                    />
                                    <input
                                        type="text"
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all font-medium"
                                        placeholder="Kategoriya"
                                    />
                                </div>

                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all font-medium resize-none"
                                    rows="3"
                                    placeholder="Izoh..."
                                    required
                                ></textarea>
                            </div>

                            <button
                                type="submit"
                                className={`w-full py-3.5 rounded-xl text-white font-bold text-lg shadow-lg transition-all transform hover:-translate-y-1 ${type === 'income' ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <Save size={20} />
                                    Saqlash
                                </span>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}