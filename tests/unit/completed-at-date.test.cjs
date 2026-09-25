/**
 * Lokal sana → ISO stamp.
 * Run: node --test tests/unit/completed-at-date.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

function todayDateInputValue() {
    const n = new Date()
    const y = n.getFullYear()
    const m = String(n.getMonth() + 1).padStart(2, '0')
    const d = String(n.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function localDateInputToIso(dateYmd) {
    const s = String(dateYmd || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date().toISOString()
    const [y, m, d] = s.split('-').map((x) => Number(x))
    if (!y || !m || !d) return new Date().toISOString()
    return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString()
}

describe('localDateInputToIso', () => {
    it('YYYY-MM-DD ni lokal tushga aylantiradi', () => {
        const iso = localDateInputToIso('2026-09-20')
        const d = new Date(iso)
        assert.equal(d.getFullYear(), 2026)
        assert.equal(d.getMonth(), 8)
        assert.equal(d.getDate(), 20)
    })

    it('noto‘g‘ri formatda hozirgi vaqt', () => {
        const iso = localDateInputToIso('abc')
        assert.ok(typeof iso === 'string' && iso.includes('T'))
    })
})

describe('todayDateInputValue', () => {
    it('YYYY-MM-DD formatida', () => {
        assert.match(todayDateInputValue(), /^\d{4}-\d{2}-\d{2}$/)
    })
})
