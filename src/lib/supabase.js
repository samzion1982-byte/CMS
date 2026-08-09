import { createClient } from '@supabase/supabase-js'

function requireEnv(name) {
  const value = import.meta.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(
      `Missing ${name}. Set it in Vercel (or .env for local dev) to your church Supabase project URL/keys.`,
    )
  }
  return String(value).trim()
}

export const SUPABASE_URL = requireEnv('VITE_SUPABASE_URL')
export const SUPABASE_ANON_KEY = requireEnv('VITE_SUPABASE_ANON_KEY')
export const SUPABASE_SERVICE_ROLE = requireEnv('VITE_SUPABASE_SERVICE_ROLE_KEY')

if (import.meta.env.DEV) {
  console.log('🔌 Supabase URL:', SUPABASE_URL)
  console.log('🔑 Supabase Anon Key configured:', !!SUPABASE_ANON_KEY)
  console.log('🔐 Supabase Service Role configured:', !!SUPABASE_SERVICE_ROLE)
}

// Main Supabase client with enhanced session persistence
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: localStorage,
    storageKey: 'sb-auth-token',
  }
})

// Check session on load
supabase.auth.getSession().then(({ data: { session }, error }) => {
  if (error) {
    console.error('❌ Session restoration error:', error.message)
  } else if (session) {
    console.log('✅ Session restored for:', session.user?.email)
    // Test database connection only if authenticated
    supabase.from('members').select('count', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) {
          console.error('❌ Database query error:', error.message)
        } else {
          console.log('✅ Database connected!', count, 'members found')
        }
      })
  } else {
    console.log('ℹ️ No active session found - please log in')
  }
})

export const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  }
})

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
