/**
 * Qisman chiqim: stock_movements.color_key hech qachon null bo‘lmasin.
 * Aks holda order_items.color bilan kalit mos kelmaydi — «Chiqqan» 0 da qoladi.
 */

/**
 * @param {string|null|undefined} colorKeyResolved — katalog bucket (resolveColorBucketKey)
 * @param {string|null|undefined} itemColor — buyurtma qatori rangi
 * @returns {string}
 */
export function resolveMovementColorKey(colorKeyResolved, itemColor) {
    const fromBucket = colorKeyResolved != null ? String(colorKeyResolved).trim() : ''
    if (fromBucket) return fromBucket
    const fromItem = itemColor != null ? String(itemColor).trim() : ''
    if (fromItem) return fromItem
    return '—'
}
