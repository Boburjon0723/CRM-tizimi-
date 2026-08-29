/**
 * Bir martalik: eski tugallanganlarni arxivga ko‘chirish + completed_at backfill.
 * Run: node scripts/fix-archive-trash-misplaced.js
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const COMPLETED_ARCHIVE_AFTER_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local')
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/)
        if (!m) continue
        const k = m[1].trim()
        let v = m[2].trim()
        if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
        ) {
            v = v.slice(1, -1)
        }
        if (!process.env[k]) process.env[k] = v
    }
}

function isCompleted(status) {
    const s = String(status || '').toLowerCase().trim()
    return s === 'completed' || s.includes('tugallan')
}

function archiveAgeTs(o) {
    const raw = o.completed_at || o.created_at || ''
    const t = new Date(raw).getTime()
    return Number.isNaN(t) ? null : t
}

function isOldEnough(o, now) {
    const t = archiveAgeTs(o)
    return t != null && now - t >= COMPLETED_ARCHIVE_AFTER_DAYS * DAY
}

async function fetchAll(s) {
    const all = []
    let from = 0
    for (;;) {
        const { data, error } = await s
            .from('orders')
            .select(
                'id, order_number, customer_name, total, status, created_at, completed_at, deleted_at, archived_at, workspace'
            )
            .order('created_at', { ascending: false })
            .range(from, from + 999)
        if (error) throw error
        all.push(...(data || []))
        if (!data || data.length < 1000) break
        from += 1000
    }
    return all
}

async function updateChunks(s, ids, patch) {
    const CHUNK = 40
    let ok = 0
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const { error } = await s.from('orders').update(patch).in('id', chunk)
        if (error) throw error
        ok += chunk.length
    }
    return ok
}

async function main() {
    loadEnvLocal()
    const s = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
    const now = Date.now()
    const ts = new Date().toISOString()
    const orders = await fetchAll(s)

    const trashToArchive = orders.filter(
        (o) => o.deleted_at && !o.archived_at && isCompleted(o.status) && isOldEnough(o, now)
    )
    const activeToArchive = orders.filter(
        (o) => !o.deleted_at && !o.archived_at && isCompleted(o.status) && isOldEnough(o, now)
    )
    const needCompletedAt = orders.filter(
        (o) => isCompleted(o.status) && !o.completed_at && o.created_at
    )

    console.log('Oldindan:')
    console.log(
        `  faol=${orders.filter((o) => !o.deleted_at && !o.archived_at).length}` +
            ` arxiv=${orders.filter((o) => o.archived_at && !o.deleted_at).length}` +
            ` korzinka=${orders.filter((o) => o.deleted_at && !o.archived_at).length}`
    )
    console.log(`Korzinka → arxiv: ${trashToArchive.length}`)
    console.log(`Faol → arxiv: ${activeToArchive.length}`)
    console.log(`completed_at backfill: ${needCompletedAt.length}`)

    if (trashToArchive.length) {
        const n = await updateChunks(
            s,
            trashToArchive.map((o) => o.id),
            { archived_at: ts, deleted_at: null }
        )
        console.log(`✓ Korzinkadan arxivga: ${n}`)
    }

    if (activeToArchive.length) {
        const n = await updateChunks(
            s,
            activeToArchive.map((o) => o.id),
            { archived_at: ts }
        )
        console.log(`✓ Faoldan arxivga: ${n}`)
    }

    // completed_at backfill — created_at dan (faqat bo‘sh bo‘lsa)
    let backfilled = 0
    for (const o of needCompletedAt) {
        const { error } = await s
            .from('orders')
            .update({ completed_at: o.created_at })
            .eq('id', o.id)
            .is('completed_at', null)
        if (error) {
            console.warn('backfill fail', o.order_number || o.id, error.message)
            break
        }
        backfilled += 1
    }
    console.log(`✓ completed_at backfill: ${backfilled}`)

    const after = await fetchAll(s)
    console.log('\nKeyin:')
    console.log(
        `  faol=${after.filter((o) => !o.deleted_at && !o.archived_at).length}` +
            ` arxiv=${after.filter((o) => o.archived_at && !o.deleted_at).length}` +
            ` korzinka=${after.filter((o) => o.deleted_at && !o.archived_at).length}`
    )

    const leftoverTrashCompleted = after.filter(
        (o) => o.deleted_at && !o.archived_at && isCompleted(o.status) && isOldEnough(o, now)
    )
    const leftoverActiveCompleted = after.filter(
        (o) => !o.deleted_at && !o.archived_at && isCompleted(o.status) && isOldEnough(o, now)
    )
    console.log(`Qoldiq eski completed korzinkada: ${leftoverTrashCompleted.length}`)
    console.log(`Qoldiq eski completed faolda: ${leftoverActiveCompleted.length}`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
