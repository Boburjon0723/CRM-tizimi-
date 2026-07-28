import { createClient } from '@supabase/supabase-js'
import { sendTelegramNotification } from '@/utils/telegram'
import {
    STALE_ORDER_DAYS,
    filterStaleOpenOrders,
    buildStaleOrdersFallbackMessage,
    buildStaleOrdersAiPrompt,
} from '@/lib/staleOrders'
import { generateStaleOrdersAiMessage, getGroqApiKey } from '@/lib/groq'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        ''
    if (!url || !key) return null
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
}

async function authorize(request) {
    const cronSecret = process.env.CRON_SECRET || ''
    const authHeader = request.headers.get('authorization') || ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const vercelCron = request.headers.get('x-vercel-cron')

    if (vercelCron) return { ok: true, via: 'vercel-cron' }
    if (cronSecret && bearer && bearer === cronSecret) return { ok: true, via: 'cron-secret' }

    const url = new URL(request.url)
    const q = url.searchParams.get('secret')
    if (cronSecret && q && q === cronSecret) return { ok: true, via: 'query-secret' }

    if (bearer) {
        const supabase = getSupabase()
        if (supabase) {
            const { data, error } = await supabase.auth.getUser(bearer)
            if (!error && data?.user) return { ok: true, via: 'user', userId: data.user.id }
        }
    }

    return { ok: false }
}

async function loadOpenOrders(supabase) {
    const fb = await supabase
        .from('orders')
        .select(
            'id, order_number, customer_name, customer_phone, total, status, created_at, source, customers(name, phone)'
        )
        .order('created_at', { ascending: true })
        .limit(1000)

    if (fb.error) throw fb.error
    return fb.data || []
}

async function runCheck({ notifyTelegram }) {
    const supabase = getSupabase()
    if (!supabase) {
        return {
            status: 500,
            body: { ok: false, error: 'Supabase sozlanmagan' },
        }
    }

    const orders = await loadOpenOrders(supabase)
    const stale = filterStaleOpenOrders(orders)

    let message = buildStaleOrdersFallbackMessage(stale)
    let aiUsed = false
    let aiError = null

    if (stale.length > 0 && getGroqApiKey()) {
        const ai = await generateStaleOrdersAiMessage(buildStaleOrdersAiPrompt(stale))
        if (ai.ok && ai.text) {
            message = ai.text
            aiUsed = true
        } else {
            aiError = ai.error || 'AI javob bermadi'
        }
    }

    let telegram = null
    if (notifyTelegram && stale.length > 0) {
        telegram = await sendTelegramNotification(message)
    } else if (notifyTelegram && stale.length === 0) {
        telegram = { ok: true, skipped: true, reason: 'Stale buyurtma yo‘q' }
    }

    return {
        status: 200,
        body: {
            ok: true,
            staleDays: STALE_ORDER_DAYS,
            count: stale.length,
            orders: stale.map((o) => ({
                id: o.id,
                order_number: o.order_number,
                customer_name: o.customer_name || o.customers?.name || null,
                customer_phone: o.customer_phone || o.customers?.phone || null,
                total: o.total,
                status: o.status,
                created_at: o.created_at,
                staleDays: o.staleDays,
            })),
            message,
            aiUsed,
            aiError,
            groqConfigured: Boolean(getGroqApiKey()),
            telegram,
        },
    }
}

export async function GET(request) {
    const auth = await authorize(request)
    if (!auth.ok) {
        return Response.json(
            {
                ok: false,
                error: 'Unauthorized — CRON_SECRET yoki tizimga kirgan foydalanuvchi tokeni kerak',
            },
            { status: 401 }
        )
    }

    const url = new URL(request.url)
    const notifyParam = url.searchParams.get('notify')
    const notifyTelegram =
        notifyParam === '1' ||
        notifyParam === 'true' ||
        Boolean(request.headers.get('x-vercel-cron')) ||
        auth.via === 'vercel-cron'

    try {
        const result = await runCheck({ notifyTelegram })
        return Response.json({ ...result.body, authVia: auth.via }, { status: result.status })
    } catch (e) {
        console.error('stale-orders check:', e)
        return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
    }
}

export async function POST(request) {
    return GET(request)
}
