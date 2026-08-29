/**
 * Audit log uchun nomlar xaritasi.
 *
 * Jadval nomlari 3 tilda — ular filtr ro‘yxatida ko‘rinadi.
 * Ustun nomlari faqat o‘zbekcha — ular diff ichida texnik tafsilot sifatida
 * chiqadi; xaritada topilmasa, ustunning asl nomi ko‘rsatiladi.
 */

/** Filtr ro‘yxatini guruhlash uchun */
export const TABLE_GROUPS = {
    orders: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
    customers: { uz: 'Mijozlar', ru: 'Клиенты', en: 'Customers' },
    warehouse: { uz: 'Mahsulot va ombor', ru: 'Товары и склад', en: 'Products & warehouse' },
    production: { uz: 'Xomashyo va ishlab chiqarish', ru: 'Сырьё и производство', en: 'Materials & production' },
    finance: { uz: 'Moliya', ru: 'Финансы', en: 'Finance' },
    staff: { uz: 'Xodimlar', ru: 'Сотрудники', en: 'Employees' },
    website: { uz: 'Vebsayt va sozlamalar', ru: 'Сайт и настройки', en: 'Website & settings' },
    integration: { uz: 'Integratsiya', ru: 'Интеграции', en: 'Integrations' },
}

/**
 * table_name → ko‘rsatiladigan nom, guruh va CRM sahifasiga havola.
 * `href` bo‘lsa, log qatoridan tegishli bo‘limga o‘tish mumkin.
 */
