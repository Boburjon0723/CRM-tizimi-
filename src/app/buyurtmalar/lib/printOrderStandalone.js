import { supabase } from '@/lib/supabase'
import {
    DEFAULT_TABLE_CONFIG,
    buildPrintDocumentHtml,
    dedupeOrderItemsKeepNewest,
    fetchOrderItemsForOrderId,
    labelColorCanonical,
    openPrintTab,
} from '../utils'

const TABLE_CONFIG_LS_KEY = 'crm_orders_table_config_v1'

function loadTableConfig() {
    try {
        const raw = localStorage.getItem(TABLE_CONFIG_LS_KEY)
        if (raw) return { ...DEFAULT_TABLE_CONFIG, ...(JSON.parse(raw) || {}) }
    } catch (e) {
        console.warn('table config load', e)
    }
    return DEFAULT_TABLE_CONFIG
}

async function loadProductsByIds(ids) {
    if (!ids.length) return []
    const withCat = await supabase.from('products').select('*, categories(id, name, name_uz)').in('id', ids)
    if (!withCat.error) return withCat.data || []
    const fb = await supabase.from('products').select('*').in('id', ids)
    return fb.data || []
}

/**
 * Buyurtmani raqami bo‘yicha buyurtmalar sahifasidagidek chop etadi (boshqa sahifalardan chaqirish uchun).
 * @returns {Promise<{ ok: boolean, reason?: 'not_found' | 'popup_blocked' }>}
 */
export async function printOrderByNumber(orderNumber, { showPrices = true, language = 'uz' } = {}) {
    const { data: orderRow, error: ordErr } = await supabase
        .from('orders')
        .select('*, customers (id, name, phone)')
        .eq('order_number', orderNumber)
        .maybeSingle()
    if (ordErr) throw ordErr
    if (!orderRow) return { ok: false, reason: 'not_found' }

    const { data: rows, error: oiErr } = await fetchOrderItemsForOrderId(orderRow.id)
    if (oiErr) throw oiErr

    const productIds = [...new Set((rows || []).map((r) => r.product_id).filter(Boolean))]
    const [products, colorsRes] = await Promise.all([
        loadProductsByIds(productIds),
        supabase.from('product_colors').select('*').order('name'),
    ])
    const productColors = colorsRes.data || []

    const order = { ...orderRow, order_items: dedupeOrderItemsKeepNewest(rows || [], products) }
    const html = buildPrintDocumentHtml({
        documentTitle: `Buyurtma-${String(order.id).slice(0, 8)}`,
        listTitle: '',
        orders: [order],
        showPrices,
        labelColorFn: (c) => labelColorCanonical(c, productColors, language),
        productsList: products,
        tableConfig: loadTableConfig(),
    })
    return openPrintTab(html) ? { ok: true } : { ok: false, reason: 'popup_blocked' }
}
