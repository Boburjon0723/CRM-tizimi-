import { normalizeModelKey } from '@/utils/validators'
import {
    displayProductName,
    productNameFields,
    productDescriptionFields,
    normalizeColorsArray,
    seedColorQtyForMatrix,
} from '../utils'

function dedupeProducts(list) {
    const seen = new Set()
    return list.filter((p) => {
        const id = String(p.id)
        if (seen.has(id)) return false
        seen.add(id)
        return true
    })
}

export function getProductsByModelCode(products, code) {
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

/** Tahrir / import: bazadan kelgan qatorlarni mahsulot bilan boyitish */
export function enrichOrderLinesFromDb(lines, products, t) {
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
        const { list, reason } = getProductsByModelCode(products, ln.codeInput)
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
                readyForSort: false,
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
                    readyForSort: false,
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
                readyForSort: false,
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
            readyForSort: false,
        }
    })
}

export function createDefaultOrderForm() {
    return {
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        total: '',
        status: 'new',
        note: '',
        source: 'dokon',
    }
}