export const TABLE_META = {
    orders: { group: 'orders', href: '/buyurtmalar', uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
    order_items: { group: 'orders', href: '/buyurtmalar', uz: 'Buyurtma qatorlari', ru: 'Позиции заказа', en: 'Order items' },

    customers: { group: 'customers', href: '/mijozlar', uz: 'Mijozlar', ru: 'Клиенты', en: 'Customers' },
    user_profiles: { group: 'integration', href: null, uz: 'Foydalanuvchi profillari', ru: 'Профили пользователей', en: 'User profiles' },

    products: { group: 'warehouse', href: '/mahsulotlar', uz: 'Mahsulotlar', ru: 'Товары', en: 'Products' },
    product_colors: { group: 'warehouse', href: '/mahsulotlar', uz: 'Mahsulot ranglari', ru: 'Цвета товара', en: 'Product colors' },
    product_inventory: { group: 'warehouse', href: '/ombor', uz: 'Ombor qoldig‘i', ru: 'Остатки склада', en: 'Inventory' },
    categories: { group: 'warehouse', href: '/mahsulotlar', uz: 'Kategoriyalar', ru: 'Категории', en: 'Categories' },
    stock_movements: { group: 'warehouse', href: '/ombor', uz: 'Ombor harakatlari', ru: 'Движения склада', en: 'Stock movements' },
    product_bom: { group: 'warehouse', href: '/ombor', uz: 'Mahsulot tarkibi (BOM)', ru: 'Состав товара', en: 'Product BOM' },
    erp_store_inventory: { group: 'warehouse', href: '/ombor', uz: 'ERP do‘kon qoldig‘i', ru: 'Остатки ERP', en: 'ERP store inventory' },

    raw_materials: { group: 'production', href: '/ombor', uz: 'Xomashyo', ru: 'Сырьё', en: 'Raw materials' },
    material_stock_movements: { group: 'production', href: '/ombor', uz: 'Xomashyo harakatlari', ru: 'Движения сырья', en: 'Material movements' },
    material_movements: { group: 'production', href: '/moliya/bolimlar', uz: 'Material harakatlari', ru: 'Движения материалов', en: 'Material movements' },
    production_runs: { group: 'production', href: '/ombor', uz: 'Ishlab chiqarish', ru: 'Производство', en: 'Production runs' },

    finance_partners: { group: 'finance', href: '/moliya/boshqaruv', uz: 'Hamkorlar', ru: 'Партнёры', en: 'Partners' },
    partner_finance_entries: { group: 'finance', href: '/moliya/boshqaruv', uz: 'Hamkor operatsiyalari', ru: 'Операции партнёра', en: 'Partner entries' },
    partner_finance_entry_lines: { group: 'finance', href: '/moliya/boshqaruv', uz: 'Operatsiya qatorlari', ru: 'Строки операции', en: 'Entry lines' },
    transactions: { group: 'finance', href: '/moliya', uz: 'Tranzaksiyalar', ru: 'Транзакции', en: 'Transactions' },
    departments: { group: 'finance', href: '/moliya/bolimlar', uz: 'Bo‘limlar', ru: 'Отделы', en: 'Departments' },
    partner_report_batches: { group: 'finance', href: '/statistika', uz: 'Hamkor hisobotlari', ru: 'Отчёты партнёра', en: 'Partner reports' },
    partner_report_lines: { group: 'finance', href: '/statistika', uz: 'Hisobot qatorlari', ru: 'Строки отчёта', en: 'Report lines' },

    employees: { group: 'staff', href: '/xodimlar', uz: 'Xodimlar', ru: 'Сотрудники', en: 'Employees' },
    employee_advances: { group: 'staff', href: '/xodimlar', uz: 'Avanslar', ru: 'Авансы', en: 'Advances' },
    employee_salary_payments: { group: 'staff', href: '/xodimlar', uz: 'Oylik to‘lovlari', ru: 'Выплаты зарплаты', en: 'Salary payments' },
    employee_payroll_month_closures: { group: 'staff', href: '/xodimlar', uz: 'Oy yopilishi', ru: 'Закрытие месяца', en: 'Month closures' },
    employee_leave_requests: { group: 'staff', href: '/xodimlar', uz: 'Ta‘til so‘rovlari', ru: 'Заявки на отпуск', en: 'Leave requests' },

    settings: { group: 'website', href: '/vebsayt', uz: 'Sozlamalar', ru: 'Настройки', en: 'Settings' },
    banners: { group: 'website', href: '/vebsayt', uz: 'Bannerlar', ru: 'Баннеры', en: 'Banners' },
    site_benefits: { group: 'website', href: '/vebsayt', uz: 'Sayt afzalliklari', ru: 'Преимущества', en: 'Site benefits' },
    reviews: { group: 'website', href: '/vebsayt', uz: 'Sharhlar', ru: 'Отзывы', en: 'Reviews' },
    album_images: { group: 'website', href: '/media-library', uz: 'Albom rasmlari', ru: 'Изображения альбома', en: 'Album images' },
    newsletter_subscriptions: { group: 'website', href: '/vebsayt', uz: 'Obunachilar', ru: 'Подписчики', en: 'Subscribers' },
    contact_messages: { group: 'website', href: '/xabarlar', uz: 'Xabarlar', ru: 'Сообщения', en: 'Messages' },

    telegram_crm_links: { group: 'integration', href: '/xodimlar', uz: 'Telegram ulanishlari', ru: 'Связи Telegram', en: 'Telegram links' },
}

/** Ustun nomlari — o‘zbekcha. Topilmasa asl nom ko‘rsatiladi. */
export const FIELD_LABELS = {
    // Umumiy
    id: 'ID',
    created_at: 'Yaratilgan sana',
    updated_at: 'Yangilangan sana',
    deleted_at: 'O‘chirilgan sana',
    archived_at: 'Arxivlangan sana',
    completed_at: 'Tugallangan sana',
    note: 'Izoh',
    notes: 'Izoh',
    status: 'Status',
    name: 'Nom',
    name_uz: 'Nom (uz)',
    name_ru: 'Nom (ru)',
    name_en: 'Nom (en)',
    title: 'Sarlavha',
    description: 'Tavsif',
    image_url: 'Rasm',
    is_active: 'Faol',
    sort_order: 'Tartib',
    workspace: 'Bo‘lim',

    // Buyurtma
    order_number: 'Buyurtma raqami',
    customer_id: 'Mijoz (ID)',
    customer_name: 'Mijoz ismi',
    customer_phone: 'Mijoz telefoni',
    total: 'Jami summa',
    subtotal: 'Qator summasi',
    payment_status: 'To‘lov holati',
    payment_method: 'To‘lov usuli',
    source: 'Manba',
    delivery_address: 'Yetkazish manzili',
    shipped_quantity: 'Chiqqan soni',

    // Buyurtma qatori / mahsulot
    order_id: 'Buyurtma (ID)',
    product_id: 'Mahsulot (ID)',
    product_name: 'Mahsulot nomi',
    model_code: 'Model kodi',
    quantity: 'Soni',
    qty: 'Soni',
    unit_price: 'Narxi (dona)',
    price: 'Narx',
    price_uzs: 'Narx (so‘m)',
    cost_price: 'Tannarx',
    color: 'Rang',
    colors: 'Ranglar',
    size: 'O‘lcham',
    unit: 'O‘lchov birligi',
    category_id: 'Kategoriya (ID)',
    sku: 'SKU',
    barcode: 'Shtrix-kod',

    // Ombor
    stock: 'Qoldiq',
    quantity_in_stock: 'Ombordagi soni',
    previous_stock: 'Oldingi qoldiq',
    new_stock: 'Yangi qoldiq',
    balance_after: 'Qoldiq (keyin)',
    min_stock: 'Minimal qoldiq',
    type: 'Turi',
    ref_type: 'Havola turi',
    ref_id: 'Havola (ID)',
    reason: 'Sabab',
    raw_material_id: 'Xomashyo (ID)',

    // Moliya
    partner_id: 'Hamkor (ID)',
    entry_type: 'Operatsiya turi',
    entry_date: 'Operatsiya sanasi',
    amount: 'Summa',
    amount_usd: 'Summa (USD)',
    amount_uzs: 'Summa (so‘m)',
    currency: 'Valyuta',
    balance: 'Balans',
    debit: 'Debet',
    credit: 'Kredit',
    category: 'Kategoriya',
    department_id: 'Bo‘lim (ID)',

    // Xodimlar
    employee_id: 'Xodim (ID)',
    position: 'Lavozim',
    monthly_salary: 'Oylik maosh',
    bonus_percent: 'Bonus (%)',
    worked_days: 'Ishlagan kunlar',
    rest_days: 'Dam olish kunlari',
    phone: 'Telefon',
    ended_period_ym: 'Yopilgan davr',
    period_ym: 'Davr (yil-oy)',

    // Aloqa
    email: 'Email',
    message: 'Xabar',
    telegram_chat_id: 'Telegram chat ID',
}

const LANGS = ['uz', 'ru', 'en']

function pickLang(obj, language) {
    if (!obj) return null
    const lang = LANGS.includes(language) ? language : 'uz'
    return obj[lang] || obj.uz || null
}

/** Jadval nomini tanlangan tilda qaytaradi; xaritada bo‘lmasa asl nom. */
export function tableLabel(tableName, language = 'uz') {
    return pickLang(TABLE_META[tableName], language) || tableName
}

/** Jadvalga tegishli CRM sahifasi havolasi (bo‘lmasa null). */
export function tableHref(tableName) {
    return TABLE_META[tableName]?.href || null
}

/** Ustun nomini o‘zbekchada qaytaradi; xaritada bo‘lmasa asl nom. */
export function fieldLabel(column) {
    return FIELD_LABELS[column] || column
}

/**
 * Filtr ro‘yxati uchun: guruhlangan jadvallar.
 * Faqat loglarda haqiqatan uchragan jadvallar ko‘rsatiladi.
 */
export function groupedTableOptions(presentTableNames, language = 'uz') {
    const present = new Set(presentTableNames || [])
    const groups = new Map()

    for (const [table, meta] of Object.entries(TABLE_META)) {
        if (present.size > 0 && !present.has(table)) continue
        const groupKey = meta.group || 'integration'
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                key: groupKey,
                label: pickLang(TABLE_GROUPS[groupKey], language) || groupKey,
                tables: [],
            })
        }
        groups.get(groupKey).tables.push({ value: table, label: tableLabel(table, language) })
    }

    // Xaritada yo‘q, lekin logda bor jadvallar ham tushib qolmasin
    const unknown = [...present].filter((tbl) => !TABLE_META[tbl])
    if (unknown.length > 0) {
        groups.set('other', {
            key: 'other',
            label: language === 'ru' ? 'Прочее' : language === 'en' ? 'Other' : 'Boshqa',
            tables: unknown.map((tbl) => ({ value: tbl, label: tbl })),
        })
    }

    return [...groups.values()]
        .map((g) => ({
            ...g,
            tables: g.tables.sort((a, b) => a.label.localeCompare(b.label, 'uz')),
        }))
        .filter((g) => g.tables.length > 0)
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|$)/

