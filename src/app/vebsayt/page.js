'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification } from '@/utils/telegram'
import Header from '@/components/Header'
import { Save, Globe, Smartphone, Monitor, Layout, Image, Palette, Type, Settings, FileText, AlertCircle, Plus, X, Trash2, Eye, EyeOff } from 'lucide-react'
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
    facebook_url: 'mysayt'
  })

  const [banners, setBanners] = useState([])
  const [products, setProducts] = useState([])
  const [webOrders, setWebOrders] = useState([])
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
      const { data: settingsData } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single()

      if (settingsData) setSettings(settingsData)

      // Load banners
      const { data: bannersData } = await supabase
        .from('banners')
        .select('*')
        .order('created_at', { ascending: false })

      setBanners(bannersData || [])

      // Load products for web display
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      setProducts(productsData || [])

      // Load web orders
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, customers(name, phone), order_items(products(name), quantity)')
        .eq('source', 'website')
        .order('created_at', { ascending: false })

      setWebOrders(ordersData || [])

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  function subscribeToOrders() {
    const channel = supabase
      .channel('web_orders_sub')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: "source=eq.website" },
        async (payload) => {
          playNotificationSound()
          loadData() // Reload to get joins
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  function playNotificationSound() {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj')
    audio.play().catch(e => console.log('Audio failed:', e))
  }

  async function handleSaveSettings() {
    try {
      // Upsert works best if we have an ID, but for settings table checking if it exists is safer if rows > 1 aren't allowed.
      // Assuming 'settings' table has 1 row or ID logic. 
      // If we used the script, 'settings' table creation didn't enforce single row but code logic implies.
      // We will try insert first row or update.

      const { data: existing } = await supabase.from('settings').select('id').single()

      let query = supabase.from('settings')

      if (existing) {
        await query.update(settings).eq('id', existing.id)
      } else {
        await query.insert(settings)
      }

      alert('Sozlamalar saqlandi!')
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Xatolik yuz berdi!')
    }
  }

  async function handleSaveBanner() {
    if (!bannerForm.title || !bannerForm.image_url) {
      alert('Sarlavha va rasm URL majburiy!')
      return
    }

    try {
      const { error } = await supabase
        .from('banners')
        .insert([bannerForm])

      if (error) throw error

      setBannerForm({ title: '', subtitle: '', image_url: '', link: '', active: true })
      setIsAddingBanner(false)
      loadData()
    } catch (error) {
      console.error('Error saving banner:', error)
      alert('Xatolik yuz berdi!')
    }
  }

  async function handleDeleteBanner(id) {
    if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return

    try {
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', id)

      if (error) throw error
      loadData()
    } catch (error) {
      console.error('Error deleting banner:', error)
    }
  }

  async function handleToggleBanner(id, currentStatus) {
    try {
      const { error } = await supabase
        .from('banners')
        .update({ active: !currentStatus })
        .eq('id', id)

      if (error) throw error
      loadData()
    } catch (error) {
      console.error('Error toggling banner:', error)
    }
  }

  async function handleToggleProduct(id, currentStatus) {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !currentStatus })
        .eq('id', id)

      if (error) throw error
      loadData()
    } catch (error) {
      console.error('Error toggling product:', error)
    }
  }

  async function handleOrderStatusChange(id, newStatus) {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', id)

      if (error) throw error
      alert('Status o\'zgartirildi!')
      loadData()
    } catch (error) {
      console.error('Error updating order:', error)
      alert('Xatolik: ' + error.message)
    }
  }

  const tabs = [
    { id: 'sozlamalar', icon: Settings, label: 'Sozlamalar' },
    { id: 'banners', icon: Image, label: 'Bannerlar' },
    { id: 'mahsulotlar', icon: FileText, label: 'Mahsulotlar' },
    { id: 'buyurtmalar', icon: Globe, label: 'Web Buyurtmalar' }
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
    <div>
      <Header title="Web Sayt Boshqaruvi" toggleSidebar={toggleSidebar} />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-sm opacity-80">Jami Bannerlar</p>
          <p className="text-3xl font-bold mt-2">{banners.length}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-sm opacity-80">Web'da Ko'rinayotgan</p>
          <p className="text-3xl font-bold mt-2">{products.filter(p => p.is_active).length}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-sm opacity-80">Web Buyurtmalar</p>
          <p className="text-3xl font-bold mt-2">{webOrders.length}</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-sm opacity-80">Yangi Buyurtmalar</p>
          <p className="text-3xl font-bold mt-2">
            {webOrders.filter(o => o.status === 'Yangi').length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition whitespace-nowrap scroll-mx-4 ${activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
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
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Sayt Sozlamalari</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Sayt nomi"
              value={settings.site_name || ''}
              onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
              className="border p-3 rounded-lg"
            />
            <input
              type="text"
              placeholder="Logo URL"
              value={settings.logo_url || ''}
              onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
              className="border p-3 rounded-lg"
            />
            <input
              type="text"
              placeholder="Banner matn"
              value={settings.banner_text || ''}
              onChange={(e) => setSettings({ ...settings, banner_text: e.target.value })}
              className="border p-3 rounded-lg col-span-2"
            />
            <input
              type="tel"
              placeholder="Telefon"
              value={settings.phone || ''}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              className="border p-3 rounded-lg"
            />
            <input
              type="text"
              placeholder="Manzil"
              value={settings.address || ''}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              className="border p-3 rounded-lg"
            />
            <input
              type="text"
              placeholder="Ish vaqti"
              value={settings.work_hours || ''}
              onChange={(e) => setSettings({ ...settings, work_hours: e.target.value })}
              className="border p-3 rounded-lg"
            />
            <input
              type="text"
              placeholder="Telegram"
              value={settings.telegram_url || ''}
              onChange={(e) => setSettings({ ...settings, telegram_url: e.target.value })}
              className="border p-3 rounded-lg"
            />
            <input
              type="text"
              placeholder="Instagram"
              value={settings.instagram_url || ''}
              onChange={(e) => setSettings({ ...settings, instagram_url: e.target.value })}
              className="border p-3 rounded-lg"
            />
            <input
              type="text"
              placeholder="Facebook"
              value={settings.facebook_url || ''}
              onChange={(e) => setSettings({ ...settings, facebook_url: e.target.value })}
              className="border p-3 rounded-lg"
            />
          </div>
          <button
            onClick={handleSaveSettings}
            className="mt-6 flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
          >
            <Save size={20} />
            Saqlash
          </button>
        </div>
      )}

      {activeTab === 'banners' && (
        <div className="space-y-4">
          <button
            onClick={() => setIsAddingBanner(!isAddingBanner)}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            {isAddingBanner ? <X size={20} /> : <Plus size={20} />}
            {isAddingBanner ? 'Bekor qilish' : 'Yangi banner'}
          </button>

          {isAddingBanner && (
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input
                  type="text"
                  placeholder="Sarlavha *"
                  value={bannerForm.title}
                  onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                  className="border p-3 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Qo'shimcha matn"
                  value={bannerForm.subtitle}
                  onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                  className="border p-3 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Rasm URL *"
                  value={bannerForm.image_url}
                  onChange={(e) => setBannerForm({ ...bannerForm, image_url: e.target.value })}
                  className="border p-3 rounded-lg col-span-2"
                />
                <input
                  type="text"
                  placeholder="Havola (ixtiyoriy)"
                  value={bannerForm.link}
                  onChange={(e) => setBannerForm({ ...bannerForm, link: e.target.value })}
                  className="border p-3 rounded-lg col-span-2"
                />
              </div>
              <button
                onClick={handleSaveBanner}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
              >
                Saqlash
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {banners.map(banner => (
              <div key={banner.id} className="bg-white rounded-lg shadow overflow-hidden">
                <img
                  src={banner.image_url}
                  alt={banner.title}
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <h4 className="font-semibold">{banner.title}</h4>
                  <p className="text-sm text-gray-600">{banner.subtitle}</p>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleToggleBanner(banner.id, banner.active)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded ${banner.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}
                    >
                      {banner.active ? <Eye size={16} /> : <EyeOff size={16} />}
                      {banner.active ? 'Faol' : 'Nofaol'}
                    </button>
                    <button
                      onClick={() => handleDeleteBanner(banner.id)}
                      className="px-4 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'mahsulotlar' && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left">Mahsulot</th>
                <th className="px-6 py-4 text-left">Narx</th>
                <th className="px-6 py-4 text-left">Miqdor</th>
                <th className="px-6 py-4 text-left">Web'da Ko'rsatish</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id} className="border-t">
                  <td className="px-6 py-4 font-medium">{product.name}</td>
                  <td className="px-6 py-4">{product.sale_price?.toLocaleString()} so'm</td>
                  <td className="px-6 py-4">{product.stock}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleProduct(product.id, product.is_active)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg ${product.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                        }`}
                    >
                      {product.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                      {product.is_active ? 'Ko\'rsatilmoqda' : 'Yashirilgan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'buyurtmalar' && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left">Mijoz</th>
                <th className="px-6 py-4 text-left">Telefon</th>
                <th className="px-6 py-4 text-left">Mahsulot</th>
                <th className="px-6 py-4 text-left">Miqdor</th>
                <th className="px-6 py-4 text-left">Summa</th>
                <th className="px-6 py-4 text-left">Status</th>
                <th className="px-6 py-4 text-left">Sana</th>
              </tr>
            </thead>
            <tbody>
              {webOrders.map(order => {
                const firstItem = order.order_items?.[0] || {};
                return (
                  <tr key={order.id} className="border-t hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{order.customers?.name || 'Foydalanuvchi'}</td>
                    <td className="px-6 py-4">{order.customers?.phone || '-'}</td>
                    <td className="px-6 py-4">{firstItem.products?.name || 'Mavjud emas'}</td>
                    <td className="px-6 py-4">{firstItem.quantity || order.quantity || 1}</td>
                    <td className="px-6 py-4 font-semibold text-green-600">
                      {order.total?.toLocaleString()} so'm
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={order.status}
                        onChange={(e) => handleOrderStatusChange(order.id, e.target.value)}
                        className={`px-3 py-1 rounded-full text-sm ${order.status === 'Yangi' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'Qabul qilindi' ? 'bg-yellow-100 text-yellow-800' :
                            order.status === 'Yetkazilmoqda' ? 'bg-purple-100 text-purple-800' :
                              'bg-green-100 text-green-800'
                          }`}
                      >
                        <option>Yangi</option>
                        <option>Qabul qilindi</option>
                        <option>Yetkazilmoqda</option>
                        <option>Tugallandi</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString('uz-UZ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}