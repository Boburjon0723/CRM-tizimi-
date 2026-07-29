/**
 * CRM AI uchun buyurtmalar bo‘limi konteksti:
 * mijoz, mahsulotlar, miqdor, summa, chiqqan / qolgan.
 */

import { createClient } from '@supabase/supabase-js'

const STATUS_UZ = {
    new: 'Yangi',
    pending: 'Jarayonda',
    completed: 'Tugallangan',
    cancelled: 'Bekor',
    other: 'Boshqa',
}

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )
}

function normalizeStatus(s) {
    const x = String(s || '').toLowerCase().trim()
    if (x === 'new' || x === 'yangi') return 'new'
    if (x === 'pending' || x === 'jarayonda') return 'pending'
    if (x === 'completed' || x.includes('tugallan')) return 'completed'
    if (x === 'cancelled' || x.includes('bekor')) return 'cancelled'
    return 'other'
}

function statusLabel(s) {
    return STATUS_UZ[normalizeStatus(s)] || String(s || '—')
}

function parseQty(v) {
    const n = Number(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : 0
}

function money(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 100) / 100
}

function shipKey(productId, colorRaw) {
    const color = (colorRaw != null ? String(colorRaw) : '').trim() || '—'
    return `${String(productId)}::${color.toLowerCase()}`
}

function normalizeColorKeyLoose(c) {
    return (c != null ? String(c) : '').trim().toLowerCase() || '—'
}

function applyMovements(map, rows) {
    for (const r of rows || []) {
        const key = shipKey(r.product_id, r.color_key || '—')
        const prev = Number(map.get(key)) || 0
        const delta = Math.abs(Number(r.change_amount) || 0)
        if (String(r.type) === 'reversal') map.set(key, Math.max(0, prev - delta))
        else map.set(key, prev + delta)
    }
    return map
}

async function fetchShippedByOrder(supabase, orderIds) {
    const result = new Map()
    if (!orderIds.length) return result
    const CHUNK = 80
    for (let i = 0; i < orderIds.length; i += CHUNK) {
        const chunk = orderIds.slice(i, i + CHUNK)
        let { data, error } = await supabase
            .from('stock_movements')
            .select('order_id, product_id, color_key, change_amount, type')
            .in('order_id', chunk)
            .in('type', ['sale', 'reversal'])
        if (error && /color_key|42703|column|does not exist/i.test(String(error.message || ''))) {
            ;({ data, error } = await supabase
                .from('stock_movements')
                .select('order_id, product_id, change_amount, type')
                .in('order_id', chunk)
                .in('type', ['sale', 'reversal']))
        }
        if (error) {
            console.warn('crmAiOrdersContext movements:', error.message)
            continue
        }
        for (const r of data || []) {
            if (!r.order_id) continue
            if (!result.has(r.order_id)) result.set(r.order_id, new Map())
            applyMovements(result.get(r.order_id), [r])
        }
    }
    return result
}

function computeLineFulfillment(items, shippedMap) {
    const lines = []
    let ordered = 0
    let shipped = 0
    for (const oi of items || []) {
        const qty = parseQty(oi.quantity)
        if (qty <= 0) continue
        const name =
            oi.product_name ||
            oi.products?.name ||
            oi.products?.name_uz ||
            'Mahsulot'
        const color = oi.color || null
        const key = shipKey(oi.product_id, color || '—')
        // loose match if exact key missing
        let done = Number(shippedMap.get(key)) || 0
        if (!done && shippedMap.size) {
            const want = normalizeColorKeyLoose(color)
            for (const [k, v] of shippedMap.entries()) {
                if (!String(k).startsWith(`${String(oi.product_id)}::`)) continue
                const ck = k.split('::')[1] || '—'
                if (normalizeColorKeyLoose(ck) === want) {
                    done = Number(v) || 0
                    break
                }
            }
        }
        const lineShipped = Math.min(qty, done)
        const rem = Math.max(0, qty - lineShipped)
        ordered += qty
        shipped += lineShipped
        const price = money(oi.price)
        lines.push({
            name: String(name).trim(),
            color: color ? String(color).trim() : null,
            qty,
            shipped: lineShipped,
            remaining: rem,
            price,
            lineTotal: money(price * qty),
        })
    }
    return {
        lines,
        ordered,
        shipped,
        remaining: Math.max(0, ordered - shipped),
        percent: ordered > 0 ? Math.min(100, Math.round((shipped / ordered) * 100)) : 0,
    }
}

