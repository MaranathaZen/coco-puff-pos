/**
 * Auth store — menyimpan user yang login, store aktif, dan shift.
 * STORE_ID diambil dari data user, bukan env variable.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Shift, Store } from '@/types'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/utils'

interface AuthState {
  user:        User | null
  store:       Store | null   // ← toko aktif user yang login
  activeShift: Shift | null
  isLoading:   boolean
  error:       string | null

  login:      (username: string, password: string) => Promise<boolean>
  logout:     () => void
  setShift:   (shift: Shift | null) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:        null,
      store:       null,
      activeShift: null,
      isLoading:   false,
      error:       null,

      login: async (username, password) => {
        set({ isLoading: true, error: null })
        try {
          const hashed = await hashPassword(password)

          // Cari user (bisa by username atau by id untuk kasir PIN)
          const user = await db.users
            .where('username').equals(username)
            .filter(u => u.is_active)
            .first()

          if (!user) {
            set({ error: 'Username tidak ditemukan', isLoading: false })
            return false
          }
          if (user.password_hash !== hashed) {
            set({ error: 'PIN atau password salah', isLoading: false })
            return false
          }

          // Ambil data toko dari store_id user
          const store = await db.stores.get(user.store_id) || null

          // Cek shift aktif
          const shift = await db.shifts
            .where('user_id').equals(user.id)
            .filter(s => s.status === 'open')
            .last()

          set({ user, store, activeShift: shift || null, isLoading: false })
          return true
        } catch (e) {
          set({ error: 'Terjadi kesalahan', isLoading: false })
          return false
        }
      },

      logout: () => set({ user: null, store: null, activeShift: null }),

      setShift: (shift) => set({ activeShift: shift }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'cocopuff-auth',
      partialize: (state) => ({
        user: state.user,
        store: state.store,
        activeShift: state.activeShift,
      }),
    }
  )
)

// ── Helper: ambil STORE_ID dari user yang login ───────────────
export function getStoreId(user: User | null): string {
  return user?.store_id || 'unknown'
}
