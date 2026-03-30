'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification } from '@/utils/telegram'
import Header from '@/components/Header'
import {
    Plus,
    Trash2,
    Save,
    X,
    Search,
    Filter,
    ShoppingCart,
    Clock,
    CheckCircle,
    FileText,
    List,
    Receipt,
    Repeat,
    Download,
    ScanLine,
    GitMerge,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Edit,
    Archive,
    RotateCcw,
} from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { isDeletedAtMissingError } from '@/lib/orderTrash'

function escapeHtml(s) {
    if (s == null) return ''
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function formatUsd(amount) {
    const n = Number(amount)
    if (!Number.isFinite(n)) return '0'
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** Buyurtma qatoridagi miqdor/narx — chop etish va yig‘indilarda satr qo‘shilishini oldini olish uchun */
function parseOrderItemQty(v) {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.floor(n)
}

function parseOrderItemPrice(v) {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/** PostgREST: line_index yo‘q yoki categories bog‘lanishi bo‘lmasa so‘rov yiqiladi */
function isSchemaOrEmbedError(err) {
    const m = String(err?.message || err?.code || err || '')
    return /line_index|categories|schema cache|column|does not exist|42703|PGRST/i.test(m)
}

const ORDERS_SELECT_FALLBACKS = [
    `*,
  customers (id, name, phone),
  order_items (
    *,
    products (id, name, size, category_id, categories (id, name, name_uz))
  )`,
    `*,
  customers (id, name, phone),
  order_items (
    *,
    products (id, name, size, category_id)
  )`,
    `*,
  customers (id, name, phone),
  order_items (
    *,
    products (id, name, size)
  )`,
    `*,
  customers (id, name, phone),
  order_items (*)
`,
]

async function fetchOrdersPageWithFallback(options = {}) {
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

async function fetchDeletedOrdersPageWithFallback() {
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
    { select: `*, products (id, name, size, category_id, categories (id, name, name_uz))`, order: 'line_index' },
    { select: `*, products (id, name, size, category_id, categories (id, name, name_uz))`, order: 'created_at' },
    { select: `*, products (id, name, size, category_id)`, order: 'created_at' },
    { select: `*, products (id, name, size)`, order: 'created_at' },
    { select: '*', order: 'created_at' },
]

async function fetchOrderItemsForOrderId(orderId) {
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

const ORDER_ITEMS_FOR_PRINT_LIST_FALLBACKS = [
    { select: `*, products (id, name, size, category_id, categories (id, name, name_uz))`, order: 'line_index' },
    { select: `*, products (id, name, size, category_id, categories (id, name, name_uz))`, order: 'created_at' },
    { select: `*, products (id, name, size, category_id)`, order: 'created_at' },
    { select: `*, products (id, name, size)`, order: 'created_at' },
    { select: '*', order: 'created_at' },
]

async function fetchOrderItemsForOrderIds(orderIds) {
    if (!orderIds?.length) return { data: [], error: null }
    for (const cfg of ORDER_ITEMS_FOR_PRINT_LIST_FALLBACKS) {
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
function normalizeModelKey(s) {
    return String(s || '')
        .trim()
        .normalize('NFKC')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/\s+/g, ' ')
        .toLowerCase()
}

/** Supabase qatorida ko‘rinadigan nom (asosiy nom bo‘sh bo‘lsa — lokalizatsiya) */
function displayProductName(p) {
    if (!p) return ''
    return (
        (p.name && String(p.name).trim()) ||
        (p.name_uz && String(p.name_uz).trim()) ||
        (p.name_ru && String(p.name_ru).trim()) ||
        (p.name_en && String(p.name_en).trim()) ||
        'Mahsulot'
    )
}

function productNameFields(p) {
    return [p?.name, p?.name_uz, p?.name_ru, p?.name_en].filter((x) => x != null && String(x).trim() !== '')
}

function productDescriptionFields(p) {
    return [p?.description, p?.description_uz, p?.description_ru, p?.description_en].filter(
        (x) => x != null && String(x).trim() !== ''
    )
}

/** CRMda ranglar ko‘pincha `colors` massivida (bitta qator) */
function normalizeColorsArray(p) {
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
 * `product_colors` qatori bo‘yicha joriy tilda rang nomi (Mahsulotlar bilan bir xil mantiq).
 * `canonicalName` — mahsulotda saqlangan kalit (odatda `product_colors.name`).
 */
function labelColorCanonical(canonicalName, productColors, language) {
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
function expandOrderLineForSubmit(line) {
    if (!line?.product_id) return []
    const pr = Number(line.product_price) || 0
    const img = line.image_url || ''
    const name = line.product_name || ''
    if (line.colorChoices?.length > 1) {
        /** Bir xil rang kaliti (takrorlangan `colorChoices` yoki yozuv farqi) bitta DB qatorida yig‘iladi */
        const byNorm = new Map()
        for (const c of line.colorChoices) {
            const q = parseInt(String(line.colorQtyByColor?.[c] ?? '0'), 10) || 0
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
                image_url: img
            })
        }
        return rows
    }
    const q = parseInt(String(line.quantity ?? '0'), 10) || 0
    if (q <= 0) return []
    return [
        {
            codeInput: line.codeInput,
            product_id: line.product_id,
            product_name: name,
            product_price: pr,
            color: line.color || '',
            quantity: String(q),
            image_url: img
        }
    ]
}

const LS_LAST_ORDER = 'crm_last_order_v1'
/** Yangi buyurtma formasi — boshqa bo‘limga o‘tganda yo‘qolmasin */
const SESSION_NEW_ORDER_DRAFT = 'crm_new_order_draft_v1'

function saveNewOrderDraft(form, orderLines) {
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

function loadNewOrderDraft() {
    try {
        const raw = sessionStorage.getItem(SESSION_NEW_ORDER_DRAFT)
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function clearNewOrderDraft() {
    try {
        sessionStorage.removeItem(SESSION_NEW_ORDER_DRAFT)
    } catch (e) {
        /* ignore */
    }
}

function draftHasMeaningfulContent(d) {
    if (!d?.orderLines?.length) return false
    const anyLine = d.orderLines.some((l) => (l.codeInput && l.codeInput.trim()) || l.product_id)
    const formBusy =
        (d.form?.customer_name || '').trim() ||
        (d.form?.customer_phone || '').trim() ||
        (d.form?.note || '').trim()
    return anyLine || !!formBusy
}

function generateDisplayOrderNumber() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `ORD-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function exportOrdersToCsv(rows, filename) {
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
 * `productsList` berilsa, bo‘sh `size` katalogdagi kod bilan to‘ldiriladi — aks holda bir xil mahsulot
 * `pid:…:nosz` va `pid:…:sz:…` ga tushib, forma/yig‘indida ikki marta sanalardi (birlashtirish).
 */
function skuBucketKeyForOrderItem(oi, productsList) {
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
 * Bir xil (product_id + size + rang) uchun bazada 2 ta qator bo‘lsa (takrorlanish xatosi),
 * eng yangi qatorni qoldiramiz — aks holda tahrir qayta ochilganda eski (birinchi) qator ko‘rinadi.
 * `created_at` bo‘lmasa `id` bo‘yicha teskari tartib (UUID uchun taxminiy).
 */
function dedupeOrderItemsKeepNewest(rows) {
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
    for (const oi of sorted) {
        const pid = String(oi.product_id ?? '')
        const sz = normalizeModelKey(oi.size != null ? String(oi.size) : '')
        const col = normalizeModelKey(oi.color != null ? String(oi.color) : '')
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

/** Saqlashdan oldin: bitta rang uchun takrorlangan yig‘ilgan qatorlarni bitta qilib qo‘shadi */
function mergeExpandedRowsForSubmit(rows) {
    if (!rows?.length) return []
    const map = new Map()
    for (const r of rows) {
        const pid = String(r.product_id ?? '')
        const col = normalizeModelKey(r.color != null ? String(r.color) : '')
        const code = normalizeModelKey(r.codeInput != null ? String(r.codeInput) : '')
        const key = `${pid}|${col}|${code}`
        const q = parseOrderItemQty(r.quantity)
        const prev = map.get(key)
        if (!prev) {
            map.set(key, { ...r, quantity: String(q) })
            continue
        }
        const pq = parseOrderItemQty(prev.quantity)
        map.set(key, { ...prev, quantity: String(pq + q) })
    }
    return Array.from(map.values())
}

/**
 * Bazaga insertdan oldin: bir xil mahsulot + model kodi (size) + rang — bitta `order_items` qatori.
 * Tahrirda `mergeExpandedRowsForSubmit` va `makeItemPayloads` orasidagi nomuvofiqlik yoki takroriy
 * qatorlar natijasida dublikat qatorlarning oldini oladi.
 */
function mergeOrderItemPayloadsForDb(payloads) {
    if (!payloads?.length) return []
    const map = new Map()
    for (const p of payloads) {
        const pid = String(p.product_id ?? '')
        const sz = normalizeModelKey(p.size != null ? String(p.size) : '')
        const col = normalizeModelKey(p.color != null ? String(p.color) : '')
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
                subtotal: sumMoney
            })
        }
    }
    return Array.from(map.values()).map((row, idx) => ({
        ...row,
        line_index: idx
    }))
}

/**
 * `order_items.size` bo‘sh bo‘lsa — mahsulot katalogidagi kod (makeItemPayloads / tahrir bilan mos).
 * Aks holda birlashtirishda bir xil mahsulot turli kalitga tushib, keyin jadvalda miqdor 2x bo‘lardi.
 */
function resolvedOrderItemSizeRaw(oi, productsList) {
    const s = oi?.size != null ? String(oi.size).trim() : ''
    if (s) return s
    const emb = oi?.products
    if (emb && typeof emb === 'object' && emb.size != null && String(emb.size).trim() !== '') {
        return String(emb.size).trim()
    }
    const p =
        oi?.product_id && productsList?.length
            ? productsList.find((x) => String(x.id) === String(oi.product_id))
            : null
    if (p?.size != null && String(p.size).trim() !== '') return String(p.size).trim()
    return ''
}

/** Model kodi bo‘yicha natural tartib (A-2 dan keyin A-10). */
function naturalCompareModelCode(a, b) {
    const sa = a != null ? String(a) : ''
    const sb = b != null ? String(b) : ''
    return sa.localeCompare(sb, 'uz', { numeric: true, sensitivity: 'base' })
}

function minLineIndexInBucket(lines) {
    if (!lines?.length) return 0
    return Math.min(...lines.map((l) => Number(l.line_index ?? 0)))
}

/** Chop etish: bir SKU (product_id + model kodi/size) — bitta qator; rang/miqdor faqat shu qopqichdagi qatorlardan.
 *  Har bir `order_item` faqat bitta kalitga tushadi — boshqa mahsulotlarning ranglari takrorlanmaydi. */
function groupOrderItemsForPrint(orderItems, productsList) {
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
        /** Har bir `order_items` qatori bo‘yicha aniq yig‘indi (bazadagi subtotal emas — noto‘g‘ri bo‘lmasin) */
        let sumQtyFromLines = 0
        for (const oi of lines) {
            const c = (oi.color || '').trim() || '—'
            const q = parseOrderItemQty(oi.quantity)
            sumQtyFromLines += q
            const prev = parseOrderItemQty(colorMap.get(c))
            colorMap.set(c, prev + q)
            const pr = parseOrderItemPrice(oi.price)
            lineMonetary += pr * q
        }
        const colorPairs = Array.from(colorMap.entries()).map(([col, qq]) => [col, parseOrderItemQty(qq)])
        const totalPiecesFromColors = colorPairs.reduce((s, [, qq]) => s + qq, 0)
        const totalPieces = totalPiecesFromColors === sumQtyFromLines ? totalPiecesFromColors : sumQtyFromLines
        lineMonetary = Math.round(lineMonetary * 100) / 100
        const lineMonetaryFinal = lineMonetary
        const unitPrice =
            totalPieces > 0 ? Math.round((lineMonetaryFinal / totalPieces) * 100) / 100 : parseOrderItemPrice(first.price)
        return {
            product_name: first.product_name || first.products?.name || '-',
            size: resolvedOrderItemSizeRaw(first, productsList || []) || first.size,
            image_url: first.image_url,
            lines,
            colorPairs,
            totalPieces,
            lineMonetary: lineMonetaryFinal,
            unitPrice
        }
    })
}

/** Kategoriya nomi (chop etish) — mahsulotdan */
function categoryLabelFromGroupedLine(firstOi) {
    const cat = firstOi?.products?.categories
    if (cat && typeof cat === 'object') {
        const n = (cat.name_uz || cat.name || '').trim()
        if (n) return n
    }
    return ''
}

/** Forma jadvali: mahsulot qatoridan kategoriya matni (tilga qarab) */
function categoryLabelFromProduct(product, language) {
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

/**
 * Guruhlar: avvalo kategoriya (nom bo‘yicha), ichida model kodi (natural), so‘ng forma tartibi (line_index).
 */
function sortGroupedBucketsForPrint(grouped) {
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
function buildColorQtyStacksHtml(colorPairs, labelColorFn) {
    const label = typeof labelColorFn === 'function' ? labelColorFn : (c) => c
    const pairs = Array.isArray(colorPairs) ? colorPairs.map(([c, q]) => [c, q]) : []
    const colorsHtml = pairs
        .map(([c]) => `<div class="stack-line">${escapeHtml(label(c))}</div>`)
        .join('')
    const qtysHtml = pairs
        .map(([, q]) => `<div class="stack-line">${escapeHtml(String(q))}</div>`)
        .join('')
    return { colorsHtml, qtysHtml }
}

function buildOrderBlockHtml(item, showPrices, labelColorFn, productsList) {
    const customerName = escapeHtml(item.customer_name || item.customers?.name || 'Noma\'lum')
    const phone = escapeHtml(item.customer_phone || item.customers?.phone || '-')
    const date = escapeHtml(new Date(item.created_at).toLocaleDateString())
    const shortId = escapeHtml(String(item.id).slice(0, 8))
    const orderNumHtml = item.order_number
        ? `<strong>№</strong> ${escapeHtml(String(item.order_number))}<br>`
        : ''
    const groupedRaw = groupOrderItemsForPrint(dedupeOrderItemsKeepNewest(item.order_items || []), productsList)
    const grouped = sortGroupedBucketsForPrint(groupedRaw)
    const colSpanAll = showPrices ? 8 : 6

    function oneDataRowHtml(g, displayIndex) {
        const sku = escapeHtml(g.size != null && g.size !== '' ? String(g.size) : '—')
        const imgHtml = g.image_url
            ? `<img class="prod-thumb" src="${escapeHtml(g.image_url)}" alt="">`
            : ''
        const { colorsHtml, qtysHtml } = buildColorQtyStacksHtml(g.colorPairs, labelColorFn)
        const priceCells = showPrices
            ? `<td class="mono">$${escapeHtml(formatUsd(g.unitPrice))}</td><td class="mono">$${escapeHtml(formatUsd(g.lineMonetary))}</td>`
            : ''
        return `<tr>
                <td>${displayIndex}</td>
                <td class="prod-img-cell">${imgHtml ? `<div class="prod-thumb-wrap">${imgHtml}</div>` : '<span class="prod-no-img">—</span>'}</td>
                <td class="mono">${sku}</td>
                <td class="colors-stack">${colorsHtml}</td>
                <td class="qty-stack mono">${qtysHtml}</td>
                <td class="mono">${g.totalPieces}</td>
                ${priceCells}
            </tr>`
    }

    const hasCategoryMeta = grouped.some((g) => Boolean(categoryLabelFromGroupedLine(g.lines[0])))
    let rowHtml = ''
    let rowNum = 1
    if (!hasCategoryMeta) {
        rowHtml = grouped.map((g) => oneDataRowHtml(g, rowNum++)).join('')
    } else {
        let currentKey = null
        let secPieces = 0
        let secMoney = 0
        const catKey = (g) => {
            const lab = categoryLabelFromGroupedLine(g.lines[0])
            return lab || '__none__'
        }
        for (const g of grouped) {
            const key = catKey(g)
            if (currentKey !== null && key !== currentKey) {
                const priceCells = showPrices
                    ? `<td class="mono totals-td totals-empty"></td><td class="mono totals-td">$${escapeHtml(formatUsd(secMoney))}</td>`
                    : ''
                rowHtml += `<tr class="cat-subtotal-row"><td colspan="5" style="text-align:right;font-weight:700;background:#eef2ff">Kategoriya jami</td><td class="mono">${secPieces}</td>${priceCells}</tr>`
                secPieces = 0
                secMoney = 0
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
            const priceCells = showPrices
                ? `<td class="mono totals-td totals-empty"></td><td class="mono totals-td">$${escapeHtml(formatUsd(secMoney))}</td>`
                : ''
            rowHtml += `<tr class="cat-subtotal-row"><td colspan="5" style="text-align:right;font-weight:700;background:#eef2ff">Kategoriya jami</td><td class="mono">${secPieces}</td>${priceCells}</tr>`
        }
    }
    const totalPar = grouped.reduce((s, g) => (Number(s) || 0) + (Number(g.totalPieces) || 0), 0)
    const totalMoney = grouped.reduce((s, g) => (Number(s) || 0) + (Number(g.lineMonetary) || 0), 0)
    const savedTotalRaw = item.total != null && item.total !== '' ? Number(item.total) : NaN
    const savedTotal = Number.isFinite(savedTotalRaw) ? savedTotalRaw : null
    /** Chop etishda ko‘rsatiladigan yig‘indi: saqlangan buyurtma summasi (bo‘lmasa qatorlar yig‘indisi) */
    const grandTotal = savedTotal != null ? savedTotal : totalMoney
    const footerPriceCells = showPrices
        ? `<td class="mono totals-td totals-empty"></td><td class="mono totals-td">$${escapeHtml(formatUsd(grandTotal))}</td>`
        : ''
    const footerRow = `<tr class="totals-row">
        <td class="totals-label" colspan="5">Jami</td>
        <td class="mono totals-td">${totalPar}</td>
        ${footerPriceCells}
      </tr>`
    const theadPrice = showPrices ? '<th class="th-narrow">1 par</th><th class="th-narrow">Qator</th>' : ''
    /* Jami alohida jadvalda: asosiy jadval sahifalanganda brauzer tbody oxiridagi qatorni 1-sahifaga "yopishtirmasligi" uchun */
    return `
    <div class="order-block">
      <div class="info">
        <div><strong>Mijoz:</strong> ${customerName}<br><strong>Tel:</strong> ${phone}</div>
        <div style="text-align:right"><strong>Sana:</strong> ${date}<br>${orderNumHtml}<strong>ID:</strong> #${shortId}</div>
      </div>
      <table class="items-table">
        <thead><tr><th>#</th><th>Rasm</th><th>Kod</th><th class="th-rang">Rang</th><th class="th-miqdor">Miqdor</th><th>Jami par</th>${theadPrice}</tr></thead>
        <tbody>${rowHtml}</tbody>
      </table>
      <table class="items-table order-totals-table">
        <tbody>${footerRow}</tbody>
      </table>
      ${
          showPrices
              ? `<p class="print-order-totals-check" style="font-size:0.82rem;color:#555;margin-top:10px;line-height:1.4"><strong>Buyurtma jami:</strong> $${escapeHtml(
                    formatUsd(grandTotal)
                )}</p>`
              : ''
      }
    </div>`
}

function buildPrintDocumentHtml({ documentTitle, listTitle, orders, showPrices, labelColorFn, productsList }) {
    const blocks = orders
        .map((o) => buildOrderBlockHtml(o, showPrices, labelColorFn, productsList))
        .join('<div class="page-break"></div>')
    const listBanner = listTitle ? `<p class="list-banner">${escapeHtml(listTitle)}</p>` : ''
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title>
    <style>
      body{font-family:sans-serif;padding:40px;color:#333}
      .header{margin-bottom:24px;border-bottom:2px solid #eee;padding-bottom:16px}
      .header h1{margin:0;color:#1a1a1a;font-size:1.25rem}
      .list-banner{color:#555;font-size:0.95rem;margin-bottom:16px}
      .order-block{margin-bottom:24px}
      .info{display:flex;justify-content:space-between;margin-bottom:20px}
      table.items-table{width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #8c8c8c;box-shadow:0 1px 2px rgba(0,0,0,.06)}
      .order-block table.items-table:not(.order-totals-table){margin-bottom:0}
      table.items-table thead{display:table-header-group}
      table.items-table th{background:#ffeb9c;color:#1a1a1a;text-align:left;padding:8px 6px;border:1px solid #c9a227;font-size:0.82rem;font-weight:700}
      table.items-table th.th-narrow{white-space:nowrap}
      table.items-table th.th-rang{background:#fff2cc}
      table.items-table th.th-miqdor{background:#e2efda}
      table.items-table td{padding:8px 6px;border:1px solid #b4b4b4;vertical-align:top}
      table.items-table tbody tr{page-break-inside:avoid}
      table.items-table tbody tr:nth-child(odd) td{background:#fffef7}
      table.items-table tbody tr:nth-child(even) td{background:#e7f3ff}
      table.items-table tbody tr:nth-child(even) td.colors-stack{background:#f5fbff}
      table.items-table tbody tr:nth-child(even) td.qty-stack{background:#eef7f0}
      table.items-table tbody tr:nth-child(odd) td.colors-stack{background:#fffdf0}
      table.items-table tbody tr:nth-child(odd) td.qty-stack{background:#f7fdf5}
      /* Jami alohida jadvalda — chop etishda umumiy summa barcha qatorlardan keyin (oxirgi sahifada) */
      table.order-totals-table{width:100%;margin-top:-1px;margin-bottom:16px;page-break-inside:avoid}
      table.order-totals-table .totals-row td{background:#d9e1f2!important;border-top:2px solid #4472c4;font-weight:700;font-size:0.88rem}
      table.order-totals-table .totals-label{text-align:right;padding:10px 8px;color:#1a1a1a}
      table.order-totals-table .totals-td{text-align:right;vertical-align:middle}
      table.order-totals-table .totals-empty{color:#999;font-weight:400}
      tr.cat-header-row td{background:#e2efda!important;border:1px solid #92c47c!important}
      tr.cat-subtotal-row td{background:#eef2ff!important;border:1px solid #9ca3af!important}
      .mono{font-variant-numeric:tabular-nums}
      .colors-stack{min-width:6.5rem;max-width:13rem;vertical-align:top;font-size:0.88rem;line-height:1.35}
      .qty-stack{min-width:3rem;text-align:right;vertical-align:top;font-size:0.88rem;line-height:1.35}
      .colors-stack .stack-line,.qty-stack .stack-line{padding:2px 0;line-height:1.35;min-height:1.25em;font-size:0.85rem}
      .qty-stack .stack-line{font-weight:600}
      /* Rasm: zebra fonini kesmasin — oq maydon; biroz kattaroq */
      /* Rasm ustuni qat’iy kenglik — jadval “yoyilib” ketmasin */
      .prod-img-cell{width:96px;max-width:96px;min-width:96px;text-align:center;vertical-align:middle;padding:4px!important;overflow:hidden;background:#fff!important}
      .prod-thumb-wrap{max-width:100%;max-height:92px;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff}
      .prod-thumb{max-width:88px;max-height:88px;width:auto;height:auto;object-fit:contain;object-position:center;vertical-align:middle;border-radius:6px;display:block;background:transparent;mix-blend-mode:multiply}
      .prod-no-img{color:#999;font-size:0.85rem}
      .page-break{page-break-after:always;border:none;margin:24px 0;padding:0;height:0;overflow:hidden}
      .footer{margin-top:32px;text-align:center;color:#666;font-size:0.8em;border-top:1px solid #eee;padding-top:16px}
      @media print{
        body{padding:16px 24px}
        .footer{page-break-inside:avoid}
        table.items-table th,table.items-table td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }
    </style></head><body>
    <div class="header"><h1>NUUR_HOME_COLLECTION</h1></div>
    ${listBanner}
    ${blocks}
    <div class="footer">Nuur_Home_Collection<br>Xaridingiz uchun rahmat!</div>
    <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
    </body></html>`
}

function openPrintTab(html) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return false
    printWindow.document.write(html)
    printWindow.document.close()
    return true
}

/** Supabase `orders_source_check`: do'kon | website | telefon (schema: DATABASE_SCHEMA.md) */
const SOURCE_STORE_DB = "do'kon"

function normalizeSourceForDb(uiSource) {
    if (uiSource === 'website' || uiSource === 'telefon') return uiSource
    if (uiSource === 'dokon' || uiSource === 'admin') return SOURCE_STORE_DB
    return SOURCE_STORE_DB
}

function normalizeSourceForForm(dbSource) {
    if (dbSource === 'website') return 'website'
    if (dbSource === 'telefon') return 'telefon'
    if (
        dbSource === SOURCE_STORE_DB ||
        dbSource === 'dokon' ||
        dbSource === 'admin' ||
        dbSource == null ||
        dbSource === ''
    ) {
        return 'dokon'
    }
    return 'dokon'
}

/** Bazadagi turli status yozuvlarini jadvaldagi select uchun inglizcha qiymatga */
function normalizeStatusForSelect(status) {
    if (status == null || status === '') return 'new'
    const s = String(status).toLowerCase().trim()
    if (s === 'new' || s === 'yangi') return 'new'
    if (s === 'pending' || s === 'jarayonda') return 'pending'
    if (s === 'completed' || s === 'tugallandi' || s === 'tugallangan') return 'completed'
    if (s === 'cancelled' || s === 'bekor qilingan' || s === 'bekor qilindi') return 'cancelled'
    return 'new'
}

/** CRM buyurtmalar ro‘yxatida mahsulotlar ustuni: dastlab faqat shuncha pozitsiya (qolgani «Barchasini ko‘rish») */
const ORDER_LIST_ITEMS_PREVIEW = 1

function createEmptyOrderLine() {
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
        /** `true` — qator kategoriya bo‘yicha tartiblangan blokda; `false` — «Tayyor»gacha pastda qoladi */
        readyForSort: false,
        /** Bir xil model kodi, turli rang/narx — turli `products` qatorlari */
        variants: [],
        /** Bir qatorda `colors` massivi — rang tanlash */
        colorChoices: [],
        /** Ko‘p rang: har bir rang uchun miqdor (0 = shu rangdan yo‘q) */
        colorQtyByColor: {}
    }
}

/** Kategoriya bo‘yicha surilish: `readyForSort === false` aniq bo‘lsa — hali tayyor emas; `undefined` — bazadan/eski qoralama */
function isLineCommittedToSortOrder(line) {
    if (!line?.product_id) return false
    if (line.readyForSort === true) return true
    if (line.readyForSort === false) return false
    return true
}

/** Boshqa qatorda shu mahsulot allaqachon tanlanganmi */
function orderLinesHasDuplicateProduct(orderLines, productId, excludeLineId) {
    if (productId == null || productId === '') return false
    const pid = String(productId)
    return (orderLines || []).some(
        (l) => l.id !== excludeLineId && l.product_id != null && String(l.product_id) === pid
    )
}

/** Bir xil `id` bilan kelgan qatorlarni bitta qilib oladi (API/join dublikatlari) */
function dedupeOrderItemsById(orderItems) {
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

/** Ro‘yxat / chop etish: faqat bir xil `id` takrorlarini oladi — miqdorni qo‘shmaydi (bazadagi qiymat). */
function normalizeOrderItemsForList(orderItems) {
    return dedupeOrderItemsById(orderItems || [])
}

/** Bitta forma qatori bo‘yicha summa */
function computeOrderLineSubtotal(line) {
    if (!line?.product_id) return 0
    const pr = Number(line.product_price) || 0
    if (line.colorChoices?.length > 1) {
        let rowSum = 0
        for (const c of line.colorChoices) {
            const q = parseInt(String(line.colorQtyByColor?.[c] ?? '0'), 10) || 0
            rowSum += pr * q
        }
        return rowSum
    }
    const q = parseInt(String(line.quantity ?? '0'), 10) || 0
    return pr * q
}

/** Forma qatorlari yig‘indisi */
function computeOrderLinesSubtotal(orderLines) {
    if (!orderLines?.length) return 0
    return orderLines.reduce((s, line) => s + computeOrderLineSubtotal(line), 0)
}

/**
 * Bir nechta buyurtmani birlashtirish: umumiy summa = har bir buyurtmaning `orders.total` yig‘indisi;
 * jami dona = har bir buyurtmadagi `order_items` miqdorlari yig‘indisining yig‘indisi (qatorlarni qayta narxlamaasdan).
 */
function aggregateMergedOrdersTotals(ordersToMerge, itemRows) {
    const subtotal =
        Math.round(ordersToMerge.reduce((acc, o) => acc + (Number(o.total) || 0), 0) * 100) / 100
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

/**
 * Yangi buyurtma jadvali: «Tayyor» bergan qatorlar kategoriya bo‘yicha; qolganlari (kod bo‘sh yoki tayyor emas) pastda.
 */
function buildOrderFormTableRows(orderLines, products, language, uncategorizedLabel) {
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
        const code =
            (line.codeInput || '').trim() ||
            (prod?.size != null && String(prod.size).trim() !== '' ? String(prod.size) : '')
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

/**
 * Ko‘p rangli matritsa: DB yoki forma ma’lumotini `colorChoices` kalitlariga joylaydi.
 * Resolve qayta bosilganda ham mavjud miqdorlar saqlanadi; bir xil rang — turli yozuv bitta ustunda.
 */
function seedColorQtyForMatrix(line, colorOpts) {
    const out = {}
    const existing =
        line.colorQtyByColor && typeof line.colorQtyByColor === 'object' ? line.colorQtyByColor : {}
    const qtyMain = parseInt(String(line.quantity ?? '0'), 10) || 0
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
function orderItemToFormLine(oi, productsList) {
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
        resolveError: '',
        variants: [],
        colorChoices: [],
        colorQtyByColor: {},
        readyForSort: true
    }
}

/** Bazadagi `order_items` → forma qatorlari (bir SKU — bir qator; bir nechta rang — matritsa) */
function orderItemsToOrderLines(orderItems, productsList) {
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
        /** Bitta rang (colorChoices.length === 1) bo‘lsa ham `isMatrix` false — yig‘indi faqat `quantity` maydonida; avvaldoim `1` qolib ketardi. */
        const qtyForSingleRow =
            colorOpts.length === 1 ? String(Math.max(0, totalPiecesMerged)) : '1'
        const singleColorDisplay = colorOpts.length === 1 ? colorOpts[0] : ''

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
            resolveError: '',
            variants: [],
            colorChoices: colorOpts,
            colorQtyByColor,
            readyForSort: true
        })
    }
    return out.length ? out : [createEmptyOrderLine()]
}

export default function Buyurtmalar() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert, showConfirm, showToast } = useDialog()
    const [orders, setOrders] = useState([])
    const [customers, setCustomers] = useState([])
    const [products, setProducts] = useState([])
    /** Ranglar lug‘ati — `product_colors` (name_uz / name_ru / name_en) */
    const [productColors, setProductColors] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    /** `all` bo‘lishi shart — `Hammasi` bilan hech qachon `matchesStatus` true bo‘lmaydi */
    const [filterStatus, setFilterStatus] = useState('all')
    /** Bir nechta buyurtmani bitta yangi buyurtmaga birlashtirish uchun tanlov */
    const [mergeSelection, setMergeSelection] = useState({})
    /** Birlashtirishdan keyin: jami summa/miqdor tanlangan buyurtmalarning o‘zidagi yig‘indilar (qatorlardan qayta hisoblanmaydi) */
    const [mergeSourceAgg, setMergeSourceAgg] = useState(null)
    /** Birlashtirish manbasi buyurtma idlari — saqlagach eski buyurtmalarni karzinkaga ko‘chirish uchun (jami daromad takrorlanmasin) */
    const [mergeSourceOrderIds, setMergeSourceOrderIds] = useState(null)
    /** Merge paytida manbalarni karzinkaga ko‘chirish (ikki marta daromad sanalmasin) */
    const [mergeArchiveSources, setMergeArchiveSources] = useState(true)
    /** Faol ro‘yxat yoki karzinka (o‘chirilganlar) */
    const [ordersListView, setOrdersListView] = useState('active')
    const [trashOrders, setTrashOrders] = useState([])
    const [trashOrderCount, setTrashOrderCount] = useState(0)
    const ordersListViewRef = useRef('active')
    const loadDataRef = useRef(async () => {})
    const loadTrashOrdersRef = useRef(async () => {})
    /** Buyurtmalar jadvalidagi mahsulotlar ro‘yxatini yoyish/yig‘ish */
    const [orderListExpandedById, setOrderListExpandedById] = useState({})
    /** Yangi buyurtma: bir nechta qator — model kodi orqali mahsulot, soni qo‘lda */
    const [orderLines, setOrderLines] = useState([createEmptyOrderLine()])
    const [form, setForm] = useState({
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        total: '',
        status: 'new',
        note: '',
        source: 'dokon'
    })

    const firstModelCodeRef = useRef(null)
    /** Tahrir/yangi buyurtma paneli — jadvaldan keyin ochilganda ko‘rinish uchun scroll */
    const orderFormPanelRef = useRef(null)
    const formRef = useRef(form)
    const orderLinesRef = useRef(orderLines)
    const isAddingRef = useRef(isAdding)
    /** Saqlash ikki marta ketma-ket ishlamasin */
    const savingOrderRef = useRef(false)
    const [isSavingOrder, setIsSavingOrder] = useState(false)
    /** Sahifaga qaytishda qoralama — «Davom ettirish» paneli */
    const [draftBanner, setDraftBanner] = useState(false)
    /** Tahrirlanayotgan buyurtma id (yangi buyurtmada `null`) */
    const [editId, setEditId] = useState(null)
    const editIdRef = useRef(null)
    /** `handleEdit` ketma-ket chaqiruvlarida eski fetch formani buzmasin */
    const editLoadSeqRef = useRef(0)

    useEffect(() => {
        formRef.current = form
    }, [form])
    useEffect(() => {
        orderLinesRef.current = orderLines
    }, [orderLines])
    useEffect(() => {
        isAddingRef.current = isAdding
    }, [isAdding])
    useEffect(() => {
        editIdRef.current = editId
    }, [editId])

    useEffect(() => {
        const d = loadNewOrderDraft()
        if (d && draftHasMeaningfulContent(d) && !isAddingRef.current) {
            setDraftBanner(true)
        }
    }, [])

    useEffect(() => {
        if (!isAdding || editId) return
        const tid = setTimeout(() => {
            saveNewOrderDraft(formRef.current, orderLinesRef.current)
        }, 600)
        return () => {
            clearTimeout(tid)
            if (isAddingRef.current && !editIdRef.current) {
                saveNewOrderDraft(formRef.current, orderLinesRef.current)
            }
        }
    }, [form, orderLines, isAdding, editId])

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'hidden' && isAddingRef.current && !editIdRef.current) {
                saveNewOrderDraft(formRef.current, orderLinesRef.current)
            }
        }
        document.addEventListener('visibilitychange', onVis)
        return () => document.removeEventListener('visibilitychange', onVis)
    }, [])

    useEffect(() => {
        if (isAdding && !editId) {
            const tid = setTimeout(() => firstModelCodeRef.current?.focus(), 100)
            return () => clearTimeout(tid)
        }
    }, [isAdding, editId])

    /** Jadvaldan «Tahrirlash» bosilganda forma yuqorida — foydalanuvchi ko‘rishi uchun */
    useEffect(() => {
        if (!isAdding) return
        const tid = setTimeout(() => {
            orderFormPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 80)
        return () => clearTimeout(tid)
    }, [isAdding, editId])

    useEffect(() => {
        ordersListViewRef.current = ordersListView
    }, [ordersListView])

    useEffect(() => {
        void loadDataRef.current()

        const reloadFromRemote = async () => {
            await loadDataRef.current({ silent: true })
            if (ordersListViewRef.current === 'trash') await loadTrashOrdersRef.current()
        }

        const channel = supabase
            .channel('orders_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
                playNotificationSound()
                void reloadFromRemote()
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
                void reloadFromRemote()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    function playNotificationSound() {
        if (typeof window !== 'undefined') {
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj')
                audio.play().catch(e => console.log('Audio play failed:', e))
            } catch (error) {
                console.error('Audio init failed:', error)
            }
        }
    }

    async function loadTrashOrders() {
        const { data, error } = await fetchDeletedOrdersPageWithFallback()
        if (error) console.error('loadTrashOrders:', error)
        setTrashOrders(data || [])
    }

    /** `silent: true` — tahrir/o‘chirishdan keyin: ro‘yxat yangilanadi, lekin butun sahifa spinneri yo‘q */
    async function loadData(opts = {}) {
        const silent = opts.silent === true
        try {
            if (!silent) setLoading(true)

            const { data: ordersData, error: ordersError } = await fetchOrdersPageWithFallback({ activeOnly: true })
            if (ordersError) throw ordersError

            let trashCnt = 0
            const trashCntRes = await supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .not('deleted_at', 'is', null)
            if (!trashCntRes.error) trashCnt = trashCntRes.count ?? 0
            else if (!isDeletedAtMissingError(trashCntRes.error)) console.warn('trash count:', trashCntRes.error)
            setTrashOrderCount(trashCnt)

            // Load Customers for dropdown
            const { data: customersData } = await supabase.from('customers').select('id, name, phone').order('name')

            // Barcha mahsulotlar — kategoriya nomi forma jadvalida tartib va jami uchun
            let productsData = null
            const prWithCat = await supabase
                .from('products')
                .select('*, categories(id, name, name_uz)')
                .order('name')
            if (prWithCat.error) {
                console.warn('products+categories:', prWithCat.error)
                const prFb = await supabase.from('products').select('*').order('name')
                productsData = prFb.data
            } else {
                productsData = prWithCat.data
            }

            const { data: colorLibData, error: colorLibError } = await supabase
                .from('product_colors')
                .select('*')
                .order('name')
            if (colorLibError) console.warn('product_colors:', colorLibError)

            setOrders(ordersData || [])
            setCustomers(customersData || [])
            setProducts(productsData || [])
            setProductColors(colorLibData || [])
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            if (!silent) setLoading(false)
        }
    }

    loadDataRef.current = loadData
    loadTrashOrdersRef.current = loadTrashOrders

    async function switchOrdersListView(next) {
        setMergeSelection({})
        setOrdersListView(next)
        if (next === 'trash') await loadTrashOrders()
    }

    function dedupeProducts(list) {
        const seen = new Set()
        return list.filter((p) => {
            const id = String(p.id)
            if (seen.has(id)) return false
            seen.add(id)
            return true
        })
    }

    /**
     * Kod bo‘yicha qidiruv (soddalashtirilgan):
     * 1) To‘liq mos: «Kod» (size) → keyin nom/tavsif/kategoriya (butun qator bilan bir xil).
     * 2) Qisman: faqat «Kod» maydoni ichida (min. 3 belgi); bitta topilganda oladi, bir nechta bo‘lsa — aniqroq yozing.
     */
    function getProductsByModelCode(code) {
        const raw = (code || '').trim()
        if (!raw) return { list: [], reason: 'empty' }
        const low = normalizeModelKey(raw)

        const exactBySize = products.filter((p) => normalizeModelKey(p.size) === low)
        if (exactBySize.length >= 1) return { list: dedupeProducts(exactBySize), reason: null }

        const exactByAnyName = products.filter((p) =>
            productNameFields(p).some((f) => normalizeModelKey(f) === low)
        )
        if (exactByAnyName.length >= 1) return { list: dedupeProducts(exactByAnyName), reason: null }

        const exactByDescription = products.filter((p) =>
            productDescriptionFields(p).some((f) => normalizeModelKey(f) === low)
        )
        if (exactByDescription.length >= 1) return { list: dedupeProducts(exactByDescription), reason: null }

        const exactByCategoryText = products.filter(
            (p) => p.category != null && String(p.category).trim() !== '' && normalizeModelKey(p.category) === low
        )
        if (exactByCategoryText.length >= 1) return { list: dedupeProducts(exactByCategoryText), reason: null }

        const minPartial = 3
        if (low.length < minPartial) {
            return { list: [], reason: 'notfound' }
        }
        const partialSize = products.filter((p) => {
            const sz = normalizeModelKey(p.size)
            return sz && sz.includes(low)
        })
        if (partialSize.length === 1) return { list: partialSize, reason: null }
        if (partialSize.length > 1) return { list: [], reason: 'ambiguous' }

        return { list: [], reason: 'notfound' }
    }

    /** Tahrir / import: bazadan kelgan qatorlarni mahsulot bilan boyitish (`line_db_*` — o‘zgartirilmasin) */
    function enrichOrderLinesFromDb(lines) {
        return lines.map((line) => {
            if (String(line.id || '').startsWith('line_db_')) {
                return { ...line }
            }
            let ln = { ...line }
            if (!(ln.codeInput || '').trim() && ln.product_id) {
                const prod = products.find((p) => String(p.id) === String(ln.product_id))
                if (prod?.size != null && String(prod.size).trim() !== '') {
                    ln = { ...ln, codeInput: String(prod.size) }
                }
            }
            const { list, reason } = getProductsByModelCode(ln.codeInput)
            if (!list.length) {
                let msg = t('orders.codeNotFound')
                if (reason === 'ambiguous') msg = t('orders.codeAmbiguous')
                if (reason === 'empty') msg = t('orders.codeEmpty')
                return {
                    ...ln,
                    variants: [],
                    colorChoices: [],
                    colorQtyByColor: {},
                    product_id: null,
                    product_name: '',
                    product_price: 0,
                    color: '',
                    image_url: '',
                    resolveError: msg,
                    readyForSort: false
                }
            }
            if (list.length === 1) {
                const product = list[0]
                const colorOpts = normalizeColorsArray(product)
                if (colorOpts.length > 1) {
                    return {
                        ...ln,
                        variants: [],
                        colorChoices: colorOpts,
                        colorQtyByColor: seedColorQtyForMatrix(ln, colorOpts),
                        product_id: product.id,
                        product_name: displayProductName(product),
                        product_price: Number(product.sale_price) || 0,
                        color: '',
                        image_url: product.image_url || '',
                        resolveError: '',
                        readyForSort: false
                    }
                }
                return {
                    ...ln,
                    variants: [],
                    colorChoices: [],
                    colorQtyByColor: {},
                    product_id: product.id,
                    product_name: displayProductName(product),
                    product_price: Number(product.sale_price) || 0,
                    color: colorOpts[0] || product.color || '',
                    image_url: product.image_url || '',
                    resolveError: '',
                    readyForSort: false
                }
            }
            return {
                ...ln,
                variants: list,
                colorChoices: [],
                colorQtyByColor: {},
                product_id: null,
                product_name: displayProductName(list[0]) || '',
                product_price: 0,
                color: '',
                image_url: '',
                resolveError: t('orders.pickColorVariant'),
                readyForSort: false
            }
        })
    }

    async function applyVariantToLine(lineId, productIdStr) {
        const snapshot = orderLinesRef.current
        if (
            productIdStr &&
            orderLinesHasDuplicateProduct(snapshot, productIdStr, lineId) &&
            !(await showConfirm(t('orders.duplicateProductConfirm'), { variant: 'warning' }))
        ) {
            return
        }
        setOrderLines((prev) =>
            prev.map((line) => {
                if (line.id !== lineId) return line
                if (!productIdStr) {
                    return {
                        ...line,
                        product_id: null,
                        product_name: displayProductName(line.variants?.[0]) || '',
                        product_price: 0,
                        color: '',
                        image_url: '',
                        colorChoices: [],
                        colorQtyByColor: {},
                        resolveError: line.variants?.length ? t('orders.pickColorVariant') : '',
                        readyForSort: false
                    }
                }
                const pool = line.variants?.length ? line.variants : products
                const p = pool.find((x) => String(x.id) === String(productIdStr))
                if (!p) return line
                return {
                    ...line,
                    product_id: p.id,
                    product_name: displayProductName(p),
                    product_price: Number(p.sale_price) || 0,
                    color: p.color || '',
                    image_url: p.image_url || '',
                    colorChoices: [],
                    colorQtyByColor: {},
                    resolveError: '',
                    readyForSort: false
                }
            })
        )
    }

    async function resolveOrderLine(lineId) {
        const line = orderLinesRef.current.find((l) => l.id === lineId)
        if (!line) return

        const { list, reason } = getProductsByModelCode(line.codeInput)
        const prevSnapshot = orderLinesRef.current

        if (!list.length) {
            let msg = t('orders.codeNotFound')
            if (reason === 'ambiguous') msg = t('orders.codeAmbiguous')
            if (reason === 'empty') msg = t('orders.codeEmpty')
            const nextLine = {
                ...line,
                variants: [],
                colorChoices: [],
                colorQtyByColor: {},
                product_id: null,
                product_name: '',
                product_price: 0,
                color: '',
                image_url: '',
                resolveError: msg,
                readyForSort: false
            }
            setOrderLines((p) => p.map((l) => (l.id === lineId ? nextLine : l)))
            return
        }

        if (list.length === 1) {
            const product = list[0]
            if (
                orderLinesHasDuplicateProduct(prevSnapshot, product.id, lineId) &&
                !(await showConfirm(t('orders.duplicateProductConfirm'), { variant: 'warning' }))
            ) {
                return
            }
            const colorOpts = normalizeColorsArray(product)
            let nextLine
            if (colorOpts.length > 1) {
                nextLine = {
                    ...line,
                    variants: [],
                    colorChoices: colorOpts,
                    colorQtyByColor: seedColorQtyForMatrix(line, colorOpts),
                    product_id: product.id,
                    product_name: displayProductName(product),
                    product_price: Number(product.sale_price) || 0,
                    color: '',
                    image_url: product.image_url || '',
                    resolveError: '',
                    readyForSort: false
                }
            } else {
                nextLine = {
                    ...line,
                    variants: [],
                    colorChoices: [],
                    colorQtyByColor: {},
                    product_id: product.id,
                    product_name: displayProductName(product),
                    product_price: Number(product.sale_price) || 0,
                    color: colorOpts[0] || product.color || '',
                    image_url: product.image_url || '',
                    resolveError: '',
                    readyForSort: false
                }
            }
            setOrderLines((p) => p.map((l) => (l.id === lineId ? nextLine : l)))
            return
        }

        const nextLine = {
            ...line,
            variants: list,
            colorChoices: [],
            colorQtyByColor: {},
            product_id: null,
            product_name: displayProductName(list[0]) || '',
            product_price: 0,
            color: '',
            image_url: '',
            resolveError: t('orders.pickColorVariant'),
            readyForSort: false
        }
        setOrderLines((p) => p.map((l) => (l.id === lineId ? nextLine : l)))
    }

    function updateOrderLine(lineId, patch) {
        setOrderLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
    }

    function updateOrderLineColorQty(lineId, colorKey, value) {
        setOrderLines((prev) =>
            prev.map((l) => {
                if (l.id !== lineId) return l
                return {
                    ...l,
                    colorQtyByColor: { ...(l.colorQtyByColor || {}), [colorKey]: value },
                    resolveError: ''
                }
            })
        )
    }

    function addOrderLine() {
        setOrderLines((prev) => [...prev, createEmptyOrderLine()])
    }

    function removeOrderLine(lineId) {
        setOrderLines((prev) => {
            const next = prev.filter((l) => l.id !== lineId)
            return next.length ? next : [createEmptyOrderLine()]
        })
    }

    function commitLineToSortOrder(lineId) {
        setOrderLines((prev) =>
            prev.map((l) => (l.id === lineId && l.product_id ? { ...l, readyForSort: true } : l))
        )
    }

    async function handleSubmit(e) {
        e.preventDefault()
        const nameTrim = (form.customer_name || '').trim()
        if (!nameTrim) {
            await showAlert(t('orders.customerNameRequired'), { variant: 'warning' })
            return
        }
        if (savingOrderRef.current) return
        savingOrderRef.current = true
        setIsSavingOrder(true)

        try {
            const customer = form.customer_id ? customers.find((c) => c.id === form.customer_id) : null
            const resolvedCustomerName =
                nameTrim || customer?.name || ''
            const resolvedPhone = (form.customer_phone || '').trim() || customer?.phone || ''

            const linesForSave = orderLines.map((l) => (l.product_id ? { ...l, readyForSort: true } : l))

            const unresolvedFetch = orderLines.filter((l) => (l.codeInput || '').trim() && !l.product_id)
                if (unresolvedFetch.length) {
                    await showAlert(t('orders.orderLinesUnresolved'), { variant: 'warning' })
                    return
                }
                const expandedRows = mergeExpandedRowsForSubmit(linesForSave.flatMap(expandOrderLineForSubmit))
                if (expandedRows.length === 0) {
                    await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
                    return
                }
                const computedTotal =
                    Math.round(
                        expandedRows.reduce((s, row) => {
                            const acc = Number(s) || 0
                            const pr = Number(row.product_price) || 0
                            const q = parseInt(String(row.quantity ?? '0'), 10) || 0
                            return acc + pr * q
                        }, 0) * 100
                    ) / 100
                const totalSum =
                    mergeSourceAgg != null ? mergeSourceAgg.subtotal : computedTotal

                const qtyByProductId = new Map()
                for (const row of expandedRows) {
                    const pid = String(row.product_id)
                    const q = parseInt(String(row.quantity ?? '0'), 10) || 0
                    qtyByProductId.set(pid, (Number(qtyByProductId.get(pid)) || 0) + q)
                }
                const stockIssues = []
                for (const [pid, qty] of qtyByProductId) {
                    const prod = products.find((p) => String(p.id) === pid)
                    if (!prod) continue
                    const st = prod.stock
                    if (st != null && st !== '' && Number.isFinite(Number(st)) && Number(st) >= 0 && qty > Number(st)) {
                        stockIssues.push(
                            `${prod.name || displayProductName(prod)}: ${t('orders.stockLabel')} ${st}, ${t('orders.qtyLabel')} ${qty}`
                        )
                    }
                }
                if (stockIssues.length) {
                    const ok = await showConfirm(
                        `${stockIssues.join('\n')}\n\n${t('orders.stockWarningConfirm')}`,
                        { title: t('orders.stockWarningTitle'), variant: 'warning' }
                    )
                    if (!ok) return
                }

                const noteCombined = (form.note || '').trim()

                const displayOrderNo = generateDisplayOrderNumber()
                const baseOrderPayload = {
                    customer_id: form.customer_id || null,
                    customer_name: resolvedCustomerName,
                    customer_phone: resolvedPhone,
                    total: totalSum,
                    status:
                        form.status === 'new' || form.status === 'Yangi'
                            ? 'new'
                            : form.status === 'pending' || form.status === 'Jarayonda'
                              ? 'pending'
                              : form.status === 'completed' || form.status === 'Tugallandi'
                                ? 'completed'
                                : form.status === 'cancelled' || form.status === 'Bekor qilindi'
                                  ? 'cancelled'
                                  : form.status,
                    note: noteCombined,
                    source: normalizeSourceForDb(form.source)
                }

                const makeItemPayloads = (orderId) =>
                    expandedRows.map((line, idx) => {
                        const prod = products.find((p) => String(p.id) === String(line.product_id))
                        const qtyRaw = parseOrderItemQty(line.quantity)
                        const qty = qtyRaw > 0 ? qtyRaw : 1
                        const rawPrice = Number(line.product_price)
                        const pr = Number.isFinite(rawPrice) ? Math.round(rawPrice * 100) / 100 : 0
                        const subtotal = Math.round(pr * qty * 100) / 100
                        const colorVal = line.color ?? prod?.color
                        const imgVal =
                            line.image_url != null && String(line.image_url).trim() !== ''
                                ? String(line.image_url).trim()
                                : prod?.image_url != null && String(prod.image_url).trim() !== ''
                                  ? String(prod.image_url).trim()
                                  : null
                        /** `orderItemToFormLine` / `orderItemsToOrderLines` bilan bir xil: avvalo forma kodini saqlash */
                        const sizeForDb =
                            line.codeInput != null && String(line.codeInput).trim() !== ''
                                ? String(line.codeInput).trim()
                                : prod?.size != null && String(prod.size).trim() !== ''
                                  ? String(prod.size).trim()
                                  : null
                        return {
                            order_id: orderId,
                            product_id: line.product_id,
                            product_name: (line.product_name || displayProductName(prod) || '').trim() || 'Mahsulot',
                            quantity: qty,
                            price: pr,
                            subtotal,
                            size: sizeForDb,
                            color: colorVal != null && colorVal !== '' ? String(colorVal) : null,
                            image_url: imgVal != null && imgVal !== '' ? String(imgVal) : null,
                            line_index: idx
                        }
                    })

                if (editId) {
                    const orderIdStr = String(editId)
                    const itemPayloadsEdit = mergeOrderItemPayloadsForDb(makeItemPayloads(orderIdStr))
                    if (!itemPayloadsEdit.length) {
                        await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
                        return
                    }

                    const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', orderIdStr)
                    if (delErr) throw delErr

                    const { error: itemErrorEdit } = await supabase.from('order_items').insert(itemPayloadsEdit)
                    if (itemErrorEdit) throw itemErrorEdit

                    const { error: updErr } = await supabase.from('orders').update(baseOrderPayload).eq('id', orderIdStr)
                    if (updErr) throw updErr

                    setForm({
                        customer_id: '',
                        customer_name: '',
                        customer_phone: '',
                        total: '',
                        status: 'new',
                        note: '',
                        source: 'dokon'
                    })
                    setOrderLines([createEmptyOrderLine()])
                    setEditId(null)
                    setIsAdding(false)
                    setMergeSourceAgg(null)
                    setMergeSourceOrderIds(null)
                    loadData({ silent: true })
                    return
                }

                let newOrder = null
                let ins = await supabase
                    .from('orders')
                    .insert([{ ...baseOrderPayload, order_number: displayOrderNo }])
                    .select()
                    .single()

                const errMsg = ins.error ? String(ins.error.message || ins.error) : ''
                if (ins.error && /order_number|column.*does not exist|schema cache/i.test(errMsg)) {
                    ins = await supabase
                        .from('orders')
                        .insert([
                            {
                                ...baseOrderPayload,
                                note: `${t('orders.orderNumberPrefix')} ${displayOrderNo}\n${noteCombined || ''}`
                            }
                        ])
                        .select()
                        .single()
                } else if (ins.error) {
                    throw ins.error
                }
                if (ins.error) throw ins.error
                newOrder = ins.data

                try {
                    const snap = {
                        customer_name: form.customer_name,
                        customer_phone: form.customer_phone,
                        customer_id: form.customer_id,
                        lines: linesForSave
                            .filter((l) => l.product_id)
                            .map((l) => ({
                                codeInput: l.codeInput,
                                quantity: l.quantity,
                                product_id: l.product_id,
                                product_name: l.product_name,
                                product_price: l.product_price,
                                color: l.color,
                                image_url: l.image_url,
                                colorChoices: l.colorChoices || [],
                                colorQtyByColor: l.colorQtyByColor || {}
                            }))
                    }
                    localStorage.setItem(LS_LAST_ORDER, JSON.stringify(snap))
                } catch (e) {
                    console.warn('localStorage', e)
                }

                const orderId = newOrder.id

                const itemPayloads = mergeOrderItemPayloadsForDb(makeItemPayloads(orderId))
                if (!itemPayloads.length) {
                    await supabase.from('orders').delete().eq('id', orderId)
                    setMergeSourceOrderIds(null)
                    await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
                    return
                }

                const { error: itemError } = await supabase.from('order_items').insert(itemPayloads)

                if (itemError) {
                    await supabase.from('orders').delete().eq('id', orderId)
                    setMergeSourceOrderIds(null)
                    throw itemError
                }

                const sourceIdsToArchive = mergeSourceOrderIds
                const shouldArchive = mergeArchiveSources ? sourceIdsToArchive : null
                if (shouldArchive?.length >= 2) {
                    const ts = new Date().toISOString()
                    const { error: archErr } = await supabase
                        .from('orders')
                        .update({ deleted_at: ts })
                        .in('id', shouldArchive)
                    if (archErr) {
                        if (isDeletedAtMissingError(archErr)) {
                            await showAlert(t('orders.deletedAtMigrationHint'), { variant: 'warning' })
                        } else {
                            await showAlert(archErr.message || String(archErr), {
                                title: t('common.saveError'),
                                variant: 'error',
                            })
                        }
                    } else {
                        setMergeSelection((prev) => {
                            const next = { ...prev }
                            for (const sid of shouldArchive) delete next[sid]
                            return next
                        })
                        showToast(t('orders.mergeArchiveSourcesDone'), { type: 'success' })
                        await loadTrashOrdersRef.current?.()
                    }
                }
                setMergeSourceOrderIds(null)

                try {
                    const num = newOrder?.order_number || displayOrderNo
                    const message = `🛍 Yangi Buyurtma\n№ ${num}\n\n👤 Mijoz: ${resolvedCustomerName}\n📞 ${resolvedPhone || '—'}\n💰 Summa: $${totalSum}`
                    await sendTelegramNotification(message)
                } catch (tgErr) {
                    console.warn('Telegram:', tgErr)
                }
                clearNewOrderDraft()

                setForm({
                    customer_id: '',
                    customer_name: '',
                    customer_phone: '',
                    total: '',
                    status: 'new',
                    note: '',
                    source: 'dokon'
                })
                setOrderLines([createEmptyOrderLine()])
                setIsAdding(false)
                setMergeSourceAgg(null)
                loadData({ silent: true })
        } catch (error) {
            console.error('Error saving order:', error)
            const msg =
                error?.message ||
                error?.error_description ||
                (typeof error === 'string' ? error : JSON.stringify(error))
            const hint = error?.hint ? `\n${error.hint}` : ''
            const details = error?.details ? `\n${error.details}` : ''
            await showAlert(`${msg}${details}${hint}`, {
                title: t('common.saveError'),
                variant: 'error',
            })
        } finally {
            savingOrderRef.current = false
            setIsSavingOrder(false)
        }
    }

    async function handleDelete(id) {
        if (!(await showConfirm(t('orders.softDeleteConfirm'), { variant: 'warning' }))) return

        try {
            const { error } = await supabase
                .from('orders')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id)

            if (error) {
                if (isDeletedAtMissingError(error)) {
                    await showAlert(t('orders.deletedAtMigrationHint'), { variant: 'warning' })
                    return
                }
                throw error
            }
            setMergeSelection((prev) => {
                const next = { ...prev }
                delete next[id]
                return next
            })
            await loadData({ silent: true })
            if (ordersListViewRef.current === 'trash') await loadTrashOrders()
        } catch (error) {
            console.error('Error deleting order:', error)
            await showAlert(t('common.deleteError'), { variant: 'error' })
        }
    }

    async function handleRestoreOrder(id) {
        try {
            const { error } = await supabase.from('orders').update({ deleted_at: null }).eq('id', id)
            if (error) {
                if (isDeletedAtMissingError(error)) {
                    await showAlert(t('orders.deletedAtMigrationHint'), { variant: 'warning' })
                    return
                }
                throw error
            }
            await loadData({ silent: true })
            await loadTrashOrders()
        } catch (error) {
            console.error('Error restoring order:', error)
            await showAlert(t('common.saveError'), { variant: 'error' })
        }
    }

    async function handlePermanentDelete(id) {
        if (!(await showConfirm(t('orders.permanentDeleteConfirm'), { variant: 'warning' }))) return

        try {
            const { error } = await supabase.from('orders').delete().eq('id', id)
            if (error) throw error
            setMergeSelection((prev) => {
                const next = { ...prev }
                delete next[id]
                return next
            })
            await loadData({ silent: true })
            await loadTrashOrders()
        } catch (error) {
            console.error('Error permanently deleting order:', error)
            await showAlert(t('common.deleteError'), { variant: 'error' })
        }
    }

    async function handleEdit(item) {
        editLoadSeqRef.current += 1
        const seq = editLoadSeqRef.current
        const orderId = item.id

        const { data: rows, error } = await fetchOrderItemsForOrderId(orderId)

        if (error) {
            console.error('handleEdit order_items:', error)
            await showAlert(t('common.saveError'), { variant: 'error' })
            return
        }
        if (seq !== editLoadSeqRef.current) return

        setMergeSourceAgg(null)
        setMergeSourceOrderIds(null)
        const linesRaw = orderItemsToOrderLines(dedupeOrderItemsKeepNewest(rows || []), products)
        const lines = enrichOrderLinesFromDb(linesRaw)

        setForm({
            customer_id: item.customer_id || '',
            customer_name: item.customer_name || item.customers?.name || '',
            customer_phone: item.customer_phone || item.customers?.phone || '',
            total: item.total != null ? String(item.total) : '',
            status: normalizeStatusForSelect(item.status),
            note: item.note || '',
            source: normalizeSourceForForm(item.source)
        })
        setOrderLines(lines)
        setEditId(orderId)
        setIsAdding(true)
    }

    async function handleStatusChange(id, newStatus) {
        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: newStatus })
                .eq('id', id)

            if (error) throw error
            setOrders((prev) =>
                prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
            )
        } catch (error) {
            console.error('Error updating status:', error)
        }
    }

    function handleCancel() {
        clearNewOrderDraft()
        setDraftBanner(false)
        setMergeSourceAgg(null)
        setMergeSourceOrderIds(null)
        setEditId(null)
        setForm({
            customer_id: '',
            customer_name: '',
            customer_phone: '',
            total: '',
            status: 'new',
            note: '',
            source: 'dokon'
        })
        setIsAdding(false)
        setOrderLines([createEmptyOrderLine()])
    }

    function restoreNewOrderDraft() {
        const d = loadNewOrderDraft()
        if (!d) {
            setDraftBanner(false)
            return
        }
        setMergeSourceAgg(null)
        setMergeSourceOrderIds(null)
        setForm(
            d.form || {
                customer_id: '',
                customer_name: '',
                customer_phone: '',
                total: '',
                status: 'new',
                note: '',
                source: 'dokon'
            }
        )
        const lines =
            Array.isArray(d.orderLines) && d.orderLines.length
                ? d.orderLines.map((ln, i) => ({
                      ...createEmptyOrderLine(),
                      ...ln,
                      id: ln.id || `line_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`
                  }))
                : [createEmptyOrderLine()]
        setOrderLines(lines)
        setEditId(null)
        setIsAdding(true)
        setDraftBanner(false)
    }

    function dismissNewOrderDraftBanner() {
        clearNewOrderDraft()
        setDraftBanner(false)
    }

    async function repeatLastOrder() {
        try {
            const raw = localStorage.getItem(LS_LAST_ORDER)
            if (!raw) {
                await showAlert(t('orders.repeatNone'), { variant: 'info' })
                return
            }
            const d = JSON.parse(raw)
            setEditId(null)
            setMergeSourceAgg(null)
            setMergeSourceOrderIds(null)
            setForm((f) => ({
                ...f,
                customer_name: d.customer_name || '',
                customer_phone: d.customer_phone || '',
                customer_id: d.customer_id || ''
            }))
            if (d.lines?.length) {
                const lines = d.lines.map((ln, idx) => {
                    const colorChoices = Array.isArray(ln.colorChoices) ? ln.colorChoices : []
                    const fromSnap =
                        ln.colorQtyByColor && typeof ln.colorQtyByColor === 'object' ? { ...ln.colorQtyByColor } : {}
                    const colorQtyByColor =
                        colorChoices.length > 1 && Object.keys(fromSnap).length === 0
                            ? Object.fromEntries(colorChoices.map((c) => [c, '0']))
                            : fromSnap
                    return {
                        ...createEmptyOrderLine(),
                        id: `line_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 9)}`,
                        codeInput: ln.codeInput || '',
                        quantity: ln.quantity != null ? String(ln.quantity) : '1',
                        product_id: ln.product_id || null,
                        product_name: ln.product_name || '',
                        product_price: Number(ln.product_price) || 0,
                        color: ln.color || '',
                        image_url: ln.image_url || '',
                        resolveError: '',
                        variants: [],
                        colorChoices,
                        colorQtyByColor,
                        readyForSort: ln.product_id ? true : false
                    }
                })
                setOrderLines(lines)
            }
            setIsAdding(true)
        } catch (e) {
            console.error(e)
            await showAlert(t('orders.repeatError'), { variant: 'error' })
        }
    }

    const selectedMergeCount = useMemo(
        () => Object.keys(mergeSelection).filter((id) => mergeSelection[id]).length,
        [mergeSelection]
    )

    function toggleMergeSelectOrder(id) {
        setMergeSelection((prev) => ({ ...prev, [id]: !prev[id] }))
    }

    function toggleMergeSelectAllFiltered() {
        const allOnPage = filteredOrders.map((o) => o.id)
        if (!allOnPage.length) return
        const allSelected = allOnPage.every((id) => mergeSelection[id])
        if (allSelected) {
            setMergeSelection((prev) => {
                const next = { ...prev }
                for (const id of allOnPage) delete next[id]
                return next
            })
        } else {
            setMergeSelection((prev) => {
                const next = { ...prev }
                for (const id of allOnPage) next[id] = true
                return next
            })
        }
    }

    function clearMergeSelection() {
        setMergeSelection({})
    }

    async function handleMergeSelectedOrders() {
        if (ordersListView !== 'active') return
        const ids = Object.keys(mergeSelection).filter((id) => mergeSelection[id])
        if (ids.length < 2) {
            await showAlert(t('orders.mergeNeedTwo'), { variant: 'warning' })
            return
        }
        const idSet = new Set(ids)
        const ordersToMerge = filteredOrders
            .filter((o) => idSet.has(o.id))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        if (ordersToMerge.length < 2) {
            await showAlert(t('orders.mergeNeedTwo'), { variant: 'warning' })
            return
        }
        try {
            const { data: allRows, error } = await fetchOrderItemsForOrderIds(ordersToMerge.map((o) => o.id))
            if (error) throw error
            const cleanedRows = normalizeOrderItemsForList(allRows || [])
            if (!cleanedRows.length) {
                await showAlert(t('orders.mergeEmptyLines'), { variant: 'warning' })
                return
            }
            const orderRank = new Map(ordersToMerge.map((o, i) => [String(o.id), i]))
            const sortedForForm = [...cleanedRows].sort((a, b) => {
                const ra = orderRank.get(String(a.order_id)) ?? 999
                const rb = orderRank.get(String(b.order_id)) ?? 999
                if (ra !== rb) return ra - rb
                const la = Number(a.line_index ?? 0)
                const lb = Number(b.line_index ?? 0)
                if (la !== lb) return la - lb
                return String(a.id || '').localeCompare(String(b.id || ''))
            })
            setMergeSourceAgg(aggregateMergedOrdersTotals(ordersToMerge, cleanedRows))
            setMergeSourceOrderIds(ordersToMerge.map((o) => o.id))
            const linesRaw = orderItemsToOrderLines(sortedForForm, products)
            const lines = enrichOrderLinesFromDb(linesRaw)
            const labels = ordersToMerge.map((o) =>
                o.order_number ? `№ ${o.order_number}` : `#${String(o.id).slice(0, 8)}`
            )
            const mergeNote = `${t('orders.mergeNotePrefix')}: ${labels.join('; ')}`
            const primary = ordersToMerge[0]
            const custName = primary.customer_name || primary.customers?.name || ''
            const custPhone = primary.customer_phone || primary.customers?.phone || ''
            const custId = primary.customer_id || ''
            clearNewOrderDraft()
            setDraftBanner(false)
            setEditId(null)
            setForm({
                customer_id: custId || '',
                customer_name: custName,
                customer_phone: custPhone,
                total: '',
                status: 'new',
                note: mergeNote,
                source: normalizeSourceForForm(primary.source)
            })
            setOrderLines(lines.length ? lines : [createEmptyOrderLine()])
            setMergeSelection({})
            setMergeArchiveSources(true)
            setIsAdding(true)
            showToast(t('orders.mergeOpenedForm'), { type: 'success' })
            requestAnimationFrame(() => {
                orderFormPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
        } catch (e) {
            console.error('handleMergeSelectedOrders:', e)
            await showAlert(t('orders.mergeFetchError'), { variant: 'error' })
        }
    }

    async function handlePrintOrder(item, showPrices) {
        const labelColorFn = (c) => labelColorCanonical(c, productColors, language)
        let orderForPrint = item
        try {
            const { data: rows, error: oiErr } = await fetchOrderItemsForOrderId(item.id)
            if (oiErr) throw oiErr
            const { data: orderRow, error: ordErr } = await supabase
                .from('orders')
                .select(`*, customers (id, name, phone)`)
                .eq('id', item.id)
                .single()
            if (ordErr) throw ordErr
            orderForPrint = {
                ...item,
                ...orderRow,
                order_items: dedupeOrderItemsKeepNewest(rows || [])
            }
        } catch (e) {
            console.error('handlePrintOrder refetch:', e)
            orderForPrint = { ...item, order_items: dedupeOrderItemsKeepNewest(item.order_items || []) }
        }
        const html = buildPrintDocumentHtml({
            documentTitle: `Buyurtma-${String(item.id).slice(0, 8)}`,
            listTitle: '',
            orders: [orderForPrint],
            showPrices,
            labelColorFn,
            productsList: products
        })
        if (!openPrintTab(html)) {
            showToast(t('orders.printPopupBlocked') || 'Brauzer chop etish oynasini bloklagan. Popup ruxsat bering.', {
                type: 'info',
            })
        }
    }

    async function handlePrintOrderList(list, showPrices) {
        if (!list?.length) {
            await showAlert(t('orders.listPrintEmpty'), { variant: 'info' })
            return
        }
        const labelColorFn = (c) => labelColorCanonical(c, productColors, language)
        const ids = list.map((o) => o.id).filter(Boolean)
        let ordersForPrint = list
        try {
            const { data: allRows, error } = await fetchOrderItemsForOrderIds(ids)
            if (error) throw error
            const byOrder = new Map()
            for (const oi of allRows || []) {
                const oid = oi.order_id
                if (!byOrder.has(oid)) byOrder.set(oid, [])
                byOrder.get(oid).push(oi)
            }
            ordersForPrint = list.map((o) => ({
                ...o,
                order_items: dedupeOrderItemsKeepNewest(byOrder.get(o.id) || o.order_items || [])
            }))
        } catch (e) {
            console.error('handlePrintOrderList refetch:', e)
            ordersForPrint = list.map((o) => ({
                ...o,
                order_items: dedupeOrderItemsKeepNewest(o.order_items || [])
            }))
        }
        const html = buildPrintDocumentHtml({
            documentTitle: showPrices ? t('orders.listPrintTitleWithPrices') : t('orders.listPrintTitleNoPrices'),
            listTitle: `${t('orders.listPrintCount')}: ${list.length}`,
            orders: ordersForPrint,
            showPrices,
            labelColorFn,
            productsList: products
        })
        if (!openPrintTab(html)) {
            showToast(t('orders.printPopupBlocked') || 'Popup bloklangan.', { type: 'info' })
        }
    }

    const orderLinesSubtotal = useMemo(() => computeOrderLinesSubtotal(orderLines), [orderLines])
    const displayFormSubtotal =
        mergeSourceAgg != null ? mergeSourceAgg.subtotal : orderLinesSubtotal
    const orderFormTableRows = useMemo(
        () => buildOrderFormTableRows(orderLines, products, language, t('orders.categoryUncategorized')),
        [orderLines, products, language, t]
    )
    const firstCodeLineId = useMemo(
        () =>
            orderFormTableRows.find((r) => r.type === 'line' && !r.line.product_id)?.line?.id ??
            orderFormTableRows.find((r) => r.type === 'line')?.line?.id,
        [orderFormTableRows]
    )

    function orderMatchesListFilters(b) {
        const customerName = b.customer_name || b.customers?.name || t('common.unknown') || 'Noma\'lum'
        const q = searchTerm.trim().toLowerCase()
        const matchesSearch =
            !q ||
            customerName.toLowerCase().includes(q) ||
            String(b.customer_phone || b.customers?.phone || '')
                .toLowerCase()
                .includes(q) ||
            String(b.id || '')
                .toLowerCase()
                .includes(q) ||
            String(b.order_number || '')
                .toLowerCase()
                .includes(q)
        const st = b.status
        const matchesStatus =
            filterStatus === 'all' ||
            filterStatus === 'Hammasi' ||
            (filterStatus === 'new' && (st === 'new' || st === 'Yangi')) ||
            (filterStatus === 'pending' && (st === 'pending' || st === 'Jarayonda')) ||
            (filterStatus === 'completed' && (st === 'completed' || st === 'Tugallandi' || st === 'Tugallangan')) ||
            (filterStatus === 'cancelled' &&
                (st === 'cancelled' || st === 'Bekor qilingan' || st === 'Bekor qilindi'))
        return matchesSearch && matchesStatus
    }

    const ordersForList = ordersListView === 'active' ? orders : trashOrders
    /** Jadval va yuqori 4 karta bir xil `filteredOrders` dan — jami va statuslar mos keladi */
    const filteredOrders = ordersForList.filter(orderMatchesListFilters)
    const totalSumma = filteredOrders.reduce((sum, b) => sum + (Number(b.total) || 0), 0)
    const statusCounts = {
        Yangi: filteredOrders.filter((b) => b.status === 'Yangi' || b.status === 'new').length,
        Jarayonda: filteredOrders.filter((b) => b.status === 'Jarayonda' || b.status === 'pending').length,
        Tugallandi: filteredOrders.filter(
            (b) =>
                b.status === 'Tugallandi' ||
                b.status === 'completed' ||
                b.status === 'Tugallangan'
        ).length,
    }

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
            <Header title={t('common.orders')} toggleSidebar={toggleSidebar} />

            {ordersListView === 'trash' ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                    <p className="font-medium leading-snug">{t('orders.trashHint')}</p>
                </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                    type="button"
                    onClick={() => switchOrdersListView('active')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                        ordersListView === 'active'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    <ShoppingCart size={16} />
                    {t('orders.activeList')}
                </button>
                <button
                    type="button"
                    onClick={() => switchOrdersListView('trash')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                        ordersListView === 'trash'
                            ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    <Archive size={16} />
                    {t('orders.trashBin')}
                    {trashOrderCount > 0 ? (
                        <span className="min-w-[1.5rem] rounded-full bg-white/20 px-1.5 text-center text-xs tabular-nums">
                            {trashOrderCount}
                        </span>
                    ) : null}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-blue-100">{t('orders.statsVisibleCount')}</p>
                            <p className="text-3xl font-bold mt-2">{filteredOrders.length}</p>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl">
                            <ShoppingCart className="text-white" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500">{t('orders.statusNew')}</p>
                            <p className="text-3xl font-bold mt-2 text-blue-600">{statusCounts.Yangi}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                            <Clock size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500">{t('orders.statusCompleted')}</p>
                            <p className="text-3xl font-bold mt-2 text-green-600">{statusCounts.Tugallandi}</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-xl text-green-600">
                            <CheckCircle size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-gray-500">{t('dashboard.totalRevenue')}</p>
                            <p className="text-3xl font-bold mt-2 text-gray-800">${formatUsd(totalSumma)}</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl text-amber-600 font-bold text-xl">
                            $
                        </div>
                    </div>
                </div>
            </div>

            {draftBanner && !isAdding ? (
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                    <p className="font-medium">{t('orders.draftRestorePrompt')}</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={restoreNewOrderDraft}
                            className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700"
                        >
                            {t('orders.draftContinue')}
                        </button>
                        <button
                            type="button"
                            onClick={dismissNewOrderDraftBanner}
                            className="rounded-xl border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-900 hover:bg-amber-100"
                        >
                            {t('orders.draftDiscard')}
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2 mb-6 bg-white p-2.5 sm:p-3 rounded-xl shadow-sm border border-gray-100">
                <div className="relative w-full lg:max-w-sm lg:flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder={t('orders.searchPlaceholder')}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-lg outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto justify-start lg:justify-end">
                    <button
                        type="button"
                        onClick={repeatLastOrder}
                        className="inline-flex items-center justify-center gap-1 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs"
                        title={t('orders.repeatLastTitle')}
                    >
                        <Repeat size={15} />
                        <span className="hidden sm:inline">{t('orders.repeatLast')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => exportOrdersToCsv(filteredOrders, `buyurtmalar-${new Date().toISOString().slice(0, 10)}.csv`)}
                        className="inline-flex items-center justify-center gap-1 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs"
                        title={t('orders.exportCsvTitle')}
                    >
                        <Download size={15} />
                        <span className="hidden sm:inline">CSV</span>
                    </button>
                    {ordersListView === 'active' ? (
                        <>
                            <button
                                type="button"
                                onClick={handleMergeSelectedOrders}
                                disabled={selectedMergeCount < 2}
                                className={`inline-flex items-center justify-center gap-1 border px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs ${
                                    selectedMergeCount >= 2
                                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                }`}
                                title={t('orders.mergeButtonTitle')}
                            >
                                <GitMerge size={15} />
                                <span className="hidden sm:inline">{t('orders.mergeButton')}</span>
                                {selectedMergeCount > 0 ? (
                                    <span className="min-w-[1.1rem] rounded-full bg-white/20 px-1 text-center text-[10px] font-bold tabular-nums leading-none py-0.5">
                                        {selectedMergeCount}
                                    </span>
                                ) : null}
                            </button>
                            {selectedMergeCount > 0 ? (
                                <button
                                    type="button"
                                    onClick={clearMergeSelection}
                                    className="inline-flex items-center justify-center bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-2 py-1.5 rounded-lg transition-all font-medium text-[11px]"
                                    title={t('orders.mergeClearTitle')}
                                >
                                    {t('orders.mergeClear')}
                                </button>
                            ) : null}
                        </>
                    ) : null}
                    <div className="flex items-center gap-1.5 bg-gray-50 px-2 rounded-lg border border-gray-100">
                        <Filter size={15} className="text-gray-500 shrink-0" />
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-transparent py-1.5 pr-1 outline-none text-gray-700 text-xs font-medium cursor-pointer max-w-[9.5rem]"
                        >
                            <option value="all">{t('orders.allStatuses')}</option>
                            <option value="new">{t('orders.statusNew')}</option>
                            <option value="pending">{t('orders.statusProcessing')}</option>
                            <option value="completed">{t('orders.statusCompleted')}</option>
                            <option value="cancelled">{t('orders.statusCancelled')}</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={() => handlePrintOrderList(filteredOrders, true)}
                        className="inline-flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs"
                        title={`${t('orders.listPrintWithPrices')} · ${t('orders.exportPdfHint')}`}
                    >
                        <Receipt size={15} />
                        <span className="hidden sm:inline">{t('orders.listPrintShortWithPrices')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handlePrintOrderList(filteredOrders, false)}
                        className="inline-flex items-center justify-center gap-1 bg-slate-600 hover:bg-slate-700 text-white px-2.5 py-1.5 rounded-lg transition-all font-semibold text-xs"
                        title={t('orders.listPrintWithoutPrices')}
                    >
                        <List size={15} />
                        <span className="hidden sm:inline">{t('orders.listPrintShortNoPrices')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (isAdding) {
                                handleCancel()
                            } else {
                                clearNewOrderDraft()
                                setDraftBanner(false)
                                setEditId(null)
                                setOrderLines([createEmptyOrderLine()])
                                setForm({
                                    customer_id: '',
                                    customer_name: '',
                                    customer_phone: '',
                                    total: '',
                                    status: 'new',
                                    note: '',
                                    source: 'dokon'
                                })
                                setMergeSourceAgg(null)
                                setMergeSourceOrderIds(null)
                                setIsAdding(true)
                            }
                        }}
                        className="inline-flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-all font-bold text-xs shadow-sm"
                    >
                        {isAdding ? <X size={16} /> : <Plus size={16} />}
                        <span className="hidden sm:inline">{isAdding ? t('common.cancel') : t('orders.newOrder')}</span>
                    </button>
                </div>
            </div>

            {isAdding && (
                <div
                    ref={orderFormPanelRef}
                    className={`bg-white p-6 rounded-2xl shadow-md mb-8 fade-in scroll-mt-4 ${
                        editId
                            ? 'border-2 border-blue-500 ring-2 ring-blue-200 shadow-lg shadow-blue-500/10'
                            : 'border border-gray-100'
                    }`}
                >
                    <h3 className="text-xl font-bold text-gray-800 mb-2">
                        {editId ? t('orders.editOrder') : t('orders.newOrder')}
                    </h3>
                    {editId ? (
                        <p className="text-sm text-gray-600 mb-6 leading-relaxed border-l-4 border-blue-500 pl-3 py-1 bg-blue-50/30 rounded-r">
                            {t('orders.editOrderLinesHint')}
                        </p>
                    ) : null}
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                            <div className="space-y-2 md:col-span-2 lg:col-span-3">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.customer')}</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            placeholder={t('orders.customerNamePlaceholder')}
                                            value={form.customer_name}
                                            onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                                            list="crm-customer-name-hints"
                                            required
                                            autoComplete="off"
                                        />
                                        <datalist id="crm-customer-name-hints">
                                            {customers.map((c) => (
                                                <option key={c.id} value={c.name} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <div className="space-y-1">
                                        <input
                                            type="tel"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            placeholder={t('orders.customerPhonePlaceholder')}
                                            value={form.customer_phone}
                                            onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                                    <label className="text-xs text-gray-500 whitespace-nowrap">{t('orders.pickExistingCustomer')}</label>
                                    <select
                                        className="w-full sm:max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                                        value={form.customer_id}
                                        onChange={(e) => {
                                            const id = e.target.value
                                            if (!id) {
                                                setForm({ ...form, customer_id: '' })
                                                return
                                            }
                                            const c = customers.find((x) => String(x.id) === String(id))
                                            if (c) {
                                                setForm({
                                                    ...form,
                                                    customer_id: id,
                                                    customer_name: c.name || '',
                                                    customer_phone: c.phone || ''
                                                })
                                            }
                                        }}
                                    >
                                        <option value="">{t('orders.existingCustomerNone')}</option>
                                        {customers.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                                {c.phone ? ` — ${c.phone}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-3 md:col-span-2 lg:col-span-3">
                                <label className="block text-sm font-bold text-gray-700">{t('common.products')}</label>
                                <>
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                <span>{t('orders.orderLinesIntro')}</span>
                                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 font-medium">
                                                    <ScanLine size={12} />
                                                    {t('orders.barcodeHint')}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-snug">
                                                {t('orders.modelCodeFormatHint')}
                                            </p>
                                        </div>
                                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-base min-w-[720px]">
                                                    <thead>
                                                        <tr className="bg-gray-50 text-left text-sm uppercase text-gray-500 font-bold">
                                                            <th className="px-3 py-2 w-36">{t('orders.modelCode')}</th>
                                                            <th className="px-3 py-2 w-28" />
                                                            <th className="px-3 py-2">{t('orders.lineProduct')}</th>
                                                            <th className="px-3 py-2 min-w-[200px]">{t('orders.lineColor')}</th>
                                                            <th className="px-3 py-2 w-24">{t('orders.lineUnitPrice')}</th>
                                                            <th className="px-3 py-2 w-20">{t('orders.quantity')}</th>
                                                            <th className="px-3 py-2 w-24">{t('orders.lineSubtotal')}</th>
                                                            <th className="px-3 py-2 w-10" />
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {orderFormTableRows.map((row) => {
                                                            if (row.type === 'catHeader') {
                                                                return (
                                                                    <tr key={row.key} className="bg-emerald-50/90">
                                                                        <td
                                                                            colSpan={8}
                                                                            className="px-3 py-2 text-sm font-bold text-emerald-900 border-t border-emerald-100"
                                                                        >
                                                                            {t('products.category')}: {row.label}
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            }
                                                            if (row.type === 'catSubtotal') {
                                                                return (
                                                                    <tr key={row.key} className="bg-indigo-50/80">
                                                                        <td
                                                                            colSpan={6}
                                                                            className="px-3 py-2 text-right text-sm font-bold text-indigo-900"
                                                                        >
                                                                            {t('orders.categorySubtotal')}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-right font-mono text-sm font-bold text-indigo-950">
                                                                            ${formatUsd(row.amount)}
                                                                        </td>
                                                                        <td className="px-3 py-2 bg-indigo-50/80" />
                                                                    </tr>
                                                                )
                                                            }
                                                            const line = row.line
                                                            const isMatrix = line.colorChoices?.length > 1
                                                            const qtySum = isMatrix
                                                                ? line.colorChoices.reduce(
                                                                      (s, c) =>
                                                                          s + (parseInt(line.colorQtyByColor?.[c] ?? '0', 10) || 0),
                                                                      0
                                                                  )
                                                                : parseInt(line.quantity, 10) || 0
                                                            const sub = computeOrderLineSubtotal(line)
                                                            const prodRow =
                                                                line.product_id &&
                                                                products.find((p) => String(p.id) === String(line.product_id))
                                                            const stockNum =
                                                                prodRow?.stock != null && prodRow.stock !== ''
                                                                    ? Number(prodRow.stock)
                                                                    : null
                                                            const stockWarn =
                                                                stockNum != null &&
                                                                Number.isFinite(stockNum) &&
                                                                stockNum >= 0 &&
                                                                qtySum > stockNum
                                                            return (
                                                                <tr key={line.id} className="bg-white">
                                                                    <td className="px-3 py-2 align-top">
                                                                        <input
                                                                            ref={line.id === firstCodeLineId ? firstModelCodeRef : undefined}
                                                                            type="text"
                                                                            className="w-full px-2 py-1.5 border rounded-lg font-mono text-sm"
                                                                            placeholder={t('orders.modelCodePlaceholder')}
                                                                            value={line.codeInput}
                                                                            onChange={(e) =>
                                                                                updateOrderLine(line.id, {
                                                                                    codeInput: e.target.value,
                                                                                    resolveError: '',
                                                                                    variants: [],
                                                                                    colorChoices: [],
                                                                                    colorQtyByColor: {},
                                                                                    product_id: null,
                                                                                    product_name: '',
                                                                                    product_price: 0,
                                                                                    color: '',
                                                                                    image_url: '',
                                                                                    readyForSort: false
                                                                                })
                                                                            }
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    e.preventDefault()
                                                                                    resolveOrderLine(line.id)
                                                                                }
                                                                            }}
                                                                        />
                                                                        {line.resolveError ? (
                                                                            <p className="text-[10px] text-red-600 mt-0.5">{line.resolveError}</p>
                                                                        ) : null}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => resolveOrderLine(line.id)}
                                                                            className="px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold whitespace-nowrap"
                                                                        >
                                                                            {t('orders.codeFetchButton')}
                                                                        </button>
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top text-gray-800">
                                                                        {line.product_id ? (
                                                                            <span className="font-medium">{line.product_name}</span>
                                                                        ) : (
                                                                            <span className="text-gray-400">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top text-sm min-w-[200px]">
                                                                        {line.variants?.length >= 2 ? (
                                                                            <select
                                                                                className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
                                                                                value={line.product_id ? String(line.product_id) : ''}
                                                                                onChange={(e) =>
                                                                                    applyVariantToLine(line.id, e.target.value)
                                                                                }
                                                                            >
                                                                                <option value="">
                                                                                    {t('orders.pickColorPlaceholder')}
                                                                                </option>
                                                                                {line.variants.map((p) => (
                                                                                    <option key={String(p.id)} value={String(p.id)}>
                                                                                        {(p.color &&
                                                                                            labelColorCanonical(
                                                                                                p.color,
                                                                                                productColors,
                                                                                                language
                                                                                            )) ||
                                                                                            displayProductName(p) ||
                                                                                            String(p.id).slice(0, 8)}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        ) : line.colorChoices?.length > 1 ? (
                                                                            <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50/80 p-2">
                                                                                <p className="text-xs font-semibold text-gray-600">
                                                                                    {t('orders.colorQtyMatrixTitle')}
                                                                                </p>
                                                                                <div className="space-y-1.5">
                                                                                    {line.colorChoices.map((c) => (
                                                                                        <div
                                                                                            key={c}
                                                                                            className="flex items-center gap-2 justify-between"
                                                                                        >
                                                                                            <span className="truncate max-w-[140px] font-medium text-gray-800 text-sm leading-snug">
                                                                                                {labelColorCanonical(
                                                                                                    c,
                                                                                                    productColors,
                                                                                                    language
                                                                                                )}
                                                                                            </span>
                                                                                            <input
                                                                                                type="number"
                                                                                                min="0"
                                                                                                step="1"
                                                                                                className="w-16 px-2 py-1 border rounded text-right text-sm font-semibold bg-white"
                                                                                                value={line.colorQtyByColor?.[c] ?? '0'}
                                                                                                onChange={(e) =>
                                                                                                    updateOrderLineColorQty(line.id, c, e.target.value)
                                                                                                }
                                                                                            />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                                <p className="text-xs text-gray-500 leading-snug">
                                                                                    {t('orders.colorQtyMatrixHint')}
                                                                                </p>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-sm font-medium text-gray-900">
                                                                                {line.color
                                                                                    ? labelColorCanonical(
                                                                                          line.color,
                                                                                          productColors,
                                                                                          language
                                                                                      )
                                                                                    : '—'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top text-sm">
                                                                        {line.product_id ? (
                                                                            <div className="space-y-1">
                                                                                <div className="flex items-center gap-0.5">
                                                                                    <span className="text-gray-500 font-mono shrink-0">$</span>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="0.01"
                                                                                        className="w-24 px-2 py-1 border rounded-lg font-mono text-sm"
                                                                                        value={
                                                                                            Number.isFinite(Number(line.product_price))
                                                                                                ? line.product_price
                                                                                                : 0
                                                                                        }
                                                                                        onChange={(e) => {
                                                                                            const raw = e.target.value
                                                                                            const n =
                                                                                                raw === ''
                                                                                                    ? 0
                                                                                                    : parseFloat(
                                                                                                          String(raw).replace(',', '.')
                                                                                                      )
                                                                                            updateOrderLine(line.id, {
                                                                                                product_price: Number.isFinite(n)
                                                                                                    ? Math.round(n * 100) / 100
                                                                                                    : 0
                                                                                            })
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                                {prodRow ? (
                                                                                    <p className="text-[10px] text-gray-500 leading-tight">
                                                                                        {t('orders.catalogPriceRef')}: $
                                                                                        {formatUsd(Number(prodRow.sale_price) || 0)}
                                                                                        {Math.abs(
                                                                                            (Number(line.product_price) || 0) -
                                                                                                (Number(prodRow.sale_price) || 0)
                                                                                        ) > 0.005 ? (
                                                                                            <button
                                                                                                type="button"
                                                                                                className="ml-2 text-blue-600 font-semibold hover:underline"
                                                                                                onClick={() =>
                                                                                                    updateOrderLine(line.id, {
                                                                                                        product_price:
                                                                                                            Math.round(
                                                                                                                (Number(prodRow.sale_price) ||
                                                                                                                    0) * 100
                                                                                                            ) / 100
                                                                                                    })
                                                                                                }
                                                                                            >
                                                                                                {t('orders.resetCatalogPrice')}
                                                                                            </button>
                                                                                        ) : null}
                                                                                    </p>
                                                                                ) : null}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="font-mono text-gray-400">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top text-sm">
                                                                        {line.product_id && isMatrix ? (
                                                                            <div className="pt-1">
                                                                                <span className="text-xs text-gray-500 block font-medium">
                                                                                    {t('orders.qtyColumnTotal')}
                                                                                </span>
                                                                                <span className="font-mono text-lg font-bold text-gray-900 tabular-nums">
                                                                                    {qtySum}
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                step="1"
                                                                                className="w-20 px-2 py-1.5 border rounded-lg text-base font-semibold tabular-nums"
                                                                                value={line.quantity}
                                                                                onChange={(e) =>
                                                                                    updateOrderLine(line.id, { quantity: e.target.value })
                                                                                }
                                                                            />
                                                                        )}
                                                                        {line.product_id && stockNum != null && Number.isFinite(stockNum) ? (
                                                                            <p
                                                                                className={`text-[10px] mt-0.5 flex items-center gap-0.5 ${stockWarn ? 'text-amber-700 font-bold' : 'text-gray-500'}`}
                                                                            >
                                                                                {stockWarn ? <AlertTriangle size={10} /> : null}
                                                                                {t('orders.stockLabel')}: {stockNum}
                                                                            </p>
                                                                        ) : null}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top font-mono text-sm font-bold">
                                                                        {line.product_id ? `$${formatUsd(sub)}` : '—'}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top">
                                                                        <div className="flex flex-col gap-1.5 items-end">
                                                                            {line.product_id && line.readyForSort === false ? (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => commitLineToSortOrder(line.id)}
                                                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                                                                                    title={t('orders.lineConfirmSortHint')}
                                                                                >
                                                                                    <CheckCircle size={14} />
                                                                                    {t('orders.lineConfirmSort')}
                                                                                </button>
                                                                            ) : null}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => removeOrderLine(line.id)}
                                                                                className="text-red-500 p-1 hover:bg-red-50 rounded"
                                                                                title={t('common.delete')}
                                                                            >
                                                                                <Trash2 size={16} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addOrderLine}
                                            className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-800"
                                        >
                                            <Plus size={18} />
                                            {t('orders.addOrderLine')}
                                        </button>
                                </>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.summa')} ($)</label>
                                <div className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-gray-900">
                                    ${formatUsd(displayFormSubtotal)}
                                </div>
                                {mergeSourceAgg ? (
                                    <p className="text-xs text-gray-600 leading-snug">{t('orders.mergeTotalsHint')}</p>
                                ) : null}
                            </div>

                            {mergeSourceAgg ? (
                                <div className="space-y-2">
                                    <label className="flex items-start gap-2 text-sm font-bold text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={mergeArchiveSources}
                                            onChange={(e) => setMergeArchiveSources(e.target.checked)}
                                            className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span>{t('orders.mergeArchiveSourcesToggle')}</span>
                                    </label>
                                    <p className="text-xs text-gray-600 leading-snug">{t('orders.mergeArchiveSourcesToggleHint')}</p>
                                </div>
                            ) : null}

                            {mergeSourceAgg ? (
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-gray-700">
                                        {t('orders.mergeTotalQtyLabel')}
                                    </label>
                                    <div className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 font-bold text-gray-900 tabular-nums">
                                        {mergeSourceAgg.totalQty}
                                    </div>
                                    <p className="text-xs text-gray-600 leading-snug">{t('orders.mergeQtyHint')}</p>
                                </div>
                            ) : null}

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.status')}</label>
                                <select
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                >
                                    <option value="new">{t('orders.statusNew')}</option>
                                    <option value="pending">{t('orders.statusProcessing')}</option>
                                    <option value="completed">{t('orders.statusCompleted')}</option>
                                    <option value="cancelled">{t('orders.statusCancelled')}</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.source')}</label>
                                <select
                                    value={form.source}
                                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                >
                                    <option value="dokon">{t('orders.adminPanel')}</option>
                                    <option value="website">{t('orders.website')}</option>
                                    <option value="telefon">{t('orders.sourcePhone')}</option>
                                </select>
                            </div>
                            <div className="md:col-span-2 lg:col-span-3 space-y-2">
                                <label className="block text-sm font-bold text-gray-700">{t('orders.note')}</label>
                                <textarea
                                    value={form.note}
                                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    rows="2"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={isSavingOrder}
                                className={`flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl shadow-lg shadow-blue-600/30 font-bold transition-all ${
                                    isSavingOrder ? 'opacity-70 cursor-not-allowed pointer-events-none' : 'hover:bg-blue-700'
                                }`}
                            >
                                <Save size={20} />
                                {isSavingOrder ? t('common.loading') : t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        {ordersListView === 'trash' ? (
                            <Archive size={48} className="mb-4 opacity-20" />
                        ) : (
                            <ShoppingCart size={48} className="mb-4 opacity-20" />
                        )}
                        <p className="font-medium text-lg">
                            {ordersListView === 'trash' ? t('orders.trashEmpty') : t('orders.noOrders')}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                    {ordersListView === 'active' ? (
                                        <th className="w-12 px-3 py-4 rounded-tl-2xl text-center" title={t('orders.mergeSelectColumn')}>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                checked={
                                                    filteredOrders.length > 0 &&
                                                    filteredOrders.every((o) => mergeSelection[o.id])
                                                }
                                                onChange={toggleMergeSelectAllFiltered}
                                                aria-label={t('orders.mergeSelectAll')}
                                            />
                                        </th>
                                    ) : null}
                                    <th className={`px-6 py-4 ${ordersListView === 'trash' ? 'rounded-tl-2xl' : ''}`}>{t('orders.idDate')}</th>
                                    <th className="px-6 py-4">{t('orders.customer')}</th>
                                    <th className="px-6 py-4">{t('orders.products')}</th>
                                    <th className="px-6 py-4">{t('orders.total')}</th>
                                    <th className="px-6 py-4">{t('orders.payment')}</th>
                                    <th className="px-6 py-4">{t('orders.status')}</th>
                                    <th className="px-6 py-4">{t('orders.source')}</th>
                                    <th className="px-6 py-4 rounded-tr-2xl text-right">{t('customers.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredOrders.map((item) => (
                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                        {ordersListView === 'active' ? (
                                            <td className="px-3 py-4 align-top text-center">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1"
                                                    checked={!!mergeSelection[item.id]}
                                                    onChange={() => toggleMergeSelectOrder(item.id)}
                                                    aria-label={t('orders.mergeSelectColumn')}
                                                />
                                            </td>
                                        ) : null}
                                        <td className="px-6 py-4">
                                            {item.order_number ? (
                                                <div className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded inline-block mb-1">
                                                    № {item.order_number}
                                                </div>
                                            ) : null}
                                            <div className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded inline-block mb-1">#{String(item.id).slice(0, 8)}</div>
                                            <div className="text-sm font-medium text-gray-700">{new Date(item.created_at).toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US')}</div>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            <div className="font-bold">{item.customer_name || item.customers?.name || 'Noma\'lum'}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5">{item.customer_phone || item.customers?.phone}</div>
                                            {item.note && <div className="text-xs text-amber-600 italic mt-1 bg-amber-50 px-2 py-0.5 rounded inline-block">{item.note}</div>}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 max-w-[300px]">
                                            {item.order_items && item.order_items.length > 0 ? (
                                                (() => {
                                                    const ois = normalizeOrderItemsForList(
                                                        dedupeOrderItemsKeepNewest(item.order_items || [])
                                                    )
                                                    const expanded = !!orderListExpandedById[item.id]
                                                    const hasMore = ois.length > ORDER_LIST_ITEMS_PREVIEW
                                                    const visible = expanded ? ois : ois.slice(0, ORDER_LIST_ITEMS_PREVIEW)
                                                    const hiddenCount = ois.length - ORDER_LIST_ITEMS_PREVIEW
                                                    return (
                                                        <div className="space-y-1">
                                                            {visible.map((oi, idx) => (
                                                                <div
                                                                    key={oi.id || idx}
                                                                    className="text-base border-b border-gray-100 last:border-0 pb-1 mb-1 last:mb-0"
                                                                >
                                                                    <div className="flex items-start gap-2.5 min-w-0">
                                                                        {oi.image_url ? (
                                                                            <div className="shrink-0 w-20 h-20 min-w-[5rem] max-w-[5rem] min-h-[5rem] max-h-[5rem] rounded-lg bg-white flex items-center justify-center overflow-hidden ring-1 ring-gray-200/60">
                                                                                <img
                                                                                    src={oi.image_url}
                                                                                    alt=""
                                                                                    className="max-h-full max-w-full object-contain object-center mix-blend-multiply"
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="shrink-0 w-20 h-20 min-w-[5rem] max-w-[5rem] min-h-[5rem] max-h-[5rem] rounded-lg border border-dashed border-gray-200/90 bg-white" />
                                                                        )}
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="font-medium text-gray-800 line-clamp-1">
                                                                                {oi.product_name || oi.products?.name}
                                                                            </div>
                                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                                                                <span className="font-bold text-blue-700 text-lg tabular-nums">
                                                                                    {oi.quantity}x
                                                                                </span>
                                                                                <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5 font-medium">
                                                                                    {oi.size && <span>Kod: {oi.size}</span>}
                                                                                    {oi.color && (
                                                                                        <span>
                                                                                            {t('orders.lineColor')}:{' '}
                                                                                            {labelColorCanonical(
                                                                                                oi.color,
                                                                                                productColors,
                                                                                                language
                                                                                            )}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {hasMore ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setOrderListExpandedById((prev) => ({
                                                                            ...prev,
                                                                            [item.id]: !prev[item.id]
                                                                        }))
                                                                    }
                                                                    className="mt-1 flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                                                                >
                                                                    {expanded ? (
                                                                        <>
                                                                            <ChevronUp size={14} className="shrink-0" />
                                                                            {t('orders.orderListCollapse')}
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <ChevronDown size={14} className="shrink-0" />
                                                                            {t('orders.orderListExpand')}
                                                                            <span className="font-normal text-gray-500">
                                                                                (
                                                                                {t('orders.orderListHiddenCount').replace(
                                                                                    '{n}',
                                                                                    String(hiddenCount)
                                                                                )}
                                                                                )
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    )
                                                })()
                                            ) : (
                                                <span className="text-gray-400 italic text-xs">Bo'sh</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-900 font-mono">
                                            ${formatUsd(item.total)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 text-xs">
                                                <span className="font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded inline-block text-center">
                                                    {item.payment_method_detail || t('orders.cash')}
                                                </span>
                                                {item.receipt_url && (
                                                    <a
                                                        href={item.receipt_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-700 hover:underline flex items-center justify-center gap-1 mt-1 font-bold"
                                                    >
                                                        <FileText size={12} />
                                                        Chek
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={normalizeStatusForSelect(item.status)}
                                                onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer outline-none transition-colors ${item.status === 'new' || item.status === 'Yangi' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                                                    item.status === 'pending' || item.status === 'Jarayonda' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                                                        item.status === 'completed' || item.status === 'Tugallandi' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                                                            'bg-red-100 text-red-700 hover:bg-red-200'
                                                    }`}
                                            >
                                                <option value="new">{t('orders.statusNew')}</option>
                                                <option value="pending">{t('orders.statusProcessing')}</option>
                                                <option value="completed">{t('orders.statusCompleted')}</option>
                                                <option value="cancelled">{t('orders.statusCancelled')}</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`text-[10px] uppercase font-bold px-2 py-1 rounded-lg ${
                                                    item.source === 'website'
                                                        ? 'bg-indigo-100 text-indigo-700'
                                                        : item.source === 'telefon'
                                                          ? 'bg-amber-100 text-amber-800'
                                                          : 'bg-gray-100 text-gray-600'
                                                }`}
                                            >
                                                {item.source === 'website'
                                                    ? 'Web'
                                                    : item.source === 'telefon'
                                                      ? t('orders.sourcePhoneShort')
                                                      : t('orders.sourceStoreShort')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1 flex-wrap justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => handlePrintOrder(item, true)}
                                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                    title={t('orders.printWithPrices')}
                                                >
                                                    <Receipt size={18} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handlePrintOrder(item, false)}
                                                    className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                                                    title={t('orders.printNoPrices')}
                                                >
                                                    <List size={18} />
                                                </button>
                                                {ordersListView === 'active' ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEdit(item)}
                                                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/25 transition-colors hover:bg-blue-700"
                                                            title={t('orders.editOrder')}
                                                        >
                                                            <Edit size={16} className="shrink-0" />
                                                            <span>{t('common.edit')}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(item.id)}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title={t('orders.moveToTrashTitle')}
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRestoreOrder(item.id)}
                                                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-green-600/25 transition-colors hover:bg-green-700"
                                                            title={t('orders.restoreOrderTitle')}
                                                        >
                                                            <RotateCcw size={16} className="shrink-0" />
                                                            <span>{t('orders.restoreOrder')}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePermanentDelete(item.id)}
                                                            className="p-2 text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                                            title={t('orders.permanentDeleteTitle')}
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}