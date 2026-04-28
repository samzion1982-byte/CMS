import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export const THEMES = {
  royal:    { name: 'Royal',    icon: '👑' },
  ocean:    { name: 'Ocean',    icon: '🌊' },
  forest:   { name: 'Forest',   icon: '🌿' },
  crimson:  { name: 'Crimson',  icon: '🍷' },
  midnight: { name: 'Midnight', icon: '🌙' },
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('cms_theme')
    return (saved && THEMES[saved]) ? saved : 'royal'
  })

  const setTheme = (t) => {
    setThemeState(t)
    localStorage.setItem('cms_theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
