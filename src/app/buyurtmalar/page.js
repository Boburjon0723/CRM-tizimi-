'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification, formatOrderNotification } from '@/utils/telegram'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Filter } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Buyurtmalar() {
    const { toggleSidebar } = useLayout()
    const [buyurtmalar, setBuyurtmalar] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterStatus, setFilterStatus] = useState('Hammasi')
    const [form, setForm] = useState({
        mijoz: '',
        mahsulot: '',
        miqdor: '',
        summa: '',
        sana: new Date().toISOString().split('T')[0],
        status: 'Yangi'
    })

    useEffect(() => {
        loadBuyurtmalar()

        // Real-time subscription
        const channel = supabase
            .channel('buyurtmalar_changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'buyurtmalar' },
                (payload) => {
                    playNotificationSound()
                    setBuyurtmalar(prev => [payload.new, ...prev])
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    function playNotificationSound() {
        if (typeof window !== 'undefined') {
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj')
                audio.play().catch(e => console.log('Audio play failed:', e))
            } catch (error) {
                console.error('Audio init failed:', error)
            }
        }
    }

    async function loadBuyurtmalar() {
        try {
            const { data, error } = await supabase
                .from('buyurtmalar')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setBuyurtmalar(data || [])
        } catch (error) {
            console.error('Error loading orders:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.mijoz || !form.mahsulot || !form.summa) {
            alert('Mijoz, mahsulot va summa majburiy!')
            return
        }

        try {
            const orderData = {
                mijoz: form.mijoz,
                mahsulot: form.mahsulot,
                miqdor: parseInt(form.miqdor) || 1,
                summa: parseInt(form.summa),
                sana: form.sana,
                status: form.status
            }

            if (editId) {
                const { error } = await supabase
                    .from('buyurtmalar')
                    .update(orderData)
                    .eq('id', editId)

                if (error) throw error
                setEditId(null)
            } else {
                const { data, error } = await supabase
                    .from('buyurtmalar')
                    .insert([orderData])
                    .select()

                if (error) throw error

                // Send Telegram notification for new orders
                if (data && data[0]) {
                    const message = formatOrderNotification(data[0])
                    await sendTelegramNotification(message)
                }
            }

            setForm({
                mijoz: '',
                mahsulot: '',
                miqdor: '',
                summa: '',
                sana: new Date().toISOString().split('T')[0],
                status: 'Yangi'
            })
            setIsAdding(false)
            loadBuyurtmalar()
        } catch (error) {
            console.error('Error saving order:', error)
            alert('Xatolik yuz berdi!')
        }
    }

    async function handleDelete(id) {
        if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

        try {
            const { error } = await supabase
                .from('buyurtmalar')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadBuyurtmalar()
        } catch (error) {
            console.error('Error deleting order:', error)
            alert('O\'chirishda xatolik!')
        }
    }

    async function handleStatusChange(id, newStatus) {
        try {
            const { error } = await supabase
                .from('buyurtmalar')
                .update({ status: newStatus })
                .eq('id', id)

            if (error) throw error
            loadBuyurtmalar()
        } catch (error) {
            console.error('Error updating status:', error)
        }
    }

    function handleEdit(item) {
        setForm({
            mijoz: item.mijoz,
            mahsulot: item.mahsulot,
            miqdor: item.miqdor.toString(),
            summa: item.summa.toString(),
            sana: item.sana,
            status: item.status
        })
        setEditId(item.id)
        setIsAdding(true)
    }

    function handleCancel() {
        setForm({
            mijoz: '',
            mahsulot: '',
            miqdor: '',
            summa: '',
            sana: new Date().toISOString().split('T')[0],
            status: 'Yangi'
        })
        setEditId(null)
        setIsAdding(false)
    }

    const filteredBuyurtmalar = buyurtmalar.filter(b => {
        const matchesSearch = b.mijoz?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            b.mahsulot?.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesStatus = filterStatus === 'Hammasi' || b.status === filterStatus
        return matchesSearch && matchesStatus
    })

    const totalSumma = filteredBuyurtmalar.reduce((sum, b) => sum + (b.summa || 0), 0)
    const statusCounts = {
        Yangi: buyurtmalar.filter(b => b.status === 'Yangi').length,
        Jarayonda: buyurtmalar.filter(b => b.status === 'Jarayonda').length,
        Tugallandi: buyurtmalar.filter(b => b.status === 'Tugallandi').length
    }

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
            <Header title="Buyurtmalar" toggleSidebar={toggleSidebar} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Jami Buyurtmalar</p>
                    <p className="text-3xl font-bold mt-2">{buyurtmalar.length}</p>
                </div>
                <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Yangi</p>
                    <p className="text-3xl font-bold mt-2">{statusCounts.Yangi}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Jarayonda</p>
                    <p className="text-3xl font-bold mt-2">{statusCounts.Jarayonda}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
                    <p className="text-sm opacity-80">Jami Summa</p>
                    <p className="text-3xl font-bold mt-2">{(totalSumma / 1000000).toFixed(1)}M</p>
                </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buyurtma qidirish..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={20} className="text-gray-500" />
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="border border-gray-300 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option>Hammasi</option>
                        <option>Yangi</option>
                        <option>Jarayonda</option>
                        <option>Tugallandi</option>
                    </select>
                </div>

                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    {isAdding ? <X size={20} /> : <Plus size={20} />}
                    {isAdding ? 'Bekor qilish' : 'Yangi buyurtma'}
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-xl shadow-sm mb-6 fade-in">
                    <h3 className="text-lg font-semibold mb-4">
                        {editId ? 'Buyurtmani tahrirlash' : 'Yangi buyurtma qo\'shish'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <input
                                type="text"
                                placeholder="Mijoz nomi *"
                                value={form.mijoz}
                                onChange={(e) => setForm({ ...form, mijoz: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Mahsulot *"
                                value={form.mahsulot}
                                onChange={(e) => setForm({ ...form, mahsulot: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                            />
                            <input
                                type="number"
                                placeholder="Miqdor"
                                value={form.miqdor}
                                onChange={(e) => setForm({ ...form, miqdor: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                min="1"
                            />
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
                            />
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                            >
                                <option>Yangi</option>
                                <option>Jarayonda</option>
                                <option>Tugallandi</option>
                            </select>
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
                {filteredBuyurtmalar.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Buyurtmalar topilmadi</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left">Mijoz</th>
                                <th className="px-6 py-4 text-left">Mahsulot</th>
                                <th className="px-6 py-4 text-left">Miqdor</th>
                                <th className="px-6 py-4 text-left">Summa</th>
                                <th className="px-6 py-4 text-left">Sana</th>
                                <th className="px-6 py-4 text-left">Status</th>
                                <th className="px-6 py-4 text-left">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBuyurtmalar.map((item) => (
                                <tr key={item.id} className="border-t hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 font-medium">{item.mijoz}</td>
                                    <td className="px-6 py-4">{item.mahsulot}</td>
                                    <td className="px-6 py-4">{item.miqdor}</td>
                                    <td className="px-6 py-4 font-semibold text-green-600">
                                        {item.summa?.toLocaleString()} so'm
                                    </td>
                                    <td className="px-6 py-4">{item.sana}</td>
                                    <td className="px-6 py-4">
                                        <select
                                            value={item.status}
                                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                            className={`px-3 py-1 rounded-full text-sm font-medium border-0 cursor-pointer ${item.status === 'Yangi' ? 'bg-blue-100 text-blue-800' :
                                                item.status === 'Jarayonda' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-green-100 text-green-800'
                                                }`}
                                        >
                                            <option>Yangi</option>
                                            <option>Jarayonda</option>
                                            <option>Tugallandi</option>
                                        </select>
                                    </td>
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