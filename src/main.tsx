import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5 }
  }
})

import { logger, setLoggerAuthStore } from '@/lib/logger'
import { useAuthStore } from '@/store/auth'
setLoggerAuthStore(useAuthStore)

window.addEventListener('unhandledrejection', (event) => {
  logger.error('global', 'Unhandled rejection', { reason: String(event.reason) })
})
window.addEventListener('error', (event) => {
  logger.error('global', event.message, { filename: event.filename, lineno: event.lineno })
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: { borderRadius: '12px', fontSize: '14px' }
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
