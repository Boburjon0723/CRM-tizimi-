/**
 * Arxiv muddati: completed_at → updated_at → created_at (legacy fallback).
 * Run: node --test tests/unit/archive-completed-at.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const COMPLETED_ARCHIVE_AFTER_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

function getCompletedOrderTimestamp(order) {
    const raw = order?.completed_at || order?.updated_at || order?.created_at || ''
    if (!raw) return null
    const t = new Date(raw).getTime()
    return Number.isNaN(t) ? null : t
}

function shouldAutoArchiveCompletedOrder(order, nowMs = Date.now()) {
    if (!order || order.deleted_at || order.archived_at) return false
    const s = String(order.status || '').toLowerCase()
    if (!(s === 'completed' || s.includes('tugallan'))) return false
    const t = getCompletedOrderTimestamp(order)
    if (t == null) return false
    return nowMs - t >= COMPLETED_ARCHIVE_AFTER_DAYS * DAY
}

const MERGE_SOURCE_NOTE_PREFIX = 'Birlashtirildi →'

function isMergeSourceOrder(order) {
    return /Birlashtirildi\s*(→|->)/i.test(String(order?.note || ''))
}

function isMergeResultOrder(order) {
    return /Birlashtirilgan buyurtmalar/i.test(String(order?.note || ''))
}

function isMergeRelatedOrder(order) {
    return isMergeSourceOrder(order) || isMergeResultOrder(order)
}

function buildMergeSourceNote(existingNote, resultOrderLabel) {
    const base = String(existingNote || '').trim()
    const mark = `${MERGE_SOURCE_NOTE_PREFIX} ${resultOrderLabel}`
    if (isMergeSourceOrder({ note: base })) return base
    return base ? `${base}\n${mark}` : mark
}

function shouldMigrateCompletedTrashToArchive(order, nowMs = Date.now()) {
    if (!order?.deleted_at || order.archived_at) return false
    const s = String(order.status || '').toLowerCase()
    if (!(s === 'completed' || s.includes('tugallan'))) return false
    if (isMergeRelatedOrder(order)) return false
    const t = getCompletedOrderTimestamp(order)
    if (t == null) return false
    return nowMs - t >= COMPLETED_ARCHIVE_AFTER_DAYS * DAY
}

describe('archive timestamp priority', () => {
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

    it('faqat created_at bor va 30+ kun — arxivlaydi (legacy fallback)', () => {
        const order = {
            status: 'completed',
            created_at: '2025-01-01T00:00:00.000Z',
        }
        assert.equal(shouldAutoArchiveCompletedOrder(order, now), true)
    })

    it('faqat created_at bor lekin yosh — arxivlamaydi', () => {
        const order = {
            status: 'completed',
            created_at: '2026-07-20T00:00:00.000Z',
        }
        assert.equal(shouldAutoArchiveCompletedOrder(order, now), false)
    })

    it('getCompletedOrderTimestamp completed_at ni ustun qo‘yadi', () => {
        const t = getCompletedOrderTimestamp({
            created_at: '2020-01-01T00:00:00.000Z',
            completed_at: '2026-07-01T00:00:00.000Z',
        })
        assert.equal(t, Date.parse('2026-07-01T00:00:00.000Z'))
    })

    it('korzinkadagi eski tugallangan — migrate', () => {
        const order = {
            status: 'completed',
            deleted_at: '2026-07-01T00:00:00.000Z',
            created_at: '2025-01-01T00:00:00.000Z',
        }
        assert.equal(shouldMigrateCompletedTrashToArchive(order, now), true)
    })

    it('korzinkadagi new — migrate qilmaydi', () => {
        const order = {
            status: 'new',
            deleted_at: '2026-07-01T00:00:00.000Z',
            created_at: '2025-01-01T00:00:00.000Z',
        }
        assert.equal(shouldMigrateCompletedTrashToArchive(order, now), false)
    })
})

describe('merge bilan bog‘liq karzinka buyurtmalari arxivga chiqmaydi', () => {
    const now = Date.parse('2026-08-29T12:00:00.000Z')

    it('merge natijasi karzinkada qoladi (daromad ikki marta sanalmasin)', () => {
        const order = {
            status: 'completed',
            note: 'Birlashtirilgan buyurtmalar: № ORD-1; № ORD-2',
            deleted_at: '2026-07-17T00:00:00.000Z',
            created_at: '2026-07-17T00:00:00.000Z',
        }
        assert.equal(shouldMigrateCompletedTrashToArchive(order, now), false)
    })

    it('merge manbasi karzinkada qoladi', () => {
        const order = {
            status: 'completed',
            note: 'Manba buyurtma: ORD-0\nBirlashtirildi → № ORD-9',
            deleted_at: '2026-04-01T00:00:00.000Z',
            created_at: '2026-04-01T00:00:00.000Z',
        }
        assert.equal(shouldMigrateCompletedTrashToArchive(order, now), false)
    })

    it('merge bilan bog‘liq bo‘lmagan eski tugallangan — arxivga o‘tadi', () => {
        const order = {
            status: 'completed',
            note: 'Oddiy izoh',
            deleted_at: '2026-04-01T00:00:00.000Z',
            created_at: '2026-04-01T00:00:00.000Z',
        }
        assert.equal(shouldMigrateCompletedTrashToArchive(order, now), true)
    })

    it('«Birlashtirilgan» belgisi «Birlashtirildi» bilan aralashmaydi', () => {
        assert.equal(isMergeSourceOrder({ note: 'Birlashtirilgan buyurtmalar: № A' }), false)
        assert.equal(isMergeResultOrder({ note: 'Birlashtirildi → № A' }), false)
    })

    it('buildMergeSourceNote belgini takrorlamaydi', () => {
        const first = buildMergeSourceNote('Eski izoh', '№ ORD-9')
        assert.equal(first, 'Eski izoh\nBirlashtirildi → № ORD-9')
        assert.equal(buildMergeSourceNote(first, '№ ORD-9'), first)
    })

    it('izoh bo‘sh bo‘lsa faqat belgi qoladi', () => {
        assert.equal(buildMergeSourceNote('', '№ ORD-9'), 'Birlashtirildi → № ORD-9')
        assert.equal(buildMergeSourceNote(null, '№ ORD-9'), 'Birlashtirildi → № ORD-9')
    })
})
