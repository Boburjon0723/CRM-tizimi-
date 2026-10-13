import { supabase } from '@/lib/supabase'

export function isJwtExpiredError(error) {
    const msg = String(error?.message || '').toLowerCase()
    return (
        msg.includes('jwt expired') ||
        msg.includes('invalid jwt') ||
        error?.code === 'PGRST301' ||
        error?.status === 401
    )
}

/** Yangilash muvaffaqiyatsiz bo‘lsa lokal sessiyani tozalaydi. */
export async function refreshOrClearSession() {
    const { data, error } = await supabase.auth.refreshSession()
    if (!error && data?.session) return data.session
    await supabase.auth.signOut({ scope: 'local' })
    return null
}
