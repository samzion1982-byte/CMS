import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const ThemeContext = createContext()

export const THEMES = {
  royal:    { name: 'Royal',    icon: '👑' },
  ocean:    { name: 'Ocean',    icon: '🌊' },
  forest:   { name: 'Forest',   icon: '🌿' },
  crimson:  { name: 'Crimson',  icon: '🍷' },
  midnight: { name: 'Midnight', icon: '🌙' },
}

function applyToDOM(t) {
  localStorage.setItem('cms_theme', t)
  document.documentElement.setAttribute('data-theme', t)
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('cms_theme')
    return (saved && THEMES[saved]) ? saved : 'royal'
  })

  // Called when user explicitly picks a theme — applies it and persists to profile
  const setTheme = async (t) => {
    if (!THEMES[t]) return
    setThemeState(t)
    applyToDOM(t)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ theme: t }).eq('id', user.id)
      }
    } catch (err) {
      console.warn('[ThemeContext] Could not save theme to profile:', err.message)
    }
  }

  // Called by AuthContext after profile loads — applies saved theme without re-writing to DB
  const applyProfileTheme = (t) => {
    if (!t || !THEMES[t]) return
    setThemeState(t)
    applyToDOM(t)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, applyProfileTheme, THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
