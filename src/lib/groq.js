/**
 * Groq Chat Completions (OpenAI-compatible).
 * Kalit: GROQ_API_KEY — faqat serverda (NEXT_PUBLIC qilmang).
 * https://console.groq.com/keys
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Tez va bepul limitga mos default; sifat uchun: llama-3.3-70b-versatile */
export function pickGroqModel() {
    const m = (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim()
    return m || 'llama-3.3-70b-versatile'
}

export function getGroqApiKey() {
    return (process.env.GROQ_API_KEY || process.env.GROQ_KEY || '').trim()
}

export function hasGroqConfig() {
    return Boolean(getGroqApiKey())
}

/**
 * @param {{ messages: Array<{role:string, content:string}>, model?: string, temperature?: number, max_tokens?: number }} opts
 * @returns {Promise<{ ok: boolean, text: string|null, error?: string|null, model?: string, raw?: unknown }>}
 */
export async function groqChatCompletion({
    messages,
    model = pickGroqModel(),
    temperature = 0.4,
    max_tokens = 2048,
} = {}) {
    const apiKey = getGroqApiKey()
    if (!apiKey) {
        return { ok: false, error: 'GROQ_API_KEY yo‘q', text: null }
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        return { ok: false, error: 'messages bo‘sh', text: null }
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
            return { ok: false, error: errMsg, text: null, raw: data, model }
        }

        const text = data?.choices?.[0]?.message?.content?.trim() || ''
        return {
            ok: Boolean(text),
            text: text || null,
            error: text ? null : 'Bo‘sh javob',
            model,
            raw: data,
        }
    } catch (e) {
        console.error('Groq fetch error:', e)
        return { ok: false, error: e?.message || String(e), text: null, model }
    }
}

/** Oddiy user prompt → matn (insights / ogohlantirish) */
export async function groqGenerateText(prompt, { system, temperature = 0.35, max_tokens = 2048 } = {}) {
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: String(prompt || '') })
    return groqChatCompletion({ messages, temperature, max_tokens })
}
