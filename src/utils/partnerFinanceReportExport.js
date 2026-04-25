import { normalizeFinCurrency } from '@/utils/financeCurrency'

/** @param {unknown} entry */
export function reportEntryDateKey(entry) {
    const s = String(entry?.entry_date ?? '')
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
    if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return s
}

/**
 * @param {Array<Record<string, unknown>>} entries
 * @param {{
 *   dateFrom?: string
 *   dateTo?: string
 *   partnerId?: string
 *   entryType?: 'all'|'supply'|'payment'|'payment_in'|'sale_out'
 *   currency?: 'all'|'UZS'|'USD'
 * }} f
 */
export function filterPartnerFinanceEntries(entries, f) {
    const df = String(f.dateFrom || '').trim()
    const dt = String(f.dateTo || '').trim()
    return (entries || []).filter((e) => {
        if (f.partnerId && e.partner_id !== f.partnerId) return false
        if (f.entryType && f.entryType !== 'all' && e.entry_type !== f.entryType) return false
        if (f.currency && f.currency !== 'all' && normalizeFinCurrency(e.currency) !== f.currency) return false
        const k = reportEntryDateKey(e)
        if (df && k && k < df) return false
        if (dt && k && k > dt) return false
        return true
    })
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/**
 * @param {{
 *   title: string
 *   periodLabel: string
 *   summarySectionTitle?: string
 *   operationsSectionTitle?: string
 *   summaryHeaders: string[]
 *   summaryRows: (string|number)[][]
 *   operationsHeaders: string[]
 *   operationsRows: (string|number)[][]
 *   lineHeaders: string[]
 *   lineRows: (string|number)[][]
 *   linesSheetTitle: string
 * }} opts
 */
export function openPartnerReportPrintWindow(opts) {
    const {
        title,
        periodLabel,
        summarySectionTitle = 'Summary',
        operationsSectionTitle = 'Operations',
        summaryHeaders,
        summaryRows,
        operationsHeaders,
        operationsRows,
        lineHeaders,
        lineRows,
        linesSheetTitle,
    } = opts

    function tableHtml(headers, rows) {
        const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
        const body = rows
            .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
            .join('')
        return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;padding:16px;color:#111;font-size:12px;}
  h1{font-size:18px;margin:0 0 4px;}
  .meta{color:#555;margin-bottom:16px;}
  h2{font-size:14px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px;}
  table{border-collapse:collapse;width:100%;margin-bottom:8px;}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
  th{background:#f3f4f6;font-weight:600;}
  td.num{text-align:right;font-variant-numeric:tabular-nums;}
  @media print{body{padding:8px;}}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${escapeHtml(periodLabel)}</div>
<h2>${escapeHtml(summarySectionTitle)}</h2>
${tableHtml(summaryHeaders, summaryRows)}
<h2>${escapeHtml(operationsSectionTitle)}</h2>
${tableHtml(operationsHeaders, operationsRows)}
${lineRows.length ? `<h2>${escapeHtml(linesSheetTitle)}</h2>${tableHtml(lineHeaders, lineRows)}` : ''}
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},200);});</script>
</body></html>`

    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) return false
    w.document.open()
    w.document.write(html)
    w.document.close()
    return true
}

/**
 * @param {{
 *   fileBase: string
 *   summaryHeaders: string[]
 *   summaryRows: (string|number)[][]
 *   operationsHeaders: string[]
 *   operationsRows: (string|number)[][]
 *   lineHeaders: string[]
 *   lineRows: (string|number)[][]
 *   sheetSummary: string
 *   sheetOperations: string
 *   sheetLines: string
 * }} opts
 */
export async function downloadPartnerFinanceReportXlsx(opts) {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    const wsSum = XLSX.utils.aoa_to_sheet([opts.summaryHeaders, ...opts.summaryRows])
    XLSX.utils.book_append_sheet(wb, wsSum, opts.sheetSummary.slice(0, 31))

    const wsOp = XLSX.utils.aoa_to_sheet([opts.operationsHeaders, ...opts.operationsRows])
    XLSX.utils.book_append_sheet(wb, wsOp, opts.sheetOperations.slice(0, 31))

    if (opts.lineRows.length) {
        const wsLn = XLSX.utils.aoa_to_sheet([opts.lineHeaders, ...opts.lineRows])
        XLSX.utils.book_append_sheet(wb, wsLn, opts.sheetLines.slice(0, 31))
    }

    const safe = String(opts.fileBase || 'hamkorlar-hisobot').replace(/[^\w\-]+/g, '_')
    XLSX.writeFile(wb, `${safe}.xlsx`)
}
