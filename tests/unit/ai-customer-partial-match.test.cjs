/**
 * Qisman mijoz ismi filtri testi.
 * node --test tests/unit/ai-customer-partial-match.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

function normalizeSearchText(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[ʼ'`´]/g, "'")
        .replace(/[‘’]/g, "'")
        .trim()
}

function scoreOrderMatch(order, items, hints) {
    if (!hints.length) return { matched: false, score: 0, customerHit: false }
    const customer = normalizeSearchText(`${order.customer_name || ''} ${order.customers?.name || ''}`)
    const customerTokens = customer.split(/\s+/).filter((t) => t.length >= 2)
    let score = 0
    let customerHit = false
    for (const h of hints) {
        if (!h || h.length < 2) continue
        if (customer && customer.includes(h)) {
            score += 600
            customerHit = true
        } else if (
            customerTokens.some(
                (tok) =>
                    tok.startsWith(h) ||
                    h.startsWith(tok) ||
                    (h.length >= 3 && tok.includes(h)) ||
                    (tok.length >= 3 && h.includes(tok))
            )
        ) {
            score += 450
            customerHit = true
        }
    }
    return { matched: score > 0, score, customerHit }
}

describe('partial customer name match', () => {
    const order = {
        customer_name: 'Klent Rustam Tojikiston Dushanbe',
        order_number: 'ORD-20260327-225902',
    }

    it('to‘liq ism', () => {
        const r = scoreOrderMatch(order, [], ['rustam tojikiston'])
        assert.equal(r.customerHit, true)
        assert.ok(r.score > 0)
    })

    it('qisman: Rust', () => {
        const r = scoreOrderMatch(order, [], ['rust'])
        assert.equal(r.customerHit, true)
    })

    it('qisman: rustam', () => {
        const r = scoreOrderMatch(order, [], ['rustam'])
        assert.equal(r.customerHit, true)
    })

    it('boshqa ism mos kelmasin', () => {
        const r = scoreOrderMatch(order, [], ['alisher'])
        assert.equal(r.customerHit, false)
    })
})
