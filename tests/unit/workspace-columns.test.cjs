/**
 * Node test: orders.workspace va customers.workspace mavjudligi.
 * Run: npm run test:workspace
 *      node --test tests/unit/workspace-columns.test.cjs
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '..', '.env.local')
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

function sb() {
    loadEnvLocal()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    assert.ok(url, 'NEXT_PUBLIC_SUPABASE_URL kerak')
    assert.ok(key, 'NEXT_PUBLIC_SUPABASE_ANON_KEY kerak')
    return createClient(url, key)
}

function isMissingWorkspaceColumn(err) {
    const msg = String(err?.message || '')
    return /workspace/i.test(msg) && /column|does not exist|42703|schema cache/i.test(msg)
}

describe('workspace columns (Buyurtmalar vs Buyurtmalar2)', () => {
    it('orders.workspace ustuni mavjud', async () => {
        const supabase = sb()
        const { data, error } = await supabase.from('orders').select('id, workspace').limit(1)
        if (error && isMissingWorkspaceColumn(error)) {
            assert.fail(
                `orders.workspace yo‘q: ${error.message}\nadd_orders_workspace.sql ni ishga tushiring.`
            )
        }
        assert.ifError(error)
        assert.ok(Array.isArray(data))
        if (data.length) {
            assert.ok(
                data[0].workspace === 'legacy' ||
                    data[0].workspace === 'buyurtmalar2' ||
                    data[0].workspace == null,
                `kutilmagan workspace: ${data[0].workspace}`
            )
        }
    })

    it('customers.workspace ustuni mavjud', async () => {
        const supabase = sb()
        const { data, error } = await supabase.from('customers').select('id, workspace').limit(1)
        if (error && isMissingWorkspaceColumn(error)) {
            assert.fail(
                `customers.workspace yo‘q: ${error.message}\nadd_customers_workspace.sql ni ishga tushiring.`
            )
        }
        assert.ifError(error)
        assert.ok(Array.isArray(data))
    })

    it('legacy va buyurtmalar2 alohida filterlanadi', async () => {
        const supabase = sb()
        const legacy = await supabase
            .from('orders')
            .select('id, workspace')
            .neq('workspace', 'buyurtmalar2')
            .limit(20)
        const v2 = await supabase
            .from('orders')
            .select('id, workspace')
            .eq('workspace', 'buyurtmalar2')
            .limit(20)

        assert.ifError(legacy.error)
        assert.ifError(v2.error)

        for (const row of legacy.data || []) {
            assert.notEqual(row.workspace, 'buyurtmalar2')
        }
        for (const row of v2.data || []) {
            assert.equal(row.workspace, 'buyurtmalar2')
        }
    })
})
