'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Image, Eye, EyeOff, Globe, Upload, Loader2 } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Mahsulotlar() {
    const { toggleSidebar } = useLayout()
    const [mahsulotlar, setMahsulotlar] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [uploading, setUploading] = useState(false)
    const [form, setForm] = useState({
        nomi: '',
        miqdor: '',
        narx: '',
        kategoriya: '',
        rasm_url: '',
        tavsif: '',
        web_active: true
    })

    useEffect(() => {
        loadMahsulotlar()
    }, [])

    async function handleImageUpload(e) {
        const file = e.target.files[0]
        if (!file) return

        try {
            setUploading(true)
            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random()}.${fileExt}`
            const filePath = `${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('mahsulotlar')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data } = supabase.storage
                .from('mahsulotlar')
                .getPublicUrl(filePath)

            setForm({ ...form, rasm_url: data.publicUrl })
        } catch (error) {
            console.error('Error uploading image:', error)
            alert('Rasm yuklashda xatolik yuz berdi: ' + (error.message || error.error_description || 'Noma\'lum xato'))
        } finally {
            setUploading(false)
        }
    }

    async function loadMahsulotlar() {
        try {
            const { data, error } = await supabase
                .from('mahsulotlar')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setMahsulotlar(data || [])
        } catch (error) {
            console.error('Error loading products:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.nomi || !form.miqdor || !form.narx) {
            alert('Barcha maydonlarni to\'ldiring!')
            return
        }

        try {
            if (editId) {
                const { error } = await supabase
                    .from('mahsulotlar')
                    .update({
                        nomi: form.nomi,
                        miqdor: parseInt(form.miqdor),
                        narx: parseInt(form.narx),
                        kategoriya: form.kategoriya,
                        rasm_url: form.rasm_url,
                        tavsif: form.tavsif,
                        web_active: form.web_active
                    })
                    .eq('id', editId)

                if (error) throw error
                setEditId(null)
            } else {
                const { error } = await supabase
                    .from('mahsulotlar')
                    .insert([{
                        nomi: form.nomi,
                        miqdor: parseInt(form.miqdor),
                        narx: parseInt(form.narx),
                        kategoriya: form.kategoriya,
                        rasm_url: form.rasm_url,
                        tavsif: form.tavsif,
                        web_active: form.web_active
                    }])

                if (error) throw error
            }

            setForm({ nomi: '', miqdor: '', narx: '', kategoriya: '', rasm_url: '', tavsif: '', web_active: true })
            setIsAdding(false)
            loadMahsulotlar()
        } catch (error) {
            console.error('Error saving product:', error)
            alert('Mahsulotni saqlashda xatolik yuz berdi: ' + (error.message || 'Noma\'lum xato'))
        }
    }

    async function handleDelete(id) {
        if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

        try {
            const { error } = await supabase
                .from('mahsulotlar')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadMahsulotlar()
        } catch (error) {
            console.error('Error deleting product:', error)
            alert('O\'chirishda xatolik!')
        }
    }

    function handleEdit(item) {
        setForm({
            nomi: item.nomi,
            miqdor: item.miqdor,
            narx: item.narx,
            kategoriya: item.kategoriya || '',
            rasm_url: item.rasm_url || '',
            tavsif: item.tavsif || '',
            web_active: item.web_active ?? true
        })
        setEditId(item.id)
        setIsAdding(true)
    }

    function handleCancel() {
        setForm({ nomi: '', miqdor: '', narx: '', kategoriya: '', rasm_url: '', tavsif: '', web_active: true })
        setEditId(null)
        setIsAdding(false)
    }

    const filteredMahsulotlar = mahsulotlar.filter(m =>
        m.nomi?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.kategoriya?.toLowerCase().includes(searchTerm.toLowerCase())
    )

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
            <Header title="Mahsulotlar" toggleSidebar={toggleSidebar} />

            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Mahsulot qidirish..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition flex-1 sm:flex-none"
                    >
                        {isAdding ? <X size={20} /> : <Plus size={20} />}
                        {isAdding ? 'Bekor qilish' : 'Yangi mahsulot'}
                    </button>
                    <a
                        href="/vebsayt"
                        className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition flex-1 sm:flex-none"
                    >
                        <Globe size={20} />
                        Web Boshqaruv
                    </a>
                </div>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-xl shadow-sm mb-6 fade-in">
                    <h3 className="text-lg font-semibold mb-4">
                        {editId ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot qo\'shish'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <input
                                type="text"
                                placeholder="Mahsulot nomi *"
                                value={form.nomi}
                                onChange={(e) => setForm({ ...form, nomi: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                            />
                            <input
                                type="number"
                                placeholder="Miqdor *"
                                value={form.miqdor}
                                onChange={(e) => setForm({ ...form, miqdor: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                                min="0"
                            />
                            <input
                                type="number"
                                placeholder="Narx (so'm) *"
                                value={form.narx}
                                onChange={(e) => setForm({ ...form, narx: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                                required
                                min="0"
                            />
                            <input
                                type="text"
                                placeholder="Kategoriya"
                                value={form.kategoriya}
                                onChange={(e) => setForm({ ...form, kategoriya: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg"
                            />
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-gray-700">Mahsulot rasmi</label>
                                <div className="flex gap-4 items-start">
                                    <div className="relative w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50">
                                        {form.rasm_url ? (
                                            <img src={form.rasm_url} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <Image className="text-gray-400" size={32} />
                                        )}
                                        {uploading && (
                                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                                <Loader2 className="animate-spin text-blue-600" size={24} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-2">
                                        <label className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-100 transition w-max text-sm font-medium">
                                            <Upload size={18} />
                                            {uploading ? 'Yuklanmoqda...' : 'Rasm tanlash'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageUpload}
                                                className="hidden"
                                                disabled={uploading}
                                            />
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Yoki rasm URL kiriting"
                                            value={form.rasm_url}
                                            onChange={(e) => setForm({ ...form, rasm_url: e.target.value })}
                                            className="border border-gray-300 p-2 rounded-lg text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                            <textarea
                                placeholder="Tavsif"
                                value={form.tavsif}
                                onChange={(e) => setForm({ ...form, tavsif: e.target.value })}
                                className="border border-gray-300 p-3 rounded-lg md:col-span-2"
                                rows="3"
                            />
                            <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-300 rounded-lg md:col-span-2">
                                <input
                                    type="checkbox"
                                    checked={form.web_active}
                                    onChange={(e) => setForm({ ...form, web_active: e.target.checked })}
                                    className="w-5 h-5 accent-blue-600"
                                />
                                <span className="font-medium">Vebsaytda ko'rsatish</span>
                            </label>
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
                {filteredMahsulotlar.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Mahsulotlar topilmadi</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left">Rasm</th>
                                <th className="px-6 py-4 text-left">Nomi</th>
                                <th className="px-6 py-4 text-left">Miqdor</th>
                                <th className="px-6 py-4 text-left">Narx</th>
                                <th className="px-6 py-4 text-left">Kategoriya</th>
                                <th className="px-6 py-4 text-left">Holati</th>
                                <th className="px-6 py-4 text-left">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMahsulotlar.map((item) => (
                                <tr key={item.id} className="border-t hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        {item.rasm_url ? (
                                            <img src={item.rasm_url} alt={item.nomi} className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                                <Image size={24} />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium">{item.nomi}</div>
                                        <div className="text-xs text-gray-400 max-w-[200px] truncate">{item.tavsif}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-sm ${item.miqdor < 10 ? 'bg-red-100 text-red-800' :
                                            item.miqdor < 50 ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-green-100 text-green-800'
                                            }`}>
                                            {item.miqdor}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">{item.narx?.toLocaleString()} so'm</td>
                                    <td className="px-6 py-4">{item.kategoriya || '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`flex items-center gap-1 text-sm ${item.web_active ? 'text-green-600' : 'text-gray-400'}`}>
                                            {item.web_active ? <Eye size={16} /> : <EyeOff size={16} />}
                                            {item.web_active ? 'Ko\'rinadi' : 'Yashirin'}
                                        </span>
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