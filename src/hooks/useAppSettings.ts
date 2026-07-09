// src/hooks/useAppSettings.ts
// Hook untuk load app settings (logo, icon, nama) dari Supabase
// Di-cache di localStorage supaya tidak flicker saat load

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Aturan markup mutasi — key mutation_type, mis. to_partner (franchise) +15%
export interface MarkupRule {
  mutation_type: string
  percent:       number
  enabled:       boolean
}

export interface AppSettings {
  app_name:     string
  app_logo_url: string | null
  app_icon_url: string | null
  markup_rules: MarkupRule[]
}

const CACHE_KEY = 'cocopuff-app-settings'
// Default markup: gudang/produksi -> franchise (to_partner) +15%.
// Dipakai kalau kolom markup_rules belum ada / kosong, supaya fitur jalan.
const DEFAULT_MARKUP_RULES: MarkupRule[] = [
  { mutation_type: 'to_partner', percent: 15, enabled: true },
]
const DEFAULT: AppSettings = {
  app_name:     'Coco Puff POS',
  app_logo_url: null,
  app_icon_url: null,
  markup_rules: DEFAULT_MARKUP_RULES,
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
        const rules = Array.isArray(data.markup_rules) && data.markup_rules.length
          ? (data.markup_rules as MarkupRule[])
          : DEFAULT_MARKUP_RULES
        const s: AppSettings = {
          app_name:     data.app_name     || DEFAULT.app_name,
          app_logo_url: data.app_logo_url || null,
          app_icon_url: data.app_icon_url || null,
          markup_rules: rules,
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

// getMarkupPercent — baca markup dari cache localStorage (sync, offline-safe).
// Return persen utk mutation_type; 0 kalau rule tak ada atau disabled.
export function getMarkupPercent(mutationType: string): number {
  try {
    const rules = loadCache().markup_rules || []
    const r = rules.find(x => x.mutation_type === mutationType && x.enabled)
    return r ? Number(r.percent) || 0 : 0
  } catch { return 0 }
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
