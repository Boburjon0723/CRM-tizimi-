'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification } from '@/utils/telegram'
import Header from '@/components/Header'
import { Save, Globe, Smartphone, Monitor, Layout, Image, Palette, Type, Settings, FileText, AlertCircle, Plus, X, Trash2, Eye, EyeOff, Wallet } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Vebsayt() {
  const { toggleSidebar } = useLayout()
  const [settings, setSettings] = useState({
    site_name: 'Mening Sexim',
    logo_url: '',
    banner_text: 'Sifatli mahsulotlar eng arzon narxlarda!',
    phone: '+998901234567',
    address: 'Toshkent, Chilonzor tumani',
    work_hours: 'Dushanba-Shanba: 9:00-20:00',
    telegram_url: '@mysayt',
    instagram_url: '@mysayt',
    facebook_url: 'mysayt',
    humo_card: '',
    uzcard_card: '',
    visa_card: ''
  })

  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState('')

  const [banners, setBanners] = useState([])
  const [products, setProducts] = useState([])
  const [webOrders, setWebOrders] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('sozlamalar')
  const [isAddingBanner, setIsAddingBanner] = useState(false)
  const [bannerForm, setBannerForm] = useState({
    title: '',
    subtitle: '',
    image_url: '',
    link: '',
    active: true
  })

  useEffect(() => {
    loadData()
    subscribeToOrders()
  }, [])

  async function loadData() {
    try {
      // Load website settings
      const { data: settingsData } = await supabase.from('settings').select('*').limit(1).single()
      if (settingsData) setSettings(settingsData)

      // Load banners
      const { data: bannersData } = await supabase.from('banners').select('*').order('created_at', { ascending: false })
      setBanners(bannersData || [])

      // Load categories
      const { data: categoriesData } = await supabase.from('categories').select('*').order('name')
      setCategories(categoriesData || [])

      // Load products for web display
      const { data: productsData } = await supabase.from('products').select('*').order('created_at', { ascending: false })
      setProducts(productsData || [])

      // Load web orders
      const { data: ordersData } = await supabase.from('orders').select('*, order_items(product_name, quantity)').eq('source', 'website').order('created_at', { ascending: false })
      setWebOrders(ordersData || [])

      // Load reviews
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select(`
          *,
          products (name)
        `)
        .order('created_at', { ascending: false })
      setReviews(reviewsData || [])

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  function subscribeToOrders() {
    const subscription = supabase
      .channel('website_orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        if (payload.new.source === 'website') {
          playNotificationSound()
          setWebOrders(prev => [payload.new, ...prev])
          sendTelegramNotification(`🆕 Yangi buyurtma!\nMijoz: ${payload.new.customer_name}\nTel: ${payload.new.customer_phone}\nSumma: ${payload.new.total}`)
        }
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }

  function playNotificationSound() {
    const audio = new Audio('/notification.mp3')
    audio.play().catch(e => console.log('Audio play failed:', e))
  }

  async function handleSaveSettings() {
    try {
      const { data, error } = await supabase.from('settings').upsert([settings]).select()
      if (error) throw error
      alert('Sozlamalar saqlandi!')
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Xatolik!')
    }
  }

  async function handleSaveBanner() {
    if (!bannerForm.title || !bannerForm.image_url) return alert('Sarlavha va Rasm URL majburiy!')
    try {
      const { error } = await supabase.from('banners').upsert([bannerForm])
      if (error) throw error
      setIsAddingBanner(false)
      setBannerForm({ title: '', subtitle: '', image_url: '', link: '', active: true })
      loadData()
      alert('Banner saqlandi!')
    } catch (error) {
      console.error('Error saving banner:', error)
      alert('Xatolik!')
    }
  }

  async function handleToggleBanner(id, currentStatus) {
    try {
      await supabase.from('banners').update({ active: !currentStatus }).eq('id', id)
      loadData()
    } catch (error) {
      console.error('Error toggling banner:', error)
    }
  }

  async function handleDeleteBanner(id) {
    if (!confirm('O\'chirmoqchimisiz?')) return
    try {
      await supabase.from('banners').delete().eq('id', id)
      loadData()
    } catch (error) {
      console.error('Error deleting banner:', error)
    }
  }

  async function handleToggleProduct(id, currentStatus) {
    try {
      await supabase.from('products').update({ is_active: !currentStatus }).eq('id', id)
      loadData()
    } catch (error) {
      console.error('Error toggling product:', error)
    }
  }

  async function handleOrderStatusChange(id, newStatus) {
    try {
      // Find the order to get customer ID since order_items might not be available here directly
      const order = webOrders.find(o => o.id === id)

      await supabase.from('orders').update({ status: newStatus }).eq('id', id)
      loadData()

      if (newStatus === 'completed' || newStatus === 'Tugallandi') {
        // Here we could update customer LTV or purchase dates if we wanted
      }
    } catch (error) {
      console.error('Error updating order:', error)
    }
  }

  async function handleSaveCategory() {
    if (!newCategory.trim()) return
    try {
      const { error } = await supabase.from('categories').insert([{ name: newCategory }])
      if (error) throw error
      setNewCategory('')
      loadData()
      alert('Kategoriya qo\'shildi!')
    } catch (error) {
      console.error('Error adding category:', error)
      alert('Xatolik!')
    }
  }

  async function handleDeleteCategory(id) {
    if (!confirm('O\'chirmoqchimisiz? Agar bu kategoriyada mahsulotlar bo\'lsa, xatolik berishi mumkin.')) return
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
      loadData()
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('O\'chirish mumkin emas (ehtimol bog\'langan mahsulotlar bordir)')
    }
  }

  // ... (handlers for settings, banners, products, orders remain)

  async function handleReviewStatus(id, newStatus) {
    try {
      await supabase.from('reviews').update({ status: newStatus }).eq('id', id)
      loadData()
    } catch (error) {
      console.error('Error updating review:', error)
    }
  }

  async function handleDeleteReview(id) {
    if (!confirm('O\'chirmoqchimisiz?')) return
    try {
      await supabase.from('reviews').delete().eq('id', id)
      loadData()
    } catch (error) {
      console.error('Error deleting review:', error)
    }
  }

  const tabs = [
    { id: 'sozlamalar', icon: Settings, label: 'Sozlamalar' },
    { id: 'banners', icon: Image, label: 'Bannerlar' },
    { id: 'kategoriyalar', icon: Layout, label: 'Kategoriyalar' },
    { id: 'mahsulotlar', icon: FileText, label: 'Mahsulotlar' },
    { id: 'buyurtmalar', icon: Globe, label: 'Web Buyurtmalar' },
    { id: 'sharhlar', icon: AlertCircle, label: 'Sharhlar' }
  ]

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
      <Header title="Web Sayt Boshqaruvi" toggleSidebar={toggleSidebar} />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-blue-100">Jami Bannerlar</p>
              <p className="text-3xl font-bold mt-2">{banners.length}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <Image className="text-white" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-2xl shadow-lg shadow-green-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-green-100">Web'da Ko'rinayotgan</p>
              <p className="text-3xl font-bold mt-2">{products.filter(p => p.is_active).length}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <Monitor className="text-white" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-2xl shadow-lg shadow-purple-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-purple-100">Web Buyurtmalar</p>
              <p className="text-3xl font-bold mt-2">{webOrders.length}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <Globe className="text-white" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-2xl shadow-lg shadow-red-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-red-100">Yangi Sharhlar</p>
              <p className="text-3xl font-bold mt-2">{reviews.filter(r => r.status === 'pending').length}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <AlertCircle className="text-white" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
            >
              <Icon size={20} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === 'sozlamalar' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 fade-in">
          <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Settings className="text-blue-600" />
            Sayt Sozlamalari
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">Sayt nomi</label>
              <input
                type="text"
                placeholder="Sayt nomi"
                value={settings.site_name || ''}
                onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">Logo URL</label>
              <input
                type="text"
                placeholder="Logo URL"
                value={settings.logo_url || ''}
                onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-gray-600">Banner matn</label>
              <input
                type="text"
                placeholder="Banner matn"
                value={settings.banner_text || ''}
                onChange={(e) => setSettings({ ...settings, banner_text: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">Telefon</label>
              <input
                type="tel"
                placeholder="Telefon"
                value={settings.phone || ''}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">Manzil</label>
              <input
                type="text"
                placeholder="Manzil"
                value={settings.address || ''}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">Ish vaqti</label>
              <input
                type="text"
                placeholder="Ish vaqti"
                value={settings.work_hours || ''}
                onChange={(e) => setSettings({ ...settings, work_hours: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">Telegram</label>
              <input
                type="text"
                placeholder="Telegram"
                value={settings.telegram_url || ''}
                onChange={(e) => setSettings({ ...settings, telegram_url: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">Instagram</label>
              <input
                type="text"
                placeholder="Instagram"
                value={settings.instagram_url || ''}
                onChange={(e) => setSettings({ ...settings, instagram_url: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-600">Facebook</label>
              <input
                type="text"
                placeholder="Facebook"
                value={settings.facebook_url || ''}
                onChange={(e) => setSettings({ ...settings, facebook_url: e.target.value })}
                className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>

            <div className="col-span-1 md:col-span-2 border-t border-gray-100 pt-6 mt-2">
              <h4 className="font-bold mb-4 flex items-center gap-2 text-gray-800">
                <Wallet size={20} className="text-green-600" />
                To'lov Ma'lumotlari (Karta raqamlari)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs text-gray-500 font-bold uppercase tracking-wide">HUMO</label>
                  <input
                    type="text"
                    placeholder="8600 ...."
                    value={settings.humo_card || ''}
                    onChange={(e) => setSettings({ ...settings, humo_card: e.target.value })}
                    className="w-full border border-gray-200 p-3 rounded-xl font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs text-gray-500 font-bold uppercase tracking-wide">UZCARD</label>
                  <input
                    type="text"
                    placeholder="8600 ...."
                    value={settings.uzcard_card || ''}
                    onChange={(e) => setSettings({ ...settings, uzcard_card: e.target.value })}
                    className="w-full border border-gray-200 p-3 rounded-xl font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs text-gray-500 font-bold uppercase tracking-wide">VISA</label>
                  <input
                    type="text"
                    placeholder="4000 ...."
                    value={settings.visa_card || ''}
                    onChange={(e) => setSettings({ ...settings, visa_card: e.target.value })}
                    className="w-full border border-gray-200 p-3 rounded-xl font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-gray-50"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSaveSettings}
              className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 font-bold transition-all"
            >
              <Save size={20} />
              Saqlash
            </button>
          </div>
        </div>
      )}

      {activeTab === 'banners' && (
        <div className="space-y-6 fade-in">
          <div className="flex justify-end">
            <button
              onClick={() => setIsAddingBanner(!isAddingBanner)}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 transition-all"
            >
              {isAddingBanner ? <X size={20} /> : <Plus size={20} />}
              {isAddingBanner ? 'Bekor qilish' : 'Yangi banner'}
            </button>
          </div>

          {isAddingBanner && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Yangi Banner</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <input
                  type="text"
                  placeholder="Sarlavha *"
                  value={bannerForm.title}
                  onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                />
                <input
                  type="text"
                  placeholder="Qo'shimcha matn"
                  value={bannerForm.subtitle}
                  onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                />
                <input
                  type="text"
                  placeholder="Rasm URL *"
                  value={bannerForm.image_url}
                  onChange={(e) => setBannerForm({ ...bannerForm, image_url: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all col-span-1 md:col-span-2"
                />
                <input
                  type="text"
                  placeholder="Havola (ixtiyoriy)"
                  value={bannerForm.link}
                  onChange={(e) => setBannerForm({ ...bannerForm, link: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all col-span-1 md:col-span-2"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSaveBanner}
                  className="bg-green-600 text-white px-8 py-3 rounded-xl hover:bg-green-700 font-bold shadow-green-200 shadow-lg transition-all"
                >
                  Saqlash
                </button>
              </div>
            </div>
          )}


          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {banners.map(banner => (
              <div key={banner.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group hover:shadow-md transition-all">
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={banner.image_url}
                    alt={banner.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  {!banner.active && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                      <span className="bg-red-500 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg">Nofaol</span>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h4 className="font-bold text-lg mb-1 text-gray-900">{banner.title}</h4>
                  <p className="text-sm text-gray-500 mb-6 line-clamp-2">{banner.subtitle}</p>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <button
                      onClick={() => handleToggleBanner(banner.id, banner.active)}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${banner.active
                        ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                    >
                      {banner.active ? <EyeOff size={16} /> : <Eye size={16} />}
                      {banner.active ? 'Yashirish' : 'Ko\'rsatish'}
                    </button>
                    <button
                      onClick={() => {
                        setBannerForm(banner);
                        setIsAddingBanner(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      <Settings size={16} />
                      Tahrirlash
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteBanner(banner.id)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={16} />
                    O'chirib yuborish
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {activeTab === 'kategoriyalar' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 fade-in">
          <h3 className="text-xl font-bold text-gray-800 mb-6">Kategoriyalar Boshqaruvi</h3>
          <div className="flex gap-4 mb-8">
            <input
              type="text"
              placeholder="Yangi kategoriya nomi"
              className="border border-gray-200 p-4 rounded-xl flex-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <button onClick={handleSaveCategory} className="bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 flex items-center gap-2 transition-all">
              <Plus size={20} /> Qo'shish
            </button>
          </div>

          <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Kategoriya Nomi</th>
                  <th className="px-6 py-4 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.map(cat => (
                  <tr key={cat.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-800">{cat.name}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleDeleteCategory(cat.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                        <Trash2 size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr>
                    <td colSpan="2" className="px-6 py-12 text-center text-gray-400">
                      Hozircha kategoriyalar yo'q. Yangi qo'shing.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'mahsulotlar' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden fade-in">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Rasm</th>
                  <th className="px-6 py-4">Mahsulot</th>
                  <th className="px-6 py-4">Kategoriya</th>
                  <th className="px-6 py-4">Narx</th>
                  <th className="px-6 py-4">Ombor</th>
                  <th className="px-6 py-4">Holati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(product => (
                  <tr key={product.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <Image size={20} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 font-bold text-gray-900">{product.name}</td>
                    <td className="px-6 py-3 text-gray-600">
                      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold uppercase">{product.category || '-'}</span>
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-700 font-mono">${product.sale_price?.toLocaleString()}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${product.stock > 10 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {product.stock} dona
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => handleToggleProduct(product.id, product.is_active)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${product.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                      >
                        {product.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                        {product.is_active ? 'Saytda bor' : 'Yashirilgan'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'buyurtmalar' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden fade-in">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Mijoz</th>
                  <th className="px-6 py-4">Telefon</th>
                  <th className="px-6 py-4">Mahsulot</th>
                  <th className="px-6 py-4">Miqdor</th>
                  <th className="px-6 py-4">Summa</th>
                  <th className="px-6 py-4">To'lov</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Sana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {webOrders.map(order => {
                  const firstItem = order.order_items?.[0] || {};
                  return (
                    <tr key={order.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">{order.customer_name || order.customers?.name || 'Foydalanuvchi'}</td>
                      <td className="px-6 py-4 text-gray-600">{order.customer_phone || order.customers?.phone || '-'}</td>
                      <td className="px-6 py-4 text-gray-800">{firstItem.product_name || firstItem.products?.name || 'Mavjud emas'}</td>
                      <td className="px-6 py-4 font-bold text-center">{firstItem.quantity || order.quantity || 1}</td>
                      <td className="px-6 py-4 font-bold text-green-600 font-mono">
                        ${order.total?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-bold uppercase text-gray-500 bg-gray-100 px-2 py-0.5 rounded w-fit">
                            {order.payment_method_detail || 'Noma\'lum'}
                          </span>
                          {order.receipt_url && (
                            <a
                              href={order.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                            >
                              <FileText size={12} />
                              Chekni ko'rish
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={order.status}
                          onChange={(e) => handleOrderStatusChange(order.id, e.target.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase cursor-pointer outline-none border-none focus:ring-2 focus:ring-opacity-50 transition-all ${order.status === 'new' || order.status === 'Yangi' ? 'bg-blue-100 text-blue-800 focus:ring-blue-400' :
                            order.status === 'pending' || order.status === 'Qabul qilindi' ? 'bg-yellow-100 text-yellow-800 focus:ring-yellow-400' :
                              order.status === 'shipping' || order.status === 'Yetkazilmoqda' ? 'bg-purple-100 text-purple-800 focus:ring-purple-400' :
                                order.status === 'completed' || order.status === 'Tugallandi' ? 'bg-green-100 text-green-800 focus:ring-green-400' :
                                  'bg-gray-100 text-gray-800 focus:ring-gray-400'
                            }`}
                        >
                          <option value="new">Yangi</option>
                          <option value="pending">Qabul qilindi</option>
                          <option value="completed">Tugallandi</option>
                          <option value="cancelled">Bekor qilindi</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">
                        {new Date(order.created_at).toLocaleDateString('uz-UZ')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab === 'sharhlar' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden fade-in">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Mahsulot</th>
                  <th className="px-6 py-4">Baho</th>
                  <th className="px-6 py-4">Sharh</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Sana</th>
                  <th className="px-6 py-4">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reviews.map(review => (
                  <tr key={review.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{review.products?.name || 'Noma\'lum'}</td>
                    <td className="px-6 py-4">
                      <div className="flex text-yellow-400 gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <span key={i} className={i < review.rating ? "fill-current" : "text-gray-200"}>★</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate text-gray-600 italic" title={review.comment}>"{review.comment}"</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${review.status === 'approved' ? 'bg-green-100 text-green-700' :
                        review.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                        {review.status === 'approved' ? 'Tasdiqlangan' :
                          review.status === 'rejected' ? 'Rad etilgan' : 'Kutilmoqda'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">{new Date(review.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 flex gap-2">
                      <button onClick={() => handleReviewStatus(review.id, 'approved')} className="text-green-600 hover:bg-green-100 p-2 rounded-lg transition-colors" title="Tasdiqlash"><Eye size={18} /></button>
                      <button onClick={() => handleReviewStatus(review.id, 'rejected')} className="text-yellow-600 hover:bg-yellow-100 p-2 rounded-lg transition-colors" title="Yashirish"><EyeOff size={18} /></button>
                      <button onClick={() => handleDeleteReview(review.id)} className="text-red-600 hover:bg-red-100 p-2 rounded-lg transition-colors" title="O'chirish"><Trash2 size={18} /></button>
                    </td>
                  </tr>
                ))}
                {reviews.length === 0 && <tr><td colSpan="6" className="text-center py-12 text-gray-400">Sharhlar yo'q</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}