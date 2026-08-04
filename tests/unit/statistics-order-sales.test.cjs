/**
 * Pure helpers for statistics sales (no Supabase).
 * Run: node --test tests/unit/statistics-order-sales.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

// Inline mirrors of key logic (keep in sync with src/utils/statisticsOrderSales.js + completedOrderSales)
function isCompletedOrderStatus(status) {
    if (status == null || status === '') return false
    const s = String(status).toLowerCase().trim()
    if (s === 'completed' || s === 'tugallandi' || s === 'tugallangan') return true
    if (s.includes('tugallan')) return true
    if (s.includes('заверш') || s === 'done') return true
    return false
}

function isCancelledOrderStatus(status) {
    const s = String(status || '')
        .toLowerCase()
        .trim()
    if (!s) return false
    return s === 'cancelled' || s.includes('bekor') || s.includes('cancel')
}

function isSalesCountableOrder(order) {
    if (!order || isCancelledOrderStatus(order.status)) return false
    if (isCompletedOrderStatus(order.status)) return true
    return (Number(order?.fulfillment?.shipped) || 0) > 0
}

function salesAnchorRaw(order) {
    if (isCompletedOrderStatus(order?.status)) {
        return order?.completed_at || order?.updated_at || order?.created_at || ''
    }
    return order?._latestShipAt || order?.updated_at || order?.created_at || ''
}

describe('statistics order sales', () => {
    it('counts completed orders', () => {
        assert.equal(isSalesCountableOrder({ status: 'completed' }), true)
        assert.equal(isSalesCountableOrder({ status: 'Tugallandi' }), true)
    })

    it('counts partial shipped pending orders', () => {
        assert.equal(
            isSalesCountableOrder({ status: 'pending', fulfillment: { shipped: 2 } }),
            true
        )
        assert.equal(
            isSalesCountableOrder({ status: 'new', fulfillment: { shipped: 0 } }),
            false
        )
    })

    it('excludes cancelled even with shipped', () => {
        assert.equal(
            isSalesCountableOrder({ status: 'cancelled', fulfillment: { shipped: 5 } }),
            false
        )
    })

    it('prefers completed_at for completed, ship date for partial', () => {
        assert.equal(
            salesAnchorRaw({
                status: 'completed',
                completed_at: '2026-01-15T10:00:00Z',
                updated_at: '2026-02-01T10:00:00Z',
                created_at: '2026-01-01T10:00:00Z',
            }),
            '2026-01-15T10:00:00Z'
        )
        assert.equal(
            salesAnchorRaw({
                status: 'pending',
                _latestShipAt: '2026-03-10T12:00:00Z',
                updated_at: '2026-03-01T12:00:00Z',
                created_at: '2026-02-01T12:00:00Z',
            }),
            '2026-03-10T12:00:00Z'
        )
    })
})
