'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Image, Eye, EyeOff, Globe, Upload, Loader2 } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Mahsulotlar() {
    const { toggleSidebar } = useLayout()
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [uploading, setUploading] = useState(false)
    const [form, setForm] = useState({
        name: '',
        stock: '', // miqdor
        sale_price: '', // narx
        category: '',
        image_url: '',
        description: '', // tavsif
        is_active: true // web_active
    })

    useEffect(() => {
        loadProducts()
    }, [])

    async function handleImageUpload(e) {
        const file = e.target.files[0]
        if (!file) return

        try {
            setUploading(true)
            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random()}.${fileExt}`
            const filePath = `${fileName}`

            // Ensure bucket exists in Supabase Storage or replace 'products' with your actual bucket name
            const { error: uploadError } = await supabase.storage
                .from('products')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data } = supabase.storage
                .from('products')
                .getPublicUrl(filePath)

            setForm({ ...form, image_url: data.publicUrl })
        } catch (error) {
            console.error('Error uploading image:', error)
            alert('Rasm yuklashda xatolik: ' + (error.message))
        } finally {
            setUploading(false)
        }
    }

    async function loadProducts() {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setProducts(data || [])
        } catch (error) {
            console.error('Error loading products:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.name || !form.price) {
            alert('Nom va Narx majburiy!')
            return
        }

        try {
            const productData = {
                name: form.name,
                stock: parseInt(form.stock) || 0,
                sale_price: parseInt(form.sale_price) || 0,
                category: form.category,
                image_url: form.image_url,
                description: form.description,
                is_active: form.is_active
            }

            if (editId) {
                const { error } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', editId)
                if (error) throw error
                setEditId(null)
            } else {
                const { error } = await supabase
                    .from('products')
                    .insert([productData])
                if (error) throw error
            }

            setForm({ name: '', stock: '', price: '', category: '', image_url: '', description: '', is_active: true })
            setIsAdding(false)
            loadProducts()
        } catch (error) {
            console.error('Error saving product:', error)
            alert('Xatolik: ' + error.message)
        }
    }

    async function handleDelete(id) {
        if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadProducts()
        } catch (error) {
            console.error('Error deleting product:', error)
            alert('O\'chirishda xatolik!')
        }
    }

    function handleEdit(item) {
        setForm({
            name: item.name,
            stock: item.stock,
            sale_price: item.sale_price,
            category: item.category || '',
            image_url: item.image_url || '',
            description: item.description || '',
            is_active: item.is_active ?? true
        })
        setEditId(item.id)
        setIsAdding(true)
    }

    function handleCancel() {
        setForm({ name: '', stock: '', price: '', category: '', image_url: '', description: '', is_active: true })
        setEditId(null)
        setIsAdding(false)
    }

    const filteredProducts = products.filter(p =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category?.toLowerCase().includes(searchTerm.toLowerCase())
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
            <Header title="Mahsulotlar (Products)" toggleSidebar={toggleSidebar} />

            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Qidirish..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg"
                    />
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition flex-1 sm:flex-none"
                    >
                        {isAdding ? <X size={20} /> : <Plus size={20} />}
                        {isAdding ? 'Bekor' : 'Yangi mahsulot'}
                    </button>
                    <a href="/vebsayt" className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition flex-1 sm:flex-none">
                        <Globe size={20} />
                        Web
                    </a>
                </div>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-xl shadow-sm mb-6 fade-in">
                    <h3 className="text-lg font-semibold mb-4">
                        {editId ? 'Tahrirlash' : 'Yangi qo\'shish'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <input className="border p-3 rounded-lg" placeholder="Nomi *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                            <input type="number" className="border p-3 rounded-lg" placeholder="Soni (Stock)" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
                            <input type="number" className="border p-3 rounded-lg" placeholder="Narxi *" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} required />
                            <input className="border p-3 rounded-lg" placeholder="Kategoriya" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />

                            {/* Image Upload */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-gray-700">Rasm</label>
                                <div className="flex gap-4 items-start">
                                    <div className="relative w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50">
                                        {form.image_url ? (
                                            <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <Image className="text-gray-400" size={32} />
                                        )}
                                        {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={24} /></div>}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-2">
                                        <label className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-100 transition w-max text-sm font-medium">
                                            <Upload size={18} />
                                            {uploading ? 'Yuklanmoqda...' : 'Yuklash'}
                                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                                        </label>
                                        <input type="text" placeholder="yoki URL" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} className="border p-2 rounded-lg text-sm" />
                                    </div>
                                </div>
                            </div>

                            <textarea className="border p-3 rounded-lg md:col-span-2" placeholder="Tavsif (Description)" rows="3" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />

                            <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-300 rounded-lg md:col-span-2">
                                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-5 h-5 accent-blue-600" />
                                <span className="font-medium">Websaytda ko'rinisin (Active)</span>
                            </label>
                        </div>
                        <div className="flex gap-3">
                            <button type="submit" className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"><Save size={20} /> Saqlash</button>
                            <button type="button" onClick={handleCancel} className="flex items-center gap-2 bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600"><X size={20} /> Bekor</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left">Product</th>
                            <th className="px-6 py-4 text-left">Price</th>
                            <th className="px-6 py-4 text-left">Stock</th>
                            <th className="px-6 py-4 text-left">Status</th>
                            <th className="px-6 py-4 text-left">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProducts.map((item) => (
                            <tr key={item.id} className="border-t hover:bg-gray-50 transition">
                                <td className="px-6 py-4 flex items-center gap-3">
                                    {item.image_url ? <img src={item.image_url} alt="" className="w-10 h-10 rounded object-cover bg-gray-100" /> : <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center"><Image size={20} className="text-gray-400" /></div>}
                                    <div>
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-xs text-gray-500">{item.category}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">{item.sale_price?.toLocaleString()}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs ${item.stock < 10 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{item.stock}</span>
                                </td>
                                <td className="px-6 py-4">
                                    {item.is_active ? <Eye size={16} className="text-green-500" /> : <EyeOff size={16} className="text-gray-400" />}
                                </td>
                                <td className="px-6 py-4 flex gap-2">
                                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:bg-blue-50 p-2 rounded"><Edit size={18} /></button>
                                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:bg-red-50 p-2 rounded"><Trash2 size={18} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}