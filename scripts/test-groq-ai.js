/**
 * Groq + CRM chat API smoke test (kalitni chop etmaydi).
 * node scripts/test-groq-ai.js
 */
const fs = require('fs')
const path = require('path')

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local')
    if (!fs.existsSync(p)) throw new Error('.env.local topilmadi')
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

function mask(v) {
    const s = String(v || '')
    if (s.length < 8) return s ? '(short)' : '(empty)'
    return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} belgi)`
}

async function testGroqDirect() {
    const key = (process.env.GROQ_API_KEY || '').trim()
    const model = (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim()
    console.log('1) Groq to‘g‘ridan-to‘g‘ri')
    console.log('   KEY:', mask(key))
    console.log('   MODEL:', model)
    if (!key) throw new Error('GROQ_API_KEY yo‘q')

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: 'Qisqa javob.' },
                { role: 'user', content: 'CRM testi: 2+2? Faqat raqam.' },
            ],
            temperature: 0,
            max_tokens: 32,
        }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(`Groq HTTP ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 200)}`)
    }
    const text = (data?.choices?.[0]?.message?.content || '').trim()
    console.log('   HTTP:', res.status, 'OK')
    console.log('   Javob:', text)
    console.log('   model:', data?.model || model)
    return text
}

async function testChatApi() {
    const base = process.env.CRM_TEST_BASE || 'http://127.0.0.1:4000'
    console.log('2) CRM /api/crm-ai/chat')
    console.log('   URL:', `${base}/api/crm-ai/chat`)
    const res = await fetch(`${base}/api/crm-ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                {
                    role: 'user',
                    content:
                        'Iyul oyi bo‘limlar xarajatlaridan 3 tasini sana va nom bilan qisqa ayt. Jami iyul taxminan qancha?',
                },
            ],
        }),
    })
    const data = await res.json().catch(() => ({}))
    console.log('   HTTP:', res.status)
    console.log('   ok:', data.ok)
    console.log('   via:', data.via || '(yo‘q)')
    console.log('   model:', data.model || '(yo‘q)')
    console.log('   contextChars:', data.contextChars ?? '(yo‘q)')
    if (!res.ok || !data.ok) {
        throw new Error(data.message || data.error || `chat HTTP ${res.status}`)
    }
    console.log('   Javob:\n', String(data.text || '').slice(0, 1200))
    return data
}

async function main() {
    loadEnvLocal()
    console.log('OPENROUTER:', mask(process.env.OPENROUTER_API_KEY))
    console.log('GEMINI:', mask(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY))
    await testGroqDirect()
    await testChatApi()
    console.log('\nNATIJA: Groq kalit va CRM chat API ishlayapti.')
}

main().catch((e) => {
    console.error('\nFAIL:', e.message || e)
    process.exit(1)
})
