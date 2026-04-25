/**
 * O‘zbekiston mobil: 998 + 9 raqam (jami 12 ta).
 * 90… yoki +998… kiritilsa ham yagona 998XXXXXXXXX qaytadi.
 * 9 ta raqam 998 bilan boshlansa — bu noto‘liq (998 + 6 ta), rad etiladi.
 */
export function normalizeUzbekPhone(input) {
    if (input == null || input === '') return ''
    const d = String(input).replace(/\D/g, '')
    if (d.length < 9) return ''

    if (d.length >= 12) {
        const last12 = d.slice(-12)
        if (/^998[1-9]\d{8}$/.test(last12)) return last12
        return ''
    }

    if (d.length === 9) {
        if (d.startsWith('998')) return ''
        if (/^[1-9]\d{8}$/.test(d)) return `998${d}`
        return ''
    }

    if (d.length === 10 && d[0] === '9') {
        const nine = d.slice(1)
        if (/^[1-9]\d{8}$/.test(nine)) return `998${nine}`
    }

    return ''
}
