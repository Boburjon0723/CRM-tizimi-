/** @typedef {'UZS'|'USD'} FinCurrency */

export const FIN_CURRENCY_UZS = 'UZS'
export const FIN_CURRENCY_USD = 'USD'

/** @param {unknown} raw */
export function normalizeFinCurrency(raw) {
    const s = String(raw ?? '')
        .trim()
        .toUpperCase()
    if (s === 'USD' || s === '$' || s === 'DOLLAR' || s === 'ДОЛЛ') return FIN_CURRENCY_USD
    return FIN_CURRENCY_UZS
}

/**
 * @param {unknown} n
 * @param {unknown} currency
 */
export function formatFinAmount(n, currency) {
    const v = Math.round((Number(n) || 0) * 100) / 100
    const c = normalizeFinCurrency(currency)
    if (c === FIN_CURRENCY_USD) {
        return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
    }
    return `${v.toLocaleString('uz-UZ')} UZS`
}

/**
 * Biz hamkorga qarzdorlik (musbat balans) — minus prefiks
 * @param {unknown} n
 * @param {unknown} currency
 */
export function formatOurDebtFin(n, currency) {
    const v = Math.round((Number(n) || 0) * 100) / 100
    if (v < 0.01) return null
    const c = normalizeFinCurrency(currency)
    const abs = Math.abs(v)
    const body =
        c === FIN_CURRENCY_USD
            ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : abs.toLocaleString('uz-UZ')
    return `−${body} ${c === FIN_CURRENCY_USD ? 'USD' : 'UZS'}`
}

/**
 * Ular bizga qarz (salbiy balans moduli) — ijobiy ko‘rinish
 * @param {unknown} n
 * @param {unknown} currency
 */
export function formatTheyOweUsFin(n, currency) {
    const v = Math.round((Number(n) || 0) * 100) / 100
    if (v < 0.01) return null
    const c = normalizeFinCurrency(currency)
    const abs = Math.abs(v)
    const body =
        c === FIN_CURRENCY_USD
            ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : abs.toLocaleString('uz-UZ')
    return `${body} ${c === FIN_CURRENCY_USD ? 'USD' : 'UZS'}`
}

/**
 * O‘ng kartada: biz qarzdor bo‘lsak «+» (hamkor talabi)
 * @param {unknown} n
 * @param {unknown} currency
 */
export function formatOurDebtPlusFin(n, currency) {
    const v = Math.round((Number(n) || 0) * 100) / 100
    if (v < 0.01) return null
    const c = normalizeFinCurrency(currency)
    const abs = Math.abs(v)
    const body =
        c === FIN_CURRENCY_USD
            ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : abs.toLocaleString('uz-UZ')
    return `+${body} ${c === FIN_CURRENCY_USD ? 'USD' : 'UZS'}`
}

/**
 * Bo‘limlar: har bir valyuta bo‘yicha to‘g‘ridan-to‘g‘ri yig‘indi, keyin rollup.
 * @param {Array<{ id: string, parent_id?: string|null }>} departments
 * @param {Record<string, number>} directByDeptId
 */
export function rollupDepartmentTotals(departments, directByDeptId) {
    const children = {}
    for (const d of departments || []) {
        const pid = d.parent_id
        if (pid == null || pid === undefined) continue
        if (!children[pid]) children[pid] = []
        children[pid].push(d.id)
    }
    const memo = {}
    function rollup(id) {
        if (memo[id] !== undefined) return memo[id]
        let s = directByDeptId[id] || 0
        const ch = children[id] || []
        for (const c of ch) s += rollup(c)
        memo[id] = s
        return s
    }
    for (const d of departments || []) rollup(d.id)
    return memo
}

/**
 * @param {Array<{ department_id?: string|null, total_cost?: unknown, currency?: unknown }>} rows
 * @returns {{ UZS: Record<string, number>, USD: Record<string, number> }}
 */
export function directDeptTotalsByCurrency(rows) {
    const UZS = {}
    const USD = {}
    for (const row of rows || []) {
        const id = row.department_id
        if (!id) continue
        const cur = normalizeFinCurrency(row.currency)
        const amt = Number(row.total_cost || 0)
        const bucket = cur === FIN_CURRENCY_USD ? USD : UZS
        bucket[id] = (bucket[id] || 0) + amt
    }
    return { UZS, USD }
}
