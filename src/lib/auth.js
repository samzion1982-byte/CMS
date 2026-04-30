import { supabase } from './supabase'
import { formatDate } from './date'
import { fetchGeoLocation, insertLoginLog } from './loginLogs'

export const ROLE_PERMISSIONS = {
  super_admin: { canAdd:true,  canEdit:true,  canDelete:true,  canPrint:true,  canManageUsers:true  },
  admin1:      { canAdd:true,  canEdit:true,  canDelete:true,  canPrint:true,  canManageUsers:false },
  admin:       { canAdd:true,  canEdit:true,  canDelete:false, canPrint:true,  canManageUsers:false },
  user:        { canAdd:false, canEdit:false, canDelete:false, canPrint:true,  canManageUsers:false },
  demo:        { canAdd:true,  canEdit:true,  canDelete:true,  canPrint:true,  canManageUsers:false },
}

export const ROLE_LABELS = { 
  super_admin: 'Super Admin', 
  admin1: 'Admin1', 
  admin: 'Admin', 
  user: 'User', 
  demo: 'Demo' 
}

export function getPerms(role) { 
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user 
}

export function initials(name = '') { 
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function fmtDate(s) {
  if (!s) return '-'
  return formatDate(s, '-')
}

export async function signIn(email, password) {
  console.log('🔐 Attempting sign in for:', email)
  
  try {
    // 1. First, check if the user is active using the database function
    const { data: isActive, error: checkError } = await supabase
      .rpc('check_user_active', { email_param: email })
    
    if (checkError) {
      console.error('Error checking user status:', checkError)
    }
    
    // 2. If user exists and is explicitly inactive, BLOCK LOGIN immediately
    if (isActive === false) {
      console.log('❌ Account is deactivated:', email)
      return { 
        data: null, 
        error: new Error('Your account has been deactivated. Please contact Zion Solutions for assistance.')
      }
    }
    
    // 3. Attempt sign in
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      console.error('❌ Sign in error:', error.message)
      throw error
    }
    
    console.log('✅ Sign in successful for:', email)
    
    // 4. Get profile after successful sign in for additional validation
    const profile = await getProfile()
    
    // 5. Final safety check – verify profile exists and is active
    if (!profile) {
      console.log('❌ No profile found for user')
      await supabase.auth.signOut()
      return { 
        data: null, 
        error: new Error('User profile not found. Please contact Zion Solutions for assistance.')
      }
    }
    
    if (profile.is_active === false) {
      console.log('❌ Profile is deactivated')
      await supabase.auth.signOut()
      return { 
        data: null, 
        error: new Error('Your account has been deactivated. Please contact Zion Solutions for assistance.')
      }
    }
    
    console.log('✅ Profile loaded:', profile.email)

    // Fire-and-forget: capture login details without delaying the response
    fetchGeoLocation().then(geo => {
      insertLoginLog({
        userId:    data.user?.id,
        email:     profile.email,
        fullName:  profile.full_name,
        role:      profile.role,
        userAgent: navigator.userAgent,
        ...geo,
      })
    })

    return { data, error: null }

  } catch (error) {
    console.error('❌ Sign in exception:', error)

    // Handle specific Supabase auth errors
    if (error.message?.includes('Invalid login credentials')) {
      return { data: null, error: new Error('Invalid email or password. Please try again.') }
    }

    return { data: null, error: new Error('Login failed. Please try again later.') }
  }
}

export async function signOut() { 
  console.log('🔓 Signing out')
  return supabase.auth.signOut() 
}

export async function getProfile() {
  try {
    console.log('🔍 Starting getProfile...')
    
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError) {
      console.error('❌ Error getting user:', userError)
      return null
    }
    
    if (!user) {
      console.log('⚠️ No user found')
      return null
    }
    
    console.log('👤 Fetching profile for user:', user.email)
    
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (profileError) {
      console.error('❌ Error fetching profile:', profileError.message)
      return null
    }
    
    console.log('✅ Profile fetched successfully:', data?.email)
    return data
    
  } catch (error) {
    console.error('❌ Exception in getProfile:', error.message)
    return null
  }
}