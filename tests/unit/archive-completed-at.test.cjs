/**
 * Arxiv muddati: tugallangan sanadan 30 kun (created_at emas).
 * Run: node --test tests/unit/archive-completed-at.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const COMPLETED_ARCHIVE_AFTER_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

function getCompletedOrderTimestamp(order) {
    const raw = order?.completed_at || order?.updated_at || ''
    if (!raw) return null
    const t = new Date(raw).getTime()
    return Number.isNaN(t) ? null : t
}

function shouldAutoArchiveCompletedOrder(order, nowMs = Date.now()) {
    if (!order || order.deleted_at || order.archived_at) return false
    const s = String(order.status || '').toLowerCase()
    if (!(s === 'completed' || s.includes('tugallan'))) return false
    if (!order.completed_at && !order.updated_at) return false
    const t = getCompletedOrderTimestamp(order)
    if (t == null) return false
    return nowMs - t >= COMPLETED_ARCHIVE_AFTER_DAYS * DAY
}

describe('archive from completed_at not created_at', () => {
    const now = Date.parse('2026-07-29T12:00:00.000Z')

    it('created_at eski bo‘lsa ham completed_at yangi bo‘lsa arxivlamaydi', () => {
        const order = {
            status: 'completed',
            created_at: '2025-01-01T00:00:00.000Z',
            completed_at: '2026-07-20T00:00:00.000Z',
            updated_at: '2026-07-20T00:00:00.000Z',
        }
        assert.equal(shouldAutoArchiveCompletedOrder(order, now), false)
    })

    it('completed_at 30+ kun oldin bo‘lsa arxivlaydi', () => {
        const order = {
            status: 'completed',
            created_at: '2026-07-01T00:00:00.000Z',
            completed_at: '2026-06-01T00:00:00.000Z',
            updated_at: '2026-06-01T00:00:00.000Z',
        }
        assert.equal(shouldAutoArchiveCompletedOrder(order, now), true)
    })

    it('faqat created_at bor — arxivlamaydi (buyurtma tushgan sana)', () => {
        const order = {
            status: 'completed',
            created_at: '2025-01-01T00:00:00.000Z',
        }
        assert.equal(shouldAutoArchiveCompletedOrder(order, now), false)
    })

    it('getCompletedOrderTimestamp created_at ni e’tiborsiz qoldiradi', () => {
        const t = getCompletedOrderTimestamp({
            created_at: '2020-01-01T00:00:00.000Z',
            completed_at: '2026-07-01T00:00:00.000Z',
        })
        assert.equal(t, Date.parse('2026-07-01T00:00:00.000Z'))
    })
})
