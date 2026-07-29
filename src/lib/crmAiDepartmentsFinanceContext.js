/**
 * CRM AI: Moliya → Bo‘limlar (xarajatlar: sana + nom + summa + yo‘l).
 * departments (daraxt) + material_movements (xarajat).
 */

import { createClient } from '@supabase/supabase-js'

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
    const cur = String(currency || 'UZS').toUpperCase() === 'USD' ? 'USD' : 'UZS'
    if (cur === 'USD') {
        return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `${n.toLocaleString('uz-UZ')} UZS`
}

function deptName(d) {
    return (
        (d?.name_uz && String(d.name_uz).trim()) ||
        (d?.name_ru && String(d.name_ru).trim()) ||
        (d?.name_en && String(d.name_en).trim()) ||
        'Bo‘lim'
    )
}

function materialName(m) {
    if (!m) return 'Xarajat'
    return (
        (m.name_uz && String(m.name_uz).trim()) ||
        (m.name_ru && String(m.name_ru).trim()) ||
        (m.name_en && String(m.name_en).trim()) ||
        'Xarajat'
    )
}

function buildDeptPath(deptId, byId) {
    const parts = []
    let cur = byId.get(String(deptId))
    let guard = 0
    while (cur && guard++ < 20) {
        parts.unshift(deptName(cur))
        if (!cur.parent_id) break
        cur = byId.get(String(cur.parent_id))
    }
    return parts.join(' / ')
}

function normalizeSearchText(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[ʼ'`´‘’]/g, "'")
        .trim()
}

const STOP = new Set([
    'bolim',
    "bo'lim",
    'bo‘lim',
    'bolimlar',
    "bo'limlar",
    'bo‘limlar',
    'xarajat',
    'xarajatlar',
    'harajat',
    'harajatlar',
    'moliya',
    'kirim',
    'chiqim',
    'hisob',
    'kitob',
    'oy',
    'oyi',
    'qancha',
    'qaysi',
    'haqida',
    'nechta',
    'sana',
    'nomi',
    'usd',
    'uzs',
    'may',
    'iyun',
    'iyul',
    'avgust',
])

function extractHints(userText) {
    const t = String(userText || '').trim()
    if (!t) return []
    const hints = []
    const month = t.match(/\b(yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr)\b/i)
    if (month) hints.push(month[1].toLowerCase())
    const ym = t.match(/\b(20\d{2})[-./](0?[1-9]|1[0-2])\b/)
    if (ym) hints.push(`${ym[1]}-${String(ym[2]).padStart(2, '0')}`)
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

const MONTH_UZ = {
    '01': 'yanvar',
    '02': 'fevral',
    '03': 'mart',
    '04': 'aprel',
    '05': 'may',
    '06': 'iyun',
    '07': 'iyul',
    '08': 'avgust',
    '09': 'sentabr',
    10: 'oktabr',
    11: 'noyabr',
    12: 'dekabr',
}

function monthNameFromDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})/)
    if (!m) return ''
    return MONTH_UZ[m[2]] || ''
}

function scoreExpense(row, hints) {
    if (!hints.length) return 0
    const blob = normalizeSearchText(
        `${row.path} ${row.name} ${row.date} ${row.note || ''} ${monthNameFromDate(row.date)}`
    )
    let score = 0
    for (const h of hints) {
        if (!h || h.length < 2) continue
        if (blob.includes(h)) score += 200 + Math.min(40, h.length * 4)
        else if (row.date && row.date.startsWith(h)) score += 300
        else if (h.length >= 3 && blob.split(/\s+/).some((t) => t.startsWith(h) || h.startsWith(t))) {
            score += 120
        }
    }
    return score
}

/**
 * @param {string} [userText]
 * @param {{ maxChars?: number }} [opts]
 */
