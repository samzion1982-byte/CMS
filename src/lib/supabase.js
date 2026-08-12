import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local (local) or set them in Vercel.')
}

// Main Supabase client with session persistence
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: localStorage,
    storageKey: 'sb-auth-token',
  }
})

/**
 * Alias for the signed-in user client.
 * The service-role key must NEVER ship in the Vite bundle.
 * Auth Admin (delete/reset user) → Edge Function `cms-admin`.
 * Flush / recycle / storage use the authenticated session (RLS).
 */
export const adminSupabase = supabase

export { createClient }

export const VENDOR = { name: 'Zion Solutions', city: 'Pondicherry', phone: '+91-9994073545' }
export const LICENSE_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTUQR5-AWLHqTbg0QS3hdYiNC1UPMl3sszX18r1UzVGbEMRdChGHVUQABLO4e8tFYnGxlHEfxgZE7eZ/pub?gid=1250083058&single=true&output=csv'

export function photoUrl(memberId, folder = 'active') {
  const { data } = supabase.storage.from('member-photos').getPublicUrl(`${folder}/${memberId}.jpg`)
  return data?.publicUrl || ''
}

export async function getChurch() {
  try {
    const { data, error } = await supabase.from('churches').select('*').limit(1).single()
    if (error) {
      console.error('Error fetching church:', error)
      return null
    }
    return data || null
  } catch (error) {
    console.error('Exception fetching church:', error)
    return null
  }
}
