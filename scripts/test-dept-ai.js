const fs = require('fs')
const path = require('path')
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    let k = m[1].trim()
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
}
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

;(async () => {
    const d = await supabase.from('departments').select('id,name_uz,parent_id,is_active').eq('is_active', true).limit(5)
    console.log('departments', d.error?.message || d.data?.length, d.data?.[0])
    const m = await supabase
        .from('material_movements')
        .select('id,department_id,total_cost,currency,movement_date,raw_material_id')
        .not('department_id', 'is', null)
        .order('movement_date', { ascending: false })
        .limit(5)
    console.log('movements', m.error?.message || m.data?.length, m.data?.[0])

    const res = await fetch('http://127.0.0.1:4000/api/crm-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [{ role: 'user', content: 'Bo‘limlar: iyul oyi xarajatlaridan 2 tasini sana va nom bilan ayt. Faqat kontekstdan.' }],
        }),
    })
    const data = await res.json()
    console.log('HTTP', res.status, 'ctx', data.contextChars, 'via', data.via)
    console.log(String(data.text || data.message || '').slice(0, 500))
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
