/**
 * Buyurtmalar AI kontekst hajmini tekshiradi.
 * node scripts/test-orders-ai-context.js
 */
const fs = require('fs')
const path = require('path')

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

async function main() {
    loadEnvLocal()
    // Next alias ishlatilmaydi — dinamik import o‘rniga to‘g‘ridan fetch orqali
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_number, status, total, customer_name')
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(120)
    if (error) throw error
    console.log('orders:', orders?.length)
    const ids = (orders || []).map((o) => o.id)
    const { data: items, error: iErr } = await supabase
        .from('order_items')
        .select('order_id, product_name, color, quantity, price')
        .in('order_id', ids.slice(0, 40))
    if (iErr) throw iErr
    console.log('items sample:', items?.length)

    // Call API and print server error more carefully
    const res = await fetch('http://127.0.0.1:4000/api/crm-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [{ role: 'user', content: 'Bitta jarayondagi buyurtma haqida qisqa ayt' }],
        }),
    })
    const text = await res.text()
    console.log('chat HTTP', res.status)
    console.log(text.slice(0, 800))
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
