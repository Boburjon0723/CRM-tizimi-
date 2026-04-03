/** @param {unknown} v */
function cellStr(v) {
    if (v == null || v === '') return ''
    if (typeof v === 'number' && Number.isFinite(v)) {
        if (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v))
        return String(v)
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    return String(v).trim()
}

/** @returns {'name'|'qty'|'price'|'total'|null} */
function headerKey(cell) {
    const s = cellStr(cell)
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
    if (!s) return null
    if (/^(nom|name|назван|наимен|товар|material)/i.test(s)) return 'name'
    if (/^(miqdor|qty|quant|колич)/i.test(s)) return 'qty'
    if (/^(birlik|unit|price|narx|цена|ед)/i.test(s)) return 'price'
    if (/^(jami|total|sum|итого|сумма)/i.test(s)) return 'total'
    return null
}

/**
 * @param {unknown[][]} matrix
 * @returns {{ dataStart: number, col: Record<'name'|'qty'|'price'|'total', number> }}
 */
export function detectSupplyColumns(matrix) {
    if (!matrix.length) {
        return { dataStart: 0, col: { name: 0, qty: 1, price: 2, total: 3 } }
    }
    const row0 = matrix[0] || []
    const col = { name: -1, qty: -1, price: -1, total: -1 }
    let hits = 0
    row0.forEach((cell, i) => {
        const k = headerKey(cell)
        if (k && col[k] === -1) {
            col[k] = i
            hits += 1
        }
    })
    if (hits >= 2) {
        return {
            dataStart: 1,
            col: {
                name: col.name >= 0 ? col.name : 0,
                qty: col.qty >= 0 ? col.qty : 1,
                price: col.price >= 0 ? col.price : 2,
                total: col.total >= 0 ? col.total : 3,
            },
        }
    }
    return { dataStart: 0, col: { name: 0, qty: 1, price: 2, total: 3 } }
}

/**
 * @param {unknown[][]} matrix
 * @returns {Array<{ item_name: string, quantity_display: string, unit_price_uzs: string, line_total_uzs: string }>}
 */
export function matrixToSupplyLines(matrix) {
    const { dataStart, col } = detectSupplyColumns(matrix)
    const out = []
    for (let r = dataStart; r < matrix.length; r += 1) {
        const row = matrix[r] || []
        const item_name = cellStr(row[col.name])
        if (!item_name) continue
        const quantity_display = cellStr(row[col.qty]) || '—'
        const up = row[col.price]
        const lt = row[col.total]
        const unit_price_uzs =
            up === '' || up == null ? '' : typeof up === 'number' ? String(up) : cellStr(up).replace(/\s/g, '')
        const line_total_uzs =
            lt === '' || lt == null ? '' : typeof lt === 'number' ? String(lt) : cellStr(lt).replace(/\s/g, '')
        out.push({ item_name, quantity_display, unit_price_uzs, line_total_uzs })
    }
    return out
}

export async function downloadSupplyTemplateXlsx() {
    const XLSX = await import('xlsx')
    const header = ['Nomlanishi', 'Miqdor', 'Birlik narxi (UZS)', 'Jami (UZS)']
    const example = ["Po'lat armatura (12mm)", '2500 kg', 8500, 21250000]
    const ws = XLSX.utils.aoa_to_sheet([header, example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kirim')
    XLSX.writeFile(wb, 'homashyo-kirim-shablon.xlsx')
}

/**
 * @param {File} file
 */
export async function parseSupplySpreadsheetFile(file) {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) return []
    const sheet = wb.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
    return matrixToSupplyLines(matrix)
}