const HINT_STOPWORDS = new Set([
    'qancha',
    'qaysi',
    'qanday',
    'buyurtma',
    'buyurtmalar',
    'buyurtmani',
    'mijoz',
    'mijozni',
    'mijozning',
    'mahsulot',
    'mahsulotlar',
    'chiqqan',
    'chiqim',
    'qolgan',
    'qoldiq',
    'summa',
    'status',
    'jarayon',
    'jarayonda',
    'yangi',
    'tugallangan',
    'tugallandi',
    'haqida',
    'bo‘yicha',
    'boyicha',
    'nechta',
    'nima',
    'kim',
    'bilan',
    'uchun',
    'bor',
    'yoq',
    'yo‘q',
    'kerak',
    'ayt',
    'ko‘rsat',
    'korsat',
    'top',
    'topib',
    'ber',
    'the',
    'and',
    'for',
    'order',
    'orders',
    'customer',
])

function normalizeSearchText(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[ʼ'`´]/g, "'")
        .replace(/[‘’]/g, "'")
        .trim()
}

function extractSearchHints(userText) {
    const t = String(userText || '').trim()
    if (!t) return []
    const hints = []
    const ord = t.match(/ORD[-_]?\d{6,}[-_]?\d*/i)
    if (ord) hints.push(ord[0].toUpperCase())

    // "Rustam" yoki «Ali» kabi qavs ichidagi ism
    for (const m of t.matchAll(/[«"']([^«"']{2,40})[»"']/g)) {
        hints.push(m[1].trim())
    }

    const words = t
        .split(/[\s,.;:!?/\\|()[\]{}]+/)
        .map((w) => w.trim())
        .filter((w) => {
            if (w.length < 2) return false
            const n = normalizeSearchText(w)
            if (HINT_STOPWORDS.has(n)) return false
            if (/^\d+$/.test(n)) return false
            return true
        })
        .slice(0, 12)
    hints.push(...words)

    // 2 so‘zli ism bo‘lagi: "Rustam Tojik"
    const rawWords = t.split(/[\s,.;:!?]+/).map((w) => w.trim()).filter((w) => w.length >= 2)
    for (let i = 0; i < rawWords.length - 1; i++) {
        const a = normalizeSearchText(rawWords[i])
        const b = normalizeSearchText(rawWords[i + 1])
        if (HINT_STOPWORDS.has(a) || HINT_STOPWORDS.has(b)) continue
        if (a.length >= 2 && b.length >= 2) hints.push(`${rawWords[i]} ${rawWords[i + 1]}`)
    }

    return [...new Set(hints.map((h) => normalizeSearchText(h)).filter(Boolean))]
}

/**
 * Qisman ism ham: "Rust" → "Rustam Tojikiston…", "ali" → "Alisher"
 * @returns {{ matched: boolean, score: number, customerHit: boolean }}
 */
function scoreOrderMatch(order, items, hints) {
    if (!hints.length) return { matched: false, score: 0, customerHit: false }

    const customer = normalizeSearchText(
        `${order.customer_name || ''} ${order.customers?.name || ''}`
    )
    const customerTokens = customer.split(/\s+/).filter((t) => t.length >= 2)
    const phone = String(order.customer_phone || order.customers?.phone || '').replace(/\D/g, '')
    const orderNo = normalizeSearchText(order.order_number || '')
    const productBlob = normalizeSearchText(
        (items || [])
            .flatMap((i) => [i.product_name, i.products?.name, i.products?.name_uz, i.color])
            .filter(Boolean)
            .join(' ')
    )

    let score = 0
    let customerHit = false

    for (const h of hints) {
        if (!h || h.length < 2) continue
        const hDigits = h.replace(/\D/g, '')

        if (orderNo && (orderNo.includes(h) || h.includes(orderNo))) {
            score += 800
        }

        // To‘liq ism ichida substring
        if (customer && customer.includes(h)) {
            score += 600 + Math.min(80, h.length * 8)
            customerHit = true
        } else if (customerTokens.length) {
            // Prefiks: rus → rustam; yoki token ismning boshidan
            const tokenHit = customerTokens.some(
                (tok) =>
                    tok.startsWith(h) ||
                    h.startsWith(tok) ||
                    (h.length >= 3 && tok.includes(h)) ||
                    (tok.length >= 3 && h.includes(tok))
            )
            if (tokenHit) {
                score += 450 + Math.min(40, h.length * 5)
                customerHit = true
            }
        }

        if (hDigits.length >= 4 && phone.includes(hDigits)) {
            score += 500
            customerHit = true
        }

        if (productBlob && productBlob.includes(h)) {
            score += 120
        }
    }

    return { matched: score > 0, score, customerHit }
}

function orderMatchesHints(order, items, hints) {
    return scoreOrderMatch(order, items, hints).matched
}

function groupFulfillmentByProduct(lines) {
    const byProduct = new Map()
    for (const ln of lines || []) {
        const name = String(ln?.name || 'Mahsulot').trim() || 'Mahsulot'
        if (!byProduct.has(name)) {
            byProduct.set(name, {
                name,
                qty: 0,
                shipped: 0,
                remaining: 0,
                colors: [],
            })
        }
        const row = byProduct.get(name)
        row.qty += Number(ln?.qty) || 0
        row.shipped += Number(ln?.shipped) || 0
        row.remaining += Number(ln?.remaining) || 0
        row.colors.push({
            color: ln?.color ? String(ln.color).trim() : '-',
            qty: Number(ln?.qty) || 0,
            shipped: Number(ln?.shipped) || 0,
            remaining: Number(ln?.remaining) || 0,
        })
    }
    return [...byProduct.values()]
}

function formatOrderBlock(order, fulfillment) {
    const num = order.order_number || String(order.id || '').slice(0, 8)
    const customer =
        order.customer_name || order.customers?.name || "Noma’lum mijoz"
    const phone = order.customer_phone || order.customers?.phone || ''
    const f = fulfillment || { lines: [], ordered: 0, shipped: 0, remaining: 0, percent: 0 }
    const header = `${num} | ${statusLabel(order.status)} | $${money(order.total)} | ${customer}${phone ? ` (${phone})` : ''} | chiq ${f.shipped}/${f.ordered} (${f.percent}%), qol ${f.remaining}`
    const grouped = groupFulfillmentByProduct(f.lines || [])
    if (!grouped.length) return `${header}\n(mahsulot yo’q)`
    const table = [
        '| Mahsulot | Ranglar (miqdor) | Buyurtma | Chiqqan | Qolgan |',
        '|---|---|---|---|---|',
        ...grouped.map((g) =>
            `| ${g.name} | ${g.colors.map((c) => `${c.color}: ${c.qty} (chiq ${c.shipped}, qol ${c.remaining})`).join('<br>')} | ${g.qty} | ${g.shipped} | ${g.remaining} |`
        ),
    ].join('\n')
    return `${header}\n${table}`
}

/**
 * @param {string} [userText] — oxirgi savol (tegishli buyurtmalarni ustunga olish)
 * @returns {Promise<string>}
 */
export async function buildOrdersAiContext(userText = '') {
    const supabase = sb()
    const hints = extractSearchHints(userText)

    const ordersRes = await supabase
        .from('orders')
        .select(
            'id, order_number, status, total, customer_name, customer_phone, created_at, completed_at, archived_at, deleted_at, customers(name, phone)'
        )
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(80)

    if (ordersRes.error) {
        // customers embed bo‘lmasa sodda select
        const fb = await supabase
            .from('orders')
            .select(
                'id, order_number, status, total, customer_name, customer_phone, created_at, completed_at, archived_at, deleted_at'
            )
            .is('deleted_at', null)
            .is('archived_at', null)
                .order('created_at', { ascending: false })
                .limit(80)
        if (fb.error) throw fb.error
        ordersRes.data = fb.data
    }

    const orders = ordersRes.data || []
    const ids = orders.map((o) => o.id).filter(Boolean)

    const itemsByOrder = new Map()
    const CHUNK = 40
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        let { data, error } = await supabase
            .from('order_items')
            .select('order_id, product_id, product_name, color, quantity, price, products(name, name_uz)')
            .in('order_id', chunk)
        if (error) {
            ;({ data, error } = await supabase
                .from('order_items')
                .select('order_id, product_id, product_name, color, quantity, price')
                .in('order_id', chunk))
        }
        if (error) {
            console.warn('crmAiOrdersContext items:', error.message)
            continue
        }
        for (const row of data || []) {
            if (!itemsByOrder.has(row.order_id)) itemsByOrder.set(row.order_id, [])
            itemsByOrder.get(row.order_id).push(row)
        }
    }

    const shippedMaps = await fetchShippedByOrder(supabase, ids)

    const byStatus = { new: 0, pending: 0, completed: 0, cancelled: 0, other: 0 }
    let sumOpen = 0
    let sumAll = 0
    const detailed = []

    for (const o of orders) {
        const st = normalizeStatus(o.status)
        byStatus[st] = (byStatus[st] || 0) + 1
        sumAll += money(o.total)
        if (st === 'new' || st === 'pending') sumOpen += money(o.total)
        const items = itemsByOrder.get(o.id) || []
        const ful = computeLineFulfillment(items, shippedMaps.get(o.id) || new Map())
        const hit = scoreOrderMatch(o, items, hints)
        detailed.push({
            order: o,
            items,
            ful,
            match: hit.matched,
            customerHit: hit.customerHit,
            priority:
                hit.score +
                (st === 'pending' || st === 'new' ? 100 : 0) +
                (ful.remaining > 0 ? 50 : 0),
        })
    }

    detailed.sort((a, b) => b.priority - a.priority || 0)

    const customerHits = detailed.filter((d) => d.customerHit)
    // Groq free TPM ~12k — kontekstni ixcham ushlaymiz
    const MAX_CHARS = 6000
    // Qisman ism topilsa — avvalo shu mijoz buyurtmalari
    const TOP = customerHits.length ? Math.min(24, Math.max(12, customerHits.length + 4)) : hints.length ? 18 : 14
    const preferred = customerHits.length
        ? [...customerHits, ...detailed.filter((d) => !d.customerHit)]
        : detailed
    const top = preferred.slice(0, TOP)
    const matched = detailed.filter((d) => d.match)

    let blocks = top.map((d) => formatOrderBlock(d.order, d.ful)).join('\n')
    const matchExtraList = matched.filter((m) => !top.includes(m)).slice(0, 8)
    let matchExtra = matchExtraList.length
        ? `\n\nSavolga mos:\n${matchExtraList.map((d) => formatOrderBlock(d.order, d.ful)).join('\n')}`
        : ''

    let body = `${blocks || '(buyurtma yo‘q)'}${matchExtra}`
    if (body.length > MAX_CHARS) {
        body = `${body.slice(0, MAX_CHARS)}\n…(qisqartirildi)`
    }

    const hintNote =
        hints.length > 0
            ? `Qidiruv (qisman ism ham): ${hints.slice(0, 8).join(', ')}. Topilgan mijoz hit: ${customerHits.length}.`
            : 'Umumiy ro‘yxat (savolda aniq mijoz yo‘q).'

    return `=== BUYURTMALAR (faol) ===
${hintNote}
Ko‘rilgan: ${orders.length}. Yangi=${byStatus.new}, Jarayon=${byStatus.pending}, Tugallangan=${byStatus.completed}, Bekor=${byStatus.cancelled}.
Summa: jami $${money(sumAll)}; ochiq $${money(sumOpen)}.
Format: № | status | $jami | mijoz | chiq/qol; keyin mahsulotlar (buyurtma, chiq, qol).

${body}

Qoidalar: faqat shu ma’lumot; yo‘q bo‘lsa «topilmadi». Mijoz ismini to‘liq yozmasa ham (masalan «Rust» → Rustam) mos kelganlar yuqorida. Chiqqan=ombor chiqimi, qolgan=hali chiqmagan.`
}

