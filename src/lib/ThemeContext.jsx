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

export const FONTS = {
  inter:    { name: 'Inter',        sample: 'Ag', family: "'Inter', sans-serif" },
  poppins:  { name: 'Poppins',      sample: 'Ag', family: "'Poppins', sans-serif" },
  raleway:  { name: 'Raleway',      sample: 'Ag', family: "'Raleway', sans-serif" },
  merri:    { name: 'Merriweather', sample: 'Ag', family: "'Merriweather', serif" },
  crimson:  { name: 'Crimson',      sample: 'Ag', family: "'Crimson Text', serif" },
}

function applyToDOM(t) {
  localStorage.setItem('cms_theme', t)
  document.documentElement.setAttribute('data-theme', t)
}

function applyFontToDOM(f) {
  localStorage.setItem('cms_font', f)
  const family = FONTS[f]?.family || FONTS.inter.family
  document.documentElement.style.setProperty('--font-ui', family)
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('cms_theme')
    return (saved && THEMES[saved]) ? saved : 'royal'
  })

  const [font, setFontState] = useState(() => {
    const saved = localStorage.getItem('cms_font')
    return (saved && FONTS[saved]) ? saved : 'inter'
  })

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

  const setFont = async (f) => {
    if (!FONTS[f]) return
    setFontState(f)
    applyFontToDOM(f)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ font: f }).eq('id', user.id)
      }
    } catch (err) {
      console.warn('[ThemeContext] Could not save font to profile:', err.message)
    }
  }

  const applyProfileTheme = (t) => {
    if (!t || !THEMES[t]) return
    setThemeState(t)
    applyToDOM(t)
  }

  const applyProfileFont = (f) => {
    if (!f || !FONTS[f]) return
    setFontState(f)
    applyFontToDOM(f)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    applyFontToDOM(font)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, applyProfileTheme, THEMES, font, setFont, applyProfileFont, FONTS }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
