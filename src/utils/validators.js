/**
 * Model kodi yoki SKU ni solishtirish uchun normalizatsiya qilish.
 * Bo'shliqlar, chiziqlar va katta/kichik harflarni bir xillashtiradi.
 */
export function normalizeModelKey(s) {
    return String(s || '')
        .trim()
        .normalize('NFKC')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/\s+/g, ' ')
        .toLowerCase()
}

/**
 * Rang kalitini normalizatsiya qilish. 
 * Agar bo'sh bo'lsa '—' beradi.
 */
export function normalizeColorKey(color) {
    const raw = (color != null ? String(color) : '').trim() || '—'
    return normalizeModelKey(raw)
}

/**
 * Natural tartibda solishtirish (A-2 < A-10)
 */
export function naturalCompare(a, b) {
    const sa = a != null ? String(a) : ''
    const sb = b != null ? String(b) : ''
    return sa.localeCompare(sb, 'uz', { numeric: true, sensitivity: 'base' })
}
