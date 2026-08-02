import { normalizeFinCurrency } from '@/utils/financeCurrency'

/** Kirim (balans +): xomashyo kirimi, hamkordan tushum */
export function isPartnerEntryKirim(entryType) {
    return entryType === 'supply' || entryType === 'payment_in'
}

/** @param {string} isoDate YYYY-MM-DD */
export function formatLedgerShortDate(isoDate) {
    const s = String(isoDate || '')
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return s || '—'
    return `${m[3]}.${m[2]}`
}

/** @param {unknown} n */
export function formatLedgerAmount(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100
    if (!Number.isFinite(v)) return '0'
    const abs = Math.abs(v)
    const hasFrac = Math.round(abs * 100) % 100 !== 0
    return abs.toLocaleString('uz-UZ', {
        minimumFractionDigits: hasFrac ? 2 : 0,
        maximumFractionDigits: 2,
    })
}

/**
 * Yuguruvchi balans: + = bizning qarz, − = ular bizga qarz.
 * @param {unknown} n
 * @param {{ weOweShort?: string, theyOweShort?: string }} [labels]
 */
export function formatLedgerBalance(n, labels = {}) {
    const v = Math.round((Number(n) || 0) * 100) / 100
    if (!Number.isFinite(v) || Math.abs(v) < 0.005) return '0'
    const num = formatLedgerAmount(v)
    if (v > 0) {
        const tag = labels.weOweShort ? ` (${labels.weOweShort})` : ''
        return `+${num}${tag}`
    }
    const tag = labels.theyOweShort ? ` (${labels.theyOweShort})` : ''
    return `−${num}${tag}`
}

/**
 * Chronological debit/credit rows with running balance (like phone ledger).
 * @param {Array<Record<string, unknown>>} entries
 * @param {'UZS'|'USD'} currency
 * @param {(entryType: string) => string} typeLabelFn
 * @param {{ weOweShort?: string, theyOweShort?: string }} [balanceLabels]
 */
export function buildPartnerLedgerRows(entries, currency, typeLabelFn, balanceLabels = {}) {
    const cur = normalizeFinCurrency(currency)
    const list = (entries || [])
        .filter((e) => normalizeFinCurrency(e.currency) === cur)
        .slice()
        .sort((a, b) => {
            const da = reportEntryDateKey(a)
            const db = reportEntryDateKey(b)
            if (da !== db) return da.localeCompare(db)
            return String(a.created_at || '').localeCompare(String(b.created_at || ''))
        })

    let bal = 0
    return list.map((e) => {
        const amt = Math.round((Number(e.amount_uzs) || 0) * 100) / 100
        const kirim = isPartnerEntryKirim(e.entry_type)
        if (kirim) bal += amt
        else bal -= amt
        bal = Math.round(bal * 100) / 100
        const note = String(e.description || '').trim()
        const opBase = typeLabelFn(e.entry_type)
        const op = note ? `${opBase} — ${note}` : opBase
        const balClass = bal > 0.005 ? 'bal-we' : bal < -0.005 ? 'bal-they' : 'bal-zero'
        return {
            date: formatLedgerShortDate(reportEntryDateKey(e)),
            operation: op,
            kirim: kirim ? formatLedgerAmount(amt) : '—',
            chiqim: kirim ? '—' : formatLedgerAmount(amt),
            balance: formatLedgerBalance(bal, balanceLabels),
            balanceClass: balClass,
            balanceRaw: bal,
            entry_type: e.entry_type,
            amount: amt,
        }
    })
}

/**
 * @param {Array<Record<string, unknown>>} entries
 * @param {'supply'|'sale_out'|'payment_in'|'payment'} entryType
 * @param {'UZS'|'USD'|'all'} [currency]
 */
export function sumPartnerEntriesByType(entries, entryType, currency = 'all') {
    let total = 0
    for (const e of entries || []) {
        if (e.entry_type !== entryType) continue
        if (currency !== 'all' && normalizeFinCurrency(e.currency) !== currency) continue
        total += Number(e.amount_uzs) || 0
    }
    return Math.round(total * 100) / 100
}

/**
 * Selected partner: 4 type summaries + Kirim/Chiqim/Balans ledger (UZS & USD).
 * @param {{
 *   title: string
 *   partnerName: string
 *   partnerPhone?: string
 *   printedAtLabel: string
 *   statusLabel?: string
 *   balanceOurDebtLabel: string
 *   balanceTheyOweLabel: string
 *   ourDebtText: string
 *   theyOweText: string
 *   typeSectionsTitle: string
 *   typeSections: { title: string, totalUzs: string, totalUsd: string, countLabel: string }[]
 *   ledgerTitle: string
 *   colDate: string
 *   colOp: string
 *   colKirim: string
 *   colChiqim: string
 *   colBalans: string
 *   balanceLegend?: string
 *   currencySections: { currencyLabel: string, rows: { date: string, operation: string, kirim: string, chiqim: string, balance: string, balanceClass?: string }[], emptyLabel: string, finalBalanceLabel?: string }[]
 *   emptyAllLabel: string
 * }} opts
 */
