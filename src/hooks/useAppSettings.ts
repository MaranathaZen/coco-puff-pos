// src/hooks/useAppSettings.ts
// Hook untuk load app settings (logo, icon, nama) dari Supabase
// Di-cache di localStorage supaya tidak flicker saat load

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface AppSettings {
  app_name:     string
  app_logo_url: string | null
  app_icon_url: string | null
}

const CACHE_KEY = 'cocopuff-app-settings'
const DEFAULT: AppSettings = {
  app_name:     'Coco Puff POS',
  app_logo_url: null,
  app_icon_url: null,
}

function loadCache(): AppSettings {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT
}

function saveCache(s: AppSettings) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)) } catch {}
}

// Singleton promise — fetch sekali, share ke semua subscriber
let fetchPromise: Promise<AppSettings> | null = null

async function fetchSettings(): Promise<AppSettings> {
  if (!fetchPromise) {
    fetchPromise = supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle()
      .then(({ data }) => {
        fetchPromise = null
        if (!data) return DEFAULT
        const s: AppSettings = {
          app_name:     data.app_name     || DEFAULT.app_name,
          app_logo_url: data.app_logo_url || null,
          app_icon_url: data.app_icon_url || null,
        }
        saveCache(s)
        return s
      })
      .catch(() => { fetchPromise = null; return DEFAULT })
  }
  return fetchPromise
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadCache)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchSettings().then(s => { setSettings(s); setLoading(false) })
  }, [])

  async function refresh() {
    fetchPromise = null
    setLoading(true)
    const s = await fetchSettings()
    setSettings(s)
    setLoading(false)
    return s
  }

  return { settings, loading, refresh }
}

// Update favicon dinamis
export function applyFavicon(iconUrl: string | null) {
  if (!iconUrl) return
  try {
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = iconUrl
  } catch {}
}
