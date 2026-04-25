import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_SUMMARY_JSON = 48_000
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function getGeminiKey() {
    return (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim()
}

function getOpenRouterKey() {
    return (process.env.OPENROUTER_API_KEY || '').trim()
}

/** Eski 1.5-flash nomi ba’zan 404; 2.0-flash va -latest sinovdan o‘tadi */
function pickGeminiModel() {
    const m = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim()
    return m || 'gemini-2.0-flash'
}

function pickOpenRouterModel() {
    const m = (process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001').trim()
    return m || 'google/gemini-2.0-flash-001'
}

const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash']

function isQuotaError(err) {
    const msg = String(err?.message || err || '')
    return /429|quota|Resource exhausted|Too Many Requests|free_tier/i.test(msg)
}

/** Model nomi noto‘g‘ri yoki API versiyasi — keyingi modelni sinash */
function isRetryableGeminiError(err) {
    const msg = String(err?.message || err || '')
    if (isQuotaError(err)) return true
    return /404|Not Found|not found|not supported/i.test(msg)
}

async function generateWithOpenRouter(apiKey, prompt) {
    const model = pickOpenRouterModel()
    const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://nuurhome-crm.local',
            'X-Title': 'Nuur Home CRM',
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.35,
            max_tokens: 2048,
        }),
    })
    const raw = await res.text()
    if (!res.ok) {
        const e = new Error(`OpenRouter ${res.status}: ${raw.slice(0, 500)}`)
        e.openRouterStatus = res.status
        throw e
    }
    let data
    try {
        data = JSON.parse(raw)
    } catch {
        throw new Error('OpenRouter: not JSON')
    }
    const content = data.choices?.[0]?.message?.content
    const trimmed = typeof content === 'string' ? content.trim() : ''
    if (!trimmed) throw new Error('empty_response')
    return trimmed
}

async function generateReportTextGemini(genAI, prompt, primaryModel) {
    const tried = new Set()
    const order = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)]
    let lastErr = null
    for (const modelName of order) {
        if (tried.has(modelName)) continue
        tried.add(modelName)
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.35,
                    maxOutputTokens: 2048,
                },
            })
            const result = await model.generateContent(prompt)
            const text = result.response?.text?.() || ''
            const trimmed = typeof text === 'string' ? text.trim() : ''
            if (trimmed) return trimmed
        } catch (e) {
            lastErr = e
            if (isRetryableGeminiError(e)) continue
            throw e
        }
    }
    if (lastErr) throw lastErr
    throw new Error('empty_response')
}

function localeInstruction(locale) {
    if (locale === 'ru') return 'Javobni rus tilida yozing.'
    if (locale === 'en') return 'Write the response in English.'
    return 'Javobni o‘zbek tilida yozing (lotin yoki kirill — foydalanuvchi interfeysiga mos).'
}

export async function POST(request) {
    const orKey = getOpenRouterKey()
    const geminiKey = getGeminiKey()
    if (!orKey && !geminiKey) {
        return NextResponse.json(
            {
                ok: false,
                error: 'missing_key',
                message: 'OPENROUTER_API_KEY yoki GEMINI_API_KEY sozlanmagan.',
            },
            { status: 503 }
        )
    }

    let body
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
    }

    const summary = body?.summary
    const locale = body?.locale === 'ru' || body?.locale === 'en' ? body.locale : 'uz'

    if (!summary || typeof summary !== 'object') {
        return NextResponse.json({ ok: false, error: 'summary_required' }, { status: 400 })
    }

    let raw
    try {
        raw = JSON.stringify(summary)
    } catch {
        return NextResponse.json({ ok: false, error: 'summary_invalid' }, { status: 400 })
    }

    if (raw.length > MAX_SUMMARY_JSON) {
        return NextResponse.json({ ok: false, error: 'summary_too_large' }, { status: 413 })
    }

    const prompt = `Sen Nuur Home (parda/aksessuar) CRM tizimi uchun biznes tahlilchisisan.
Quyidagi JSON — foydalanuvchi tanlagan davr va filtrlarga ko‘ra CRM «Statistika» sahifasidan olingan yig‘ma raqamlar (USD).
Vazifa: qisqa, amaliy hisobot (sarlavha + 2–6 band: savdo, kirim/chiqim, kategoriya/mahsulot/mijoz tendentsiyalari, e’tibor berish kerak bo‘lgan nuqtalar).
Aniq raqamlarni qayta yozing; taxminiy bo‘lsa «taxminan» deb belgilang.
Shaxsiy telefon raqamlarni matnda takrorlamang; mijozlarni ism yoki «mijoz 1» kabi umumiy qilib atang.

${localeInstruction(locale)}

JSON ma’lumot:
${raw}`

    if (orKey) {
        try {
            const text = await generateWithOpenRouter(orKey, prompt)
            return NextResponse.json({ ok: true, text })
        } catch (e) {
            const msg = e?.message || String(e)
            console.error('crm-ai openrouter:', msg)
            const st = Number(e?.openRouterStatus)
            if (st === 429 || isQuotaError(e) || /429|rate limit|quota/i.test(msg)) {
                return NextResponse.json(
                    { ok: false, error: 'quota_exceeded', message: msg.slice(0, 400) },
                    { status: 429 }
                )
            }
            /** OpenRouter: kredit yo‘q (402) yoki boshqa xato — zaxira: to‘g‘ridan-to‘g‘ri Gemini */
            const canFallbackGemini =
                geminiKey &&
                (st === 402 ||
                    st === 401 ||
                    /Insufficient credits|402|payment required/i.test(msg))
            if (canFallbackGemini) {
                try {
                    const genAI = new GoogleGenerativeAI(geminiKey)
                    const trimmed = await generateReportTextGemini(genAI, prompt, pickGeminiModel())
                    return NextResponse.json({ ok: true, text: trimmed, via: 'gemini_fallback' })
                } catch (e2) {
                    const m2 = e2?.message || String(e2)
                    console.error('crm-ai gemini after openrouter:', m2)
                    return NextResponse.json(
                        {
                            ok: false,
                            error: 'both_providers_failed',
                            message: `${msg.slice(0, 280)} | Gemini zaxira: ${m2.slice(0, 220)}`,
                        },
                        { status: 502 }
                    )
                }
            }
            return NextResponse.json(
                { ok: false, error: 'openrouter_error', message: msg.slice(0, 500) },
                { status: 502 }
            )
        }
    }

    try {
        const genAI = new GoogleGenerativeAI(geminiKey)
        const trimmed = await generateReportTextGemini(genAI, prompt, pickGeminiModel())
        return NextResponse.json({ ok: true, text: trimmed })
    } catch (e) {
        const msg = e?.message || String(e)
        console.error('crm-ai gemini:', msg)
        if (isQuotaError(e)) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'quota_exceeded',
                    message: msg.slice(0, 400),
                },
                { status: 429 }
            )
        }
        return NextResponse.json(
            { ok: false, error: 'gemini_error', message: msg.slice(0, 500) },
            { status: 502 }
        )
    }
}
