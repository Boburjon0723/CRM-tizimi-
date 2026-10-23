import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL yoki Key topilmadi! Iltimos, Vercel panelida Environment Variables qo\'shing.')
}

let loginRedirectStarted = false

function clearStoredSession() {
  if (typeof localStorage === 'undefined') return
  const keys = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && key.startsWith('sb-') && key.includes('auth-token')) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
}

/** Eskirgan JWT bilan sahifada qolmasin — login ochiladi. */
export function goToLoginAfterExpired() {
  if (typeof window === 'undefined' || loginRedirectStarted) return
  if (window.location.pathname.startsWith('/login')) return
  loginRedirectStarted = true
  clearStoredSession()
  window.location.assign('/login')
}

async function fetchWithExpiredJwtRedirect(input, init) {
  const response = await fetch(input, init)
  if (response.status !== 401) return response
  try {
    const text = await response.clone().text()
    if (/jwt expired|invalid jwt|PGRST301/i.test(text)) goToLoginAfterExpired()
  } catch {
    /* javob o‘qilmasa sahifa o‘z xatosini ko‘rsatadi */
  }
  return response
}

/** CRM: login sessiyasi JWT bilan ketadi — RLS authenticated siyosatlari shu orqali ishlaydi */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: fetchWithExpiredJwtRedirect,
    },
  }
)