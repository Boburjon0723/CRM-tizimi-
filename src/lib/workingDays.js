/**
 * Tanlangan oyda dushanba–shanba kunlari soni (yakshanba dam).
 * Ish/dam kunlari yig‘indisi uchun bazaviy sifatida ishlatiladi.
 */
export function countMonSatWeekdaysInMonth(periodYm) {
    const s = String(periodYm || '').trim()
    const m = /^(\d{4})-(\d{2})$/.exec(s)
    if (!m) return 26
    const y = Number(m[1])
    const mo = Number(m[2])
    if (mo < 1 || mo > 12) return 26
    const last = new Date(y, mo, 0).getDate()
    let n = 0
    for (let d = 1; d <= last; d++) {
        const wd = new Date(y, mo - 1, d).getDay()
        if (wd >= 1 && wd <= 6) n++
    }
    return n
}