export async function buildDepartmentsFinanceAiContext(userText = '', opts = {}) {
    const maxChars = opts.maxChars ?? 8000
    const supabase = sb()
    const hints = extractHints(userText)

    const [deptRes, movRes, matRes] = await Promise.all([
        supabase
            .from('departments')
            .select('id, parent_id, name_uz, name_ru, name_en, sort_order, is_active')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        supabase
            .from('material_movements')
            .select(
                'id, department_id, raw_material_id, total_cost, currency, movement_date, note, quantity'
            )
            .not('department_id', 'is', null)
            .order('movement_date', { ascending: false })
            .limit(800),
        supabase.from('raw_materials').select('id, name_uz, name_ru, name_en').limit(3000),
    ])

    if (deptRes.error) throw deptRes.error
    if (movRes.error) throw movRes.error

    const departments = deptRes.data || []
    const movements = movRes.data || []
    const materials = matRes.error ? [] : matRes.data || []

    const byId = new Map(departments.map((d) => [String(d.id), d]))
    const matById = new Map(materials.map((m) => [String(m.id), m]))

    // Root section totals (for cards like May/June)
    const rootTotals = new Map() // id -> { uzs, usd, name }
    for (const d of departments) {
        if (d.parent_id == null) {
            rootTotals.set(String(d.id), { name: deptName(d), uzs: 0, usd: 0 })
        }
    }

    const rows = []
    for (const mv of movements) {
        const path = buildDeptPath(mv.department_id, byId)
        const mat = matById.get(String(mv.raw_material_id))
        const name = materialName(mat)
        const date = String(mv.movement_date || '').slice(0, 10)
        const currency = String(mv.currency || 'UZS').toUpperCase() === 'USD' ? 'USD' : 'UZS'
        const amount = money(mv.total_cost)
        const row = {
            path,
            name,
            date,
            currency,
            amount,
            note: mv.note || '',
            department_id: mv.department_id,
        }
        row.score = scoreExpense(row, hints)
        rows.push(row)

        // rollup to root
        let cur = byId.get(String(mv.department_id))
        let guard = 0
        let rootId = null
        while (cur && guard++ < 20) {
            if (!cur.parent_id) {
                rootId = String(cur.id)
                break
            }
            cur = byId.get(String(cur.parent_id))
        }
        if (rootId && rootTotals.has(rootId)) {
            const t = rootTotals.get(rootId)
            if (currency === 'USD') t.usd += amount
            else t.uzs += amount
        }
    }

    rows.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))

    const matched = rows.filter((r) => r.score > 0)
    const focus = matched.length ? matched : rows
    const TOP = matched.length ? Math.min(60, Math.max(25, matched.length)) : 40
    const top = focus.slice(0, TOP)

    let sumUzs = 0
    let sumUsd = 0
    for (const r of rows) {
        if (r.currency === 'USD') sumUsd += r.amount
        else sumUzs += r.amount
    }

    const rootLines = [...rootTotals.values()]
        .filter((t) => t.uzs > 0 || t.usd > 0)
        .sort((a, b) => b.uzs + b.usd * 12000 - (a.uzs + a.usd * 12000))
        .map((t) => {
            const parts = []
            if (t.uzs) parts.push(fmtAmt(t.uzs, 'UZS'))
            if (t.usd) parts.push(fmtAmt(t.usd, 'USD'))
            return `- ${t.name}: ${parts.join(' / ')}`
        })
        .join('\n')

    const expenseLines = top
        .map(
            (r) =>
                `${r.date || '?'} | ${r.path || '—'} | ${r.name} | ${fmtAmt(r.amount, r.currency)}${r.note ? ` | ${String(r.note).slice(0, 60)}` : ''}`
        )
        .join('\n')

    const hintNote =
        hints.length > 0
            ? `Qidiruv: ${hints.slice(0, 8).join(', ')}. Mos xarajat: ${matched.length}.`
            : 'So‘nggi xarajatlar (umumiy).'

    let body = `=== MOLIYA → BO‘LIMLAR (xarajatlar) ===
${hintNote}
Jami (yuklangan): ${fmtAmt(sumUzs, 'UZS')} / ${fmtAmt(sumUsd, 'USD')} · ${rows.length} ta yozuv.
Yuqori bo‘limlar yig‘indisi:
${rootLines || '(yo‘q)'}

Xarajatlar (sana | yo‘l | nom | summa):
${expenseLines || '(yo‘q)'}

Qoidalar: xarajat nomi + sana shu ro‘yxatdan; yo‘q bo‘lsa «topilmadi». Oy nomi (may/iyun) yo‘l yoki sanada qidiriladi.`

    if (body.length > maxChars) body = `${body.slice(0, maxChars)}\n…(qisqartirildi)`
    return body
}

export function isDepartmentsFinanceQuery(userText) {
    const t = normalizeSearchText(userText)
    if (!t) return false
    return /bo'?lim|bolim|xarajat|harajat|kirim\s*chiqim|hisob\s*kitob|yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr/.test(
        t
    )
}
