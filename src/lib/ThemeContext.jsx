import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase, adminSupabase } from './supabase'

const ThemeContext = createContext()

export const THEMES = {
  royal:   { name: 'Royal',   icon: '👑' },
  ocean:   { name: 'Ocean',   icon: '🌊' },
  forest:  { name: 'Forest',  icon: '🌿' },
  crimson: { name: 'Crimson', icon: '🍷' },
  amber:   { name: 'Amber',   icon: '☀️' },
  sky:     { name: 'Sky',     icon: '☁️' },
  sage:    { name: 'Sage',    icon: '🍃' },
  copper:  { name: 'Copper',  icon: '🪙' },
  blush:   { name: 'Blush',   icon: '🌸' },
}

export const FONTS = {
  outfit:   { name: 'Outfit',         sample: 'Rg', family: "'Outfit', sans-serif" },
  nunito:   { name: 'Nunito',        sample: 'Gg', family: "'Nunito', sans-serif" },
  grotesk:  { name: 'Space Grotesk', sample: 'Gq', family: "'Space Grotesk', sans-serif" },
  merri:    { name: 'Merriweather',  sample: 'Ag', family: "'Merriweather', serif" },
  crimson:  { name: 'Crimson',       sample: 'Qg', family: "'Crimson Text', serif" },
}

function applyToDOM(t) {
  localStorage.setItem('cms_theme', t)
  document.documentElement.setAttribute('data-theme', t)
}

function applyFontToDOM(f) {
  localStorage.setItem('cms_font', f)
  const family = FONTS[f]?.family || FONTS.outfit.family
  document.documentElement.style.setProperty('--font-ui', family)
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('cms_theme')
    const t = (saved && THEMES[saved]) ? saved : 'royal'
    if (saved !== t) applyToDOM(t)
    return t
  })

  const [font, setFontState] = useState(() => {
    const saved = localStorage.getItem('cms_font')
    return (saved && FONTS[saved]) ? saved : 'outfit'
  })

  // Prevent profile reloads from clobbering a theme/font the user just picked
  const userThemeLockRef = useRef(0)
  const userFontLockRef = useRef(0)

  const setTheme = useCallback(async (t) => {
    if (!THEMES[t]) return
    userThemeLockRef.current = Date.now()
    setThemeState(t)
    applyToDOM(t)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await adminSupabase.from('profiles').update({ theme: t }).eq('id', user.id)
      }
    } catch (err) {
      console.warn('[ThemeContext] Could not save theme to profile:', err.message)
    }
  }, [])

  const setFont = useCallback(async (f) => {
    if (!FONTS[f]) return
    userFontLockRef.current = Date.now()
    setFontState(f)
    applyFontToDOM(f)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await adminSupabase.from('profiles').update({ font: f }).eq('id', user.id)
      }
    } catch (err) {
      console.warn('[ThemeContext] Could not save font to profile:', err.message)
    }
  }, [])

  const applyProfileTheme = useCallback((t) => {
    if (!t || !THEMES[t]) return
    // Ignore stale DB theme for a few seconds after the user picks one
    if (Date.now() - userThemeLockRef.current < 8000) {
      const local = localStorage.getItem('cms_theme')
      if (local && local !== t) return
    }
    setThemeState(t)
    applyToDOM(t)
  }, [])

  const applyProfileFont = useCallback((f) => {
    if (!f || !FONTS[f]) return
    if (Date.now() - userFontLockRef.current < 8000) {
      const local = localStorage.getItem('cms_font')
      if (local && local !== f) return
    }
    setFontState(f)
    applyFontToDOM(f)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    applyFontToDOM(font)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeContext.Provider value={{ theme, setTheme, applyProfileTheme, THEMES, font, setFont, applyProfileFont, FONTS }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