export async function buildFullCrmAiContext(userText = '') {
    try {
        const { buildPartnerFinanceAiContext, isPartnerFinanceQuery } = await import(
            '@/lib/crmAiPartnerFinanceContext'
        )
        const { buildDepartmentsFinanceAiContext, isDepartmentsFinanceQuery } = await import(
            '@/lib/crmAiDepartmentsFinanceContext'
        )

        const financeFocus = isPartnerFinanceQuery(userText)
        const deptFocus = isDepartmentsFinanceQuery(userText)

        let ordersBudget = 2200
        let partnerBudget = 1200
        let deptBudget = 1200
        if (deptFocus && !financeFocus) {
            ordersBudget = 1200
            partnerBudget = 800
            deptBudget = 2800
        } else if (financeFocus && !deptFocus) {
            ordersBudget = 1200
            partnerBudget = 2800
            deptBudget = 800
        } else if (financeFocus && deptFocus) {
            ordersBudget = 1000
            partnerBudget = 1800
            deptBudget = 1800
        } else {
            // Oddiy buyurtma savoli — faqat buyurtmalar asosiy
            ordersBudget = 3200
            partnerBudget = 600
            deptBudget = 600
        }

        const [ordersCtx, financeCtx, deptCtx] = await Promise.all([
            buildOrdersAiContext(userText).then((s) =>
                s.length > ordersBudget ? `${s.slice(0, ordersBudget)}\n…(buyurtmalar qisqartirildi)` : s
            ),
            buildPartnerFinanceAiContext(userText, { maxChars: partnerBudget }).catch((e) => {
                console.warn('partner finance AI context:', e?.message || e)
                return '=== HAMKORLAR MOLIYASI ===\n(yuklanmadi)'
            }),
            buildDepartmentsFinanceAiContext(userText, { maxChars: deptBudget }).catch((e) => {
                console.warn('departments AI context:', e?.message || e)
                return '=== BO‘LIMLAR ===\n(yuklanmadi)'
            }),
        ])

        return `Siz Nuur Home CRM AI yordamchisisiz.
Ko‘rasiz:
1) Buyurtmalar — mijoz, mahsulot, chiqqan/qolgan
2) Hamkorlar moliyasi — qarz, to‘lov, xomashyo
3) Bo‘limlar — xarajatlar (sana, nom, yo‘l, summa)
Savolga qarab mos bo‘limdan aniq raqamlar bilan javob bering.

FORMATLASHTIRISH QOIDALARI (majburiy):
- Bo’lim sarlavhalarini === SARLAVHA === formatda yozing (masalan: === HAMKORLAR QARZI ===).
- Hamkorlar/qarz ro’yxatini "- Nomi: qiymat" formatda yozing.
- Buyurtma mahsulotlarini MAJBURIY jadval (markdown table) formatda ber:
  | Mahsulot | Rang | Buyurtma | Chiqqan | Qolgan |
  Har bir mahsulot/rang alohida qatorda.
- Xarajatlarni ham jadval formatda ber: | Sana | Nomi | Summa |
- Yig’indi / jami qatorni alohida satrada yozing: Jami: $xxx
- Ixcham, aniq raqamlar bilan javob bering. Ortiqcha gap yo’q.

${ordersCtx}

${financeCtx}

${deptCtx}`
    } catch (e) {
        console.warn('buildFullCrmAiContext:', e?.message || e)
        return `Siz Nuur Home CRM AI yordamchisisiz. Kontekst yuklanmadi: ${e?.message || e}`
    }
}
