/**
 * Auth store — menyimpan user yang sedang login dan shift aktif.
 * Zustand = pengganti useState tapi bisa diakses dari mana saja.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Shift } from '@/types'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/utils'
import { STORE_ID } from '@/lib/supabase'

interface AuthState {
  user:        User | null
  activeShift: Shift | null
  isLoading:   boolean
  error:       string | null

  login:       (username: string, password: string) => Promise<boolean>
  logout:      () => void
  setShift:    (shift: Shift | null) => void
  clearError:  () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:        null,
      activeShift: null,
      isLoading:   false,
      error:       null,

      login: async (username, password) => {
        set({ isLoading: true, error: null })
        try {
          const hashed = await hashPassword(password)
          const user   = await db.users
            .where('username').equals(username)
            .filter(u => u.store_id === STORE_ID || u.role === 'owner')
            .filter(u => u.is_active)
            .first()

          if (!user) {
            set({ error: 'Username tidak ditemukan', isLoading: false })
            return false
          }
          if (user.password_hash !== hashed) {
            set({ error: 'Password salah', isLoading: false })
            return false
          }

          // Cek shift aktif
          const shift = await db.shifts
            .where('user_id').equals(user.id)
            .filter(s => s.status === 'open')
            .last()

          set({ user, activeShift: shift || null, isLoading: false })
          return true
        } catch (e) {
          set({ error: 'Terjadi kesalahan', isLoading: false })
          return false
        }
      },

      logout: () => set({ user: null, activeShift: null }),

      setShift: (shift) => set({ activeShift: shift }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'cocopuff-auth',
      partialize: (state) => ({ user: state.user, activeShift: state.activeShift }),
    }
  )
)
