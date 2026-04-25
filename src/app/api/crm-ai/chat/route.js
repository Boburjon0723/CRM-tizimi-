import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

async function getCrmContext() {
    try {
        const { data: products } = await supabase.from('products').select('name, sale_price, category').limit(20)
        return `MAHSULOTLAR: ${JSON.stringify(products || [])}`
    } catch (e) {
        return 'Context error.'
    }
}

async function callOpenRouter(messages, context) {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
        console.error("OpenRouter API Key topilmadi (.env.local ni tekshiring)")
        return null
    }

    try {
        console.log("OpenRouter ga so'rov yuborilmoqda...")
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "CRM AI"
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-lite-preview-02-05:free",
                messages: [
                    { role: "system", content: `Siz Nuur Home CRM tahlilchisiz. Context: ${context}` },
                    ...messages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
                ]
            })
        })

        const data = await response.json()
        if (data.error) {
            console.error("OpenRouter API Xatosi:", data.error)
            return null
        }
        
        return data.choices?.[0]?.message?.content || null
    } catch (e) {
        console.error("OpenRouter Fetch Xatosi:", e.message)
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

    const { messages } = body
    const context = await getCrmContext()

    // 1. OpenRouter
    const orResult = await callOpenRouter(messages, context)
    if (orResult) {
        return NextResponse.json({ ok: true, text: orResult })
    }

    // 2. Gemini Fallback
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
        try {
            console.log("Gemini SDK ga o'tilmoqda (Fallback)...")
            const genAI = new GoogleGenerativeAI(geminiKey)
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
            const result = await model.generateContent(messages[messages.length - 1].content)
            return NextResponse.json({ ok: true, text: result.response.text() })
        } catch (e) {
            console.error("Gemini SDK Xatosi:", e.message)
        }
    }

    return NextResponse.json({ ok: false, error: 'AI_LIMIT_EXCEEDED' }, { status: 502 })
}
