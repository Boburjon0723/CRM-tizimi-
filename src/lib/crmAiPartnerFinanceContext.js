/**
 * CRM AI: Hamkorlar moliyasi (Moliya → boshqaruv) konteksti.
 * Balans: + = biz qarzdormiz, − = ular bizga qarzdor (UZS/USD alohida).
 */

import { createClient } from '@supabase/supabase-js'

const ENTRY_LABEL = {
    supply: 'Xomashyo kirimi',
    sale_out: 'Sotish/chiqim',
    payment_in: 'Hamkordan tushum',
    payment: 'Hamkorga to‘lov',
}

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )
}

function money(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 100) / 100
}

function fmtAmt(v, currency) {
    const n = money(v)
    const abs = Math.abs(n)
    const cur = String(currency || 'UZS').toUpperCase() === 'USD' ? 'USD' : 'UZS'
    if (cur === 'USD') return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `${abs.toLocaleString('uz-UZ')} UZS`
}

function normalizeCur(c) {
    return String(c || 'UZS').toUpperCase() === 'USD' ? 'USD' : 'UZS'
}

function partnerDisplayName(p) {
    return (
        (p?.name_uz && String(p.name_uz).trim()) ||
        (p?.name_ru && String(p.name_ru).trim()) ||
        (p?.name_en && String(p.name_en).trim()) ||
        'Hamkor'
    )
}

function computeBalance(entries, currency) {
    const cur = normalizeCur(currency)
    let b = 0
    for (const e of entries || []) {
        if (normalizeCur(e.currency) !== cur) continue
        const amt = Number(e.amount_uzs) || 0
        if (e.entry_type === 'supply' || e.entry_type === 'payment_in') b += amt
        else b -= amt
    }
    return money(b)
}

function balanceStatus(balUzs, balUsd) {
    const owes = balUzs > 0.01 || balUsd > 0.01
    const owed = balUzs < -0.01 || balUsd < -0.01
    if (owes && !owed) return 'Biz qarzdormiz'
    if (owed && !owes) return 'Ular qarzdor'
    if (owes && owed) return 'Aralash'
    return 'Yopilgan'
}

