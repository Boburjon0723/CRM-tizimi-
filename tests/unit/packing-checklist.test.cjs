/**
 * Ranglar yig‘indisi — qadoqlash blankasi uchun.
 * Run: node --test tests/unit/packing-checklist.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

function parseOrderItemQty(q) {
    const n = Number(q)
    return Number.isFinite(n) ? n : 0
}

function normalizeOrderItemColorKey(c) {
    return String(c || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .trim() || '—'
}

function sortColorPairsByStandardOrder(pairs) {
    return [...(pairs || [])].sort((a, b) =>
        String(a?.[0] || '').localeCompare(String(b?.[0] || ''), 'uz')
    )
}

function aggregateOrderColorTotals(groupedBuckets) {
    const map = new Map()
    for (const g of groupedBuckets || []) {
        for (const [raw, qty] of g.colorPairs || []) {
            const colorLabel = String(raw || '—').trim() || '—'
            const nk = normalizeOrderItemColorKey(colorLabel)
            const prev = map.get(nk)
            const nextQty = (prev ? prev.qty : 0) + (parseOrderItemQty(qty) || 0)
            map.set(nk, { label: prev?.label ?? colorLabel, qty: nextQty })
        }
    }
    return sortColorPairsByStandardOrder(
        Array.from(map.values()).map(({ label, qty }) => [label, qty])
    )
}

describe('aggregateOrderColorTotals', () => {
    it('bir nechta SKU dagi bir xil ranglarni qo‘shadi', () => {
        const grouped = [
            { colorPairs: [['Oq', 100], ['Jigarrang', 50]] },
            { colorPairs: [['oq', 20], ['Qora', 30]] },
        ]
        const rows = aggregateOrderColorTotals(grouped)
        const asMap = Object.fromEntries(rows.map(([c, q]) => [normalizeOrderItemColorKey(c), q]))
        assert.equal(asMap.oq, 120)
        assert.equal(asMap.jigarrang, 50)
        assert.equal(asMap.qora, 30)
        const total = rows.reduce((s, [, q]) => s + q, 0)
        assert.equal(total, 200)
    })

    it('bo‘sh buyurtmada bo‘sh ro‘yxat', () => {
        assert.deepEqual(aggregateOrderColorTotals([]), [])
        assert.deepEqual(aggregateOrderColorTotals(null), [])
    })
})
