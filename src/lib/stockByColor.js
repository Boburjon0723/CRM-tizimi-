/**
 * Mahsulotdagi rang bo‘yicha zaxira — Ombor sahifasi va inventoryService uchun umumiy yordamchilar.
 * `buyurtmalar/utils` emas — yengil import (ombor SSR/bundle uchun).
 */
import { normalizeModelKey } from '@/utils/validators'

/** Buyurtma qatori rangi bilan bir xil kalit (buyurtmalar/utils bilan mos) */
function normalizeOrderItemColorKey(color) {
    const raw = (color != null ? String(color) : '').trim() || '—'
    return normalizeModelKey(raw)
}

export function numStock(v) {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, n) : 0
}

/** Katalogdagi ranglar ro‘yxati (colors[] yoki color) — ombor bilan bir xil */
export function listProductColors(p) {
    const arr = Array.isArray(p?.colors) ? p.colors : []
    const names = arr.map((c) => String(c ?? '').trim()).filter(Boolean)
    const uniq = [...new Set(names)]
    if (uniq.length) return uniq
    const legacy = p?.color != null ? String(p.color).trim() : ''
    return legacy ? [legacy] : []
}

export function parseStockByColor(p) {
    const raw = p?.stock_by_color
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const o = {}
        for (const [k, v] of Object.entries(raw)) {
            const n = Number(v)
            if (Number.isFinite(n) && n >= 0) o[k] = Math.floor(n)
        }
        return o
    }
    return {}
}

export function sumStockByColor(map) {
    if (!map || typeof map !== 'object') return 0
    return Object.values(map).reduce(
        (s, n) => s + (Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0),
        0
    )
}

/**
 * Ko‘rsatish / tahrir: rang kalitlari bilan; DB bo‘sh bo‘lsa joriy jami ranglarga taqsimlanadi
 * (ombor sahifasidagi bilan bir xil mantiq).
 */
export function buildStockByColorMap(product) {
    const colors = listProductColors(product)
    if (!colors.length) return {}
    const fromDb = parseStockByColor(product)
    const out = {}
    let sumDb = 0
    for (const c of colors) {
        const v = fromDb[c]
        const n = v != null && Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0
        out[c] = n
        sumDb += n
    }
    if (sumDb > 0) return out
    const total = numStock(product.stock)
    if (total <= 0) return Object.fromEntries(colors.map((c) => [c, 0]))
    const per = Math.floor(total / colors.length)
    let rem = total - per * colors.length
    colors.forEach((c, i) => {
        out[c] = per + (i === 0 ? rem : 0)
    })
    return out
}

export function productHasColorVariants(p) {
    return listProductColors(p).length > 0
}

/**
 * Buyurtma qatori rangini katalog kalitiga moslaydi.
 * @returns {string|null}
 */
export function resolveColorBucketKey(product, orderColorRaw) {
    const keys = listProductColors(product)
    if (!keys.length) return null
    const needle = normalizeOrderItemColorKey(orderColorRaw)
    for (const k of keys) {
        if (normalizeOrderItemColorKey(k) === needle) return k
    }
    return null
}
