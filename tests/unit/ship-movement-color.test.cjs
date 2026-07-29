/**
 * Qisman chiqim: color_key ↔ order_items.color mosligi (regression).
 * Run: node --test tests/unit/ship-movement-color.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

/** src/lib/shipMovementColor.js bilan bir xil */
function resolveMovementColorKey(colorKeyResolved, itemColor) {
    const fromBucket = colorKeyResolved != null ? String(colorKeyResolved).trim() : ''
    if (fromBucket) return fromBucket
    const fromItem = itemColor != null ? String(itemColor).trim() : ''
    if (fromItem) return fromItem
    return '—'
}

/** Soddalashtirilgan kalit (normalizeModelKey asosida) */
function orderItemShipKey(productId, colorRaw) {
    const raw = (colorRaw != null ? String(colorRaw) : '').trim() || '—'
    const norm =
        raw === '—'
            ? '—'
            : String(raw)
                  .trim()
                  .normalize('NFKC')
                  .replace(/[\u2013\u2014\u2212]/g, '-')
                  .replace(/\s+/g, ' ')
                  .toLowerCase()
    return `${String(productId)}::${norm}`
}

function applyMovementRowsToMap(out, rows) {
    for (const r of rows || []) {
        const key = orderItemShipKey(r.product_id, r.color_key || '—')
        const prev = Number(out.get(key)) || 0
        const deltaAbs = Math.abs(Number(r.change_amount) || 0)
        if (String(r.type) === 'reversal') {
            out.set(key, Math.max(0, prev - deltaAbs))
        } else {
            out.set(key, prev + deltaAbs)
        }
    }
    return out
}

function computeOrderFulfillment(orderItems, shippedMap) {
    const agg = new Map()
    for (const oi of orderItems || []) {
        if (!oi?.product_id) continue
        const key = orderItemShipKey(oi.product_id, oi.color || '—')
        const q = Number(oi.quantity) || 0
        if (q <= 0) continue
        agg.set(key, (Number(agg.get(key)) || 0) + q)
    }
    let ordered = 0
    let shipped = 0
    for (const [key, qty] of agg.entries()) {
        ordered += qty
        shipped += Math.min(qty, Number(shippedMap.get(key)) || 0)
    }
    const remaining = Math.max(0, ordered - shipped)
    let state = 'none'
    if (ordered > 0 && shipped > 0 && remaining > 0) state = 'partial'
    else if (ordered > 0 && remaining === 0 && shipped > 0) state = 'full'
    return { ordered, shipped, remaining, state }
}

describe('resolveMovementColorKey', () => {
    it('katalog bucket ni afzal ko‘radi', () => {
        assert.equal(resolveMovementColorKey('Kulrang', 'kulrang'), 'Kulrang')
    })

    it('bucket null bo‘lsa buyurtma rangini yozadi (eski bug fix)', () => {
        assert.equal(resolveMovementColorKey(null, 'kulrang'), 'kulrang')
        assert.equal(resolveMovementColorKey(undefined, 'navot'), 'navot')
        assert.equal(resolveMovementColorKey('', 'oq'), 'oq')
    })

    it('ikkala ham bo‘sh bo‘lsa —', () => {
        assert.equal(resolveMovementColorKey(null, null), '—')
        assert.equal(resolveMovementColorKey(null, ''), '—')
    })
})

describe('partial ship fulfillment color_key matching', () => {
    const productId = 'prod-m544'
    const items = [
        { product_id: productId, color: 'kulrang', quantity: 10 },
        { product_id: productId, color: 'navot', quantity: 5 },
    ]

    it('REGRESSION: color_key=null bo‘lsa chiqqan 0 qoladi', () => {
        const map = applyMovementRowsToMap(
            new Map(),
            [{ product_id: productId, color_key: null, change_amount: -10, type: 'sale' }]
        )
        const f = computeOrderFulfillment(items, map)
        assert.equal(f.shipped, 0, 'null color_key buyurtma rangi bilan mos kelmasligi kerak')
        assert.equal(f.state, 'none')
    })

    it('FIX: item.color dan yozilgan color_key chiqqanni hisoblaydi', () => {
        const stored = resolveMovementColorKey(null, 'kulrang')
        const map = applyMovementRowsToMap(
            new Map(),
            [
                {
                    product_id: productId,
                    color_key: stored,
                    change_amount: -10,
                    type: 'sale',
                },
            ]
        )
        const f = computeOrderFulfillment(items, map)
        assert.equal(f.shipped, 10)
        assert.equal(f.remaining, 5)
        assert.equal(f.state, 'partial')
    })

    it('ikkala rang to‘liq chiqqanda state=full', () => {
        const map = applyMovementRowsToMap(
            new Map(),
            [
                {
                    product_id: productId,
                    color_key: resolveMovementColorKey(null, 'kulrang'),
                    change_amount: -10,
                    type: 'sale',
                },
                {
                    product_id: productId,
                    color_key: resolveMovementColorKey('navot', 'navot'),
                    change_amount: -5,
                    type: 'sale',
                },
            ]
        )
        const f = computeOrderFulfillment(items, map)
        assert.equal(f.shipped, 15)
        assert.equal(f.remaining, 0)
        assert.equal(f.state, 'full')
    })

    it('orderItemShipKey catalog vs buyurtma rangi (case) mos', () => {
        const a = orderItemShipKey(productId, 'Kulrang')
        const b = orderItemShipKey(productId, 'kulrang')
        assert.equal(a, b)
    })
})
