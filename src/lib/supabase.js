import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://wjasjrthijpxlarreics.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODAzMDAsImV4cCI6MjA5MTc1NjMwMH0.cCWk_U3kbLvCRuk916hoYP7cIlWusHTRbgSpvHnuktY'
export const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'

console.log('🔌 Supabase URL:', SUPABASE_URL)
console.log('🔑 Supabase Anon Key exists:', !!SUPABASE_ANON_KEY)
console.log('🔐 Supabase Service Role exists:', !!SUPABASE_SERVICE_ROLE)

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