import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LEAVE_TEXT = '🛌 Dam olmoqchiman'

function getBotToken() {
    return (
        process.env.TELEGRAM_BOT_TOKEN ||
        process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN ||
        ''
    ).trim()
}

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    return createClient(url, key, { auth: { persistSession: false } })
}

function normalizeUzbekPhone(input) {
    if (input == null || input === '') return ''
    const d = String(input).replace(/\D/g, '')
    if (d.length < 9) return ''
    const tail9 = d.slice(-9)
    if (!/^[1-9]\d{8}$/.test(tail9)) return ''
    return `998${tail9}`
}

function managerChatIdSet() {
    const raw = process.env.TELEGRAM_MANAGER_CHAT_IDS || ''
    const ids = new Set()
    for (const part of raw.split(/[,\s]+/)) {
        const t = part.trim()
        if (!t) continue
        const n = Number(t)
        if (Number.isFinite(n)) ids.add(n)
    }
    return ids
}

async function tgSend(botToken, body) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
        console.error('Telegram sendMessage:', data)
    }
    return data
}

export async function POST(request) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (secret) {
        const token = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || ''
        if (token !== secret) {
            return NextResponse.json({ ok: false }, { status: 401 })
        }
    }

    const botToken = getBotToken()
    if (!botToken) {
        console.error('TELEGRAM_BOT_TOKEN sozlanmagan')
        return NextResponse.json({ ok: true })
    }

    const supabase = getServiceSupabase()
    if (!supabase) {
        console.error('SUPABASE_SERVICE_ROLE_KEY yoki URL yo‘q — webhook ishlamaydi')
        return NextResponse.json({ ok: true })
    }

    let update
    try {
        update = await request.json()
    } catch {
        return NextResponse.json({ ok: false }, { status: 400 })
    }

    const msg = update.message || update.edited_message
    if (!msg || !msg.from) {
        return NextResponse.json({ ok: true })
    }

    const chatId = msg.chat?.id
    const from = msg.from
    const userId = from.id
    const managers = managerChatIdSet()
    const isManager = managers.has(Number(userId))

    const contactKeyboard = {
        keyboard: [[{ text: '📱 Telefonni yuborish', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
    }

    const leaveKeyboard = {
        keyboard: [[{ text: LEAVE_TEXT }]],
        resize_keyboard: true
    }

    if (msg.text === '/start' || msg.text === '/help') {
        if (isManager) {
            await tgSend(botToken, {
                chat_id: chatId,
                text:
                    '👔 <b>Boshliq rejimi</b>\n\nXodimlar «Dam olmoqchiman» bosganda bildirishnomalar shu bot orqali keladi. CRM da xodim telefoni to‘g‘ri kiritilgan bo‘lsin.',
                parse_mode: 'HTML'
            })
            return NextResponse.json({ ok: true })
        }
        await tgSend(botToken, {
            chat_id: chatId,
            text:
                '👋 <b>Assalomu alaykum</b>\n\nCRM dagi xodim telefoningizni tanlash uchun pastdagi tugma orqali kontaktingizni yuboring.',
            parse_mode: 'HTML',
            reply_markup: contactKeyboard
        })
        return NextResponse.json({ ok: true })
    }

    if (msg.contact) {
        if (isManager) {
            await tgSend(botToken, {
                chat_id: chatId,
                text: 'Siz boshliq sifatida ro‘yxatdan o‘tgansiz.',
                reply_markup: { remove_keyboard: true }
            })
            return NextResponse.json({ ok: true })
        }

        const norm = normalizeUzbekPhone(msg.contact.phone_number)
        if (!norm) {
            await tgSend(botToken, {
                chat_id: chatId,
                text: '❌ Telefon raqami noto‘g‘ri. Qaytadan urinib ko‘ring.'
            })
            return NextResponse.json({ ok: true })
        }

        const { data: empRows, error: empErr } = await supabase
            .from('employees')
            .select('id, name')
            .eq('phone', norm)
            .limit(2)

        if (empErr) {
            console.error('employees lookup:', empErr)
            await tgSend(botToken, {
                chat_id: chatId,
                text: '⚠️ Tizim vaqtincha band. Keyinroq urinib ko‘ring.'
            })
            return NextResponse.json({ ok: true })
        }

        const emp = empRows?.[0]
        if (!emp) {
            await tgSend(botToken, {
                chat_id: chatId,
                text:
                    '❌ Bu telefon CRM dagi xodimlar ro‘yxatida topilmadi. Admin telefoningizni xodim kartasiga kiritganini tekshiring (998… format).'
            })
            return NextResponse.json({ ok: true })
        }

        const { error: upErr } = await supabase.from('telegram_crm_links').upsert(
            {
                telegram_user_id: userId,
                telegram_chat_id: chatId,
                phone_normalized: norm,
                role: 'employee',
                employee_id: emp.id,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'telegram_user_id' }
        )

        if (upErr) {
            console.error('telegram_crm_links upsert:', upErr)
            await tgSend(botToken, {
                chat_id: chatId,
                text: '⚠️ Bog‘lanishni saqlab bo‘lmadi. Keyinroq urinib ko‘ring.'
            })
            return NextResponse.json({ ok: true })
        }

        await tgSend(botToken, {
            chat_id: chatId,
            text: `✅ <b>${escapeHtml(emp.name)}</b>, siz tanildingiz.\n\nDam olish uchun pastdagi tugmani bosing.`,
            parse_mode: 'HTML',
            reply_markup: leaveKeyboard
        })
        return NextResponse.json({ ok: true })
    }

    const text = (msg.text || '').trim()
    if (text === LEAVE_TEXT) {
        if (isManager) {
            await tgSend(botToken, {
                chat_id: chatId,
                text: 'Bu tugma faqat xodimlar uchun.'
            })
            return NextResponse.json({ ok: true })
        }

        const { data: linkRow, error: linkErr } = await supabase
            .from('telegram_crm_links')
            .select('employee_id')
            .eq('telegram_user_id', userId)
            .maybeSingle()

        if (linkErr || !linkRow?.employee_id) {
            await tgSend(botToken, {
                chat_id: chatId,
                text: 'Avval telefon orqali ro‘yxatdan o‘ting: /start',
                reply_markup: contactKeyboard
            })
            return NextResponse.json({ ok: true })
        }

        const { data: emp, error: eErr } = await supabase
            .from('employees')
            .select('id, name')
            .eq('id', linkRow.employee_id)
            .maybeSingle()

        if (eErr || !emp) {
            await tgSend(botToken, {
                chat_id: chatId,
                text: 'Xodim topilmadi. Admin bilan bog‘laning.'
            })
            return NextResponse.json({ ok: true })
        }

        const { error: insErr } = await supabase.from('employee_leave_requests').insert({
            employee_id: emp.id,
            telegram_chat_id: chatId,
            source: 'telegram',
            note: null
        })

        if (insErr) {
            console.error('employee_leave_requests insert:', insErr)
            await tgSend(botToken, {
                chat_id: chatId,
                text: '⚠️ So‘rovni saqlab bo‘lmadi.'
            })
            return NextResponse.json({ ok: true })
        }

        await tgSend(botToken, {
            chat_id: chatId,
            text: `✅ So‘rov yuborildi. Boshliq xabar oladi.\n\n<b>${escapeHtml(emp.name)}</b>`,
            parse_mode: 'HTML'
        })

        const line = `🛌 <b>Dam olish so‘rovi</b>\n\nXodim: <b>${escapeHtml(emp.name)}</b>\nTelefon CRM: bog‘langan`
        for (const mid of managers) {
            await tgSend(botToken, {
                chat_id: mid,
                text: line,
                parse_mode: 'HTML'
            })
        }

        return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}
