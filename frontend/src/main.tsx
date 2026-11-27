import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { wakeBackend } from './lib/api'
import './index.css'

wakeBackend()

try {
  if (localStorage.getItem('cp_theme') === 'dark') document.documentElement.classList.add('dark')
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
      <Toaster richColors position="top-right" closeButton />
    </AuthProvider>
  </StrictMode>,
)