/**
 * Log qiymatini o‘qishga qulay matnga aylantiradi.
 * `null` → «—», mantiqiy → ha/yo‘q, sana → kun.oy.yil, obyekt → JSON.
 */
export function formatLogValue(value, language = 'uz') {
    const dash = '—'
    if (value === null || value === undefined || value === '') return dash

    if (typeof value === 'boolean') {
        if (language === 'ru') return value ? 'да' : 'нет'
        if (language === 'en') return value ? 'yes' : 'no'
        return value ? 'ha' : 'yo‘q'
    }

    if (typeof value === 'number') {
        return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
    }

    if (typeof value === 'string') {
        if (ISO_DATE_RE.test(value)) {
            const d = new Date(value)
            if (!Number.isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0')
                const mm = String(d.getMonth() + 1).padStart(2, '0')
                const yyyy = d.getFullYear()
                const hasTime = value.includes('T')
                if (!hasTime) return `${dd}.${mm}.${yyyy}`
                const hh = String(d.getHours()).padStart(2, '0')
                const mi = String(d.getMinutes()).padStart(2, '0')
                return `${dd}.${mm}.${yyyy} ${hh}:${mi}`
            }
        }
        return value
    }

    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

/** Sana-vaqtni «kun.oy.yil soat:daqiqa:sekund» ko‘rinishida */
export function formatLogTimestamp(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`
}

/**
 * changed_fields (UPDATE) yoki new_data/old_data (INSERT/DELETE) dan
 * ko‘rsatish uchun bir xil ko‘rinishdagi qatorlar yasaydi.
 */
export function buildDiffRows(log) {
    if (!log) return []

    if (log.action === 'UPDATE' && log.changed_fields) {
        return Object.entries(log.changed_fields)
            .map(([field, pair]) => ({
                field,
                label: fieldLabel(field),
                old: pair?.old ?? null,
                new: pair?.new ?? null,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'uz'))
    }

    const snapshot = log.action === 'INSERT' ? log.new_data : log.old_data
    if (!snapshot) return []

    return Object.entries(snapshot)
        .filter(([field]) => field !== 'id')
        .filter(([, value]) => value !== null && value !== '')
        .map(([field, value]) => ({
            field,
            label: fieldLabel(field),
            old: log.action === 'INSERT' ? null : value,
            new: log.action === 'INSERT' ? value : null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'uz'))
}
