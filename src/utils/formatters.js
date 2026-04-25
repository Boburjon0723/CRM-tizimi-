/**
 * Amoutni USD formatida (1,234.56) qaytarish
 */
export function formatUsd(amount) {
    const n = Number(amount)
    if (!Number.isFinite(n)) return '0'
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/**
 * Amoutni UZS formatida (1 234 567 so'm) qaytarish
 */
export function formatUzs(amount, language = 'uz') {
    const n = Number(amount) || 0
    const suffix = language === 'uz' ? "so'm" : language === 'ru' ? 'сум' : 'UZS'
    return `${n.toLocaleString('uz-UZ')} ${suffix}`
}

/**
 * Sanani lokal formatda qaytarish
 */
export function formatDate(dateStr, language = 'uz') {
    if (!dateStr) return '-'
    const locale = language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ'
    try {
        return new Date(dateStr).toLocaleDateString(locale, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        })
    } catch (e) {
        return dateStr
    }
}
