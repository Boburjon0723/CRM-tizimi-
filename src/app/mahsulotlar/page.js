'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/withTimeout'
import Header from '@/components/Header'
import { Plus, Edit, Trash2, Save, X, Search, Image, Eye, EyeOff, Globe, Upload, Loader2, Package, AlertTriangle, Layers, Palette } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'

/** CRM: bitta qator — uz/ru/en nom va qiymat */
const emptyFeatureRow = () => ({
    name_uz: '',
    value_uz: '',
    name_ru: '',
    value_ru: '',
    name_en: '',
    value_en: '',
})

function parseFeatureCell(item) {
    if (item == null) return { name: '', value: '' }
    if (typeof item === 'string') {
        const m = item.match(/^([^:]+):\s*(.*)$/s)
        if (m) return { name: m[1].trim(), value: m[2].trim() }
        return { name: '', value: item.trim() }
    }
    return {
        name: String(item.name ?? '').trim(),
        value: String(item.value ?? '').trim(),
    }
}

/** DB features → forma qatorlari */
function featuresRowsFromProduct(item) {
    const f = item?.features
    if (!f || typeof f !== 'object' || Array.isArray(f)) return []
    if ('uz' in f || 'ru' in f || 'en' in f) {
        const uz = Array.isArray(f.uz) ? f.uz : []
        const ru = Array.isArray(f.ru) ? f.ru : []
        const en = Array.isArray(f.en) ? f.en : []
        const n = Math.max(uz.length, ru.length, en.length)
        const rows = []
        for (let i = 0; i < n; i++) {
            const u = parseFeatureCell(uz[i])
            const r = parseFeatureCell(ru[i])
            const e = parseFeatureCell(en[i])
            rows.push({
                name_uz: u.name,
                value_uz: u.value,
                name_ru: r.name,
                value_ru: r.value,
                name_en: e.name,
                value_en: e.value,
            })
        }
        return rows
    }
    return Object.entries(f).map(([key, value]) => ({
        name_uz: key,
        value_uz: String(value ?? ''),
        name_ru: key,
        value_ru: String(value ?? ''),
        name_en: key,
        value_en: String(value ?? ''),
    }))
}

/** Forma → DB JSONB { uz: [...], ru: [...], en: [...] } */
function featuresToPayload(rows) {
    const rowHasAny = (r) =>
        [r.name_uz, r.value_uz, r.name_ru, r.value_ru, r.name_en, r.value_en].some((x) => String(x ?? '').trim() !== '')
    const kept = rows.filter(rowHasAny)
    if (!kept.length) return {}
    return {
        uz: kept.map((r) => ({
            name: String(r.name_uz ?? '').trim(),
            value: String(r.value_uz ?? '').trim(),
        })),
        ru: kept.map((r) => ({
            name: String(r.name_ru ?? '').trim(),
            value: String(r.value_ru ?? '').trim(),
        })),
        en: kept.map((r) => ({
            name: String(r.name_en ?? '').trim(),
            value: String(r.value_en ?? '').trim(),
        })),
    }
}

/** Jamoaviy rang: mahsulot qatoridan colors[] (bo'sh bo'lsa legacy color) */
function resolvedColorListForProduct(p) {
    let colors = Array.isArray(p.colors)
        ? p.colors.map((c) => String(c ?? '').trim()).filter(Boolean)
        : []
    const leg = (p.color && String(p.color).trim()) || ''
    if (colors.length === 0 && leg) colors = [leg]
    return colors
}

function dedupeColorsKeepOrder(colors) {
    const seen = new Set()
    const out = []
    for (const c of colors) {
        if (seen.has(c)) continue
        seen.add(c)
        out.push(c)
    }
    return out
}

function computeBulkColorReplaceUpdate(p, oldStr, newStr) {
    let colors = resolvedColorListForProduct(p)
    const legacyRaw = (p.color && String(p.color).trim()) || ''

    let changed = false
    colors = colors.map((c) => {
        if (c === oldStr) {
            changed = true
            return newStr
        }
        return c
    })
    colors = dedupeColorsKeepOrder(colors)

    if (legacyRaw === oldStr) changed = true

    if (!changed) return null
    return { colors, color: colors[0] || '' }
}

function computeBulkColorAddUpdate(p, namesToAdd) {
    let colors = resolvedColorListForProduct(p)
    let changed = false
    for (const n of namesToAdd) {
        if (!colors.includes(n)) {
            colors.push(n)
            changed = true
        }
    }
    if (!changed) return null
    return { colors, color: colors[0] || '' }
}

function computeBulkColorRemoveUpdate(p, rem) {
    let colors = resolvedColorListForProduct(p)
    const legacyRaw = (p.color && String(p.color).trim()) || ''
    const next = colors.filter((c) => c !== rem)
    if (next.length === colors.length && legacyRaw !== rem) return null
    return { colors: next, color: next[0] || '' }
}

