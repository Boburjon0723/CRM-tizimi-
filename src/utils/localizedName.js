export function pickLocalizedName(row, lang) {
    if (!row) return ''
    if (lang === 'ru') return row.name_ru || row.name_uz || row.name_en || ''
    if (lang === 'en') return row.name_en || row.name_uz || row.name_ru || ''
    return row.name_uz || row.name_ru || row.name_en || ''
}
