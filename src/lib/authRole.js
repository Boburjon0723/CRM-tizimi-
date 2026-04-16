import { supabase } from '@/lib/supabase'

function normalizeRole(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === 'admin' || s === 'owner' || s === 'superadmin') return 'admin'
  if (s === 'crm') return 'crm'
  if (s === 'erp' || s === 'manager' || s === 'ceo') return 'erp'
  if (s === 'seller' || s === 'sotuvchi' || s === 'pos') return 'seller'
  return 'user'
}

export async function resolveCrmRole(user) {
  if (!user?.id) return 'user'
  try {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role) return normalizeRole(profile.role)
  } catch {
    // fallback to auth metadata
  }

  return normalizeRole(
    user.user_metadata?.nuur_role ||
      user.user_metadata?.role ||
      user.app_metadata?.nuur_role ||
      user.app_metadata?.role
  )
}

export function canAccessCrm(role) {
  return role === 'crm' || role === 'admin'
}