export default function Mahsulotlar() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert, showConfirm } = useDialog()
    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const [colorLibrary, setColorLibrary] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)
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
        reviews: '0',
        model_3d_url: '' // 3D model link
    })
    const [isAddingColor, setIsAddingColor] = useState(false)
    const [newColor, setNewColor] = useState({ name_uz: '', name_ru: '', name_en: '', hex_code: '#000000' })
    const [cleanupInProgress, setCleanupInProgress] = useState(false)

    /** Kategoriya bo'yicha bir martalik tavsif / xususiyat (shu kategoriyadagi barcha mahsulotlarga) */
    const [bulkCategoryId, setBulkCategoryId] = useState('')
    const [bulkDescUz, setBulkDescUz] = useState('')
    const [bulkDescRu, setBulkDescRu] = useState('')
    const [bulkDescEn, setBulkDescEn] = useState('')
    const [bulkFeatures, setBulkFeatures] = useState([])
    const [bulkApplying, setBulkApplying] = useState(false)

    /** Kategoriya bo'yicha jamoaviy ranglar */
    const [bulkColorTab, setBulkColorTab] = useState('replace') // 'replace' | 'add' | 'remove'
    const [bulkColorReplaceFrom, setBulkColorReplaceFrom] = useState('')
    const [bulkColorReplaceTo, setBulkColorReplaceTo] = useState('')
    const [bulkColorAddNames, setBulkColorAddNames] = useState([])
    const [bulkColorRemoveName, setBulkColorRemoveName] = useState('')
    const [bulkColorApplying, setBulkColorApplying] = useState(false)

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoadError(null)
            setLoading(true)
            await withTimeout(
                (async () => {
                    const { data: catData, error: eCat } = await supabase
                        .from('categories')
                        .select('*')
                        .order('name')
                    if (eCat) throw eCat
                    setCategories(catData || [])

                    const { data, error: eProd } = await supabase
                        .from('products')
                        .select('*, categories(name)')
                        .order('created_at', { ascending: false })
                    if (eProd) throw eProd
                    setProducts(data || [])

                    const { data: colorData, error: eCol } = await supabase
                        .from('product_colors')
                        .select('*')
                        .order('name')
                    if (eCol) throw eCol
                    setColorLibrary(colorData || [])
                })(),
                55000,
                'Mahsulotlar 55 soniya ichida yuklanmadi — internet yoki Supabase ulanishini tekshiring, keyin «Qayta urinish» bosing.'
            )
        } catch (error) {
            console.error('Error loading data:', error)
            setLoadError(error?.message || "Ma'lumot yuklanmadi.")
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

    async function handleModelUpload(e) {
        const file = e.target.files[0]
        if (!file) return

        try {
            setUploading(true)
            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random()}.${fileExt}`
            const filePath = `${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('models') // Storage bucket for 3D models
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data } = supabase.storage
                .from('models')
                .getPublicUrl(filePath)

            setForm({ ...form, model_3d_url: data.publicUrl })
        } catch (error) {
            console.error('Error uploading model:', error)
            alert('Model yuklashda xatolik: ' + (error.message))
        } finally {
            setUploading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        const hasName = form.name_uz || form.name_ru || form.name_en || form.name;
        if (!hasName || !form.sale_price) {
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
                features: featuresToPayload(form.features),
                rating: parseFloat(form.rating) || 0,
                reviews: parseInt(form.reviews) || 0,
                model_3d_url: form.model_3d_url
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

            setForm({
                name: '',
                name_uz: '',
                name_ru: '',
                name_en: '',
                sale_price: '',
                category_id: '',
                image_url: '',
                description: '',
                description_uz: '',
                description_ru: '',
                description_en: '',
                is_active: true,
                features: [],
                images: [],
                imageUrlInput: '',
                color: '',
                colors: [],
                size: '',
                rating: '0',
                reviews: '0',
                model_3d_url: '',
            })
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
            features: featuresRowsFromProduct(item),
            imageUrlInput: '',
            rating: item.rating?.toString() || '0',
            reviews: item.reviews?.toString() || '0',
            model_3d_url: item.model_3d_url || ''
        })

        setEditId(item.id)
        setIsModalOpen(true)
    }

    function handleCancel() {
        setForm({
            name: '',
            name_uz: '',
            name_ru: '',
            name_en: '',
            sale_price: '',
            category_id: '',
            image_url: '',
            description: '',
            description_uz: '',
            description_ru: '',
            description_en: '',
            is_active: true,
            features: [],
            images: [],
            imageUrlInput: '',
            color: '',
            colors: [],
            size: '',
            rating: '0',
            reviews: '0',
            model_3d_url: '',
        })
        setEditId(null)
        setIsModalOpen(false)
    }

    async function handleAddColor() {
        const name_uz = (newColor.name_uz || '').trim()
        const name_ru = (newColor.name_ru || '').trim()
        const name_en = (newColor.name_en || '').trim()
        if (!name_uz && !name_ru && !name_en) {
            alert('Kamida bitta tilda rang nomini kiriting!')
            return
        }
        if (!newColor.hex_code) return
        const name = name_uz || name_ru || name_en
        try {
            const { data, error } = await supabase
                .from('product_colors')
                .insert([{ name, name_uz: name_uz || name, name_ru: name_ru || name, name_en: name_en || name, hex_code: newColor.hex_code }])
                .select()
            if (error) throw new Error(error.message || JSON.stringify(error))
            setColorLibrary([...colorLibrary, data[0]])
            setNewColor({ name_uz: '', name_ru: '', name_en: '', hex_code: '#000000' })
            setIsAddingColor(false)
        } catch (error) {
            console.error('Error adding color:', error)
            const msg = error?.message || error?.error_description || 'Noma\'lum xatolik'
            alert('Rangni saqlashda xatolik: ' + msg)
        }
    }

    async function handleDeleteColor(e, colorId, colorName) {
        e.stopPropagation()
        if (!confirm(`"${colorName}" rangini o'chirishni xohlaysizmi? Barcha mahsulotlardan ham olib tashlanadi.`)) return
        try {
            // 1. Barcha mahsulotlardan shu rangni olib tashlash
            const { data: productsWithColor } = await supabase
                .from('products')
                .select('id, colors')
                .overlaps('colors', [colorName])

            if (productsWithColor?.length) {
                for (const p of productsWithColor) {
                    const newColors = (p.colors || []).filter(c => c !== colorName)
                    await supabase.from('products').update({ colors: newColors }).eq('id', p.id)
                }
            }

            // 2. Rangni product_colors dan o'chirish
            const { error } = await supabase.from('product_colors').delete().eq('id', colorId)
            if (error) throw error
            setColorLibrary(colorLibrary.filter(c => c.id !== colorId))
            setForm(f => ({ ...f, colors: (f.colors || []).filter(c => c !== colorName) }))
            loadData()
        } catch (error) {
            console.error('Error deleting color:', error)
            alert('Rangni o\'chirishda xatolik: ' + (error?.message || ''))
        }
    }

    async function handleCleanupOrphanedColors() {
        if (!confirm('Mahsulotlardan mavjud bo\'lmagan (o\'chirilgan) ranglarni tozalashni xohlaysizmi?')) return
        try {
            setCleanupInProgress(true)
            const validNames = new Set(colorLibrary.map(c => c.name))
            const { data: allProducts } = await supabase.from('products').select('id, colors')
            let updated = 0
            for (const p of allProducts || []) {
                const arr = p.colors || []
                const filtered = arr.filter(c => validNames.has(c))
                if (filtered.length !== arr.length) {
                    await supabase.from('products').update({ colors: filtered }).eq('id', p.id)
                    updated++
                }
            }
            loadData()
            alert(updated > 0 ? `${updated} ta mahsulot tozalandi.` : 'Tozalanadigan mahsulot topilmadi.')
        } catch (error) {
            console.error('Error cleaning colors:', error)
            alert('Tozalashda xatolik: ' + (error?.message || ''))
        } finally {
            setCleanupInProgress(false)
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
        setForm({ ...form, features: [...form.features, emptyFeatureRow()] })
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

    const bulkProductCount = bulkCategoryId
        ? products.filter((p) => p.category_id === bulkCategoryId).length
        : 0

    function bulkAddFeature() {
        setBulkFeatures((prev) => [...prev, emptyFeatureRow()])
    }

    function bulkFeatureChange(index, field, value) {
        setBulkFeatures((prev) => {
            const next = [...prev]
            next[index] = { ...next[index], [field]: value }
            return next
        })
    }

    function bulkRemoveFeature(index) {
        setBulkFeatures((prev) => prev.filter((_, i) => i !== index))
    }

    /** Tanlangan kategoriyadagi birinchi mahsulotdan shablon (maydonlarni to'ldirish) */
    function loadBulkTemplateFromCategory() {
        if (!bulkCategoryId) {
            alert('Avval kategoriyani tanlang.')
            return
        }
        const sample = products.find((p) => p.category_id === bulkCategoryId)
        if (!sample) {
            alert('Bu kategoriyada mahsulot topilmadi.')
            return
        }
        setBulkDescUz(sample.description_uz || '')
        setBulkDescRu(sample.description_ru || '')
        setBulkDescEn(sample.description_en || '')
        setBulkFeatures(featuresRowsFromProduct(sample))
    }

    async function applyBulkCategoryContent() {
        if (!bulkCategoryId) {
            alert('Kategoriyani tanlang.')
            return
        }
        if (bulkProductCount === 0) {
            alert('Bu kategoriyada mahsulot yo‘q.')
            return
        }
        const hasDesc = [bulkDescUz, bulkDescRu, bulkDescEn].some((s) => String(s || '').trim() !== '')
        const hasFeat = bulkFeatures.some((r) =>
            [r.name_uz, r.value_uz, r.name_ru, r.value_ru, r.name_en, r.value_en].some((x) => String(x || '').trim() !== '')
        )
        if (!hasDesc && !hasFeat) {
            alert('Kamida bitta til uchun tavsif yoki kamida bitta xususiyat qatorini kiriting.')
            return
        }
        const payload = {}
        if (hasDesc) {
            payload.description = bulkDescRu || bulkDescUz || bulkDescEn || ''
            payload.description_uz = bulkDescUz
            payload.description_ru = bulkDescRu
            payload.description_en = bulkDescEn
        }
        if (hasFeat) {
            payload.features = featuresToPayload(bulkFeatures)
        }
        const parts = [hasDesc ? 'tavsif' : null, hasFeat ? 'xususiyatlar' : null].filter(Boolean).join(' va ')
        if (
            !confirm(
                `«${categories.find((c) => c.id === bulkCategoryId)?.name || '…'}» — ${bulkProductCount} ta mahsulot: ${parts} yangilanadi. Davom etasizmi?`
            )
        ) {
            return
        }
        try {
            setBulkApplying(true)
            const { error } = await supabase.from('products').update(payload).eq('category_id', bulkCategoryId)
            if (error) throw error
            alert(`Muvaffaqiyatli: ${bulkProductCount} ta mahsulot yangilandi.`)
            loadData()
        } catch (error) {
            console.error('Bulk update error:', error)
            alert('Yangilashda xatolik: ' + (error.message || ''))
        } finally {
            setBulkApplying(false)
        }
    }

    const bulkCategoryUniqueColorNames = useMemo(() => {
        if (!bulkCategoryId) return []
        const set = new Set()
        for (const p of products) {
            if (p.category_id !== bulkCategoryId) continue
            for (const c of resolvedColorListForProduct(p)) {
                if (c) set.add(c)
            }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }, [products, bulkCategoryId])

    function colorLibLabel(c) {
        return c[`name_${language}`] || c.name_uz || c.name_ru || c.name_en || c.name
    }

    function toggleBulkColorAddName(name) {
        setBulkColorAddNames((prev) =>
            prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
        )
    }

    async function applyBulkColorReplace() {
        if (!bulkCategoryId) {
            await showAlert('Kategoriyani tanlang.')
            return
        }
        const oldStr = bulkColorReplaceFrom.trim()
        const newStr = bulkColorReplaceTo.trim()
        if (!oldStr) {
            await showAlert('Almashtiriladigan (eski) rang qiymatini kiriting yoki ro‘yxatdan tanlang.')
            return
        }
        if (!newStr) {
            await showAlert('Yangi rangni kutubxonadan tanlang.')
            return
        }
        if (oldStr === newStr) {
            await showAlert('Eski va yangi rang bir xil — hech narsa o‘zgarmaydi.')
            return
        }
        if (!colorLibrary.some((c) => c.name === newStr)) {
            await showAlert('Yangi rang faqat «Ranglar to‘plami» kutubxonasidagi qiymat bo‘lishi kerak.')
            return
        }
        const targets = products.filter((p) => p.category_id === bulkCategoryId)
        if (targets.length === 0) {
            await showAlert('Bu kategoriyada mahsulot yo‘q.')
            return
        }
        const catName = categories.find((c) => c.id === bulkCategoryId)?.name || '…'
        const ok = await showConfirm(
            `«${catName}» — ${targets.length} ta mahsulot: «${oldStr}» nomli rang «${newStr}» bilan almashtirilsinmi?\n\n(Mahsulotlarning colors massividagi to‘liq mos keluvchi qiymat almashtiriladi.)`,
            { variant: 'warning' }
        )
        if (!ok) return
        try {
            setBulkColorApplying(true)
            let updated = 0
            for (const p of targets) {
                const patch = computeBulkColorReplaceUpdate(p, oldStr, newStr)
                if (!patch) continue
                const { error } = await supabase.from('products').update(patch).eq('id', p.id)
                if (error) throw error
                updated++
            }
            await showAlert(
                updated > 0
                    ? `${updated} ta mahsulot yangilandi.`
                    : "Hech bir mahsulotda bunday rang qiymati topilmadi (colors yoki legacy color).",
                { variant: updated > 0 ? 'success' : 'info' }
            )
            loadData()
        } catch (error) {
            console.error('Bulk color replace error:', error)
            await showAlert('Yangilashda xatolik: ' + (error.message || ''), { variant: 'error' })
        } finally {
            setBulkColorApplying(false)
        }
    }

    async function applyBulkColorAdd() {
        if (!bulkCategoryId) {
            await showAlert('Kategoriyani tanlang.')
            return
        }
        const names = bulkColorAddNames.filter((n) => colorLibrary.some((c) => c.name === n))
        if (names.length === 0) {
            await showAlert('Kamida bitta rangni kutubxonadan belgilang.')
            return
        }
        const targets = products.filter((p) => p.category_id === bulkCategoryId)
        if (targets.length === 0) {
            await showAlert('Bu kategoriyada mahsulot yo‘q.')
            return
        }
        const catName = categories.find((c) => c.id === bulkCategoryId)?.name || '…'
        const ok = await showConfirm(
            `«${catName}» — ${targets.length} ta mahsulotga ${names.length} ta rang qo‘shilsinmi? (Mavjud ranglar takrorlanmaydi.)`,
            { variant: 'warning' }
        )
        if (!ok) return
        try {
            setBulkColorApplying(true)
            let updated = 0
            for (const p of targets) {
                const patch = computeBulkColorAddUpdate(p, names)
                if (!patch) continue
                const { error } = await supabase.from('products').update(patch).eq('id', p.id)
                if (error) throw error
                updated++
            }
            await showAlert(
                updated > 0 ? `${updated} ta mahsulotga yangi rang qo‘shildi.` : `Tanlangan ranglar bu ${targets.length} ta mahsulotda allaqachon bor edi.`,
                { variant: updated > 0 ? 'success' : 'info' }
            )
            loadData()
        } catch (error) {
            console.error('Bulk color add error:', error)
            await showAlert('Yangilashda xatolik: ' + (error.message || ''), { variant: 'error' })
        } finally {
            setBulkColorApplying(false)
        }
    }

    async function applyBulkColorRemove() {
        if (!bulkCategoryId) {
            await showAlert('Kategoriyani tanlang.')
            return
        }
        const rem = bulkColorRemoveName.trim()
        if (!rem) {
            await showAlert('Olib tashlanadigan rangni tanlang yoki kiriting.')
            return
        }
        const targets = products.filter((p) => p.category_id === bulkCategoryId)
        if (targets.length === 0) {
            await showAlert('Bu kategoriyada mahsulot yo‘q.')
            return
        }
        const catName = categories.find((c) => c.id === bulkCategoryId)?.name || '…'
        const ok = await showConfirm(
            `«${catName}» — ${targets.length} ta mahsulotdan «${rem}» rangi olib tashlansinmi?`,
            { variant: 'warning' }
        )
        if (!ok) return
        try {
            setBulkColorApplying(true)
            let updated = 0
            for (const p of targets) {
                const patch = computeBulkColorRemoveUpdate(p, rem)
                if (!patch) continue
                const { error } = await supabase.from('products').update(patch).eq('id', p.id)
                if (error) throw error
                updated++
            }
            await showAlert(
                updated > 0 ? `${updated} ta mahsulotdan rang olib tashlandi.` : 'Hech bir mahsulotda bu rang yo‘q.',
                { variant: updated > 0 ? 'success' : 'info' }
            )
            loadData()
        } catch (error) {
            console.error('Bulk color remove error:', error)
            await showAlert('Yangilashda xatolik: ' + (error.message || ''), { variant: 'error' })
        } finally {
            setBulkColorApplying(false)
        }
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
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600" />
                    <p className="text-sm text-gray-500 text-center max-w-md leading-relaxed">
                        Ma&apos;lumotlar yuklanmoqda. Ko&apos;p mahsulot yoki sekin tarmoqda 1 dan bir necha
                        daqiqagacha cho&apos;zilishi mumkin — sabab bo&apos;lmasa, brauzer konsolini ochib
                        (F12) xatolarni ko&apos;ring.
                    </p>
                </div>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="max-w-7xl mx-auto px-6">
                <Header title={t('common.products')} toggleSidebar={toggleSidebar} />
                <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50/90 p-8 text-center">
                    <AlertTriangle className="text-red-600 shrink-0" size={40} strokeWidth={1.75} />
                    <p className="text-red-900 font-medium max-w-lg leading-relaxed">{loadError}</p>
                    <button
                        type="button"
                        onClick={() => loadData()}
                        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-blue-700"
                    >
                        Qayta urinish
                    </button>
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
                <div className="flex gap-3 w-full md:w-auto flex-wrap">
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
                        type="button"
                        onClick={handleCleanupOrphanedColors}
                        disabled={cleanupInProgress}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        title="Mahsulotlardan o'chirilgan ranglarni tozalash"
                    >
                        {cleanupInProgress ? 'Tozalanmoqda...' : 'Ranglarni tozalash'}
                    </button>
                    <button
                        onClick={() => {
                            setEditId(null)
                            setForm({
                                name: '',
                                name_uz: '',
                                name_ru: '',
                                name_en: '',
                                sale_price: '',
                                category_id: '',
                                image_url: '',
                                description: '',
                                description_uz: '',
                                description_ru: '',
                                description_en: '',
                                is_active: true,
                                features: [],
                                images: [],
                                imageUrlInput: '',
                                color: '',
                                colors: [],
                                size: '',
                                rating: '0',
                                reviews: '0',
                                model_3d_url: '',
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

            {/* Kategoriya bo'yicha umumiy tavsif va xususiyatlar */}
            <div className="mb-8 bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200/80 bg-white/60 flex flex-wrap items-center gap-3">
                    <Layers className="text-blue-600 shrink-0" size={22} />
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Kategoriya bo‘yicha tavsif va xususiyat</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Alohida mahsulot qo‘shish o‘zgarishsiz. Bu yerda tanlangan kategoriyadagi <strong>barcha</strong> mahsulotlarga bir xil matn va xususiyatlar yoziladi.
                        </p>
                    </div>
                </div>
                <div className="p-5 space-y-5">
                    <div className="flex flex-col sm:flex-row gap-4 flex-wrap items-start sm:items-end">
                        <div className="w-full sm:flex-1 sm:min-w-[220px] space-y-2">
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Kategoriya</label>
                            <select
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                                value={bulkCategoryId}
                                onChange={(e) => setBulkCategoryId(e.target.value)}
                            >
                                <option value="">— Tanlang —</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                            {bulkCategoryId ? (
                                <p className="text-xs text-blue-700 font-medium">
                                    Ta’sir: <strong>{bulkProductCount}</strong> ta mahsulot
                                </p>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={loadBulkTemplateFromCategory}
                            disabled={!bulkCategoryId}
                            className="px-4 py-3 rounded-xl text-sm font-bold border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Birinchi mahsulotdan yuklash
                        </button>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-800">Tavsif</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-blue-600">UZ</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={bulkDescUz}
                                    onChange={(e) => setBulkDescUz(e.target.value)}
                                    placeholder="O‘zbekcha tavsif"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-red-700">RU</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={bulkDescRu}
                                    onChange={(e) => setBulkDescRu(e.target.value)}
                                    placeholder="Русское описание"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600">EN</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={bulkDescEn}
                                    onChange={(e) => setBulkDescEn(e.target.value)}
                                    placeholder="English description"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-800">Xususiyatlar</h3>
                            <button
                                type="button"
                                onClick={bulkAddFeature}
                                className="text-sm text-blue-600 font-bold hover:underline"
                            >
                                + Qator qo‘shish
                            </button>
                        </div>
                        <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                            {bulkFeatures.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">
                                    Faqat tavsifni yangilamoqchi bo‘lsangiz, xususiyat qatorlarini bo‘sh qoldiring — mavjud xususiyatlar o‘zgarmaydi.
                                </p>
                            ) : null}
                            {bulkFeatures.map((feature, index) => (
                                <div
                                    key={index}
                                    className="rounded-xl border border-gray-200 bg-white/80 p-4 space-y-3"
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
                                        <button
                                            type="button"
                                            onClick={() => bulkRemoveFeature(index)}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                            title="O‘chirish"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                        <div className="space-y-2 rounded-lg border border-blue-100 bg-white p-3">
                                            <div className="text-xs font-bold text-blue-700">O‘zbek</div>
                                            <input
                                                type="text"
                                                placeholder="Nomi"
                                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                                value={feature.name_uz ?? ''}
                                                onChange={(e) => bulkFeatureChange(index, 'name_uz', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Qiymati"
                                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                                value={feature.value_uz ?? ''}
                                                onChange={(e) => bulkFeatureChange(index, 'value_uz', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-3">
                                            <div className="text-xs font-bold text-amber-800">Русский</div>
                                            <input
                                                type="text"
                                                placeholder="Название"
                                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                                value={feature.name_ru ?? ''}
                                                onChange={(e) => bulkFeatureChange(index, 'name_ru', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Значение"
                                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                                value={feature.value_ru ?? ''}
                                                onChange={(e) => bulkFeatureChange(index, 'value_ru', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2 rounded-lg border border-emerald-100 bg-white p-3">
                                            <div className="text-xs font-bold text-emerald-800">English</div>
                                            <input
                                                type="text"
                                                placeholder="Name"
                                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                                value={feature.name_en ?? ''}
                                                onChange={(e) => bulkFeatureChange(index, 'name_en', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Value"
                                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                                value={feature.value_en ?? ''}
                                                onChange={(e) => bulkFeatureChange(index, 'value_en', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-200/80">
                        <button
                            type="button"
                            onClick={() => {
                                setBulkCategoryId('')
                                setBulkDescUz('')
                                setBulkDescRu('')
                                setBulkDescEn('')
                                setBulkFeatures([])
                                setBulkColorTab('replace')
                                setBulkColorReplaceFrom('')
                                setBulkColorReplaceTo('')
                                setBulkColorAddNames([])
                                setBulkColorRemoveName('')
                            }}
                            className="px-5 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-white/80 border border-transparent hover:border-gray-200"
                        >
                            Tozalash
                        </button>
                        <button
                            type="button"
                            disabled={bulkApplying || !bulkCategoryId}
                            onClick={applyBulkCategoryContent}
                            className="px-6 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md disabled:opacity-50 flex items-center gap-2"
                        >
                            {bulkApplying ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            Kategoriyadagilarga qo‘llash
                        </button>
                    </div>
                </div>
            </div>

            {/* Kategoriya bo'yicha jamoaviy ranglar */}
            <div className="mb-8 bg-gradient-to-br from-violet-50/80 to-slate-50 rounded-2xl border border-violet-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-violet-200/50 bg-white/70 flex flex-wrap items-center gap-3">
                    <Palette className="text-violet-600 shrink-0" size={22} />
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Kategoriya bo‘yicha ranglar (jamoa)</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Noto‘g‘ri rangni bir vaqtda almashtirish, ko‘plab mahsulotga rang qo‘shish yoki kategoriyadan bir rangni olib tashlash. Qiymatlar mahsulotdagi{' '}
                            <code className="text-[11px] bg-violet-100/80 px-1 rounded">colors</code> massivi bilan bir xil (kutubxonaning ichki nomi).
                        </p>
                    </div>
                </div>
                <div className="p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 flex-wrap items-start sm:items-end">
                        <div className="w-full sm:flex-1 sm:min-w-[220px] space-y-2">
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Kategoriya</label>
                            <select
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 text-gray-800"
                                value={bulkCategoryId}
                                onChange={(e) => setBulkCategoryId(e.target.value)}
                            >
                                <option value="">— Tanlang —</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                            {bulkCategoryId ? (
                                <p className="text-xs text-violet-800 font-medium">
                                    Ta’sir: <strong>{bulkProductCount}</strong> ta mahsulot · Ushbu kategoriyadagi ranglar:{' '}
                                    <strong>{bulkCategoryUniqueColorNames.length}</strong> ta noyob qiymat
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {[
                            { id: 'replace', label: 'Almashtirish' },
                            { id: 'add', label: 'Qo‘shish' },
                            { id: 'remove', label: 'Olib tashlash' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setBulkColorTab(tab.id)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                                    bulkColorTab === tab.id
                                        ? 'bg-violet-600 text-white shadow-md'
                                        : 'bg-white border border-violet-200 text-violet-800 hover:bg-violet-50'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {bulkColorTab === 'replace' ? (
                        <div className="space-y-4 rounded-xl border border-violet-100 bg-white/80 p-4">
                            <p className="text-xs text-gray-600">
                                Masalan, noto‘g‘ri tanlangan rang nomi 100 ta mahsulotda — eski nomni yangi kutubxona nomiga bir marta almashtirasiz.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Eski rang (qiymat)</label>
                                    <input
                                        type="text"
                                        list="bulk-cat-color-datalist"
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                                        placeholder="colors massividagi aniq matn"
                                        value={bulkColorReplaceFrom}
                                        onChange={(e) => setBulkColorReplaceFrom(e.target.value)}
                                        disabled={!bulkCategoryId}
                                    />
                                    <datalist id="bulk-cat-color-datalist">
                                        {bulkCategoryUniqueColorNames.map((name) => (
                                            <option key={name} value={name} />
                                        ))}
                                    </datalist>
                                    {bulkCategoryId && bulkCategoryUniqueColorNames.length === 0 ? (
                                        <p className="text-xs text-amber-700">Bu kategoriyada hozircha rang qiymati yo‘q — avval mahsulotlarga rang bering.</p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Yangi rang (kutubxona)</label>
                                    <select
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                                        value={bulkColorReplaceTo}
                                        onChange={(e) => setBulkColorReplaceTo(e.target.value)}
                                    >
                                        <option value="">— Tanlang —</option>
                                        {[...colorLibrary]
                                            .sort((a, b) =>
                                                String(colorLibLabel(a)).localeCompare(String(colorLibLabel(b)), undefined, {
                                                    sensitivity: 'base',
                                                })
                                            )
                                            .map((c) => (
                                                <option key={c.id} value={c.name}>
                                                    {colorLibLabel(c)} ({c.name})
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={bulkColorApplying || !bulkCategoryId}
                                onClick={applyBulkColorReplace}
                                className="px-6 py-2.5 rounded-xl font-bold bg-violet-600 text-white hover:bg-violet-700 shadow-md disabled:opacity-50 flex items-center gap-2"
                            >
                                {bulkColorApplying ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                Almashtirishni qo‘llash
                            </button>
                        </div>
                    ) : null}

                    {bulkColorTab === 'add' ? (
                        <div className="space-y-4 rounded-xl border border-violet-100 bg-white/80 p-4">
                            <p className="text-xs text-gray-600">
                                Tanlangan kategoriyadagi barcha mahsulotlarga belgilangan ranglarni qo‘shadi (allaqachon bo‘lsa o‘tkazib yuboradi).
                            </p>
                            <div className="flex flex-wrap gap-2 max-h-[220px] overflow-y-auto p-2 bg-gray-50/80 rounded-xl border border-gray-100">
                                {colorLibrary.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">Avval «Ranglar to‘plami» orqali kutubxonaga rang qo‘shing.</p>
                                ) : (
                                    [...colorLibrary]
                                        .sort((a, b) =>
                                            String(colorLibLabel(a)).localeCompare(String(colorLibLabel(b)), undefined, {
                                                sensitivity: 'base',
                                            })
                                        )
                                        .map((c) => {
                                            const on = bulkColorAddNames.includes(c.name)
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => toggleBulkColorAddName(c.name)}
                                                    className={`flex items-center gap-2 pl-3 pr-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                                        on
                                                            ? 'bg-violet-600 border-violet-600 text-white shadow'
                                                            : 'bg-white border-gray-200 text-gray-600 hover:border-violet-300'
                                                    }`}
                                                >
                                                    <span
                                                        className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                                                        style={{ backgroundColor: c.hex_code }}
                                                    />
                                                    {colorLibLabel(c)}
                                                </button>
                                            )
                                        })
                                )}
                            </div>
                            <button
                                type="button"
                                disabled={bulkColorApplying || !bulkCategoryId || bulkColorAddNames.length === 0}
                                onClick={applyBulkColorAdd}
                                className="px-6 py-2.5 rounded-xl font-bold bg-violet-600 text-white hover:bg-violet-700 shadow-md disabled:opacity-50 flex items-center gap-2"
                            >
                                {bulkColorApplying ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                                Tanlangan ranglarni qo‘shish
                            </button>
                        </div>
                    ) : null}

                    {bulkColorTab === 'remove' ? (
                        <div className="space-y-4 rounded-xl border border-violet-100 bg-white/80 p-4">
                            <p className="text-xs text-gray-600">
                                Kategoriyadagi barcha mahsulotlardan bir xil rang qiymatini olib tashlaydi (asosiy ko‘rinish maydoni yangilanadi).
                            </p>
                            <div className="space-y-2 max-w-md">
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">Olib tashlash — qiymat</label>
                                <input
                                    type="text"
                                    list="bulk-remove-color-datalist"
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                                    placeholder="colors massividagi aniq matn"
                                    value={bulkColorRemoveName}
                                    onChange={(e) => setBulkColorRemoveName(e.target.value)}
                                    disabled={!bulkCategoryId}
                                />
                                <datalist id="bulk-remove-color-datalist">
                                    {bulkCategoryUniqueColorNames.map((name) => (
                                        <option key={name} value={name} />
                                    ))}
                                </datalist>
                            </div>
                            <p className="text-[11px] text-gray-500">
                                Ro‘yxat kategoriyadagi mavjud ranglardan; boshqa qiymatni qo‘lda yozishingiz mumkin — matn colors bilan to‘liq mos kelishi kerak.
                            </p>
                            <button
                                type="button"
                                disabled={bulkColorApplying || !bulkCategoryId || !bulkColorRemoveName.trim()}
                                onClick={applyBulkColorRemove}
                                className="px-6 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 shadow-md disabled:opacity-50 flex items-center gap-2"
                            >
                                {bulkColorApplying ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                                Rangni kategoriyadan olib tashlash
                            </button>
                        </div>
                    ) : null}
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
                                        {colorLibrary.map(color => {
                                            const colorLabel = color[`name_${language}`] || color.name_uz || color.name_ru || color.name_en || color.name
                                            return (
                                                <div
                                                    key={color.id}
                                                    className="relative group"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleColor(color.name)}
                                                        className={`flex items-center gap-2 pl-3 pr-8 py-1.5 rounded-lg border transition-all ${form.colors?.includes(color.name)
                                                            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'
                                                            }`}
                                                    >
                                                        <div
                                                            className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                                                            style={{ backgroundColor: color.hex_code }}
                                                        />
                                                        <span className="text-xs font-bold">{colorLabel}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleDeleteColor(e, color.id, colorLabel)}
                                                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-100 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="O'chirish"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )
                                        })}

                                        {colorLibrary.length === 0 && (
                                            <p className="text-gray-400 text-xs italic">Ranglar kutubxonasi bo'sh</p>
                                        )}
                                    </div>

                                    {isAddingColor && (
                                        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-4 animate-fade-in">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-blue-600 uppercase">Rang nomi (UZ)</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Masalan: Qora"
                                                        className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg outline-none text-sm"
                                                        value={newColor.name_uz}
                                                        onChange={e => setNewColor({ ...newColor, name_uz: e.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-red-600 uppercase">Rang nomi (RU)</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Например: Чёрный"
                                                        className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg outline-none text-sm"
                                                        value={newColor.name_ru}
                                                        onChange={e => setNewColor({ ...newColor, name_ru: e.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-gray-600 uppercase">Rang nomi (EN)</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Black"
                                                        className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg outline-none text-sm"
                                                        value={newColor.name_en}
                                                        onChange={e => setNewColor({ ...newColor, name_en: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <input
                                                    type="color"
                                                    className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 bg-white"
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
                                                    onClick={() => { setIsAddingColor(false); setNewColor({ name_uz: '', name_ru: '', name_en: '', hex_code: '#000000' }) }}
                                                    className="text-gray-400 hover:text-gray-600 p-2"
                                                >
                                                    <X size={20} />
                                                </button>
                                            </div>
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
                                        <Image size={24} />
                                        <span className="text-[10px] mt-1 font-bold">Rasm</span>
                                        <input type="file" multiple className="hidden" onChange={handleImageUpload} accept="image/*" />
                                    </label>
                                </div>
                            </div>

                            {/* 3D Model */}
                            <div className="space-y-4 bg-blue-50 p-6 rounded-xl border border-dashed border-blue-300">
                                <label className="block text-sm font-bold text-blue-700 mb-2 font-mono flex items-center gap-2">
                                    <Globe size={18} />
                                    3D Model (.glb, .gltf)
                                </label>
                                <div className="flex items-center gap-4">
                                    {form.model_3d_url ? (
                                        <div className="flex-1 p-3 bg-white rounded-lg border border-blue-200 text-xs text-blue-600 truncate font-mono">
                                            {form.model_3d_url}
                                        </div>
                                    ) : (
                                        <div className="flex-1 p-3 bg-white/50 rounded-lg border border-dashed border-blue-200 text-xs text-gray-400 italic">
                                            Model yuklanmagan
                                        </div>
                                    )}
                                    <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-all shadow-md text-sm font-bold">
                                        <Upload size={16} />
                                        <span>{form.model_3d_url ? 'Almashtirish' : 'Model Yuklash'}</span>
                                        <input type="file" accept=".glb,.gltf" className="hidden" onChange={handleModelUpload} />
                                    </label>
                                    {form.model_3d_url && (
                                        <button
                                            type="button"
                                            onClick={() => setForm({ ...form, model_3d_url: '' })}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-blue-400 font-medium">Faqat .glb yoki .gltf formatidagi fayllarni yuklang. Hajmi 10MB dan oshmasligi tavsiya etiladi.</p>
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
                                <div className="space-y-4">
                                    {form.features.map((feature, index) => (
                                        <div
                                            key={index}
                                            className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3"
                                        >
                                            <div className="flex justify-between items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500">
                                                    #{index + 1}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveFeature(index)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                                    title="O'chirish"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                <div className="space-y-2 rounded-lg border border-blue-100 bg-white p-3">
                                                    <div className="text-xs font-bold text-blue-700">O'zbek</div>
                                                    <input
                                                        type="text"
                                                        placeholder="Nomi (masalan: Rangi)"
                                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={feature.name_uz ?? ''}
                                                        onChange={(e) => handleFeatureChange(index, 'name_uz', e.target.value)}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Qiymati (masalan: Qora)"
                                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={feature.value_uz ?? ''}
                                                        onChange={(e) => handleFeatureChange(index, 'value_uz', e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-3">
                                                    <div className="text-xs font-bold text-amber-800">Русский</div>
                                                    <input
                                                        type="text"
                                                        placeholder="Название (например: Цвет)"
                                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={feature.name_ru ?? ''}
                                                        onChange={(e) => handleFeatureChange(index, 'name_ru', e.target.value)}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Значение (например: Черный)"
                                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={feature.value_ru ?? ''}
                                                        onChange={(e) => handleFeatureChange(index, 'value_ru', e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2 rounded-lg border border-emerald-100 bg-white p-3">
                                                    <div className="text-xs font-bold text-emerald-800">English</div>
                                                    <input
                                                        type="text"
                                                        placeholder="Name (e.g. Color)"
                                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={feature.name_en ?? ''}
                                                        onChange={(e) => handleFeatureChange(index, 'name_en', e.target.value)}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Value (e.g. Black)"
                                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={feature.value_en ?? ''}
                                                        onChange={(e) => handleFeatureChange(index, 'value_en', e.target.value)}
                                                    />
                                                </div>
                                            </div>
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