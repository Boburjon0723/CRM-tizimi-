import {
    dedupeOrderItemsKeepNewest,
    groupOrderItemsForPrint,
    sortGroupedBucketsForPrint,
} from '../utils'

const TABLE_MISSING_RE = /Could not find the table|does not exist|42P01|schema cache/i

/** Hamkorlar moliyasidagi yozuv buyurtmaga shu kod orqali bog‘lanadi (takror yozilmasin / qaytarilganda o‘chirilsin). */
export function partnerSaleReferenceForOrder(order) {
    if (order?.order_number) return String(order.order_number)
    return `ORD-${String(order?.id || '').slice(0, 8)}`
}

/** Faol hamkorlar ro‘yxati. Jadval bo‘lmasa — bo‘sh ro‘yxat va `missing: true`. */
export async function loadActiveFinancePartners(supabase) {
    const { data, error } = await supabase
        .from('finance_partners')
        .select('id, name_uz, name_ru, name_en, phone')
        .eq('is_active', true)
        .order('name_uz', { ascending: true })
    if (error) {
        if (TABLE_MISSING_RE.test(String(error.message || ''))) return { partners: [], missing: true }
        return { partners: [], missing: false, error }
    }
    return { partners: data || [], missing: false }
}

/** Hamkor nomi (filtrlash) va tugallanganda yozilgan sotuvlar (reference → partner). */
export async function loadPartnerOrderLinkIndex(supabase) {
    const names = new Map()
    const refs = new Map()
    const [pRes, eRes] = await Promise.all([
        supabase.from('finance_partners').select('id, name_uz, name_ru, name_en'),
        supabase
            .from('partner_finance_entries')
            .select('partner_id, reference_code')
            .eq('entry_type', 'sale_out'),
    ])
    if (!pRes.error) {
        for (const p of pRes.data || []) names.set(String(p.id), p)
    }
    if (!eRes.error) {
        for (const e of eRes.data || []) {
            const ref = String(e.reference_code || '').trim()
            if (ref && e.partner_id && !refs.has(ref)) refs.set(ref, String(e.partner_id))
        }
    }
    return { names, refs }
}

/** Buyurtma hamkorga bog‘langanmi: `orders.partner_id` yoki moliya sotuvining reference kodi. */
export function partnerIdForOrder(order, saleOutRefs) {
    const direct = order?.partner_id ? String(order.partner_id) : ''
    if (direct) return direct
    if (!saleOutRefs || typeof saleOutRefs.get !== 'function') return ''
    const ref = partnerSaleReferenceForOrder(order)
    return saleOutRefs.get(ref) || ''
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100
}

/** Buyurtma qatorlari → moliya qatorlari (SKU bo‘yicha guruhlangan). */
export function buildPartnerSaleLines(orderItems, productsList) {
    const grouped = sortGroupedBucketsForPrint(
        groupOrderItemsForPrint(dedupeOrderItemsKeepNewest(orderItems || [], productsList), productsList)
    )
    return grouped
        .map((g) => {
            const sku = g.size != null && String(g.size).trim() !== '' ? String(g.size).trim() : ''
            const name = String(g.product_name || '').trim() || '—'
            return {
                item_name: sku && !name.includes(sku) ? `${name} (${sku})` : name,
                quantity_display: String(g.totalPieces || 0),
                unit_price_uzs: round2(g.unitPrice),
                line_total_uzs: round2(g.lineMonetary),
            }
        })
        .filter((ln) => Number(ln.quantity_display) > 0)
}

/**
 * Tugallangan buyurtmani hamkorga «Mahsulot sotuvi» (sale_out, USD) sifatida yozadi.
 * Shu buyurtma uchun yozuv allaqachon bo‘lsa — qayta yozmaydi.
 * @returns {{ status: 'created' | 'exists' | 'missing' | 'empty', amount?: number }}
 */
export async function recordPartnerSaleForOrder(supabase, { partnerId, order, orderItems, productsList, entryDate }) {
    const reference = partnerSaleReferenceForOrder(order)

    const { data: existing, error: exErr } = await supabase
        .from('partner_finance_entries')
        .select('id')
        .eq('entry_type', 'sale_out')
        .eq('reference_code', reference)
        .limit(1)
    if (exErr) {
        if (TABLE_MISSING_RE.test(String(exErr.message || ''))) return { status: 'missing' }
        throw exErr
    }
    if (existing?.length) return { status: 'exists' }

    const lines = buildPartnerSaleLines(orderItems, productsList)
    const linesSum = round2(lines.reduce((s, ln) => s + ln.line_total_uzs, 0))
    const savedTotal = Number(order?.total)
    const amount = Number.isFinite(savedTotal) && savedTotal > 0 ? round2(savedTotal) : linesSum
    if (!(amount > 0)) return { status: 'empty' }

    const customer = String(order?.customer_name || order?.customers?.name || '').trim()
    const { data: inserted, error: insErr } = await supabase
        .from('partner_finance_entries')
        .insert([
            {
                partner_id: partnerId,
                entry_type: 'sale_out',
                amount_uzs: amount,
                currency: 'USD',
                entry_date: entryDate,
                description: `Buyurtma ${reference}${customer ? ` — ${customer}` : ''}`,
                reference_code: reference,
                warehouse_note: null,
                responsible_name: null,
            },
        ])
        .select('id')
        .single()
    if (insErr) throw insErr

    if (inserted?.id && lines.length) {
        const rows = lines.map((ln, i) => ({ entry_id: inserted.id, line_index: i, ...ln }))
        const { error: lineErr } = await supabase.from('partner_finance_entry_lines').insert(rows)
        if (lineErr) {
            await supabase.from('partner_finance_entries').delete().eq('id', inserted.id)
            throw lineErr
        }
    }
    return { status: 'created', amount }
}

/** Buyurtma tugallangandan qaytarilsa — unga bog‘langan hamkor sotuvi yozuvini o‘chiradi. */
export async function removePartnerSaleForOrder(supabase, order) {
    const reference = partnerSaleReferenceForOrder(order)
    const { data: rows, error } = await supabase
        .from('partner_finance_entries')
        .select('id')
        .eq('entry_type', 'sale_out')
        .eq('reference_code', reference)
    if (error) {
        if (TABLE_MISSING_RE.test(String(error.message || ''))) return 0
        throw error
    }
    const ids = (rows || []).map((r) => r.id)
    if (!ids.length) return 0
    await supabase.from('partner_finance_entry_lines').delete().in('entry_id', ids)
    const { error: delErr } = await supabase.from('partner_finance_entries').delete().in('id', ids)
    if (delErr) throw delErr
    return ids.length
}
