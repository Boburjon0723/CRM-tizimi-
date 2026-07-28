/**
 * Groq Chat Completions (OpenAI-compatible).
 * Kalit: GROQ_API_KEY (server-only — NEXT_PUBLIC qilmang).
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'

export function getGroqApiKey() {
    return process.env.GROQ_API_KEY || process.env.GROQ_KEY || ''
}

export async function groqChatCompletion({
    messages,
    model = DEFAULT_MODEL,
    temperature = 0.4,
    max_tokens = 1024,
} = {}) {
    const apiKey = getGroqApiKey()
    if (!apiKey) {
        return { ok: false, error: 'GROQ_API_KEY yo‘q', text: null }
    }

    try {
        const res = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens,
            }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
            const errMsg = data?.error?.message || data?.message || `HTTP ${res.status}`
            console.error('Groq API error:', errMsg)
            return { ok: false, error: errMsg, text: null, raw: data }
        }

        const text = data?.choices?.[0]?.message?.content?.trim() || ''
        return { ok: Boolean(text), text, raw: data, error: text ? null : 'Bo‘sh javob' }
    } catch (e) {
        console.error('Groq fetch error:', e)
        return { ok: false, error: e?.message || String(e), text: null }
    }
}

/** Stale buyurtmalar uchun AI matn; muvaffaqiyatsiz bo‘lsa null */
export async function generateStaleOrdersAiMessage(prompt) {
    const result = await groqChatCompletion({
        messages: [
            {
                role: 'system',
                content:
                    'Siz Nuur Home CRM yordamchisisiz. Qisqa, professional o‘zbekcha ogohlantirish yozasiz. Faqat xabar matnini qaytaring.',
            },
            { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        max_tokens: 900,
    })
    return result
}
