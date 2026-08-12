/**
 * Multi-region (cabang Bali/franchise) — helper akses & region aktif.
 *
 * Model:
 *  - Setiap data punya kolom `region` ('malang' | 'bali').
 *  - User punya `region` (region asal) + `all_regions` (super-user HQ/admin lihat semua).
 *  - Region TERLIHAT (read): all_regions ? semua : [region user].
 *  - Region TULIS AKTIF (write): user biasa = region-nya; super-user = pilihan switcher.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

export const REGIONS = ['malang', 'bali'] as const
export type Region = typeof REGIONS[number]
export const DEFAULT_REGION: Region = 'malang'

export const REGION_LABELS: Record<string, string> = {
  malang: 'Malang',
  bali: 'Bali',
  all: 'Semua Region',
}

export function isSuperUser(user: User | null | undefined): boolean {
  return !!user?.all_regions
}

/** Region yang boleh DILIHAT user (untuk filter query/sync). */
export function getVisibleRegions(user: User | null | undefined): string[] {
  if (!user) return [DEFAULT_REGION]
  if (user.all_regions) return [...REGIONS]
  return [user.region || DEFAULT_REGION]
}

interface RegionState {
  /** Pilihan super-user: satu region atau 'all' (untuk tampilan gabungan). */
  activeRegion: string
  setActiveRegion: (r: string) => void
}

/** Store pilihan region super-user (persisted). Non-super tidak memakainya. */
export const useRegionStore = create<RegionState>()(
  persist(
    (set) => ({
      activeRegion: DEFAULT_REGION,
      setActiveRegion: (r) => set({ activeRegion: r }),
    }),
    { name: 'cocopuff-region' }
  )
)

/**
 * Region untuk MENULIS data baru. Bisa dipanggil di luar React (sync/db).
 * - User biasa: selalu region-nya sendiri (tak bisa dialihkan).
 * - Super-user: activeRegion pilihan; kalau 'all'/invalid → fallback region asal
 *   (menulis harus ke satu region konkret, tak boleh 'all').
 */
export function getActiveRegion(user: User | null | undefined): string {
  if (!user) return DEFAULT_REGION
  if (!user.all_regions) return user.region || DEFAULT_REGION
  const sel = useRegionStore.getState().activeRegion
  if (sel && sel !== 'all' && (REGIONS as readonly string[]).includes(sel)) return sel
  return user.region || DEFAULT_REGION
}

/**
 * Region efektif untuk MEMBACA (filter list). Super-user dgn 'all' → semua region
 * terlihat; kalau pilih satu region → hanya region itu. Non-super → region-nya.
 */
export function getReadRegions(user: User | null | undefined): string[] {
  if (!user) return [DEFAULT_REGION]
  if (!user.all_regions) return [user.region || DEFAULT_REGION]
  const sel = useRegionStore.getState().activeRegion
  if (sel === 'all' || !sel) return [...REGIONS]
  return [sel]
}