function normalizeSearchText(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[ʼ'`´‘’]/g, "'")
        .trim()
}

const STOP = new Set([
    'hamkor',
    'hamkorlar',
    'moliya',
    'moliyasi',
    'qarz',
    'qarzdor',
    'qarzdormiz',
    'balans',
    'to‘lov',
    'tolov',
    'tushum',
    'xomashyo',
    'kirimi',
    'sotish',
    'chiqim',
    'qancha',
    'qaysi',
    'haqida',
    'nechta',
    'biz',
    'ular',
    'bizga',
    'kim',
    'bor',
    'usd',
    'uzs',
    'dollar',
    'so‘m',
    'som',
])

function extractPartnerHints(userText) {
    const t = String(userText || '').trim()
    if (!t) return []
    const hints = []
    for (const m of t.matchAll(/[«"']([^«"']{2,40})[»"']/g)) hints.push(m[1].trim())
    const words = t
        .split(/[\s,.;:!?/\\|()[\]{}]+/)
        .map((w) => w.trim())
        .filter((w) => {
            if (w.length < 2) return false
            const n = normalizeSearchText(w)
            if (STOP.has(n)) return false
            if (/^\d+$/.test(n)) return false
            return true
        })
        .slice(0, 12)
    hints.push(...words)
    return [...new Set(hints.map((h) => normalizeSearchText(h)).filter(Boolean))]
}

function scorePartnerMatch(partner, hints) {
    if (!hints.length) return { matched: false, score: 0 }
    const name = normalizeSearchText(
        `${partnerDisplayName(partner)} ${partner.name_uz || ''} ${partner.name_ru || ''} ${partner.name_en || ''}`
    )
    const tokens = name.split(/\s+/).filter((t) => t.length >= 2)
    const phone = String(partner.phone || '').replace(/\D/g, '')
    let score = 0
    for (const h of hints) {
        if (!h || h.length < 2) continue
        if (name.includes(h)) score += 600 + Math.min(60, h.length * 6)
        else if (
            tokens.some(
                (tok) =>
                    tok.startsWith(h) ||
                    h.startsWith(tok) ||
                    (h.length >= 3 && tok.includes(h)) ||
                    (tok.length >= 3 && h.includes(tok))
            )
        ) {
            score += 450
        }
        const hd = h.replace(/\D/g, '')
        if (hd.length >= 4 && phone.includes(hd)) score += 500
    }
    return { matched: score > 0, score }
}

function formatEntry(e, linesByEntry) {
    const type = ENTRY_LABEL[e.entry_type] || e.entry_type
    const cur = normalizeCur(e.currency)
    const lines = linesByEntry.get(e.id) || []
    const lineTxt = lines
        .slice(0, 6)
        .map((l) => `${l.item_name || '?'}×${l.quantity_display || '?'}`)
        .join(', ')
    const more = lines.length > 6 ? ` +${lines.length - 6}` : ''
    return `${e.entry_date || '?'} | ${type} | ${fmtAmt(e.amount_uzs, cur)} ${cur}${e.reference_code ? ` | ${e.reference_code}` : ''}${lineTxt ? ` | ${lineTxt}${more}` : ''}${e.description ? ` | ${e.description}` : ''}`
}

function formatPartnerBlock(p, entries, linesByEntry, { maxOps = 8 } = {}) {
    const name = partnerDisplayName(p)
    const balUzs = computeBalance(entries, 'UZS')
    const balUsd = computeBalance(entries, 'USD')
    const status = balanceStatus(balUzs, balUsd)
    const ourUzs = balUzs > 0 ? balUzs : 0
    const ourUsd = balUsd > 0 ? balUsd : 0
    const theyUzs = balUzs < 0 ? Math.abs(balUzs) : 0
    const theyUsd = balUsd < 0 ? Math.abs(balUsd) : 0

    const sorted = [...(entries || [])].sort((a, b) =>
        String(b.entry_date || '').localeCompare(String(a.entry_date || ''))
    )
    const ops = sorted.slice(0, maxOps).map((e) => `  ${formatEntry(e, linesByEntry)}`).join('\n')

    return `${name}${p.phone ? ` | ${p.phone}` : ''} | ${status}
  Bizning qarz: ${ourUzs ? fmtAmt(ourUzs, 'UZS') : '—'} / ${ourUsd ? fmtAmt(ourUsd, 'USD') : '—'}
  Ular bizga qarz: ${theyUzs ? fmtAmt(theyUzs, 'UZS') : '—'} / ${theyUsd ? fmtAmt(theyUsd, 'USD') : '—'}
  So‘nggi ops:
${ops || '  (operatsiya yo‘q)'}`
}

/**
 * @param {string} [userText]
 * @param {{ maxChars?: number }} [opts]
 */
export async function buildPartnerFinanceAiContext(userText = '', opts = {}) {
    const maxChars = opts.maxChars ?? 9000
    const supabase = sb()
    const hints = extractPartnerHints(userText)

    const [partnersRes, entriesRes, linesRes] = await Promise.all([
        supabase
            .from('finance_partners')
            .select('id, name_uz, name_ru, name_en, phone, note, legal_id, is_active')
            .eq('is_active', true)
            .order('name_uz', { ascending: true }),
        supabase
            .from('partner_finance_entries')
            .select(
                'id, partner_id, entry_type, amount_uzs, currency, entry_date, description, reference_code'
            )
            .order('entry_date', { ascending: false })
            .limit(2000),
        supabase
            .from('partner_finance_entry_lines')
            .select('entry_id, item_name, quantity_display, unit_price_uzs, line_total_uzs, line_index')
            .order('line_index', { ascending: true })
            .limit(4000),
    ])

    if (partnersRes.error) throw partnersRes.error
    if (entriesRes.error) throw entriesRes.error

    const partners = partnersRes.data || []
    const entries = entriesRes.data || []
    const lines = linesRes.error ? [] : linesRes.data || []

    const entriesByPartner = new Map()
    for (const e of entries) {
        if (!entriesByPartner.has(e.partner_id)) entriesByPartner.set(e.partner_id, [])
        entriesByPartner.get(e.partner_id).push(e)
    }
    const linesByEntry = new Map()
    for (const l of lines) {
        if (!linesByEntry.has(l.entry_id)) linesByEntry.set(l.entry_id, [])
        linesByEntry.get(l.entry_id).push(l)
    }

    let ourDebtUzs = 0
    let ourDebtUsd = 0
    let theyOweUzs = 0
    let theyOweUsd = 0

    const rows = []
    for (const p of partners) {
        const pe = entriesByPartner.get(p.id) || []
        const balUzs = computeBalance(pe, 'UZS')
        const balUsd = computeBalance(pe, 'USD')
        if (balUzs > 0) ourDebtUzs += balUzs
        if (balUsd > 0) ourDebtUsd += balUsd
        if (balUzs < 0) theyOweUzs += Math.abs(balUzs)
        if (balUsd < 0) theyOweUsd += Math.abs(balUsd)
        const hit = scorePartnerMatch(p, hints)
        rows.push({
            partner: p,
            entries: pe,
            balUzs,
            balUsd,
            match: hit.matched,
            priority: hit.score + (Math.abs(balUzs) + Math.abs(balUsd) * 12000) * 0.00001,
        })
    }

    rows.sort((a, b) => b.priority - a.priority || partnerDisplayName(a.partner).localeCompare(partnerDisplayName(b.partner), 'uz'))

    const matched = rows.filter((r) => r.match)
    const focus = matched.length ? matched : rows
    const TOP = matched.length ? Math.min(12, Math.max(6, matched.length)) : 10
    const top = focus.slice(0, TOP)

    // Compact list of all partners (balances only)
    const listLines = rows
        .slice(0, 40)
        .map((r) => {
            const n = partnerDisplayName(r.partner)
            const st = balanceStatus(r.balUzs, r.balUsd)
            const parts = []
            if (Math.abs(r.balUzs) > 0.01) parts.push(fmtAmt(r.balUzs, 'UZS') + (r.balUzs > 0 ? ' (biz)' : ' (ular)'))
            if (Math.abs(r.balUsd) > 0.01) parts.push(fmtAmt(r.balUsd, 'USD') + (r.balUsd > 0 ? ' (biz)' : ' (ular)'))
            return `- ${n}: ${parts.join(', ') || '0'} | ${st}`
        })
        .join('\n')

    const detail = top
        .map((r) =>
            formatPartnerBlock(r.partner, r.entries, linesByEntry, {
                maxOps: matched.length ? 12 : 6,
            })
        )
        .join('\n\n')

    const hintNote =
        hints.length > 0
            ? `Qidiruv (qisman ism): ${hints.slice(0, 8).join(', ')}. Mos hamkor: ${matched.length}.`
            : 'Umumiy hamkorlar ro‘yxati.'

    let body = `=== HAMKORLAR MOLIYASI ===
${hintNote}
Jami biz qarzdormiz: ${fmtAmt(ourDebtUzs, 'UZS')} / ${fmtAmt(ourDebtUsd, 'USD')}
Jami ular qarzi: ${fmtAmt(theyOweUzs, 'UZS')} / ${fmtAmt(theyOweUsd, 'USD')}
Balans: + = biz qarzdormiz; − = ular bizga qarzdor. Valyutalar aralashmaydi.
Operatsiyalar: supply=xomashyo kirimi(+), sale_out=sotish(−), payment_in=hamkordan tushum(+), payment=hamkorga to‘lov(−).

Hamkorlar (qisqa):
${listLines || '(yo‘q)'}

Batafsil (ustun):
${detail || '(yo‘q)'}

Qoidalar: faqat shu ma’lumot; ism to‘liq bo‘lmasa ham (Fatxi→Fatxiddin) moslar yuqorida.`

    if (body.length > maxChars) body = `${body.slice(0, maxChars)}\n…(qisqartirildi)`
    return body
}

export function isPartnerFinanceQuery(userText) {
    const t = normalizeSearchText(userText)
    if (!t) return false
    return /hamkor|moliya|qarz|qarzdor|balans|to'?lov|tushum|xomashyo|kirimi|sotish|chiqim|usd|uzs|dollar|so'?m/.test(
        t
    )
}
