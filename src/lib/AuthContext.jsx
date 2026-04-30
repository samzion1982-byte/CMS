import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { getProfile, signIn as authSignIn } from './auth'
import { useTheme } from './ThemeContext'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const profileLoadingRef = useRef(false)
  const { applyProfileTheme } = useTheme()

  // Function to load and validate profile with deduplication
  const loadProfile = useCallback(async (sessionUser) => {
    // Prevent duplicate profile loading
    if (profileLoadingRef.current) {
      console.log('⏸️ Profile already loading, skipping...')
      return
    }

    // If no session user, skip loading
    if (!sessionUser) {
      console.log('⚠️ No session user, skipping profile load')
      setProfile(null)
      return null
    }

    try {
      profileLoadingRef.current = true
      console.log('🔍 Starting getProfile for:', sessionUser.email)
      
      // Add 15 second timeout to profile loading
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .single()
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile loading timeout')), 15000)
      )
      
      const { data, error: profileError } = await Promise.race([profilePromise, timeoutPromise])
      
      if (profileError) {
        console.error('❌ Error fetching profile:', profileError.message)
        setProfile(null)
        return null
      }
      
      console.log('✅ Profile loaded successfully:', data?.email)
      setProfile(data)
      if (data?.theme) applyProfileTheme(data.theme)
      return data
    } catch (error) {
      console.error('❌ Error loading profile:', error.message)
      setProfile(null)
      return null
    } finally {
      profileLoadingRef.current = false
    }
  }, [])

  // Initialize auth state
  useEffect(() => {
    let mounted = true
    
    const initializeAuth = async () => {
      try {
        console.log('🔧 AuthProvider initializing...')
        
        // Get initial session
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          if (mounted) {
            setSession(null)
            setUser(null)
            setLoading(false)
          }
          return
        }
        
        if (mounted) {
          console.log('📦 Initial session:', currentSession?.user?.email || 'No session')
          setSession(currentSession)
          setUser(currentSession?.user ?? null)
          
          if (currentSession?.user) {
            console.log('⏳ Loading profile...')
            await loadProfile(currentSession.user)
          }
          setLoading(false)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        if (mounted) {
          setSession(null)
          setUser(null)
          setLoading(false)
        }
      }
    }

    initializeAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('🔄 Auth state changed:', event, newSession?.user?.email || 'No session')
      
      if (mounted) {
        setSession(newSession)
        setUser(newSession?.user ?? null)
        
        // Only load profile on INITIAL_SESSION to avoid race conditions on SIGNED_IN
        if (event === 'INITIAL_SESSION' && newSession?.user) {
          console.log('⏳ Loading profile on initial session...')
          await loadProfile(newSession.user)
        } else if (event === 'SIGNED_IN' && newSession?.user) {
          // For SIGNED_IN events (during login), load profile asynchronously
          console.log('⏳ Loading profile on sign in...')
          loadProfile(newSession.user).catch(console.error)
        } else if (!newSession) {
          setProfile(null)
        }
        
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = async (email, password) => {
    console.log('🔐 AuthContext.signIn called for:', email)
    const result = await authSignIn(email, password)
    if (result.error) {
      console.error('❌ Sign in failed:', result.error.message)
      throw result.error
    }
    console.log('✅ Sign in successful')
    return result.data
  }

  const signOut = async () => {
    console.log('🔓 AuthContext.signOut called')
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign out error:', error)
    }
    setProfile(null)
    setUser(null)
    setSession(null)
  }

  const refreshSession = async () => {
    console.log('🔄 Refreshing session...')
    const { data: { session: currentSession }, error } = await supabase.auth.getSession()
    if (!error && currentSession) {
      setSession(currentSession)
      setUser(currentSession.user ?? null)
      await loadProfile()
    }
    return !error && currentSession
  }

  const value = {
    session,
    user,
    profile,
    loading: loading,
    initialized: !loading, // initialized is true when loading is false
    signIn,
    signOut,
    refreshSession,
    isAuthenticated: !!session
  }
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}