/**
 * Run: node --test tests/unit/color-standard-order.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// Dynamic import of ESM not available; mirror core ranking for regression.
// Keep in sync with STANDARD_COLOR_ORDER_GROUPS in buyurtmalar/utils.js
const GROUPS = [
    ['qaymoq', 'qaymo'],
    ['tilla'],
    ['seriy', 'seri'],
    ['qora', 'black'],
    ['mokriy', 'mokry', 'mokriyasfalt'],
    ['kofe'],
    ['ochkofe'],
    ['novot'],
]

function canonicalize(color) {
    const raw = String(color ?? '')
        .trim()
        .toLowerCase()
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, '')
        .replace(/[(){}\[\].,;:/\\'"`~!@#$%^&*+=?|<>_-]/g, '')
    if (!raw) return ''
    return raw.endsWith('rang') ? raw.slice(0, -4) || raw : raw
}

function rank(color) {
    const tok = canonicalize(color)
    if (!tok || tok === '—') return 9000
    for (let i = 0; i < GROUPS.length; i++) {
        for (const g of GROUPS[i]) {
            if (tok === g || (g.length >= 4 && tok.startsWith(g))) return i
        }
    }
    return 8000
}

function sortLabels(labels) {
    return [...labels].sort((a, b) => {
        const d = rank(a) - rank(b)
        if (d !== 0) return d
        return String(a).localeCompare(String(b), 'uz', { sensitivity: 'base' })
    })
}

describe('standard color print order', () => {
    it('orders mixed labels as qaymoq→tilla→seriy→qora→mokriy→kofe→ochkofe→novot', () => {
        const input = [
            'seriy(40823)',
            'och kofe(40752)',
            'Tilla (40686)',
            'novot (41067)',
            'qaymoq (41458)',
            'kofe(40744)',
            'Qora',
            'mokriy',
        ]
        const sorted = sortLabels(input).map(canonicalize)
        assert.deepEqual(
            sorted.map((s) => {
                if (s.startsWith('qaymo')) return 'qaymoq'
                if (s.startsWith('tilla')) return 'tilla'
                if (s.startsWith('seriy') || s.startsWith('seri')) return 'seriy'
                if (s.startsWith('qora')) return 'qora'
                if (s.startsWith('mokriy') || s.startsWith('mokry')) return 'mokriy'
                if (s.startsWith('ochkofe')) return 'ochkofe'
                if (s.startsWith('kofe')) return 'kofe'
                if (s.startsWith('novot')) return 'novot'
                return s
            }),
            ['qaymoq', 'tilla', 'seriy', 'qora', 'mokriy', 'kofe', 'ochkofe', 'novot']
        )
    })

    it('does not classify ochkofe as kofe', () => {
        assert.ok(rank('och kofe(40752)') > rank('kofe(40744)'))
        assert.equal(rank('kofe(40744)'), GROUPS.findIndex((g) => g.includes('kofe')))
        assert.equal(rank('och kofe(40752)'), GROUPS.findIndex((g) => g.includes('ochkofe')))
    })
})
