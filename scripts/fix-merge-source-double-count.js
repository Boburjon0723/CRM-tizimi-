/**
 * Bir martalik: merge (birlashtirish) tufayli «Jami daromad» ikki marta
 * sanalishini tuzatadi.
 *
 * Muammo: merge natijasi ham, uning manba buyurtmalari ham ro‘yxatda (aktiv/arxiv)
 * qolsa — bir xil summa ikki marta hisoblanadi.
 *
 * Qoida:
 *   1) Manbalar allaqachon karzinkada bo‘lsa — natija haqiqat. Manbalar izohiga
 *      «Birlashtirildi → №...» belgisi qo‘yiladi, shunda avtomatik «karzinka →
 *      arxiv» ko‘chirishi ularni qaytarib chiqarmaydi.
 *   2) Manbalar ro‘yxatda qolgan bo‘lsa — MANBALAR haqiqat (ularda chiqim sanalari
 *      to‘g‘ri), natija karzinkaga ko‘chiriladi.
 *   3) Natija allaqachon karzinkada bo‘lsa — birlashtirish bekor qilingan, tegilmaydi.
 *
 * Run: node scripts/fix-merge-source-double-count.js            (faqat ko‘rsatadi)
 *      node scripts/fix-merge-source-double-count.js --apply    (bazaga yozadi)
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const APPLY = process.argv.includes('--apply')
const MERGE_SOURCE_NOTE_PREFIX = 'Birlashtirildi →'

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local')
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/)
        if (!m) continue
        const k = m[1].trim()
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1)
        }
        if (!process.env[k]) process.env[k] = v
    }
}

function isMergeSourceOrder(order) {
    return /Birlashtirildi\s*(→|->)/i.test(String(order?.note || ''))
}

function buildMergeSourceNote(existingNote, resultOrderLabel) {
    const base = String(existingNote || '').trim()
    const mark = `${MERGE_SOURCE_NOTE_PREFIX} ${resultOrderLabel}`
    if (isMergeSourceOrder({ note: base })) return base
    return base ? `${base}\n${mark}` : mark
}

function loc(o) {
    if (o.deleted_at) return 'korzinka'
    if (o.archived_at) return 'arxiv'
    return 'aktiv'
}

function parseSourceNumbers(note) {
    return (String(note || '').match(/Birlashtirilgan buyurtmalar:?\s*([^\n]*)/i)?.[1] || '')
        .split(';')
        .map((x) => x.replace(/^\s*№?\s*/, '').trim())
        .filter(Boolean)
}

async function fetchAllOrders(s) {
    const out = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await s
            .from('orders')
            .select('id, order_number, customer_name, total, status, note, created_at, deleted_at, archived_at')
            .order('created_at', { ascending: true })
            .range(from, from + PAGE - 1)
        if (error) throw error
        out.push(...(data || []))
        if (!data || data.length < PAGE) break
    }
    return out
}

