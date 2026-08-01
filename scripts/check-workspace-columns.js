/**
 * Buyurtmalar / Buyurtmalar2 ajratish ustunlarini tekshiradi.
 * Run (CRM-tizimi- ildizidan):
 *   node scripts/check-workspace-columns.js
 *   npm run test:workspace
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local')
    if (!fs.existsSync(p)) return
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

function isMissingColumnError(err) {
    return /column|does not exist|42703|schema cache/i.test(String(err?.message || err || ''))
}

async function checkOrdersWorkspace(supabase) {
    console.log('1) orders.workspace ...')
    const res = await supabase.from('orders').select('id, workspace').limit(3)
    if (res.error) {
        if (isMissingColumnError(res.error) && /workspace/i.test(String(res.error.message || ''))) {
            console.error('  FAIL: orders.workspace ustuni YO‘Q')
            console.error('  → Supabase SQL Editor: add_orders_workspace.sql')
            return { ok: false, error: res.error.message }
        }
        console.error('  FAIL:', res.error.message)
        return { ok: false, error: res.error.message }
    }
    const rows = res.data || []
    const values = [...new Set(rows.map((r) => r.workspace ?? '(null)'))]
    console.log(`  OK — sample: ${rows.length} qator, workspace qiymatlari: ${values.join(', ') || '—'}`)

    const legacy = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .neq('workspace', 'buyurtmalar2')
    const v2 = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('workspace', 'buyurtmalar2')
    if (!legacy.error && !v2.error) {
        console.log(
            `  Hisob: legacy≈${legacy.count ?? '?'} · buyurtmalar2=${v2.count ?? '?'}`
        )
    }
    return { ok: true, sample: rows }
}

async function checkCustomersWorkspace(supabase) {
    console.log('2) customers.workspace ...')
    const res = await supabase.from('customers').select('id, workspace').limit(3)
    if (res.error) {
        if (isMissingColumnError(res.error) && /workspace/i.test(String(res.error.message || ''))) {
            console.error('  FAIL: customers.workspace ustuni YO‘Q')
            console.error('  → Supabase SQL Editor: add_customers_workspace.sql')
            return { ok: false, error: res.error.message }
        }
        console.error('  FAIL:', res.error.message)
        return { ok: false, error: res.error.message }
    }
    const rows = res.data || []
    const v2 = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('workspace', 'buyurtmalar2')
    console.log(
        `  OK — sample: ${rows.length} qator · buyurtmalar2 mijozlar: ${v2.error ? '?' : v2.count ?? 0}`
    )
    return { ok: true, sample: rows }
}

async function checkSeparation(supabase) {
    console.log('3) Ajratish (legacy vs buyurtmalar2) ...')
    const mixed = await supabase
        .from('orders')
        .select('id, order_number, workspace')
        .eq('workspace', 'buyurtmalar2')
        .limit(5)
    if (mixed.error) {
        console.error('  FAIL:', mixed.error.message)
        return { ok: false }
    }
    console.log(
        `  OK — Buyurtmalar2 buyurtmalari alohida o‘qiladi (${mixed.data?.length || 0} sample)`
    )
    if (mixed.data?.length) {
        for (const o of mixed.data) {
            console.log(`     · ${o.order_number || o.id} → workspace=${o.workspace}`)
        }
    }
    return { ok: true }
}

async function main() {
    loadEnvLocal()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) {
        console.error('Supabase env topilmadi (.env.local)')
        process.exit(1)
    }
    const supabase = createClient(url, key)

    const a = await checkOrdersWorkspace(supabase)
    const b = await checkCustomersWorkspace(supabase)
    const c = a.ok ? await checkSeparation(supabase) : { ok: false }

    console.log('')
    if (a.ok && b.ok && c.ok) {
        console.log('NATIJA: OK — workspace ustunlari bor, ajratish ishlaydi.')
        process.exit(0)
    }
    console.log('NATIJA: FAIL — yuqoridagi xatolarni tuzating.')
    process.exit(1)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
