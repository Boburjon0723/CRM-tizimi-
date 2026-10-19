/**
 * Buyurtma «Eslatma» — narxli chop HTML da chiqishi.
 * Run: node --test tests/unit/order-print-eslatma.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

function escapeHtml(s) {
    if (s == null) return ''
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function formatPrintNoteHtml(note) {
    return escapeHtml(note).replace(/\r\n|\r|\n/g, '<br>')
}

/** buildOrderBlockHtml dagi eslatma bloki — bir xil qoida */
function buildOrderEslatmaHtml(item) {
    const orderEslatmaRaw = String(item?.note || '').trim()
    if (!orderEslatmaRaw) return ''
    return `<p class="order-eslatma" style="margin:0 0 14px;padding:8px 10px;background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;color:#92400e;font-size:0.88rem;line-height:1.4"><strong>Eslatma:</strong> ${formatPrintNoteHtml(orderEslatmaRaw)}</p>`
}

describe('order print eslatma', () => {
    it('eslatma bo‘lsa narxli chop HTML da chiqadi', () => {
        const html = buildOrderEslatmaHtml({ note: 'Yetkazish ertalab' })
        assert.match(html, /order-eslatma/)
        assert.match(html, /<strong>Eslatma:<\/strong>/)
        assert.match(html, /Yetkazish ertalab/)
    })

    it('bo‘sh eslatmada blok yo‘q', () => {
        assert.equal(buildOrderEslatmaHtml({ note: '' }), '')
        assert.equal(buildOrderEslatmaHtml({ note: '   ' }), '')
        assert.equal(buildOrderEslatmaHtml({}), '')
        assert.equal(buildOrderEslatmaHtml(null), '')
    })

    it('ko‘p qatorli eslatmada Enter <br> bo‘ladi', () => {
        const html = buildOrderEslatmaHtml({ note: '1-qator\n2-qator' })
        assert.match(html, /1-qator<br>2-qator/)
    })

    it('HTML xavfsiz escape qilinadi', () => {
        const html = buildOrderEslatmaHtml({ note: '<script>x</script>' })
        assert.doesNotMatch(html, /<script>/)
        assert.match(html, /&lt;script&gt;/)
    })
})
