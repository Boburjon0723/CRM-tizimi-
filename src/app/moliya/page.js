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
        <div>
            <Header title="Moliya (Finance)" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-sm font-medium">Joriy Balans</p>
                            <h3 className="text-2xl font-bold mt-1 text-gray-800">{balance.toLocaleString()} so'm</h3>
                        </div>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Wallet size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-sm font-medium">Jami Kirim</p>
                            <h3 className="text-2xl font-bold mt-1 text-green-600">+{totalIncome.toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                            <ArrowUpCircle size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-sm font-medium">Jami Chiqim</p>
                            <h3 className="text-2xl font-bold mt-1 text-red-600">-{totalExpense.toLocaleString()}</h3>
                        </div>
                        <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                            <ArrowDownCircle size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-semibold text-gray-800">So'nggi O'tkazmalar</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setFilterType('all')}
                                className={`px-3 py-1 rounded-lg text-sm ${filterType === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
                            >Barchasi</button>
                            <button
                                onClick={() => setFilterType('income')}
                                className={`px-3 py-1 rounded-lg text-sm ${filterType === 'income' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                            >Kirim</button>
                            <button
                                onClick={() => setFilterType('expense')}
                                className={`px-3 py-1 rounded-lg text-sm ${filterType === 'expense' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                            >Chiqim</button>
                        </div>
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                        {filteredTransactions.map(t => (
                            <div key={t.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                                <div className="flex gap-4 items-center">
                                    <div className={`p-2 rounded-full ${t.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                        {t.type === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-800">{t.description}</p>
                                        <div className="flex gap-2 text-xs text-gray-500">
                                            <span>{new Date(t.date).toLocaleDateString()}</span>
                                            {t.category && <span>• {t.category}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`font-bold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                        {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}
                                    </p>
                                    <button onClick={() => handleDelete(t.id)} className="text-xs text-gray-400 hover:text-red-500 mt-1">O'chirish</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-6">Yangi O'tkazma</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setType('income')}
                                className={`py-2 rounded-md text-sm font-medium transition ${type === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}
                            >Kirim</button>
                            <button
                                type="button"
                                onClick={() => setType('expense')}
                                className={`py-2 rounded-md text-sm font-medium transition ${type === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}
                            >Chiqim</button>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Summa</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                placeholder="0"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Sana</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kategoriya</label>
                            <input
                                type="text"
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                placeholder="Masalan: Oylik, Savdo, Ijara"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Izoh</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                rows="3"
                                placeholder="Batafsil ma'lumot..."
                                required
                            ></textarea>
                        </div>

                        <button
                            type="submit"
                            className={`w-full py-2 rounded-lg text-white font-medium transition ${type === 'income' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                        >
                            Saqlash
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}