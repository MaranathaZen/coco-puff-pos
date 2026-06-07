// src/lib/logger.ts
// Error tracking & monitoring untuk Coco Puff POS
// Usage: logger.error('CashierPage', 'Checkout gagal', { error, data })

import { supabase } from './supabase'

type LogLevel = 'error' | 'warn' | 'info'

interface LogEntry {
  level: LogLevel
  page: string
  message: string
  detail?: string
  user_id?: string
  store_id?: string
  user_agent?: string
}

// Buffer untuk batch insert (hindari spam request)
let logBuffer: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(async () => {
    flushTimer = null
    if (!logBuffer.length) return
    const toFlush = [...logBuffer]
    logBuffer = []
    try {
      await supabase.from('app_logs').insert(toFlush)
    } catch {
      // Silent fail — jangan crash app karena logging
    }
  }, 2000) // batch setiap 2 detik
}

async function log(level: LogLevel, page: string, message: string, detail?: any) {
  // Console output tetap ada
  const prefix = level === 'error' ? '🔴' : level === 'warn' ? '🟡' : '🔵'
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `${prefix} [${page}] ${message}`,
    detail || ''
  )

  try {
    // Ambil user dari store tanpa import circular
    const authStore = (window as any).__authStore?.getState?.()
    const user = authStore?.user

    const entry: LogEntry = {
      level,
      page,
      message: message.slice(0, 500),
      detail: detail ? JSON.stringify(detail).slice(0, 1000) : undefined,
      user_id: user?.id || undefined,
      store_id: user?.store_id || undefined,
      user_agent: navigator.userAgent.slice(0, 200),
    }

    logBuffer.push(entry)
    scheduleFlush()
  } catch {
    // Silent fail
  }
}

export const logger = {
  error: (page: string, message: string, detail?: any) => log('error', page, message, detail),
  warn:  (page: string, message: string, detail?: any) => log('warn',  page, message, detail),
  info:  (page: string, message: string, detail?: any) => log('info',  page, message, detail),
}

// Expose auth store reference (dipanggil dari main.tsx atau App.tsx)
export function setLoggerAuthStore(store: any) {
  (window as any).__authStore = store
}
