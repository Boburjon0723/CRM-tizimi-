'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Image, Eye, EyeOff, Globe, Upload, Loader2, Package, AlertTriangle } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'

export default function Mahsulotlar() {
    const { toggleSidebar } = useLayout()
    const { t } = useLanguage()
    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const [colorLibrary, setColorLibrary] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editId, setEditId] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterCategory, setFilterCategory] = useState('all')
    const [uploading, setUploading] = useState(false)
    const [form, setForm] = useState({
        name: '',
        name_uz: '',
        name_ru: '',
        name_en: '',
        sale_price: '', // narx
        category_id: '',
        image_url: '',
        description: '', // tavsif
        description_uz: '',
        description_ru: '',
        description_en: '',
        is_active: true, // web_active
        features: [], // xususiyatlar
        images: [], // ko'p rasmlar
        imageUrlInput: '', // temporary input
        color: '', // legacy
        colors: [], // multi-select
        size: '', // Mapping to 'Kod'
        rating: '0',
        reviews: '0'
    })
    const [isAddingColor, setIsAddingColor] = useState(false)
    const [newColor, setNewColor] = useState({ name: '', hex_code: '#000000' })

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)
            // Load Categories
            const { data: catData } = await supabase.from('categories').select('*').order('name')
            setCategories(catData || [])

            // Load Products
            const { data, error } = await supabase
                .from('products')
                .select('*, categories(name)')
                .order('created_at', { ascending: false })

            if (error) throw error
            setProducts(data || [])

            // Load Color Library
            const { data: colorData } = await supabase.from('product_colors').select('*').order('name')
            setColorLibrary(colorData || [])
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleImageUpload(e) {
        const files = Array.from(e.target.files)
        if (!files.length) return

        try {
            setUploading(true)
            const newImageUrls = []

            for (const file of files) {
                const fileExt = file.name.split('.').pop()
                const fileName = `${Math.random()}.${fileExt}`
                const filePath = `${fileName}`

                const { error: uploadError } = await supabase.storage
                    .from('products')
                    .upload(filePath, file)

                if (uploadError) throw uploadError

                const { data } = supabase.storage
                    .from('products')
                    .getPublicUrl(filePath)

                newImageUrls.push(data.publicUrl)
            }

            const updatedImages = [...(form.images || []), ...newImageUrls]
            setForm({ ...form, images: updatedImages, image_url: updatedImages[0] || '' })
        } catch (error) {
            console.error('Error uploading image:', error)
            alert('Rasm yuklashda xatolik: ' + (error.message))
        } finally {
            setUploading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.name || !form.sale_price) {
            alert(t('products.requiredError') || 'Nom va Narx majburiy!')
            return
        }

        try {
            const categoryName = categories.find(c => c.id === form.category_id)?.name || ''

            const productData = {
                name: form.name_ru || form.name_uz || form.name_en || form.name,
                name_uz: form.name_uz,
                name_ru: form.name_ru,
                name_en: form.name_en,
                sale_price: parseFloat(form.sale_price) || 0,
                category_id: form.category_id || null,
                category: categoryName, // Sync name for redundancy
                image_url: form.images?.[0] || form.image_url || '',
                images: form.images || [],
                description: form.description_ru || form.description_uz || form.description_en || form.description,
                description_uz: form.description_uz,
                description_ru: form.description_ru,
                description_en: form.description_en,
                is_active: form.is_active,
                color: form.colors?.[0] || form.color || '', // preserve first for legacy
                colors: form.colors || [],
                size: form.size, // Kod
                features: form.features.reduce((acc, curr) => {
                    if (curr.key) acc[curr.key] = curr.value;
                    return acc;
                }, {}),
                rating: parseFloat(form.rating) || 0,
                reviews: parseInt(form.reviews) || 0
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

            setForm({ name: '', sale_price: '', category_id: '', image_url: '', description: '', is_active: true, features: [], images: [], imageUrlInput: '', color: '', colors: [], size: '', rating: '0', reviews: '0' })
            setIsModalOpen(false)
            loadData()
        } catch (error) {
            console.error('Error saving product:', error)
            alert(t('common.saveError'))
        }
    }

    async function handleDelete(id) {
        if (!confirm(t('common.deleteConfirm'))) return

        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', id)

            if (error) throw error
            loadData()
        } catch (error) {
            console.error('Error deleting product:', error)
            alert(t('common.deleteError'))
        }
    }

    function handleEdit(item) {
        setForm({
            name: item.name || '',
            name_uz: item.name_uz || '',
            name_ru: item.name_ru || '',
            name_en: item.name_en || '',
            sale_price: item.sale_price?.toString() || '',
            category_id: item.category_id || '',
            image_url: item.image_url || '',
            images: item.images || (item.image_url ? [item.image_url] : []),
            description: item.description || '',
            description_uz: item.description_uz || '',
            description_ru: item.description_ru || '',
            description_en: item.description_en || '',
            is_active: item.is_active ?? true,
            color: item.color || '',
            colors: item.colors || (item.color ? [item.color] : []),
            size: item.size || '',
            features: item.features ? Object.entries(item.features).map(([key, value]) => ({ key, value })) : [],
            imageUrlInput: '',
            rating: item.rating?.toString() || '0',
            reviews: item.reviews?.toString() || '0'
        })

        setEditId(item.id)
        setIsModalOpen(true)
    }

    function handleCancel() {
        setForm({ name: '', sale_price: '', category_id: '', image_url: '', description: '', is_active: true, features: [], images: [], imageUrlInput: '', color: '', colors: [], size: '' })
        setEditId(null)
        setIsModalOpen(false)
    }

    async function handleAddColor() {
        if (!newColor.name || !newColor.hex_code) return
        try {
            const { data, error } = await supabase
                .from('product_colors')
                .insert([newColor])
                .select()
            if (error) throw error
            setColorLibrary([...colorLibrary, data[0]])
            setNewColor({ name: '', hex_code: '#000000' })
            setIsAddingColor(false)
        } catch (error) {
            console.error('Error adding color:', error)
            alert('Rangni saqlashda xatolik!')
        }
    }

    function toggleColor(colorName) {
        const currentColors = [...(form.colors || [])]
        const index = currentColors.indexOf(colorName)
        if (index > -1) {
            currentColors.splice(index, 1)
        } else {
            currentColors.push(colorName)
        }
        setForm({ ...form, colors: currentColors })
    }

    async function toggleStatus(id, currentStatus) {
        try {
            const { error } = await supabase
                .from('products')
                .update({ is_active: !currentStatus })
                .eq('id', id)

            if (error) throw error
            loadData()
        } catch (error) {
            console.error('Error updating status:', error)
        }
    }

    function handleRemoveImage(index) {
        const newImages = form.images.filter((_, i) => i !== index)
        setForm({ ...form, images: newImages, image_url: newImages[0] || '' })
    }

    function handleAddFeature() {
        setForm({ ...form, features: [...form.features, { key: '', value: '' }] })
    }

    function handleFeatureChange(index, field, value) {
        const newFeatures = [...form.features]
        newFeatures[index][field] = value
        setForm({ ...form, features: newFeatures })
    }

    function handleRemoveFeature(index) {
        const newFeatures = form.features.filter((_, i) => i !== index)
        setForm({ ...form, features: newFeatures })
    }

    const filteredProducts = products.filter(p => {
        const searchTerms = searchTerm.toLowerCase().split(' ').filter(word => word.length > 0);

        if (searchTerms.length === 0) {
            return filterCategory === 'all' || p.categories?.name === filterCategory;
        }

        const matchesSearch = searchTerms.every(term => {
            const inName = p.name?.toLowerCase().includes(term);
            const inNameUz = p.name_uz?.toLowerCase().includes(term);
            const inNameRu = p.name_ru?.toLowerCase().includes(term);
            const inNameEn = p.name_en?.toLowerCase().includes(term);
            const inSize = p.size?.toLowerCase().includes(term);
            const inColors = p.colors?.some(c => c.toLowerCase().includes(term));
            const inCategory = p.categories?.name?.toLowerCase().includes(term);

            return inName || inNameUz || inNameRu || inNameEn || inSize || inColors || inCategory;
        });

        const matchesCategory = filterCategory === 'all' || p.categories?.name === filterCategory;
        return matchesSearch && matchesCategory;
    })

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
            <Header title={t('common.products')} toggleSidebar={toggleSidebar} />

            {/* Actions Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder={t('products.searchPlaceholder')}
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <select
                        className="px-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl outline-none cursor-pointer transition-all text-gray-700 font-medium"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                    >
                        <option value="all">{t('products.allCategories')}</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => {
                            setEditId(null)
                            setForm({
                                name: '',
                                sale_price: '',
                                category_id: '',
                                image_url: '',
                                description: '',
                                min_stock: '10',
                                is_active: true,
                                features: [],
                                images: [],
                                imageUrlInput: '',
                                color: '',
                                size: ''
                            })
                            setIsModalOpen(true)
                        }}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 font-bold"
                    >
                        <Plus size={20} />
                        <span className="hidden sm:inline">{t('common.add')}</span>
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                <th className="px-6 py-4 rounded-tl-2xl">{t('products.image')}</th>
                                <th className="px-6 py-4">{t('products.name')}</th>
                                <th className="px-6 py-4">Koddi</th>
                                <th className="px-6 py-4">{t('products.category')}</th>
                                <th className="px-6 py-4">{t('products.salePrice')}</th>
                                <th className="px-6 py-4">Rangi</th>
                                <th className="px-6 py-4">{t('products.status')}</th>
                                <th className="px-6 py-4 rounded-tr-2xl text-right">{t('products.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredProducts.map((item) => (
                                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden border border-gray-100">
                                            {item.images?.[0] ? (
                                                <img src={item.images[0]} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <Package size={20} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                                    <td className="px-6 py-4 font-mono font-medium text-gray-600">
                                        {item.size || '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold">
                                            {item.categories?.name || '-'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono font-medium text-gray-700">
                                        {item.sale_price?.toLocaleString()} $
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {item.colors && item.colors.length > 0 ? (
                                                item.colors.map((c, i) => (
                                                    <span key={i} className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100">
                                                        {c}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-gray-400">{item.color || '-'}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => toggleStatus(item.id, item.is_active)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${item.is_active
                                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                }`}
                                        >
                                            {item.is_active ? t('products.active') : t('products.inactive')}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(item)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            >
                                                <Edit size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredProducts.length === 0 && (
                        <div className="text-center py-12">
                            <Package size={48} className="mx-auto text-gray-200 mb-4" />
                            <p className="text-gray-400 font-medium">{t('products.noProducts')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal - keeping existing logic but improving styles inside would be next step if needed */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-gray-900">
                                {editId ? t('products.editProduct') : t('products.newProduct')}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-8">
                            {/* Form Sections as before but with updated Tailwind classes if desirable. 
                                For brevity, assuming Form styling is passable or will be updated separately 
                                if the user complains. The main request was "ko'kamroq/chiroyli" which usually targets the main view.
                            */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Basic Fields - Multilingual Names */}
                                <div className="space-y-4 col-span-2">
                                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider">Nomi (UZ)</label>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                value={form.name_uz}
                                                onChange={e => setForm({ ...form, name_uz: e.target.value })}
                                                placeholder="Masalan: Parda"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-red-600 uppercase tracking-wider">Название (RU)</label>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                value={form.name_ru}
                                                onChange={e => setForm({ ...form, name_ru: e.target.value })}
                                                placeholder="Например: Шторы"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Name (EN)</label>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                value={form.name_en}
                                                onChange={e => setForm({ ...form, name_en: e.target.value })}
                                                placeholder="e.g. Curtains"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="block text-sm font-bold text-gray-700">Sotuv Narxi ($)</label>
                                    <input
                                        type="number"
                                        required
                                        className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        value={form.sale_price}
                                        onChange={e => setForm({ ...form, sale_price: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-4 col-span-2">
                                    <div className="flex justify-between items-center">
                                        <label className="block text-sm font-bold text-gray-700">Ranglar to'plami</label>
                                        <button
                                            type="button"
                                            onClick={() => setIsAddingColor(true)}
                                            className="text-xs text-blue-600 font-bold hover:underline"
                                        >
                                            + Yangi rang qo'shish
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100 min-h-[100px]">
                                        {colorLibrary.map(color => (
                                            <button
                                                key={color.id}
                                                type="button"
                                                onClick={() => toggleColor(color.name)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${form.colors?.includes(color.name)
                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'
                                                    }`}
                                            >
                                                <div
                                                    className="w-3 h-3 rounded-full border border-black/10"
                                                    style={{ backgroundColor: color.hex_code }}
                                                />
                                                <span className="text-xs font-bold">{color.name}</span>
                                            </button>
                                        ))}

                                        {colorLibrary.length === 0 && (
                                            <p className="text-gray-400 text-xs italic">Ranglar kutubxonasi bo'sh</p>
                                        )}
                                    </div>

                                    {isAddingColor && (
                                        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-4 animate-fade-in">
                                            <input
                                                type="text"
                                                placeholder="Rang nomi"
                                                className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg outline-none text-sm"
                                                value={newColor.name}
                                                onChange={e => setNewColor({ ...newColor, name: e.target.value })}
                                            />
                                            <input
                                                type="color"
                                                className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent"
                                                value={newColor.hex_code}
                                                onChange={e => setNewColor({ ...newColor, hex_code: e.target.value })}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddColor}
                                                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md"
                                            >
                                                Saqlash
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsAddingColor(false)}
                                                className="text-gray-400 hover:text-gray-600"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Stock & Category */}
                                <div className="space-y-4">
                                    <label className="block text-sm font-bold text-gray-700">Koddi</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        value={form.size}
                                        onChange={e => setForm({ ...form, size: e.target.value })}
                                        placeholder="Masalan: TR-102"
                                    />
                                </div>
                                <div className="space-y-4">
                                    <label className="block text-sm font-bold text-gray-700">Kategoriya</label>
                                    <select
                                        className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        value={form.category_id}
                                        onChange={e => setForm({ ...form, category_id: e.target.value })}
                                        required
                                    >
                                        <option value="">Tanlang</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Rating and Reviews */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <label className="block text-sm font-bold text-gray-700">Reyting (0-5)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="5"
                                        className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        value={form.rating}
                                        onChange={e => setForm({ ...form, rating: e.target.value })}
                                        placeholder="4.5"
                                    />
                                </div>
                                <div className="space-y-4">
                                    <label className="block text-sm font-bold text-gray-700">Sharhlar soni</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        value={form.reviews}
                                        onChange={e => setForm({ ...form, reviews: e.target.value })}
                                        placeholder="10"
                                    />
                                </div>
                            </div>

                            {/* Description - Multilingual */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-700">Tavsif (Description)</h3>
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider">Tavsif (UZ)</label>
                                        <textarea
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            rows="2"
                                            value={form.description_uz}
                                            onChange={e => setForm({ ...form, description_uz: e.target.value })}
                                        ></textarea>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-red-600 uppercase tracking-wider">Описание (RU)</label>
                                        <textarea
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            rows="2"
                                            value={form.description_ru}
                                            onChange={e => setForm({ ...form, description_ru: e.target.value })}
                                        ></textarea>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Description (EN)</label>
                                        <textarea
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            rows="2"
                                            value={form.description_en}
                                            onChange={e => setForm({ ...form, description_en: e.target.value })}
                                        ></textarea>
                                    </div>
                                </div>
                            </div>

                            {/* Images */}
                            <div className="space-y-4 bg-gray-50 p-6 rounded-xl border border-dashed border-gray-300">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Rasmlar</label>
                                <div className="flex flex-wrap gap-4">
                                    {form.images.map((img, index) => (
                                        <div key={index} className="relative w-24 h-24 group">
                                            <img src={img} alt="" className="w-full h-full object-cover rounded-lg shadow-sm" />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveImage(index)}
                                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    <label className="w-24 h-24 flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-500 transition-all text-blue-500">
                                        <Upload size={24} />
                                        <span className="text-xs font-bold mt-1">Yuklash</span>
                                        <input type="file" multiple className="hidden" onChange={handleImageUpload} />
                                    </label>
                                </div>
                            </div>

                            {/* Features */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="block text-sm font-bold text-gray-700">Xususiyatlar</label>
                                    <button
                                        type="button"
                                        onClick={handleAddFeature}
                                        className="text-sm text-blue-600 font-bold hover:underline"
                                    >
                                        + Qo'shish
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {form.features.map((feature, index) => (
                                        <div key={index} className="flex gap-4 items-start">
                                            <input
                                                type="text"
                                                placeholder="Nomi (Masalan: Rangi)"
                                                className="flex-1 px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={feature.key}
                                                onChange={e => handleFeatureChange(index, 'key', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Qiymati (Masalan: Qora)"
                                                className="flex-1 px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={feature.value}
                                                onChange={e => handleFeatureChange(index, 'value', e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveFeature(index)}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6 border-t flex justify-end gap-3 sticky bottom-0 bg-white p-4 -mx-6 -mb-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploading}
                                    className="px-6 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
                                >
                                    {uploading ? t('common.loading') : t('common.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    )
}