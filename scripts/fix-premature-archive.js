/**
 * Xato arxivlanganlarni qaytarish: completed_at yo‘q yoki 30 kundan yangi
 * bo‘lsa, lekin archived_at bor — asosiy ro‘yxatga qaytaradi.
 *
 * Dry-run: node scripts/fix-premature-archive.js
 * Apply:   node scripts/fix-premature-archive.js --apply
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ARCHIVE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local')
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/)
        if (!m) continue
        let v = m[2].trim()
        if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
        ) {
            v = v.slice(1, -1)
        }
        if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v
    }
}

;(async () => {
    loadEnvLocal()
    const apply = process.argv.includes('--apply')
    const s = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const { data: rows, error } = await s
        .from('orders')
        .select('id, order_number, customer_name, status, created_at, completed_at, archived_at, deleted_at')
        .not('archived_at', 'is', null)
        .is('deleted_at', null)
        .order('archived_at', { ascending: false })
        .limit(2000)

    if (error) {
        console.error('XATO:', error.message)
        process.exit(1)
    }

    const now = Date.now()
    const premature = []
    for (const o of rows || []) {
        if (String(o.status || '').toLowerCase() !== 'completed' && !/tugallan/i.test(String(o.status || ''))) {
            // status tugallanmagan lekin arxivda — ham qaytarish kerak bo‘lishi mumkin
            premature.push({ ...o, reason: 'status_not_completed' })
            continue
        }
        if (!o.completed_at) {
            premature.push({ ...o, reason: 'completed_at_null' })
            continue
        }
        const t = new Date(o.completed_at).getTime()
        if (Number.isNaN(t) || now - t < ARCHIVE_DAYS * DAY_MS) {
            premature.push({ ...o, reason: 'completed_at_too_recent' })
        }
    }

    console.log(`Arxivdagi jami: ${rows?.length || 0}`)
    console.log(`Erta arxivlangan (qaytarilishi kerak): ${premature.length}`)
    const byReason = {}
    for (const o of premature) byReason[o.reason] = (byReason[o.reason] || 0) + 1
    console.log('Sabab:', JSON.stringify(byReason))
    console.log('\nBirinchi 15:')
    premature.slice(0, 15).forEach((o) => {
        console.log(
            `  ${o.order_number} | ${o.customer_name} | created=${o.created_at?.slice(0, 10)} completed=${o.completed_at?.slice(0, 10) || 'NULL'} | ${o.reason}`
        )
    })

    if (!apply) {
        console.log('\n(Dry-run) Qo‘llash uchun: node scripts/fix-premature-archive.js --apply')
        return
    }

    let ok = 0
    let fail = 0
    for (const o of premature) {
        const { error: updErr } = await s.from('orders').update({ archived_at: null }).eq('id', o.id)
        if (updErr) {
            console.warn('fail', o.order_number, updErr.message)
            fail++
        } else ok++
    }
    console.log(`\nQaytarildi: ${ok}, xato: ${fail}`)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
