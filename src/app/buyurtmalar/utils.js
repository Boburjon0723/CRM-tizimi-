import { supabase } from '@/lib/supabase'
import { isDeletedAtMissingError } from '@/lib/orderTrash'
import { formatUsd } from '@/utils/formatters'
export { formatUsd }
import { normalizeModelKey as coreNormalizeModelKey } from '@/utils/validators'

export function escapeHtml(s) {
    if (s == null) return ''
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** Buyurtma qatoridagi miqdor/narx — chop etish va yig‘indilarda satr qo‘shilishini oldini olish uchun */
export function parseOrderItemQty(v) {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
}

/** Chop etish / ro'yxat: miqdorni qisqa matn (kg yoki dona) */
export function formatOrderQtyPlain(q) {
    const n = parseOrderItemQty(q)
    if (!Number.isFinite(n) || n <= 0) return '0'
    const r = Math.round(n * 1000) / 1000
    return Number.isInteger(r) ? String(r) : String(r)
}

/** Buyurtma qatori: mahsulot kg bo'yicha sotilsa "2.5 kg", aks holda "3×" */
export function orderItemQtyDisplay(oi, productsList) {
    const prod =
        oi?.product_id && productsList?.length
            ? productsList.find((p) => String(p.id) === String(oi.product_id))
            : null
    const emb = oi?.products
    const isKg = Boolean(prod?.is_kg ?? emb?.is_kg)
    const q = parseOrderItemQty(oi.quantity)
    const s = formatOrderQtyPlain(q)
    return isKg ? `${s} kg` : `${s}×`
}

export function parseOrderItemPrice(v) {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/** API / jadvalda: `line_note` (bazadan) yoki eski variant */
export function orderItemLineNoteText(oi) {
    if (!oi || typeof oi !== 'object') return ''
    const v = oi.line_note ?? oi.lineNote
    return String(v ?? '').trim()
}

/** Bir nechta qatorlarni birlashtirganda qator izohlarini saqlash */
export function mergeLineNotes(a, b) {
    const s1 = String(a ?? '').trim()
    const s2 = String(b ?? '').trim()
    if (!s1) return s2
    if (!s2) return s1
    if (s1 === s2) return s1
    return `${s1}; ${s2}`
}

/** PostgREST: line_index yo‘q yoki categories bog‘lanishi bo‘lmasa so‘rov yiqiladi */
export function isSchemaOrEmbedError(err) {
    const m = String(err?.message || err?.code || err || '')
    return /line_index|categories|schema cache|column|does not exist|42703|PGRST/i.test(m)
}

export const ORDERS_SELECT_FALLBACKS = [
    `*,
  customers (id, name, phone),
  order_items (
    *,
    products (id, name, size, category_id, is_kg, categories (id, name, name_uz))
  )`,
    `*,
  customers (id, name, phone),
  order_items (
    *,
    products (id, name, size, category_id, is_kg)
  )`,
    `*,
  customers (id, name, phone),
  order_items (
    *,
    products (id, name, size, is_kg)
  )`,
    `*,
  customers (id, name, phone),
  order_items (*)
`,
]

export async function fetchOrdersPageWithFallback(options = {}) {
    const { activeOnly = true } = options

    async function trySelect(useDeletedFilter) {
        for (const sel of ORDERS_SELECT_FALLBACKS) {
            let q = supabase.from('orders').select(sel).order('created_at', { ascending: false })
            if (useDeletedFilter && activeOnly) q = q.is('deleted_at', null)
            const res = await q
            if (!res.error) return res
            if (useDeletedFilter && activeOnly && isDeletedAtMissingError(res.error)) return null
            if (!isSchemaOrEmbedError(res.error)) return res
            console.warn('orders select fallback:', res.error?.message)
        }
        return { data: null, error: new Error('orders load failed') }
    }

    if (activeOnly) {
        const first = await trySelect(true)
        if (first !== null) return first
    }
    return trySelect(false)
}

export async function fetchDeletedOrdersPageWithFallback() {
    for (const sel of ORDERS_SELECT_FALLBACKS) {
        const res = await supabase
            .from('orders')
            .select(sel)
            .not('deleted_at', 'is', null)
            .order('created_at', { ascending: false })
        if (!res.error) return res
        if (isDeletedAtMissingError(res.error)) return { data: [], error: null }
        if (!isSchemaOrEmbedError(res.error)) return res
        console.warn('deleted orders select fallback:', res.error?.message)
    }
    return { data: [], error: null }
}

const ORDER_ITEMS_FOR_ORDER_FALLBACKS = [
    { select: `*, products (id, name, size, category_id, is_kg, categories (id, name, name_uz))`, order: 'line_index' },
    { select: `*, products (id, name, size, category_id, is_kg, categories (id, name, name_uz))`, order: 'created_at' },
    { select: `*, products (id, name, size, category_id, is_kg)`, order: 'created_at' },
    { select: `*, products (id, name, size, is_kg)`, order: 'created_at' },
    { select: '*', order: 'created_at' },
]

export async function fetchOrderItemsForOrderId(orderId) {
    for (const cfg of ORDER_ITEMS_FOR_ORDER_FALLBACKS) {
        let q = supabase.from('order_items').select(cfg.select).eq('order_id', orderId)
        q =
            cfg.order === 'line_index'
                ? q.order('line_index', { ascending: true })
                : q.order('created_at', { ascending: true })
        const r = await q
        if (!r.error) return r
        if (!isSchemaOrEmbedError(r.error)) return r
        console.warn('order_items select fallback:', r.error?.message)
    }
    return { data: null, error: new Error('order_items fetch failed') }
}

export async function fetchOrderItemsForOrderIds(orderIds) {
    if (!orderIds?.length) return { data: [], error: null }
    for (const cfg of ORDER_ITEMS_FOR_ORDER_FALLBACKS) {
        let q = supabase.from('order_items').select(cfg.select).in('order_id', orderIds)
        q =
            cfg.order === 'line_index'
                ? q.order('line_index', { ascending: true })
                : q.order('created_at', { ascending: true })
        const r = await q
        if (!r.error) return r
        if (!isSchemaOrEmbedError(r.error)) return r
        console.warn('order_items (in) select fallback:', r.error?.message)
    }
    return { data: null, error: new Error('order_items batch fetch failed') }
}

/** Model kodi solishtirish: probel, tire, katta/kichik harf */
export function normalizeModelKey(s) {
    return coreNormalizeModelKey(s)
}

/**
 * Buyurtma qatori rangi uchun yagona kalit: null/bo‘sh va «—» bitta (`normalizeModelKey('')` ≠ `normalizeModelKey('—')` bo‘lmasin).
 * Aks holda dedupe turli kalit, `orderItemsToOrderLines` esa bitta SKUda miqdorni qo‘shib yuborardi — tahrirda 2x.
 */
export function normalizeOrderItemColorKey(color) {
    const raw = (color != null ? String(color) : '').trim() || '—'
    return normalizeModelKey(raw)
}

/** Supabase qatorida ko‘rinadigan nom (asosiy nom bo‘sh bo‘lsa — lokalizatsiya) */
export function displayProductName(p) {
    if (!p) return ''
    return (
        (p.name && String(p.name).trim()) ||
        (p.name_uz && String(p.name_uz).trim()) ||
        (p.name_ru && String(p.name_ru).trim()) ||
        (p.name_en && String(p.name_en).trim()) ||
        'Mahsulot'
    )
}

export function productNameFields(p) {
    return [p?.name, p?.name_uz, p?.name_ru, p?.name_en].filter((x) => x != null && String(x).trim() !== '')
}

export function productDescriptionFields(p) {
    return [p?.description, p?.description_uz, p?.description_ru, p?.description_en].filter(
        (x) => x != null && String(x).trim() !== ''
    )
}

/** CRMda ranglar ko‘pincha colors massivida (bitta qator) */
export function normalizeColorsArray(p) {
    if (!p) return []
    const raw = p.colors
    let arr = []
    if (Array.isArray(raw)) {
        arr = raw.map((x) => String(x).trim()).filter(Boolean)
    } else if (raw != null && String(raw).trim() !== '') {
        const s = String(raw).trim()
        if (s.startsWith('[') || s.startsWith('{')) {
            try {
                const j = JSON.parse(s)
                if (Array.isArray(j)) arr = j.map((x) => String(x).trim()).filter(Boolean)
            } catch {
                arr = [s]
            }
        } else {
            arr = [s]
        }
    }
    if (!arr.length && p.color && String(p.color).trim()) {
        arr = [String(p.color).trim()]
    }
    const seen = new Set()
    return arr.filter((c) => {
        const k = normalizeModelKey(c)
        if (!k || seen.has(k)) return false
        seen.add(k)
        return true
    })
}

/**
 * product_colors qatori bo‘yicha joriy tilda rang nomi (Mahsulotlar bilan bir xil mantiq).
 * canonicalName — mahsulotda saqlangan kalit (odatda product_colors.name).
 */
export function labelColorCanonical(canonicalName, productColors, language) {
    if (canonicalName == null || String(canonicalName).trim() === '') return ''
    const s = String(canonicalName).trim()
    if (!productColors?.length) return s
    const low = normalizeModelKey(s)
    const row = productColors.find((x) => normalizeModelKey(String(x.name ?? '')) === low)
    if (row) {
        const loc = language === 'ru' ? 'name_ru' : language === 'en' ? 'name_en' : 'name_uz'
        return row[loc] || row.name_uz || row.name_ru || row.name_en || row.name || s
    }
    return s
}

/** Bir qatordan buyurtma pozitsiyalari: ko‘p rangda har bir rang + miqdor alohida qator */
export function expandOrderLineForSubmit(line) {
    if (!line?.product_id) return []
    const pr = Number(line.product_price) || 0
    const img = line.image_url || ''
    const name = line.product_name || ''
    const noteTrim = String(line.local_note ?? '').trim()
    if (line.colorChoices?.length > 1) {
        /** Bir xil rang kaliti (takrorlangan colorChoices yoki yozuv farqi) bitta DB qatorida yig‘iladi */
        const byNorm = new Map()
        for (const c of line.colorChoices) {
            const q = parseFloat(String(line.colorQtyByColor?.[c] ?? '0')) || 0
            if (q <= 0) continue
            const nk = normalizeModelKey(String(c))
            const prev = byNorm.get(nk)
            if (prev) {
                prev.qty += q
            } else {
                byNorm.set(nk, { label: String(c), qty: q })
            }
        }
        const rows = []
        for (const { label, qty } of byNorm.values()) {
            if (qty <= 0) continue
            rows.push({
                codeInput: line.codeInput,
                product_id: line.product_id,
                product_name: name,
                product_price: pr,
                color: label,
                quantity: String(qty),
                image_url: img,
                line_note: noteTrim
            })
        }
        return rows
    }
    const q = parseFloat(String(line.quantity ?? '0')) || 0
    if (q <= 0) return []
    return [
        {
            codeInput: line.codeInput,
            product_id: line.product_id,
            product_name: name,
            product_price: pr,
            color: line.color || '',
            quantity: String(q),
            image_url: img,
            line_note: noteTrim
        }
    ]
}

export const LS_LAST_ORDER = 'crm_last_order_v1'
/** Yangi buyurtma formasi — boshqa bo‘limga o‘tganda yo‘qolmasin */
export const SESSION_NEW_ORDER_DRAFT = 'crm_new_order_draft_v1'

export function saveNewOrderDraft(form, orderLines) {
    try {
        if (typeof window === 'undefined') return
        sessionStorage.setItem(
            SESSION_NEW_ORDER_DRAFT,
            JSON.stringify({ form, orderLines, savedAt: Date.now() })
        )
    } catch (e) {
        console.warn('saveNewOrderDraft', e)
    }
}

export function loadNewOrderDraft() {
    try {
        const raw = sessionStorage.getItem(SESSION_NEW_ORDER_DRAFT)
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

export function clearNewOrderDraft() {
    try {
        sessionStorage.removeItem(SESSION_NEW_ORDER_DRAFT)
    } catch (e) {
        /* ignore */
    }
}

export function draftHasMeaningfulContent(d) {
    if (!d?.orderLines?.length) return false
    const anyLine = d.orderLines.some(
        (l) => (l.codeInput && l.codeInput.trim()) || l.product_id || (l.local_note && String(l.local_note).trim())
    )
    const formBusy =
        (d.form?.customer_name || '').trim() ||
        (d.form?.customer_phone || '').trim() ||
        (d.form?.note || '').trim()
    return anyLine || !!formBusy
}

export function generateDisplayOrderNumber() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `ORD-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function exportOrdersToCsv(rows, filename) {
    const esc = (v) => {
        const s = v == null ? '' : String(v)
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
        return s
    }
    const header = ['order_number', 'id', 'customer_name', 'phone', 'total', 'status', 'created_at']
    const lines = [header.join(',')]
    for (const r of rows) {
        lines.push(
            [
                esc(r.order_number),
                esc(r.id),
                esc(r.customer_name || r.customers?.name),
                esc(r.customer_phone || r.customers?.phone),
                esc(r.total),
                esc(r.status),
                esc(r.created_at)
            ].join(',')
        )
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename || `buyurtmalar-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
}

/**
 * Bir SKU — bitta kalit (product_id + model kodi).
 * productsList berilsa, bo‘sh size katalog dagi kod bilan to‘ldiriladi — aks holda bir xil mahsulot 
 * pid:…:nosz va pid:…:sz:… ga tushib, forma/yig‘indida ikki marta sanalardi (birlashtirish).
 */
export function skuBucketKeyForOrderItem(oi, productsList) {
    const pid = oi.product_id != null && oi.product_id !== '' ? String(oi.product_id) : ''
    const sizeRaw = resolvedOrderItemSizeRaw(oi, productsList || [])
    const sizeKey = normalizeModelKey(sizeRaw)
    if (pid) {
        return sizeKey ? `pid:${pid}:sz:${sizeKey}` : `pid:${pid}:nosz`
    }
    if (oi.id != null && oi.id !== '') return `noid:${String(oi.id)}`
    return `row:${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Bir xil (product_id + model kodi + rang) uchun bazada 2 ta qator bo‘lsa (takrorlanish xatosi), 
 * eng yangi qatorni qoldiramiz — aks holda tahrir qayta ochilganda eski (birinchi) qator ko‘rinadi.
 * created_at bo‘lmasa id bo‘yicha teskari tartib (UUID uchun taxminiy).
 * 
 * Model kodi resolvedOrderItemSizeRaw bilan olinadi (skuBucketKeyForOrderItem / chop etish bilan bir xil).
 * Aks holda bir qatorda size bo‘sh, ikkinchisida to‘ldirilgan bo‘lsa, turli dedupe kaliti + bitta SKU 
 * qopqichida yig‘ilish → jadvalda miqdor 2x ko‘rinardi.
 */
export function dedupeOrderItemsKeepNewest(rows, productsList) {
    if (!rows?.length) return []
    const ts = (r) => {
        const t = r.created_at ?? r.updated_at
        if (t == null || t === '') return NaN
        const ms = new Date(t).getTime()
        return Number.isNaN(ms) ? NaN : ms
    }
    const sorted = [...rows].sort((a, b) => {
        const ta = ts(a)
        const tb = ts(b)
        if (!Number.isNaN(ta) && !Number.isNaN(tb) && tb !== ta) return tb - ta
        if (!Number.isNaN(tb) && Number.isNaN(ta)) return 1
        if (Number.isNaN(tb) && !Number.isNaN(ta)) return -1
        return String(b.id || '').localeCompare(String(a.id || ''))
    })
    const seen = new Set()
    const out = []
    const plist = productsList || []
    for (const oi of sorted) {
        const pid = String(oi.product_id ?? '')
        const sizeResolved = resolvedOrderItemSizeRaw(oi, plist)
        const sz = normalizeModelKey(sizeResolved != null ? String(sizeResolved) : '')
        const col = normalizeOrderItemColorKey(oi.color)
        const key = `${pid}|${sz}|${col}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(oi)
    }
    out.sort((a, b) => {
        const la = Number(a.line_index ?? 0)
        const lb = Number(b.line_index ?? 0)
        if (la !== lb) return la - lb
        const ta = ts(a)
        const tb = ts(b)
        if (!Number.isNaN(ta) && !Number.isNaN(tb) && tb !== ta) return tb - ta
        return String(b.id || '').localeCompare(String(a.id || ''))
    })
    return out
}

/** Yig‘ilgan forma qatori: model kodi — avvalo codeInput, bo‘lsa katalog products.size (chop etish kaliti bilan mos) */
export function resolvedModelCodeForExpandedRow(r, productsList) {
    const fromInput = r?.codeInput != null ? String(r.codeInput).trim() : ''
    if (fromInput) return fromInput
    const pid = r?.product_id
    const p = pid && productsList?.length ? productsList.find((x) => String(x.id) === String(pid)) : null
    if (p?.size != null && String(p.size).trim() !== '') return String(p.size).trim()
    return ''
}

/** Insert payload: size bo‘sh bo‘lsa — katalogdan (DB ga null tushishi mumkin, lekin kalit bir xil bo‘lsin) */
export function resolvedModelCodeForItemPayload(p, productsList) {
    const fromSize = p?.size != null ? String(p.size).trim() : ''
    if (fromSize) return fromSize
    const pid = p?.product_id
    const prod = pid && productsList?.length ? productsList.find((x) => String(x.id) === String(pid)) : null
    if (prod?.size != null && String(prod.size).trim() !== '') return String(prod.size).trim()
    return ''
}

/** Saqlashdan oldin: bitta rang uchun takrorlangan yig‘ilgan qatorlarni bitta qilib qo‘shadi */
export function mergeExpandedRowsForSubmit(rows, productsList) {
    if (!rows?.length) return []
    const map = new Map()
    const plist = productsList || []
    for (const r of rows) {
        const pid = String(r.product_id ?? '')
        const col = normalizeOrderItemColorKey(r.color)
        const code = normalizeModelKey(resolvedModelCodeForExpandedRow(r, plist))
        const key = `${pid}|${col}|${code}`
        const q = parseOrderItemQty(r.quantity)
        const prev = map.get(key)
        if (!prev) {
            map.set(key, { ...r, quantity: String(q) })
            continue
        }
        const pq = parseOrderItemQty(prev.quantity)
        map.set(key, {
            ...prev,
            quantity: String(pq + q),
            line_note: mergeLineNotes(prev.line_note, r.line_note)
        })
    }
    return Array.from(map.values())
}

/**
 * Bazaga insertdan oldin: bir xil mahsulot + model kodi (size) + rang — bitta order_items qatori.
 * Tahrirda mergeExpandedRowsForSubmit va makeItemPayloads orasidagi nomuvofiqlik yoki takroriy 
 * qatorlar natijasida dublikat qatorlarning oldini oladi.
 * productsList — bo‘sh size bilan kelgan qatorlar katalog kodiga qarab bir xil kalitga tushsin (2x DB qatori yo‘q).
 */
export function mergeOrderItemPayloadsForDb(payloads, productsList) {
    if (!payloads?.length) return []
    const map = new Map()
    const plist = productsList || []
    for (const p of payloads) {
        const pid = String(p.product_id ?? '')
        const sz = normalizeModelKey(resolvedModelCodeForItemPayload(p, plist))
        const col = normalizeOrderItemColorKey(p.color)
        const key = `${pid}|${sz}|${col}`
        const q = parseOrderItemQty(p.quantity)
        const qty = q > 0 ? q : 0
        if (qty <= 0) continue
        const pr = Number(p.price)
        const price = Number.isFinite(pr) ? Math.round(pr * 100) / 100 : 0
        const money = Math.round(price * qty * 100) / 100
        const prev = map.get(key)
        if (!prev) {
            map.set(key, { ...p, quantity: qty, price, subtotal: money })
        } else {
            const pq = parseOrderItemQty(prev.quantity)
            const prevSub = Number(prev.subtotal)
            const prevMoney = Number.isFinite(prevSub)
                ? prevSub
                : Math.round((Number(prev.price) || 0) * pq * 100) / 100
            const sumMoney = Math.round((prevMoney + money) * 100) / 100
            const nq = pq + qty
            const newPrice = nq > 0 ? Math.round((sumMoney / nq) * 100) / 100 : price
            map.set(key, {
                ...prev,
                quantity: nq,
                price: newPrice,
                subtotal: sumMoney,
                line_note: mergeLineNotes(prev.line_note, p.line_note)
            })
        }
    }
    return Array.from(map.values()).map((row, idx) => ({
        ...row,
        line_index: idx
    }))
}

/**
 * order_items.size bo‘sh bo‘lsa — mahsulot katalogidagi kod (makeItemPayloads / tahrir bilan mos).
 * Aks holda birlashtirishda bir xil mahsulot turli kalitga tushib, keyin jadvalda miqdor 2x bo‘lardi.
 */
export function resolvedOrderItemSizeRaw(oi, productsList) {
    const s = oi?.size != null ? String(oi.size).trim() : ''
    if (s) return s
    const emb = oi?.products
    if (emb && typeof emb === 'object' && emb.size != null && String(emb.size).trim() !== '') {
        return String(emb.size).trim()
    }
    const p = oi?.product_id && productsList?.length ? productsList.find((x) => String(x.id) === String(oi.product_id)) : null
    if (p?.size != null && String(p.size).trim() !== '') return String(p.size).trim()
    return ''
}

/** Model kodi bo‘yicha natural tartib (A-2 dan keyin A-10). */
export function naturalCompareModelCode(a, b) {
    const sa = a != null ? String(a) : ''
    const sb = b != null ? String(b) : ''
    return sa.localeCompare(sb, 'uz', { numeric: true, sensitivity: 'base' })
}

export function minLineIndexInBucket(lines) {
    if (!lines?.length) return 0
    return Math.min(...lines.map((l) => Number(l.line_index ?? 0)))
}

export function normalizeOrderItemsForList(items) {
    return Array.isArray(items) ? items : []
}

/** Chop etish: bir SKU (product_id + model kodi/size) — bitta qator; rang/miqdor faqat shu qopqichdagi qatorlardan. */
export function groupOrderItemsForPrint(orderItems, productsList) {
    if (!orderItems?.length) return []
    const items = normalizeOrderItemsForList(orderItems)
    const buckets = new Map()
    for (const oi of items) {
        const key = skuBucketKeyForOrderItem(oi, productsList)
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(oi)
    }
    const bucketArrays = Array.from(buckets.values())
    bucketArrays.sort((a, b) => minLineIndexInBucket(a) - minLineIndexInBucket(b))
    return bucketArrays.map((lines) => {
        const first = lines[0]
        const colorMap = new Map()
        let lineMonetary = 0
        let sumQtyFromLines = 0
        for (const oi of lines) {
            const raw = (oi.color || '').trim() || '—'
            const nk = normalizeOrderItemColorKey(oi.color)
            const q = parseOrderItemQty(oi.quantity)
            sumQtyFromLines += q
            const prevEntry = colorMap.get(nk)
            const nextQty = (prevEntry ? parseOrderItemQty(prevEntry.qty) : 0) + q
            colorMap.set(nk, { label: prevEntry?.label ?? raw, qty: nextQty })
            const pr = parseOrderItemPrice(oi.price)
            lineMonetary += pr * q
        }
        const colorPairs = Array.from(colorMap.values()).map(({ label, qty }) => [label, parseOrderItemQty(qty)])
        const totalPiecesFromColors = colorPairs.reduce((s, [, qq]) => s + qq, 0)
        const totalPieces = totalPiecesFromColors === sumQtyFromLines ? totalPiecesFromColors : sumQtyFromLines
        lineMonetary = Math.round(lineMonetary * 100) / 100
        const lineMonetaryFinal = lineMonetary
        const unitPrice = totalPieces > 0 ? Math.round((lineMonetaryFinal / totalPieces) * 100) / 100 : parseOrderItemPrice(first.price)
        const lineNoteParts = []
        for (const oi of lines) {
            const n = orderItemLineNoteText(oi)
            if (n && !lineNoteParts.includes(n)) lineNoteParts.push(n)
        }
        const lineNoteJoined = lineNoteParts.join('; ')
        const customerNames = Array.from(new Set(lines.map((l) => l._customer_name).filter(Boolean))).join(', ')
        return {
            product_name: first.product_name || first.products?.name || '-',
            size: resolvedOrderItemSizeRaw(first, productsList || []) || first.size,
            image_url: first.image_url,
            lines,
            colorPairs,
            totalPieces,
            lineMonetary: lineMonetaryFinal,
            unitPrice,
            lineNote: lineNoteJoined,
            customerNames
        }
    })
}

/** Kategoriya nomi (chop etish) — mahsulotdan */
export function categoryLabelFromGroupedLine(firstOi) {
    const cat = firstOi?.products?.categories
    if (cat && typeof cat === 'object') {
        const n = (cat.name_uz || cat.name || '').trim()
        if (n) return n
    }
    return ''
}

/** Forma jadvali: mahsulot qatoridan kategoriya matni (tilga qarab) */
export function categoryLabelFromProduct(product, language) {
    if (!product) return ''
    const cat = product.categories
    if (cat && typeof cat === 'object') {
        if (language === 'ru' && cat.name) return String(cat.name).trim()
        if (language === 'en' && (cat.name_en || cat.name)) return String(cat.name_en || cat.name).trim()
        const n = (cat.name_uz || cat.name || '').trim()
        if (n) return n
    }
    if (product.category != null && String(product.category).trim() !== '') {
        return String(product.category).trim()
    }
    return ''
}

/** Guruhlar: kategoriya (nom bo‘yicha), ichida model kodi (natural), so‘ng forma tartibi (line_index). */
export function sortGroupedBucketsForPrint(grouped) {
    if (!grouped?.length) return []
    return [...grouped].sort((a, b) => {
        const na = (categoryLabelFromGroupedLine(a.lines[0]) || '\uFFFF').toLowerCase()
        const nb = (categoryLabelFromGroupedLine(b.lines[0]) || '\uFFFF').toLowerCase()
        const c = na.localeCompare(nb, 'uz')
        if (c !== 0) return c
        const cm = naturalCompareModelCode(a.size, b.size)
        if (cm !== 0) return cm
        return minLineIndexInBucket(a.lines) - minLineIndexInBucket(b.lines)
    })
}

/** Rang va son — ikki ustunda vertikal ro‘yxat (har bir qatorda rang | soni) */
export function buildColorQtyStacksHtml(colorPairs, labelColorFn) {
    const label = typeof labelColorFn === 'function' ? labelColorFn : (c) => c
    const pairs = Array.isArray(colorPairs) ? colorPairs.map(([c, q]) => [c, q]) : []
    const colorsHtml = pairs.map(([c]) => `<div class="stack-line">${escapeHtml(label(c))}</div>`).join('')
    const qtysHtml = pairs.map(([, q]) => `<div class="stack-line">${escapeHtml(String(q))}</div>`).join('')
    return { colorsHtml, qtysHtml }
}

export function buildOrderBlockHtml(item, showPrices, labelColorFn, productsList, tableConfig) {
    const customerName = escapeHtml(item.customer_name || item.customers?.name || 'Noma\'lum')
    const phone = escapeHtml(item.customer_phone || item.customers?.phone || '-')
    const date = escapeHtml(new Date(item.created_at).toLocaleDateString())
    const shortId = escapeHtml(String(item.id).slice(0, 8))
    const orderNumHtml = item.order_number ? `<strong>№</strong> ${escapeHtml(String(item.order_number))}<br>` : ''
    const groupedRaw = groupOrderItemsForPrint(dedupeOrderItemsKeepNewest(item.order_items || [], productsList), productsList)
    const grouped = sortGroupedBucketsForPrint(groupedRaw)
    const withNote = (!showPrices && !!tableConfig?.includePrintNoteColumn) || (showPrices && !!tableConfig?.includePrintNoteWithPrices)
    const withExtra = (!showPrices && !!tableConfig?.includePrintExtraColumn) || (showPrices && !!tableConfig?.includePrintExtraWithPrices)
    const colSpanAll = (showPrices ? 8 : 6) + (withNote ? 1 : 0) + (withExtra ? 1 : 0)
    const noteTh = escapeHtml(showPrices ? String(tableConfig?.printNoteTitleWithPrices ?? 'Izoh').trim() || 'Izoh' : String(tableConfig?.printNoteTitle ?? 'Izoh').trim() || 'Izoh')
    const extraTh = escapeHtml(showPrices ? String(tableConfig?.printExtraTitleWithPrices ?? 'Belgi').trim() || 'Belgi' : String(tableConfig?.printExtraTitle ?? 'Belgi').trim() || 'Belgi')
    const noteCellEmpty = withNote ? '<td class="print-note-cell"></td>' : ''
    const extraCell = withExtra ? '<td class="print-extra-cell"></td>' : ''

    function oneDataRowHtml(g, displayIndex) {
        const sku = escapeHtml(g.size != null && g.size !== '' ? String(g.size) : '—')
        const imgHtml = g.image_url ? `<img class="prod-thumb" src="${escapeHtml(g.image_url)}" alt="">` : ''
        const { colorsHtml, qtysHtml } = buildColorQtyStacksHtml(g.colorPairs, labelColorFn)
        const priceCells = showPrices ? `<td class="mono">$${escapeHtml(formatUsd(g.unitPrice))}</td><td class="mono">$${escapeHtml(formatUsd(g.lineMonetary))}</td>` : ''
        const noteCellRow = withNote ? `<td class="print-note-cell">${g.lineNote ? escapeHtml(g.lineNote) : ''}</td>` : ''
        return `<tr>
                <td>${displayIndex}</td>
                <td class="prod-img-cell">${imgHtml ? `<div class="prod-thumb-wrap">${imgHtml}</div>` : '<span class="prod-no-img">—</span>'}</td>
                <td class="mono">${sku}</td>
                <td class="colors-stack">${colorsHtml}</td>
                <td class="qty-stack mono">${qtysHtml}</td>
                <td class="mono">${g.totalPieces}</td>
                ${priceCells}${noteCellRow}${extraCell}
            </tr>`
    }

    const hasCategoryMeta = grouped.some((g) => Boolean(categoryLabelFromGroupedLine(g.lines[0])))
    let rowHtml = ''
    let rowNum = 1
    if (!hasCategoryMeta) {
        rowHtml = grouped.map((g) => oneDataRowHtml(g, rowNum++)).join('')
    } else {
        let currentKey = null; let secPieces = 0; let secMoney = 0
        const catKey = (g) => categoryLabelFromGroupedLine(g.lines[0]) || '__none__'
        for (const g of grouped) {
            const key = catKey(g)
            if (currentKey !== null && key !== currentKey) {
                const pCells = showPrices ? `<td class="mono totals-td totals-empty"></td><td class="mono totals-td">$${escapeHtml(formatUsd(secMoney))}</td>` : ''
                rowHtml += `<tr class="cat-subtotal-row"><td colspan="5" style="text-align:right;font-weight:700;background:#eef2ff">Kategoriya jami</td><td class="mono">${secPieces}</td>${pCells}${noteCellEmpty}${extraCell}</tr>`
                secPieces = 0; secMoney = 0
            }
            if (key !== currentKey) {
                const lab = categoryLabelFromGroupedLine(g.lines[0]) || '—'
                rowHtml += `<tr class="cat-header-row"><td colspan="${colSpanAll}" style="background:#e2efda;font-weight:700;padding:8px 6px;font-size:0.9rem">Kategoriya: ${escapeHtml(lab)}</td></tr>`
                currentKey = key
            }
            rowHtml += oneDataRowHtml(g, rowNum++)
            secPieces += Number(g.totalPieces) || 0
            secMoney += Number(g.lineMonetary) || 0
        }
        if (currentKey !== null) {
            const pCells = showPrices ? `<td class="mono totals-td totals-empty"></td><td class="mono totals-td">$${escapeHtml(formatUsd(secMoney))}</td>` : ''
            rowHtml += `<tr class="cat-subtotal-row"><td colspan="5" style="text-align:right;font-weight:700;background:#eef2ff">Kategoriya jami</td><td class="mono">${secPieces}</td>${pCells}${noteCellEmpty}${extraCell}</tr>`
        }
    }
    const totalPar = grouped.reduce((s, g) => (Number(s) || 0) + (Number(g.totalPieces) || 0), 0)
    const totalMoney = grouped.reduce((s, g) => (Number(s) || 0) + (Number(g.lineMonetary) || 0), 0)
    const savedTotalRaw = item.total != null && item.total !== '' ? Number(item.total) : NaN
    const savedTotal = Number.isFinite(savedTotalRaw) ? savedTotalRaw : null
    const grandTotal = savedTotal != null ? savedTotal : totalMoney
    const fPriceCells = showPrices ? `<td class="mono totals-td totals-empty"></td><td class="mono totals-td">$${escapeHtml(formatUsd(grandTotal))}</td>` : ''
    const fRow = `<tr class="totals-row"><td class="totals-label" colspan="5">Jami</td><td class="mono totals-td">${totalPar}</td>${fPriceCells}${noteCellEmpty}${extraCell}</tr>`
    const thPrice = showPrices ? '<th class="th-narrow">1 par</th><th class="th-narrow">Qator</th>' : ''
    const thNote = withNote ? `<th class="th-izoh">${noteTh}</th>` : ''
    const thExtra = withExtra ? `<th class="th-extra">${extraTh}</th>` : ''
    
    return `<div class="order-block"><div class="info"><div><strong>Mijoz:</strong> ${customerName}<br><strong>Tel:</strong> ${phone}</div><div style="text-align:right"><strong>Sana:</strong> ${date}<br>${orderNumHtml}<strong>ID:</strong> #${shortId}</div></div><table class="items-table"><thead><tr><th>#</th><th>Rasm</th><th>Kod</th><th class="th-rang">Rang</th><th class="th-miqdor">Miqdor</th><th>Jami par</th>${thPrice}${thNote}${thExtra}</tr></thead><tbody>${rowHtml}</tbody></table><table class="items-table order-totals-table"><tbody>${fRow}</tbody></table>${showPrices ? `<p class="print-order-totals-check" style="font-size:0.82rem;color:#555;margin-top:10px;line-height:1.4"><strong>Buyurtma jami:</strong> $${escapeHtml(formatUsd(grandTotal))}</p>` : ''}</div>`
}

export function buildPrintDocumentHtml({ documentTitle, listTitle, orders, showPrices, labelColorFn, productsList, tableConfig }) {
    const blocks = orders.map((o) => buildOrderBlockHtml(o, showPrices, labelColorFn, productsList, tableConfig)).join('<div class="page-break"></div>')
    const listBanner = listTitle ? `<p class="list-banner">${escapeHtml(listTitle)}</p>` : ''
    const imagePx = imagePxBySize(tableConfig?.imageSize)
    const imageWrapPx = imagePx + 10
    const imageCellPx = imagePx + 14
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title><style>body{font-family:sans-serif;padding:40px;color:#333}.header{margin-bottom:24px;border-bottom:2px solid #eee;padding-bottom:16px}.header h1{margin:0;color:#1a1a1a;font-size:1.25rem}.list-banner{color:#555;font-size:0.95rem;margin-bottom:16px}.order-block{margin-bottom:24px}.info{display:flex;justify-content:space-between;margin-bottom:20px}table.items-table{width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #8c8c8c;box-shadow:0 1px 2px rgba(0,0,0,.06)}.order-block table.items-table:not(.order-totals-table){margin-bottom:0}table.items-table thead{display:table-header-group}table.items-table th{background:#ffeb9c;color:#1a1a1a;text-align:left;padding:8px 6px;border:1px solid #c9a227;font-size:0.82rem;font-weight:700}table.items-table th.th-narrow{white-space:nowrap}table.items-table th.th-rang{background:#fff2cc}table.items-table th.th-miqdor{background:#e2efda}table.items-table td{padding:8px 6px;border:1px solid #b4b4b4;vertical-align:top}table.items-table tbody tr{page-break-inside:avoid}table.items-table tbody tr:nth-child(odd) td{background:#fffef7}table.items-table tbody tr:nth-child(even) td{background:#e7f3ff}table.items-table tbody tr:nth-child(even) td.colors-stack{background:#f5fbff}table.items-table tbody tr:nth-child(even) td.qty-stack{background:#eef7f0}table.items-table tbody tr:nth-child(odd) td.colors-stack{background:#fffdf0}table.items-table tbody tr:nth-child(odd) td.qty-stack{background:#f7fdf5}table.order-totals-table{width:100%;margin-top:-1px;margin-bottom:16px;page-break-inside:avoid}table.order-totals-table .totals-row td{background:#d9e1f2!important;border-top:2px solid #4472c4;font-weight:700;font-size:0.88rem}table.order-totals-table .totals-label{text-align:right;padding:10px 8px;color:#1a1a1a}table.order-totals-table .totals-td{text-align:right;vertical-align:middle}table.order-totals-table .totals-empty{color:#999;font-weight:400}tr.cat-header-row td{background:#e2efda!important;border:1px solid #92c47c!important}tr.cat-subtotal-row td{background:#eef2ff!important;border:1px solid #9ca3af!important}.mono{font-variant-numeric:tabular-nums}.colors-stack{min-width:6.5rem;max-width:13rem;vertical-align:top;font-size:0.88rem;line-height:1.35}.qty-stack{min-width:3rem;text-align:right;vertical-align:top;font-size:0.88rem;line-height:1.35}.colors-stack .stack-line,.qty-stack .stack-line{padding:2px 0;line-height:1.35;min-height:1.25em;font-size:0.85rem}.qty-stack .stack-line{font-weight:600}.prod-img-cell{width:${imageCellPx}px;max-width:${imageCellPx}px;min-width:${imageCellPx}px;text-align:center;vertical-align:middle;padding:6px!important;overflow:hidden;background:#fff!important}.prod-thumb-wrap{max-width:100%;max-height:${imageWrapPx}px;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff}.prod-thumb{max-width:${imagePx}px;max-height:${imagePx}px;width:auto;height:auto;object-fit:contain;object-position:center;vertical-align:middle;border-radius:6px;display:block;background:transparent;mix-blend-mode:multiply}.prod-no-img{color:#999;font-size:0.85rem}table.items-table th.th-izoh{background:#ede9fe;color:#1a1a1a;min-width:5rem}.print-note-cell{min-width:5.5rem;min-height:2.5rem;background:#fff!important;vertical-align:middle;border:1px dashed #c4b5fd!important}table.items-table th.th-extra{background:#dbeafe;color:#1a1a1a;min-width:5rem}.print-extra-cell{min-width:5.5rem;min-height:2.5rem;background:#fff!important;vertical-align:middle;border:1px dashed #93c5fd!important}.page-break{page-break-after:always;border:none;margin:24px 0;padding:0;height:0;overflow:hidden}.footer{margin-top:32px;text-align:center;color:#666;font-size:0.8em;border-top:1px solid #eee;padding-top:16px}@media print{body{padding:16px 24px}.footer{page-break-inside:avoid}table.items-table th,table.items-table td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="header"><h1>NUUR_HOME_COLLECTION</h1></div>${listBanner}${blocks}<div class="footer">Nuur_Home_Collection<br>Xaridingiz uchun rahmat!</div><script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script></body></html>`
}

/**
 * Bir nechta buyurtmalardagi mahsulotlarni birlashtirish (SKU + rang bo‘yicha miqdorlarni qo‘shish).
 * Ishlab chiqarish yoki yig‘ish ro‘yxati (picking list) uchun ishlatiladi.
 */


/**
 * Umumlashtirilgan (consolidated) kategoriya bo‘yicha chop etish htmlli.
 * Tanlangan barcha buyurtmalardagi mahsulotlar bitta yirik jadvalda kategoriya bo‘yicha guruhlanadi.
 */
export function buildConsolidatedPrintHtml({ documentTitle, listTitle, orders, showPrices, labelColorFn, productsList, tableConfig }) {
    // 1. Kategoriyalarni aniqlaymiz
    const allUniqueCategories = new Set()
    for (const o of orders) {
        for (const oi of normalizeOrderItemsForList(o.order_items)) {
            const cat = categoryLabelFromGroupedLine(oi) || '—'
            allUniqueCategories.add(cat)
        }
    }
    const categoriesSorted = Array.from(allUniqueCategories).sort((a, b) => a.localeCompare(b, 'uz'))

    const withNote = (!showPrices && !!tableConfig?.includePrintNoteColumn) || (showPrices && !!tableConfig?.includePrintNoteWithPrices)
    const withExtra = (!showPrices && !!tableConfig?.includePrintExtraColumn) || (showPrices && !!tableConfig?.includePrintExtraWithPrices)
    const colSpanFixed = 6 // #, Rasm, Kod, Rang, Miqdor, Jami par
    const colSpanAll = colSpanFixed + (showPrices ? 2 : 0) + (withNote ? 1 : 0) + (withExtra ? 1 : 0)

    const noteTh = escapeHtml(showPrices ? String(tableConfig?.printNoteTitleWithPrices ?? 'Izoh').trim() || 'Izoh' : String(tableConfig?.printNoteTitle ?? 'Izoh').trim() || 'Izoh')
    const extraTh = escapeHtml(showPrices ? String(tableConfig?.printExtraTitleWithPrices ?? 'Belgi').trim() || 'Belgi' : String(tableConfig?.printExtraTitle ?? 'Belgi').trim() || 'Belgi')
    const thPrice = showPrices ? '<th class="th-narrow">1 par</th><th class="th-narrow">Qator</th>' : ''
    const thNote = withNote ? `<th class="th-izoh">${noteTh}</th>` : ''
    const thExtra = withExtra ? `<th class="th-extra">${extraTh}</th>` : ''

    const imagePx = imagePxBySize(tableConfig?.imageSize)
    const imageWrapPx = imagePx + 10
    const imageCellPx = imagePx + 14

    function oneDataRowHtml(g, displayIndex) {
        const sku = escapeHtml(g.size != null && g.size !== '' ? String(g.size) : '—')
        const imgHtml = g.image_url ? `<img class="prod-thumb" src="${escapeHtml(g.image_url)}" alt="">` : ''
        const { colorsHtml, qtysHtml } = buildColorQtyStacksHtml(g.colorPairs, labelColorFn)
        const priceCells = showPrices ? `<td class="mono">$${escapeHtml(formatUsd(g.unitPrice))}</td><td class="mono">$${escapeHtml(formatUsd(g.lineMonetary))}</td>` : ''
        const noteCellRow = withNote ? `<td class="print-note-cell">${g.lineNote ? escapeHtml(g.lineNote) : ''}</td>` : ''
        const extraCell = withExtra ? '<td class="print-extra-cell"></td>' : ''

        return `<tr>
                <td>${displayIndex}</td>
                <td class="prod-img-cell">${imgHtml ? `<div class="prod-thumb-wrap">${imgHtml}</div>` : '<span class="prod-no-img">—</span>'}</td>
                <td class="mono">${sku}</td>
                <td class="colors-stack">${colorsHtml}</td>
                <td class="qty-stack mono">${qtysHtml}</td>
                <td class="mono">${g.totalPieces}</td>
                ${priceCells}${noteCellRow}${extraCell}
            </tr>`
    }

    let fullBodyHtml = ''
    let totalPiecesGlobal = 0

    for (const categoryName of categoriesSorted) {
        let categoryTotalPieces = 0
        let categoryBlocksHtml = ''

        // Shu kategoriyaga tegishli mahsulotlari bor mijozlarni topamiz
        for (const o of orders) {
            const customerItems = normalizeOrderItemsForList(o.order_items).filter(oi => (categoryLabelFromGroupedLine(oi) || '—') === categoryName)
            if (customerItems.length === 0) continue

            const groupedRaw = groupOrderItemsForPrint(customerItems, productsList)
            const grouped = sortGroupedBucketsForPrint(groupedRaw)

            const customerName = escapeHtml(o.customer_name || o.customers?.name || 'Mijoz')
            const customerHeader = `<h3 style="margin: 15px 0 8px 0; font-size: 1rem; color: #1e40af;">Mijoz: ${customerName}</h3>`
            
            let rowHtml = ''
            let rowNum = 1
            let customerTotalPieces = 0

            for (const g of grouped) {
                rowHtml += oneDataRowHtml(g, rowNum++)
                customerTotalPieces += Number(g.totalPieces) || 0
            }

            categoryTotalPieces += customerTotalPieces
            
            categoryBlocksHtml += `
                <div class="customer-block">
                    ${customerHeader}
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Rasm</th>
                                <th>Kod</th>
                                <th class="th-rang">Rang</th>
                                <th class="th-miqdor">Miqdor</th>
                                <th>Jami par</th>
                                ${thPrice}${thNote}${thExtra}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowHtml}
                            <tr class="customer-totals-row">
                                <td colspan="5" style="text-align:right; font-weight:700;">Mijoz jami</td>
                                <td class="mono" style="font-weight:700;">${customerTotalPieces}</td>
                                <td colspan="${colSpanAll - 6}"></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `
        }

        if (categoryBlocksHtml) {
            totalPiecesGlobal += categoryTotalPieces
            fullBodyHtml += `
                <div class="category-section" style="margin-bottom: 40px; border-top: 2px solid #3b82f6; padding-top: 10px;">
                    <h2 style="background: #eff6ff; padding: 10px; margin: 0; font-size: 1.15rem; border-radius: 6px;">Kategoriya: ${escapeHtml(categoryName)}</h2>
                    ${categoryBlocksHtml}
                    <div style="text-align: right; padding: 10px; font-weight: 700; background: #f8fafc; border-radius: 4px; margin-top: 5px;">
                        Kategoriya umumiy jami: ${categoryTotalPieces} ta
                    </div>
                </div>
            `
        }
    }

    const listBannerHtml = listTitle ? `<p class="list-banner">${escapeHtml(listTitle)}</p>` : ''

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title><style>
        body{font-family:sans-serif;padding:30px;color:#333; line-height: 1.4;}
        .header{margin-bottom:24px;border-bottom:2px solid #eee;padding-bottom:16px}
        .header h1{margin:0;color:#1a1a1a;font-size:1.25rem}
        .list-banner{color:#555;font-size:0.95rem;margin-bottom:16px}
        table.items-table{width:100%;border-collapse:collapse;margin-bottom:10px;border:1px solid #8c8c8c;}
        table.items-table th{background:#f1f5f9;color:#1a1a1a;text-align:left;padding:8px 6px;border:1px solid #94a3b8;font-size:0.8rem;font-weight:700}
        table.items-table td{padding:6px 6px;border:1px solid #cbd5e1;vertical-align:top; font-size: 0.85rem;}
        table.items-table tbody tr:nth-child(even) td{background:#f8fafc}
        .mono{font-variant-numeric:tabular-nums; font-family: monospace;}
        .colors-stack, .qty-stack{ font-size:0.82rem; line-height:1.3; }
        .stack-line{padding:1px 0;}
        .prod-img-cell{width:${imageCellPx}px; text-align:center; vertical-align:middle; padding:4px!important; background:#fff!important}
        .prod-thumb-wrap{max-width:100%; max-height:${imageWrapPx}px; display:flex; align-items:center; justify-content:center; overflow:hidden;}
        .prod-thumb{max-width:${imagePx}px; max-height:${imagePx}px; object-fit:contain;}
        .customer-totals-row td { background: #f1f5f9 !important; }
        .category-section { page-break-inside: avoid; }
        @media print {
            body { padding: 10px; }
            .category-section { page-break-inside: avoid; margin-bottom: 20px; }
            .customer-block { page-break-inside: avoid; margin-bottom: 15px; }
        }
    </style></head><body>
        <div class="header"><h1>NUUR_HOME_COLLECTION</h1></div>
        ${listBannerHtml}
        ${fullBodyHtml}
        <div style="margin-top: 30px; padding: 15px; background: #1e3a8a; color: white; font-weight: 700; text-align: center; border-radius: 8px; font-size: 1.1rem;">
            TANLANGAN BARCHA BUYURTMALAR JAMI: ${totalPiecesGlobal} ta mahsulot
        </div>
        <div class="footer" style="margin-top: 30px; text-align: center; color: #666; font-size: 0.8rem;">
            Nuur_Home_Collection<br>Xaridingiz uchun rahmat!
        </div>
        <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
    </body></html>`
}

export function openPrintTab(html) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return false
    printWindow.document.write(html)
    printWindow.document.close()
    return true
}

export const SOURCE_STORE_DB = "do'kon"

export function normalizeSourceForDb(uiSource) {
    if (uiSource === 'website' || uiSource === 'telefon') return uiSource
    if (uiSource === 'dokon' || uiSource === 'admin') return SOURCE_STORE_DB
    return SOURCE_STORE_DB
}

export function normalizeSourceForForm(dbSource) {
    if (dbSource === 'website') return 'website'
    if (dbSource === 'telefon') return 'telefon'
    if (dbSource === SOURCE_STORE_DB || dbSource === 'dokon' || dbSource === 'admin' || dbSource == null || dbSource === '') return 'dokon'
    return 'dokon'
}

export function normalizeStatusForSelect(status) {
    if (status == null || status === '') return 'new'
    const s = String(status).toLowerCase().trim()
    if (s === 'new' || s === 'yangi') return 'new'
    if (s === 'pending' || s === 'jarayonda') return 'pending'
    if (s === 'completed' || s === 'tugallandi' || s === 'tugallangan') return 'completed'
    if (s === 'cancelled' || s === 'bekor qilingan' || s === 'bekor qilindi') return 'cancelled'
    return 'new'
}

export const ORDER_LIST_ITEMS_PREVIEW = 1

export function createEmptyOrderLine() {
    return {
        id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        codeInput: '',
        quantity: '1',
        product_id: null,
        product_name: '',
        product_price: 0,
        color: '',
        image_url: '',
        resolveError: '',
        local_note: '',
        readyForSort: false,
        variants: [],
        colorChoices: [],
        colorQtyByColor: {}
    }
}

export const DEFAULT_TABLE_CONFIG = {
    imageSize: 'md',
    includePrintNoteColumn: true,
    includePrintExtraColumn: false,
    includePrintNoteWithPrices: false,
    includePrintExtraWithPrices: false,
    printNoteTitle: 'Izoh',
    printExtraTitle: 'Belgi',
    printNoteTitleWithPrices: 'Izoh',
    printExtraTitleWithPrices: 'Belgi',
    showFormImageColumn: true,
    showFormColorColumn: true
}

export function imagePxBySize(sizeKey) {
    if (sizeKey === 'sm') return 72
    if (sizeKey === 'lg') return 132
    return 104
}

export function isLineCommittedToSortOrder(line) {
    if (!line?.product_id) return false
    if (line.readyForSort === true) return true
    if (line.readyForSort === false) return false
    return true
}

export function orderLinesHasDuplicateProduct(orderLines, productId, excludeLineId) {
    if (productId == null || productId === '') return false
    const pid = String(productId)
    return (orderLines || []).some((l) => l.id !== excludeLineId && l.product_id != null && String(l.product_id) === pid)
}

export function findFirstDuplicateProductLineId(orderLines, productId, excludeLineId) {
    if (productId == null || productId === '') return null
    const pid = String(productId)
    for (const l of orderLines || []) {
        if (l.id === excludeLineId) continue
        if (l.product_id != null && String(l.product_id) === pid) return l.id
    }
    return null
}

/** Takror mahsulot: `sourceLine` dagi miqdorlarni `targetId` qatoriga qo‘shadi, `sourceLine` ni olib tashlaydi. */
export function mergeDuplicateSourceLineIntoTarget(orderLines, targetId, sourceLine, product) {
    const target = orderLines.find((l) => l.id === targetId)
    if (!target || !sourceLine || !product || targetId === sourceLine.id) return orderLines

    const colorOpts = normalizeColorsArray(product)
    const targetMatrix = (target.colorChoices?.length || 0) > 1
    const sourceMatrix = (sourceLine.colorChoices?.length || 0) > 1
    const productMulti = colorOpts.length > 1

    let nextTarget = { ...target }
    const noteMerged = mergeLineNotes(target.local_note, sourceLine.local_note)

    function mergeSourceMatrixInto(baseTarget) {
        const tq = { ...(baseTarget.colorQtyByColor || {}) }
        for (const c of baseTarget.colorChoices || []) {
            if (tq[c] == null) tq[c] = '0'
        }
        for (const c of sourceLine.colorChoices || []) {
            const add = parseOrderItemQty(sourceLine.colorQtyByColor?.[c] ?? '0')
            if (add <= 0) continue
            const nk = normalizeModelKey(String(c))
            const matchKey = baseTarget.colorChoices.find((k) => normalizeModelKey(String(k)) === nk)
            const destKey = matchKey || baseTarget.colorChoices[0]
            if (!destKey) continue
            tq[destKey] = String(parseOrderItemQty(tq[destKey] ?? '0') + add)
        }
        return { ...baseTarget, colorQtyByColor: tq, local_note: noteMerged }
    }

    if (targetMatrix) {
        if (sourceMatrix) {
            nextTarget = mergeSourceMatrixInto(nextTarget)
        } else {
            const tq = { ...(nextTarget.colorQtyByColor || {}) }
            const add = parseOrderItemQty(sourceLine.quantity ?? '0')
            const sc = (sourceLine.color || '').trim()
            const key =
                nextTarget.colorChoices.find((c) => normalizeModelKey(String(c)) === normalizeModelKey(sc)) ||
                nextTarget.colorChoices[0]
            if (key && add) {
                tq[key] = String(parseOrderItemQty(tq[key] ?? '0') + add)
            }
            nextTarget = { ...nextTarget, colorQtyByColor: tq, local_note: noteMerged }
        }
    } else if (sourceMatrix && productMulti) {
        nextTarget = {
            ...target,
            colorChoices: [...colorOpts],
            colorQtyByColor: seedColorQtyForMatrix(target, colorOpts),
            quantity: '0',
            color: '',
            product_id: product.id,
            product_name: displayProductName(product),
            product_price: Number(product.sale_price) || 0,
            image_url: product.image_url || target.image_url || ''
        }
        nextTarget = mergeSourceMatrixInto(nextTarget)
    } else if (sourceMatrix && !productMulti) {
        let sum = 0
        for (const c of sourceLine.colorChoices || []) {
            sum += parseOrderItemQty(sourceLine.colorQtyByColor?.[c] ?? '0')
        }
        const qt = parseOrderItemQty(nextTarget.quantity ?? '0')
        nextTarget = { ...nextTarget, quantity: String(qt + sum), local_note: noteMerged }
    } else {
        const qt = parseOrderItemQty(nextTarget.quantity ?? '0')
        const qs = parseOrderItemQty(sourceLine.quantity ?? '0')
        nextTarget = { ...nextTarget, quantity: String(qt + qs), local_note: noteMerged }
    }

    const rest = orderLines
        .filter((l) => l.id !== sourceLine.id)
        .map((l) => (l.id === targetId ? nextTarget : l))
    return rest.length ? rest : [createEmptyOrderLine()]
}

/** Bir xil `id` bilan kelgan qatorlarni bitta qilib oladi (API/join dublikatlari) */
export function dedupeOrderItemsById(orderItems) {
    if (!orderItems?.length) return []
    const seen = new Set()
    const out = []
    for (const oi of orderItems) {
        const id = oi?.id
        if (id != null && id !== '') {
            const key = String(id)
            if (seen.has(key)) continue
            seen.add(key)
        }
        out.push(oi)
    }
    return out
}

/** Ko‘p rangli matritsa: DB yoki forma ma’lumotini `colorChoices` kalitlariga joylaydi. */
export function seedColorQtyForMatrix(line, colorOpts) {
    const out = {}
    const existing =
        line.colorQtyByColor && typeof line.colorQtyByColor === 'object' ? line.colorQtyByColor : {}
    const qtyMain = parseOrderItemQty(line.quantity ?? '0')
    const lineColor = (line.color || '').trim()
    const lineColorNorm = normalizeModelKey(lineColor)
    for (const c of colorOpts) {
        const cn = normalizeModelKey(c)
        if (existing[c] != null && String(existing[c]).trim() !== '') {
            out[c] = String(existing[c])
            continue
        }
        let fromExisting = null
        for (const [k, v] of Object.entries(existing)) {
            if (normalizeModelKey(String(k)) === cn) {
                fromExisting = v
                break
            }
        }
        if (fromExisting != null && String(fromExisting).trim() !== '') {
            out[c] = String(fromExisting)
            continue
        }
        if (lineColorNorm && cn === lineColorNorm) {
            out[c] = String(qtyMain)
            continue
        }
        out[c] = '0'
    }
    return out
}

/** Bitta `order_items` qatorini forma strukturasiga */
export function orderItemToFormLine(oi, productsList) {
    const prod = oi?.product_id ? productsList.find((p) => String(p.id) === String(oi.product_id)) : null
    const savedPrice = oi.price != null ? Number(oi.price) : NaN
    const catalogPrice = prod ? Number(prod.sale_price) || 0 : 0
    const product_price = Number.isFinite(savedPrice) ? Math.round(savedPrice * 100) / 100 : catalogPrice
    const sizeStr = resolvedOrderItemSizeRaw(oi, productsList) || ''
    const qtyOne = parseOrderItemQty(oi.quantity) || 1
    const colorOpts = prod ? normalizeColorsArray(prod) : []

    if (colorOpts.length > 1) {
        const base = {
            ...createEmptyOrderLine(),
            id: `line_db_${oi.id}`,
            codeInput: sizeStr,
            quantity: '1',
            product_id: oi.product_id || null,
            product_name: (oi.product_name || displayProductName(prod) || '').trim() || 'Mahsulot',
            product_price,
            color: '',
            image_url: oi.image_url || prod?.image_url || '',
            local_note: String(oi.line_note || '').trim(),
            resolveError: '',
            variants: [],
            colorChoices: colorOpts,
            colorQtyByColor: seedColorQtyForMatrix(
                {
                    color: (oi.color || '').trim() || (prod?.color ? String(prod.color) : ''),
                    quantity: String(qtyOne),
                    colorQtyByColor: {}
                },
                colorOpts
            ),
            readyForSort: true
        }
        return base
    }

    return {
        ...createEmptyOrderLine(),
        id: `line_db_${oi.id}`,
        codeInput: sizeStr,
        quantity: String(qtyOne),
        product_id: oi.product_id || null,
        product_name: (oi.product_name || displayProductName(prod) || '').trim() || 'Mahsulot',
        product_price,
        color: (oi.color || '').trim() || (prod?.color ? String(prod.color) : ''),
        image_url: oi.image_url || prod?.image_url || '',
        local_note: String(oi.line_note || '').trim(),
        resolveError: '',
        variants: [],
        colorChoices: [],
        colorQtyByColor: {},
        readyForSort: true
    }
}

/** Bazadagi `order_items` → forma qatorlari (bir SKU — bir qator; bir nechta rang — matritsa) */
export function orderItemsToOrderLines(orderItems, productsList) {
    const items = normalizeOrderItemsForList(orderItems || [])
    if (!items.length) return [createEmptyOrderLine()]

    const buckets = new Map()
    for (const oi of items) {
        const key = skuBucketKeyForOrderItem(oi, productsList)
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(oi)
    }

    const out = []
    for (const group of buckets.values()) {
        group.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
        const first = group[0]
        const prod = first.product_id ? productsList.find((p) => String(p.id) === String(first.product_id)) : null

        if (group.length === 1) {
            out.push(orderItemToFormLine(first, productsList))
            continue
        }

        const savedPrice = first.price != null ? Number(first.price) : NaN
        const catalogPrice = prod ? Number(prod.sale_price) || 0 : 0
        const product_price = Number.isFinite(savedPrice) ? Math.round(savedPrice * 100) / 100 : catalogPrice
        const sizeStr = resolvedOrderItemSizeRaw(first, productsList) || ''

        /** Bir xil rang (turli yozuv) bitta kalitda — miqdorlar qo‘shiladi, takroriy ustunlar bo‘lmaydi */
        const byColorNorm = new Map()
        for (const oi of group) {
            const raw = (oi.color || '').trim() || '—'
            const nk = normalizeModelKey(raw)
            const q = parseOrderItemQty(oi.quantity)
            const prev = byColorNorm.get(nk)
            if (prev) {
                prev.qty += q
            } else {
                byColorNorm.set(nk, { label: raw, qty: q })
            }
        }
        const colorOpts = []
        const colorQtyByColor = {}
        let totalPiecesMerged = 0
        for (const { label, qty } of byColorNorm.values()) {
            colorOpts.push(label)
            colorQtyByColor[label] = String(qty)
            totalPiecesMerged += qty
        }
        /** Bitta rang (colorChoices.length === 1) bo‘lsa ham `isMatrix` false — yig‘indi faqat `quantity` maydonida */
        const qtyForSingleRow =
            colorOpts.length === 1 ? String(Math.max(0, totalPiecesMerged)) : '1'
        const singleColorDisplay = colorOpts.length === 1 ? colorOpts[0] : ''
        const lineNoteMerged = [...new Set(group.map((x) => String(x.line_note || '').trim()).filter(Boolean))].join(
            '; '
        )

        out.push({
            ...createEmptyOrderLine(),
            id: `line_db_${first.id}`,
            codeInput: sizeStr,
            quantity: qtyForSingleRow,
            product_id: first.product_id || null,
            product_name: (first.product_name || displayProductName(prod) || '').trim() || 'Mahsulot',
            product_price,
            color: singleColorDisplay,
            image_url: first.image_url || prod?.image_url || '',
            local_note: lineNoteMerged,
            resolveError: '',
            variants: [],
            colorChoices: colorOpts,
            colorQtyByColor,
            readyForSort: true
        })
    }
    return out.length ? out : [createEmptyOrderLine()]
}

/** Dona/rang bo‘yicha forma qatorining jami summasi */
export function computeOrderLineSubtotal(line) {
    if (!line?.product_id) return 0
    const pr = Number(line.product_price) || 0
    const matrix = (line.colorChoices?.length || 0) > 1
    if (matrix) {
        let rowSum = 0
        for (const c of line.colorChoices) {
            const q = parseOrderItemQty(line.colorQtyByColor?.[c] ?? '0')
            rowSum += pr * q
        }
        return rowSum
    }
    const q = parseOrderItemQty(line.quantity ?? '0')
    return pr * q
}

/** Forma qatorlari yig‘indisi */
export function computeOrderLinesSubtotal(orderLines) {
    if (!orderLines?.length) return 0
    return orderLines.reduce((s, line) => s + computeOrderLineSubtotal(line), 0)
}

/**
 * Bir nechta buyurtmani birlashtirish: umumiy summa = har bir buyurtmaning `orders.total` yig‘indisi;
 * jami dona = har bir buyurtmadagi `order_items` miqdorlari yig‘indisining yig‘indisi (qatorlarni qayta narxlamaasdan).
 */
export function aggregateMergedOrdersTotals(ordersToMerge, itemRows) {
    const subtotal = Math.round(ordersToMerge.reduce((acc, o) => acc + (Number(o.total) || 0), 0) * 100) / 100
    const byOrder = new Map()
    for (const oi of itemRows || []) {
        const oid = oi?.order_id
        if (oid == null || oid === '') continue
        const k = String(oid)
        byOrder.set(k, (byOrder.get(k) || 0) + parseOrderItemQty(oi.quantity))
    }
    let totalQty = 0
    for (const o of ordersToMerge) {
        totalQty += byOrder.get(String(o.id)) || 0
    }
    return { subtotal, totalQty }
}

export function orderCategoryLabels(order, uncategorizedLabel = '—') {
    const items = dedupeOrderItemsKeepNewest(order?.order_items || [], [])
    const labels = new Set()
    for (const oi of items) {
        const cat = oi?.products?.categories
        const name = (cat?.name_uz || cat?.name || '').trim()
        labels.add(name || uncategorizedLabel)
    }
    return Array.from(labels)
}

export function filterOrderItemsByCategoryLabel(orderItems, categoryLabel, uncategorizedLabel = '—') {
    const target = (categoryLabel || '').trim()
    if (!target || target === 'all') return orderItems || []
    return (orderItems || []).filter((oi) => {
        const cat = oi?.products?.categories
        const name = (cat?.name_uz || cat?.name || '').trim() || uncategorizedLabel
        return name === target
    })
}

/**
 * Yangi buyurtma jadvali: «Tayyor» bergan qatorlar kategoriya bo‘yicha; qolganlari (kod bo‘sh yoki tayyor emas) pastda.
 */
export function buildOrderFormTableRows(orderLines, products, language, uncategorizedLabel) {
    const lines = orderLines || []
    const draft = []
    const resolved = []
    lines.forEach((line, idx) => {
        if (isLineCommittedToSortOrder(line)) {
            resolved.push({ line, origIdx: idx })
        } else {
            draft.push({ line, origIdx: idx })
        }
    })
    draft.sort((a, b) => a.origIdx - b.origIdx)
    const resolvedEnriched = resolved.map(({ line, origIdx }) => {
        const prod = products.find((p) => String(p.id) === String(line.product_id))
        const catLab = categoryLabelFromProduct(prod, language)
        const displayCat = catLab || uncategorizedLabel || '—'
        const catKey = (catLab || '__none__').toLowerCase()
        const code = (line.codeInput || '').trim() || (prod?.size != null && String(prod.size).trim() !== '' ? String(prod.size) : '')
        return { line, origIdx, prod, catLab, displayCat, catKey, code }
    })
    resolvedEnriched.sort((a, b) => {
        const c = a.catKey.localeCompare(b.catKey, 'uz')
        if (c !== 0) return c
        return naturalCompareModelCode(a.code, b.code)
    })
    const out = []
    let currentCat = null
    let catSum = 0
    for (const r of resolvedEnriched) {
        if (currentCat !== r.catKey) {
            if (currentCat !== null) {
                out.push({
                    type: 'catSubtotal',
                    categoryKey: currentCat,
                    amount: catSum,
                    key: `sub_${currentCat}_${out.length}`
                })
                catSum = 0
            }
            out.push({
                type: 'catHeader',
                label: r.displayCat,
                categoryKey: r.catKey,
                key: `hdr_${r.catKey}_${out.length}`
            })
            currentCat = r.catKey
        }
        catSum += computeOrderLineSubtotal(r.line)
        out.push({ type: 'line', line: r.line, key: `line_${r.line.id}` })
    }
    if (currentCat !== null) {
        out.push({
            type: 'catSubtotal',
            categoryKey: currentCat,
            amount: catSum,
            key: `sub_${currentCat}_final`
        })
    }
    draft.forEach(({ line }) => {
        out.push({ type: 'line', line, key: `line_${line.id}` })
    })
    return out
}
