import React from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './lib/ThemeContext'

console.log('🚀 Application starting...')

// Add error handling for uncaught errors
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
})

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

const root = createRoot(rootElement)

// Render with error boundary
try {
  root.render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  )
  console.log('✅ App rendered successfully')
} catch (error) {
  console.error('❌ Failed to render app:', error)
  rootElement.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
      <div style="text-align: center; padding: 20px;">
        <h2>Failed to load application</h2>
        <p style="color: #666;">Please check the console for errors</p>
        <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">Reload Page</button>
      </div>
    </div>
  `
}