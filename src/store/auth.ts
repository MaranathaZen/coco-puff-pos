/**
 * Auth store — v2
 * CHANGELOG:
 * - login() return User | null
 * - Tambah region ke user object saat login (dari DB)
 * - forceLogout dengan delay agar toast sempat tampil
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Shift, Store } from '@/types'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/utils'

interface AuthState {
  user:        User | null
  store:       Store | null
  activeShift: Shift | null
  isLoading:   boolean
  error:       string | null

  login:       (username: string, password: string) => Promise<User | null>
  logout:      () => void
  forceLogout: () => void
  setShift:    (shift: Shift | null) => void
  clearError:  () => void
}

async function openShift(user: User): Promise<Shift> {
  const allShifts = await db.shifts.where('user_id').equals(user.id).toArray()
  const existing  = allShifts.find(s => s.status === 'open')
  if (existing) return existing

  const shift: Shift = {
    id:           generateId(),
    store_id:     user.store_id,
    user_id:      user.id,
    opened_at:    now(),
    closed_at:    undefined,
    opening_cash: 0,
    closing_cash: 0,
    status:       'open',
    total_trx:    0,
    total_sales:  0,
  }
  await db.shifts.add(shift)
  try { await supabase.from('shifts').insert(shift) }
  catch { console.warn('[SHIFT] Gagal sync ke Supabase, akan retry nanti') }
  return shift
}

async function closeShift(shift: Shift): Promise<void> {
  const updated = { ...shift, status: 'closed' as const, closed_at: now() }
  await db.shifts.put(updated)
  try {
    await supabase.from('shifts')
      .update({ status: 'closed', closed_at: updated.closed_at })
      .eq('id', shift.id)
  } catch { console.warn('[SHIFT] Gagal close shift ke Supabase') }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:        null,
      store:       null,
      activeShift: null,
      isLoading:   false,
      error:       null,

      login: async (username, password) => {
        set({ isLoading: true, error: null })
        try {
          const hashed = await hashPassword(password)

          const dbUser = await db.users
            .filter(u => u.username?.toLowerCase() === username.toLowerCase() && u.is_active)
            .first()

          if (!dbUser) {
            set({ error: 'Username tidak ditemukan', isLoading: false })
            return null
          }
          if (dbUser.password_hash !== hashed) {
            set({ error: 'PIN atau password salah', isLoading: false })
            return null
          }

          // FIX: ambil region dari DB — field region ada di Supabase
          // tapi mungkin belum ada di Dexie local (schema lama)
          // Coba ambil dari Supabase langsung untuk pastikan region terbaru
          let region = (dbUser as any).region || ''
          if (!region) {
            try {
              const { data } = await supabase
                .from('users')
                .select('region')
                .eq('id', dbUser.id)
                .single()
              region = data?.region || 'malang'
            } catch {
              region = 'malang'
            }
          }

          // Deteksi region dari store_id sebagai fallback
          if (!region) {
            const storeId = dbUser.store_id || ''
            region = storeId.includes('bali') ? 'bali' : 'malang'
          }

          // Inject region ke user object
          const user = { ...dbUser, region } as User

          // Update region di Dexie lokal supaya next login tidak perlu fetch Supabase
          await db.users.update(dbUser.id, { region } as any)

          const store = await db.stores.get(user.store_id) || null

          let shift: Shift | null = null
          if (['kasir', 'manager', 'owner'].includes(user.role)) {
            shift = await openShift(user)
          }

          set({ user, store, activeShift: shift, isLoading: false })
          return user
        } catch (e) {
          console.error('[AUTH] login error', e)
          set({ error: 'Terjadi kesalahan saat login', isLoading: false })
          return null
        }
      },

      logout: async () => {
        const { activeShift } = get()
        if (activeShift && activeShift.status === 'open') {
          await closeShift(activeShift)
        }
        set({ user: null, store: null, activeShift: null })
      },

      forceLogout: async () => {
        const { activeShift } = get()
        if (activeShift && activeShift.status === 'open') {
          await closeShift(activeShift)
        }
        setTimeout(() => {
          set({ user: null, store: null, activeShift: null })
        }, 1500)
      },

      setShift:   (shift) => set({ activeShift: shift }),
      clearError: ()      => set({ error: null }),
    }),
    {
      name: 'cocopuff-auth',
      partialize: (state) => ({
        user:        state.user,
        store:       state.store,
        activeShift: state.activeShift,
      }),
    }
  )
)

export function getStoreId(user: User | null): string {
  return user?.store_id || 'unknown'
}
