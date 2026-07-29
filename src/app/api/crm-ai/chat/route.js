import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { groqChatCompletion, hasGroqConfig, pickGroqModel } from '@/lib/groq'
import { buildFullCrmAiContext } from '@/lib/crmAiOrdersContext'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function lastUserText(messages) {
    const list = Array.isArray(messages) ? messages : []
    for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i]
        if (m && (m.role === 'user' || m.role === 'human') && String(m.content || '').trim()) {
            return String(m.content).trim()
        }
    }
    return ''
}

function truncateText(s, max = 1200) {
    const t = String(s || '')
    if (t.length <= max) return t
    return `${t.slice(0, max)}\n…(qisqartirildi)`
}

function toChatMessages(messages, context, { historyLimit = 6, msgMax = 1200 } = {}) {
    const system = {
        role: 'system',
        content: context,
    }
    const hist = (Array.isArray(messages) ? messages : [])
        .filter((m) => m && (m.content || '').trim())
        .slice(-historyLimit)
        .map((m) => ({
            role: m.role === 'ai' || m.role === 'assistant' ? 'assistant' : 'user',
            content: truncateText(m.content, msgMax),
        }))
    return [system, ...hist]
}

function shrinkContext(context, maxChars = 4500) {
    const t = String(context || '')
    if (t.length <= maxChars) return t
    return `${t.slice(0, maxChars)}\n…(kontekst qisqartirildi — Groq limit)`
}

async function callOpenRouter(messages, context) {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim()
    if (!apiKey) return null

    try {
        const model =
            (process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001').trim() ||
            'google/gemini-2.0-flash-001'
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://nuurhome-crm.local',
                'X-Title': 'Nuur Home CRM',
            },
            body: JSON.stringify({
                model,
                messages: toChatMessages(messages, context),
                temperature: 0.3,
                max_tokens: 3000,
            }),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok || data.error) {
            console.error('OpenRouter chat:', data.error || response.status)
            return null
        }
        return data.choices?.[0]?.message?.content?.trim() || null
    } catch (e) {
        console.error('OpenRouter chat fetch:', e.message)
        return null
    }
}

async function callGemini(messages, context) {
    const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim()
    if (!geminiKey) return null
    try {
        const genAI = new GoogleGenerativeAI(geminiKey)
        const modelName = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash'
        const model = genAI.getGenerativeModel({ model: modelName })
        const last = lastUserText(messages)
        if (!last) return null
        const prompt = `${context}\n\nFoydalanuvchi savoli:\n${last}`
        const result = await model.generateContent(prompt)
        return result.response?.text?.()?.trim() || null
    } catch (e) {
        console.error('Gemini chat:', e.message)
        return null
    }
}

export async function POST(request) {
    let body
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
    }

    const { messages } = body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json({ ok: false, error: 'messages_required' }, { status: 400 })
    }

    const context = await buildFullCrmAiContext(lastUserText(messages))
    let lastGroqError = null

    // 1) Groq — asosiy model, keyin kichik/boshqa modellar (kunlik/TPM limit uchun)
    if (hasGroqConfig()) {
        const primary = pickGroqModel()
        const attempts = [
            { model: primary, contextMax: 7000, historyLimit: 6, max_tokens: 1800 },
            // 70b kunlik limit tugasa — boshqa modellar (alohida kvota)
            { model: 'llama-3.1-8b-instant', contextMax: 4000, historyLimit: 4, max_tokens: 1200 },
            { model: 'gemma2-9b-it', contextMax: 4000, historyLimit: 4, max_tokens: 1200 },
            { model: 'llama-3.2-3b-preview', contextMax: 3500, historyLimit: 3, max_tokens: 1000 },
        ]

        for (const attempt of attempts) {
            const compactCtx = shrinkContext(context, attempt.contextMax)
            const chatMsgs = toChatMessages(messages, compactCtx, {
                historyLimit: attempt.historyLimit,
                msgMax: 800,
            })
            const groq = await groqChatCompletion({
                messages: chatMsgs,
                model: attempt.model,
                temperature: 0.3,
                max_tokens: attempt.max_tokens,
            })
            if (groq.ok && groq.text) {
                return NextResponse.json({
                    ok: true,
                    text: groq.text,
                    via: 'groq',
                    model: groq.model,
                    contextChars: compactCtx.length,
                })
            }
            lastGroqError = groq.error || lastGroqError
            console.warn(`Groq ${attempt.model} failed:`, groq.error)
            // Kalit yoki model yo‘q bo‘lsa keyingisiga o‘tish; boshqa xatolarda ham urinish
        }
    }

    // 2) OpenRouter
    const orResult = await callOpenRouter(messages, context)
    if (orResult) {
        return NextResponse.json({
            ok: true,
            text: orResult,
            via: 'openrouter',
            contextChars: context.length,
        })
    }

    // 3) Gemini
    const geminiText = await callGemini(messages, context)
    if (geminiText) {
        return NextResponse.json({
            ok: true,
            text: geminiText,
            via: 'gemini',
            contextChars: context.length,
        })
    }

    const isRateLimit = /rate.?limit|tokens per day|TPD|TPM|Request too large/i.test(
        lastGroqError || ''
    )
    return NextResponse.json(
        {
            ok: false,
            error: isRateLimit ? 'RATE_LIMIT' : 'AI_UNAVAILABLE',
            message: isRateLimit
                ? `Groq bepul limiti tugadi (${lastGroqError || 'rate limit'}). Taxminan 1 soatdan keyin qayta urinib ko‘ring yoki OPENROUTER_API_KEY / GEMINI_API_KEY qo‘shing.`
                : 'AI javob bermadi. GROQ_API_KEY (tavsiya), OPENROUTER_API_KEY yoki GEMINI_API_KEY ni .env.local ga qo‘ying.',
            detail: lastGroqError || null,
        },
        { status: 502 }
    )
}