;(async () => {
    loadEnvLocal()
    const s = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const orders = await fetchAllOrders(s)
    const byNumber = new Map()
    for (const o of orders) if (o.order_number) byNumber.set(String(o.order_number).trim(), o)

    const mergeResults = orders.filter((o) => /Birlashtirilgan buyurtmalar/i.test(o.note || ''))
    console.log(`\nMerge natijalari: ${mergeResults.length} ta`)

    /** @type {Array<{id: string, num: string, payload: object, what: string}>} */
    const actions = []
    let skippedUndone = 0
    let doubleCounted = 0

    for (const r of mergeResults) {
        const label = `№ ${r.order_number || String(r.id).slice(0, 8)}`

        if (r.deleted_at) {
            skippedUndone += 1
            console.log(`\n${label} — natija KARZINKADA (birlashtirish bekor) → tegilmaydi`)
            continue
        }

        const nums = parseSourceNumbers(r.note)
        const srcs = nums.map((n) => byNumber.get(n)).filter(Boolean)
        const missing = nums.filter((n) => !byNumber.get(n))
        const srcsInList = srcs.filter((o) => !o.deleted_at)

        console.log(`\n${label} | ${r.customer_name} | ${loc(r)} | ${r.status} | $${r.total}`)
        for (const o of srcs) {
            console.log(`   manba №${o.order_number} | ${loc(o)} | ${o.status} | $${o.total}`)
        }
        if (missing.length) console.log(`   topilmadi (o‘chirilgan): ${missing.join(', ')}`)

        if (srcsInList.length === 0) {
            // 1-qoida: natija haqiqat, manbalarga belgi qo‘yiladi
            const needMark = srcs.filter((o) => !isMergeSourceOrder(o))
            if (!needMark.length) {
                console.log(`   → o‘zgarish yo‘q (manbalar karzinkada, belgi bor)`)
                continue
            }
            console.log(`   → manbalar karzinkada qoladi; ${needMark.length} ta izohga belgi qo‘yiladi`)
            for (const o of needMark) {
                actions.push({
                    id: o.id,
                    num: o.order_number,
                    payload: { note: buildMergeSourceNote(o.note, label) },
                    what: `belgi qo‘yildi (karzinkada qoladi)`,
                })
            }
            continue
        }

        // 2-qoida: manbalar ro‘yxatda — natija karzinkaga
        doubleCounted += Number(r.total) || 0
        console.log(
            `   >>> IKKI MARTA SANALGAN: $${r.total} — natija karzinkaga ko‘chiriladi, manbalar (${srcsInList
                .map((o) => `№${o.order_number}`)
                .join(', ')}) joyida qoladi`
        )
        actions.push({
            id: r.id,
            num: r.order_number,
            payload: { deleted_at: new Date().toISOString(), archived_at: null },
            what: `natija karzinkaga (manbalar haqiqat)`,
        })
    }

    console.log(`\n=== REJA ===`)
    console.log(`bekor qilingan merge (tegilmadi): ${skippedUndone}`)
    console.log(`o‘zgartiriladigan buyurtma: ${actions.length}`)
    console.log(`statistikadan chiqadigan ortiqcha summa: $${doubleCounted.toFixed(2)}`)

    if (!actions.length) {
        console.log('\nHech narsa o‘zgartirilmadi — hammasi joyida.')
        return
    }
    if (!APPLY) {
        console.log('\n(--apply berilmadi: bazaga yozilmadi)')
        return
    }

    console.log('\n=== BAZAGA YOZISH ===')
    let ok = 0
    const failed = []
    for (const a of actions) {
        const { error } = await s.from('orders').update(a.payload).eq('id', a.id)
        if (error) {
            failed.push({ num: a.num, msg: error.message })
            continue
        }
        ok += 1
        console.log(`   ✓ №${a.num} — ${a.what}`)
    }
    console.log(`\nYangilandi: ${ok} / ${actions.length}`)
    if (failed.length) {
        console.log('Xatolar:')
        failed.forEach((f) => console.log(`   №${f.num}: ${f.msg}`))
    }

    // Tekshiruv: hali ikki marta sanaladigan juftlik bormi
    const after = await fetchAllOrders(s)
    const stillBad = []
    for (const r of after.filter(
        (o) => /Birlashtirilgan buyurtmalar/i.test(o.note || '') && !o.deleted_at
    )) {
        for (const n of parseSourceNumbers(r.note)) {
            const o = after.find((x) => String(x.order_number).trim() === n)
            if (o && !o.deleted_at) stillBad.push(`№${r.order_number} ↔ №${o.order_number}`)
        }
    }
    console.log(
        stillBad.length
            ? `\nDIQQAT — hali ikki marta sanaladigan juftliklar: ${stillBad.join(', ')}`
            : `\nTekshiruv OK: har bir merge juftligidan faqat bitta tomon hisobda.`
    )
})().catch((e) => {
    console.error('XATO:', e.message || e)
    process.exit(1)
})
