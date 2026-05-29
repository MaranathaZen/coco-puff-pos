/**
 * Auth store — menyimpan user yang login, store aktif, dan shift.
 * Shift otomatis dibuka saat login, ditutup saat logout.
 * forceLogout: dipanggil setelah ganti password/PIN — wajib login ulang.
 *
 * CHANGELOG:
 * - login() sekarang return User | null (bukan boolean) agar LoginPage
 *   tidak perlu getState() yang bisa race condition dengan persist middleware.
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

  /** Return User jika berhasil, null jika gagal. Error detail ada di state.error */
  login:       (username: string, password: string) => Promise<User | null>
  logout:      () => void
  /**
   * forceLogout — dipanggil setelah user berhasil ganti password/PIN.
   * Menutup shift aktif lalu clear session.
   * User akan diarahkan ke /login oleh ProtectedRoute.
   *
   * Cara pakai di SettingsPage:
   *   const { forceLogout } = useAuthStore()
   *   toast.success('Password berhasil diubah. Silakan login ulang.')
   *   forceLogout()
   */
  forceLogout: () => void
  setShift:    (shift: Shift | null) => void
  clearError:  () => void
}

// ── Helpers ────────────────────────────────────────────────────

async function openShift(user: User): Promise<Shift> {
  const allShifts = await db.shifts
    .where('user_id').equals(user.id)
    .toArray()
  const existing = allShifts.find(s => s.status === 'open')
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
  try {
    await supabase.from('shifts').insert(shift)
  } catch {
    console.warn('[SHIFT] Gagal sync ke Supabase, akan retry nanti')
  }
  return shift
}

async function closeShift(shift: Shift): Promise<void> {
  const updated = { ...shift, status: 'closed' as const, closed_at: now() }
  await db.shifts.put(updated)
  try {
    await supabase.from('shifts')
      .update({ status: 'closed', closed_at: updated.closed_at })
      .eq('id', shift.id)
  } catch {
    console.warn('[SHIFT] Gagal close shift ke Supabase')
  }
}

// ── Store ──────────────────────────────────────────────────────

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

          const user = await db.users
            .filter(u =>
              u.username?.toLowerCase() === username.toLowerCase() &&
              u.is_active
            )
            .first()

          if (!user) {
            set({ error: 'Username tidak ditemukan', isLoading: false })
            return null
          }
          if (user.password_hash !== hashed) {
            set({ error: 'PIN atau password salah', isLoading: false })
            return null
          }

          const store = await db.stores.get(user.store_id) || null

          let shift: Shift | null = null
          if (['kasir', 'manager', 'owner'].includes(user.role)) {
            shift = await openShift(user)
          }

          set({ user, store, activeShift: shift, isLoading: false })
          return user  // ← kembalikan objek user, bukan true/false
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
        // Jeda singkat agar toast sempat tampil sebelum redirect
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