export function openPartnerLedgerPrintWindow(opts) {
    const typeCards = (opts.typeSections || [])
        .map(
            (s) => `<div class="type-card">
  <div class="type-title">${escapeHtml(s.title)}</div>
  <div class="type-amt">${escapeHtml(s.totalUzs)}</div>
  <div class="type-amt">${escapeHtml(s.totalUsd)}</div>
  <div class="type-count">${escapeHtml(s.countLabel)}</div>
</div>`
        )
        .join('')

    const ledgerBlocks = (opts.currencySections || [])
        .map((sec) => {
            if (!sec.rows?.length) {
                return `<h2>${escapeHtml(sec.currencyLabel)}</h2><p class="empty">${escapeHtml(sec.emptyLabel)}</p>`
            }
            const body = sec.rows
                .map(
                    (r) => `<tr>
  <td>${escapeHtml(r.date)}</td>
  <td>${escapeHtml(r.operation)}</td>
  <td class="num">${escapeHtml(r.kirim)}</td>
  <td class="num">${escapeHtml(r.chiqim)}</td>
  <td class="num bal ${escapeHtml(r.balanceClass || '')}">${escapeHtml(r.balance)}</td>
</tr>`
                )
                .join('')
            const finalRow = sec.finalBalanceLabel
                ? `<p class="final-bal">${escapeHtml(sec.finalBalanceLabel)}</p>`
                : ''
            return `<h2>${escapeHtml(sec.currencyLabel)}</h2>
${opts.balanceLegend ? `<p class="legend">${escapeHtml(opts.balanceLegend)}</p>` : ''}
<table class="ledger">
  <thead>
    <tr>
      <th>${escapeHtml(opts.colDate)}</th>
      <th>${escapeHtml(opts.colOp)}</th>
      <th class="num">${escapeHtml(opts.colKirim)}</th>
      <th class="num">${escapeHtml(opts.colChiqim)}</th>
      <th class="num">${escapeHtml(opts.colBalans)}</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>
${finalRow}`
        })
        .join('')

    const hasAnyRow = (opts.currencySections || []).some((s) => s.rows?.length)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(opts.title)}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px;color:#111;font-size:12px;max-width:900px;margin:0 auto;}
  h1{font-size:18px;margin:0 0 2px;font-weight:700;}
  .phone{color:#555;margin:0 0 4px;font-size:12px;}
  .meta{color:#666;margin:0 0 14px;font-size:11px;}
  .bal-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
  .bal-card{flex:1;min-width:160px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#f9fafb;}
  .bal-card .lbl{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.03em;}
  .bal-card .val{font-size:14px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums;}
  .status{display:inline-block;margin-top:6px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#fee2e2;color:#991b1b;}
  h2{font-size:13px;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid #ddd;font-weight:700;}
  .legend{margin:-2px 0 10px;font-size:11px;color:#4b5563;line-height:1.4;}
  .types{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
  .type-card{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;}
  .type-title{font-weight:700;font-size:12px;margin-bottom:6px;}
  .type-amt{font-variant-numeric:tabular-nums;font-size:12px;line-height:1.45;}
  .type-count{color:#6b7280;font-size:10px;margin-top:4px;}
  table.ledger{border-collapse:collapse;width:100%;margin-bottom:8px;}
  table.ledger th,table.ledger td{padding:8px 6px;text-align:left;border-bottom:1px solid #d1d5db;vertical-align:top;}
  table.ledger th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#374151;font-weight:700;border-bottom:2px solid #111;}
  table.ledger td.num,table.ledger th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  table.ledger td.bal{font-weight:600;}
  table.ledger td.bal-we{color:#b91c1c;}
  table.ledger td.bal-they{color:#047857;}
  .final-bal{font-size:12px;font-weight:700;margin:0 0 16px;padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;}
  .empty{color:#9ca3af;font-size:12px;}
  @media print{
    body{padding:8px;max-width:none;}
    .type-card,.bal-card{break-inside:avoid;}
    table.ledger{page-break-inside:auto;}
    tr{page-break-inside:avoid;}
  }
</style></head><body>
<h1>${escapeHtml(opts.partnerName)}</h1>
${opts.partnerPhone ? `<p class="phone">${escapeHtml(opts.partnerPhone)}</p>` : ''}
<p class="meta">${escapeHtml(opts.printedAtLabel)}</p>
<div class="bal-row">
  <div class="bal-card">
    <div class="lbl">${escapeHtml(opts.balanceOurDebtLabel)}</div>
    <div class="val">${escapeHtml(opts.ourDebtText)}</div>
  </div>
  <div class="bal-card">
    <div class="lbl">${escapeHtml(opts.balanceTheyOweLabel)}</div>
    <div class="val">${escapeHtml(opts.theyOweText)}</div>
    ${opts.statusLabel ? `<span class="status">${escapeHtml(opts.statusLabel)}</span>` : ''}
  </div>
</div>
<h2>${escapeHtml(opts.typeSectionsTitle)}</h2>
<div class="types">${typeCards}</div>
<h2>${escapeHtml(opts.ledgerTitle)}</h2>
${hasAnyRow ? ledgerBlocks : `<p class="empty">${escapeHtml(opts.emptyAllLabel)}</p>`}
</body></html>`

    return printHtmlDocument(html)
}

/**
 * Yangi tab ochmasdan chop etish (iframe). Popup blocker ishlamaydi.
 * @param {string} html
 * @returns {boolean}
 */
export function printHtmlDocument(html) {
    if (typeof document === 'undefined') return false

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText =
        'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
    document.body.appendChild(iframe)

    const win = iframe.contentWindow
    const doc = win?.document
    if (!doc || !win) {
        iframe.remove()
        return false
    }

    doc.open()
    doc.write(html)
    doc.close()

    const cleanup = () => {
        try {
            iframe.remove()
        } catch {
            /* ignore */
        }
    }

    const runPrint = () => {
        try {
            win.focus()
            win.print()
        } finally {
            setTimeout(cleanup, 1500)
        }
    }

    // Brauzer kontentni chizib bo‘lgach print
    if (doc.readyState === 'complete') {
        setTimeout(runPrint, 50)
    } else {
        iframe.onload = () => setTimeout(runPrint, 50)
        setTimeout(runPrint, 300)
    }
    return true
}

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
</body></html>`

    return printHtmlDocument(html)
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
