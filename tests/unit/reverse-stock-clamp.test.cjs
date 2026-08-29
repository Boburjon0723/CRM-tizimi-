/**
 * Qaytarish (reversal) yo‘qdan zaxira yaratmasligi.
 *
 * Muammo: zaxira 0 bo‘lganda chiqim `-300` deb yozilsa ham
 * `previous_stock → new_stock` 0 → 0 bo‘lib qoladi (hech narsa ayrilmaydi).
 * Eski kod qaytarishda so‘ralgan miqdorni shartsiz qo‘shar edi → 0 → 300.
 *
 * Run: node --test tests/unit/reverse-stock-clamp.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

/** inventoryService.loadRealDeductedByProduct ichidagi yig‘ish mantiqi */
function computeRealDeductedByProduct(rows) {
    const out = new Map()
    for (const row of rows || []) {
        const pid = String(row.product_id || '')
        if (!pid) continue
        const prev = Number(row.previous_stock) || 0
        const next = Number(row.new_stock) || 0
        const acc = Number(out.get(pid)) || 0
        if (String(row.type) === 'reversal') {
            out.set(pid, acc - Math.max(0, next - prev))
        } else {
            out.set(pid, acc + Math.max(0, prev - next))
        }
    }
    return out
}

/** reverseStockForOrder ichidagi cheklash mantiqi */
function clampReturnQty(budgetByProduct, productId, requestedQty) {
    if (!budgetByProduct) return requestedQty
    const pid = String(productId)
    const budget = Math.max(0, Number(budgetByProduct.get(pid)) || 0)
    const qty = Math.min(requestedQty, budget)
    budgetByProduct.set(pid, budget - qty)
    return qty
}

describe('reversal yo‘qdan zaxira yaratmaydi', () => {
    it('zaxira 0 bo‘lgan chiqimdan keyin qaytarish 0 beradi', () => {
        // M-503 ning haqiqiy tarixi: sale -300 | 0 → 0
        const budget = computeRealDeductedByProduct([
            { product_id: 'M-503', type: 'sale', previous_stock: 0, new_stock: 0 },
        ])
        assert.equal(budget.get('M-503'), 0)
        assert.equal(clampReturnQty(budget, 'M-503', 300), 0)
    })

    it('haqiqatan ayrilgan miqdorgacha qaytaradi', () => {
        const budget = computeRealDeductedByProduct([
            { product_id: 'p1', type: 'sale', previous_stock: 100, new_stock: 40 },
        ])
        assert.equal(budget.get('p1'), 60)
        assert.equal(clampReturnQty(budget, 'p1', 250), 60)
    })

    it('so‘ralgan miqdor kamroq bo‘lsa o‘shanchasi qaytadi', () => {
        const budget = computeRealDeductedByProduct([
            { product_id: 'p1', type: 'sale', previous_stock: 100, new_stock: 0 },
        ])
        assert.equal(clampReturnQty(budget, 'p1', 30), 30)
        assert.equal(budget.get('p1'), 70)
    })

    it('avval qaytarilgan qism budjetdan ayriladi', () => {
        const budget = computeRealDeductedByProduct([
            { product_id: 'p1', type: 'sale', previous_stock: 100, new_stock: 0 },
            { product_id: 'p1', type: 'reversal', previous_stock: 0, new_stock: 80 },
        ])
        assert.equal(budget.get('p1'), 20)
        assert.equal(clampReturnQty(budget, 'p1', 100), 20)
    })

    it('bir mahsulotning bir nechta rangi umumiy budjetni bo‘lishadi', () => {
        const budget = computeRealDeductedByProduct([
            { product_id: 'p1', type: 'sale', previous_stock: 100, new_stock: 60 },
            { product_id: 'p1', type: 'sale', previous_stock: 60, new_stock: 50 },
        ])
        assert.equal(budget.get('p1'), 50)
        assert.equal(clampReturnQty(budget, 'p1', 40), 40)
        assert.equal(clampReturnQty(budget, 'p1', 40), 10)
        assert.equal(clampReturnQty(budget, 'p1', 40), 0)
    })

    it('harakat topilmasa qaytarish yo‘q', () => {
        const budget = computeRealDeductedByProduct([])
        assert.equal(clampReturnQty(budget, 'p1', 500), 0)
    })

    it('budjet olinmasa (so‘rov xatosi) eski xatti-harakat qoladi', () => {
        assert.equal(clampReturnQty(null, 'p1', 500), 500)
    })

    it('M-503 bugungi holati: 650 dona fantom qaytarish bo‘lmaydi', () => {
        const budget = computeRealDeductedByProduct([
            { product_id: 'M-503', type: 'sale', previous_stock: 0, new_stock: 0 },
            { product_id: 'M-503', type: 'sale', previous_stock: 0, new_stock: 0 },
            { product_id: 'M-503', type: 'sale', previous_stock: 0, new_stock: 0 },
        ])
        const returned = [300, 250, 100].map((q) => clampReturnQty(budget, 'M-503', q))
        assert.deepEqual(returned, [0, 0, 0])
    })
})
