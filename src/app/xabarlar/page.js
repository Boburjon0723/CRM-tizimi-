'use client'

import { useState, useEffect } from 'react'
import { Mail, Trash2, Eye, MessageSquare, Calendar, Phone, User, Filter } from 'lucide-react'
import Header from '@/components/Header'
import { useLayout } from '@/context/LayoutContext'
import { supabase } from '@/lib/supabase'

export default function Xabarlar() {
    const { toggleSidebar } = useLayout()
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all') // all, new, read, replied

    useEffect(() => {
        loadMessages()

        // Real-time subscription for new messages
        const subscription = supabase
            .channel('contact_messages_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'contact_messages' },
                () => {
                    loadMessages()
                }
            )
            .subscribe()

        return () => {
            subscription.unsubscribe()
        }
    }, [filter])

    async function loadMessages() {
        try {
            let query = supabase
                .from('contact_messages')
                .select('*')
                .order('created_at', { ascending: false })

            if (filter !== 'all') {
                query = query.eq('status', filter)
            }

            const { data, error } = await query

            if (error) throw error
            setMessages(data || [])
        } catch (error) {
            console.error('Error loading messages:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleDelete(id) {
        if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

        try {
            const { error } = await supabase
                .from('contact_messages')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadMessages()
        } catch (error) {
            console.error('Error deleting message:', error)
            alert('O\'chirishda xatolik!')
        }
    }

    async function handleStatusChange(id, newStatus) {
        try {
            const updateData = { status: newStatus }

            if (newStatus === 'read') {
                updateData.read_at = new Date().toISOString()
            } else if (newStatus === 'replied') {
                updateData.replied_at = new Date().toISOString()
            }

            const { error } = await supabase
                .from('contact_messages')
                .update(updateData)
                .eq('id', id)

            if (error) throw error
            loadMessages()
        } catch (error) {
            console.error('Error updating message:', error)
            alert('Yangilashda xatolik!')
        }
    }

    const filterButtons = [
        { value: 'all', label: 'Hammasi', color: 'gray' },
        { value: 'new', label: 'Yangi', color: 'blue' },
        { value: 'read', label: 'O\'qilgan', color: 'gray' },
        { value: 'replied', label: 'Javob berilgan', color: 'green' }
    ]

    const getStatusColor = (status) => {
        const colors = {
            new: 'bg-blue-100 text-blue-700',
            read: 'bg-gray-100 text-gray-700',
            replied: 'bg-green-100 text-green-700'
        }
        return colors[status] || colors.new
    }

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-6">
            <Header title="Xabarlar" toggleSidebar={toggleSidebar} />

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg shadow-blue-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-blue-100">Jami Xabarlar</p>
                            <p className="text-3xl font-bold mt-2">{messages.length}</p>
                        </div>
                        <MessageSquare size={36} className="opacity-80" />
                    </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Yangi</p>
                            <p className="text-2xl font-bold text-blue-600 mt-2">
                                {messages.filter(m => m.status === 'new').length}
                            </p>
                        </div>
                        <Mail size={28} className="text-blue-500" />
                    </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">O'qilgan</p>
                            <p className="text-2xl font-bold text-gray-600 mt-2">
                                {messages.filter(m => m.status === 'read').length}
                            </p>
                        </div>
                        <Eye size={28} className="text-gray-500" />
                    </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Javob berilgan</p>
                            <p className="text-2xl font-bold text-green-600 mt-2">
                                {messages.filter(m => m.status === 'replied').length}
                            </p>
                        </div>
                        <MessageSquare size={28} className="text-green-500" />
                    </div>
                </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                <Filter size={20} className="text-gray-400 mt-2 flex-shrink-0" />
                {filterButtons.map(btn => (
                    <button
                        key={btn.value}
                        onClick={() => setFilter(btn.value)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${filter === btn.value
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                            }`}
                    >
                        {btn.label}
                    </button>
                ))}
            </div>

            {/* Messages Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Yuklanmoqda...</div>
                ) : messages.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
                        <p className="font-medium text-lg">Xabarlar topilmadi</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">Mijoz</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">Aloqa</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">Mavzu</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">Xabar</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">Sana</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">Status</th>
                                    <th className="text-left py-4 px-6 text-sm font-bold text-gray-700">Amallar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {messages.map((message) => (
                                    <tr key={message.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="py-4 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <User size={20} className="text-blue-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-gray-900 truncate">{message.name}</p>
                                                    <p className="text-sm text-gray-500 truncate">{message.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            {message.phone && (
                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                    <Phone size={14} className="flex-shrink-0" />
                                                    <span className="truncate">{message.phone}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-4 px-6">
                                            <p className="font-medium text-gray-700 truncate max-w-xs">{message.subject || '-'}</p>
                                        </td>
                                        <td className="py-4 px-6 max-w-xs">
                                            <p className="text-gray-600 text-sm line-clamp-2">
                                                {message.message}
                                            </p>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex items-center gap-2 text-sm text-gray-500 whitespace-nowrap">
                                                <Calendar size={14} />
                                                {new Date(message.created_at).toLocaleDateString('uz-UZ')}
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <select
                                                value={message.status}
                                                onChange={(e) => handleStatusChange(message.id, e.target.value)}
                                                className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(message.status)} border-0 cursor-pointer`}
                                            >
                                                <option value="new">Yangi</option>
                                                <option value="read">O'qilgan</option>
                                                <option value="replied">Javob berilgan</option>
                                            </select>
                                        </td>
                                        <td className="py-4 px-6">
                                            <button
                                                onClick={() => handleDelete(message.id)}
                                                className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                                title="O'chirish"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
