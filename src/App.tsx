import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { seedIfEmpty } from '@/lib/seed'
import { startSyncWorker, stopSyncWorker } from '@/lib/sync'

import LoginPage            from '@/pages/auth/LoginPage'
import Layout               from '@/components/layout/Layout'
import CashierPage          from '@/pages/cashier/CashierPage'
import ProductsPage         from '@/pages/settings/SettingsProductPage'
import StoreRecipePage      from '@/pages/products/StoreRecipePage'
import ReportsPage          from '@/pages/reports/ReportsPage'
import SettingsPage         from '@/pages/settings/SettingsPage'
import OwnerPage            from '@/pages/owner/OwnerPage'
import GudangPage           from '@/pages/gudang/GudangPage'
import ProduksiPage         from '@/pages/produksi/ProduksiPage'
import LaporanGudangPage    from '@/pages/laporan/LaporanGudangPage'
import EndOfDayPage         from '@/pages/cashier/EndOfDayPage'
import CloseOrderPage       from '@/pages/cashier/CloseOrderPage'
import ResepPage            from '@/pages/resep/ResepPage'
import UnifiedStokPage      from '@/pages/stok/UnifiedStokPage'
import UnifiedPembelianPage from '@/pages/pembelian/UnifiedPembelianPage'
import UnifiedMutasiPage    from '@/pages/mutasi/UnifiedMutasiPage'
import UnifiedBiayaPage     from '@/pages/biaya/UnifiedBiayaPage'
import AccountingPage       from '@/pages/accounting/AccountingPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

// ── Error Boundary ────────────────────────────────────────────
// Menangkap blank white screen dan tampilkan tombol reload
import { Component, type ReactNode } from 'react'

interface EBState { hasError: boolean; error?: Error }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full shadow-sm">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Terjadi Kesalahan</h2>
          <p className="text-sm text-gray-400 mb-6">Aplikasi mengalami error. Coba reload halaman.</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium">
            Reload Aplikasi
          </button>
          <button
            onClick={async () => {
              // Hard reset: hapus SW + cache + reload
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations()
                await Promise.all(regs.map(r => r.unregister()))
              }
              const keys = await caches.keys()
              await Promise.all(keys.map(k => caches.delete(k)))
              window.location.reload()
            }}
            className="w-full py-2 mt-2 text-xs text-gray-400 underline">
            Reset Cache & Reload
          </button>
        </div>
      </div>
    )
  }
}

// ── Auto-update Service Worker ────────────────────────────────
function useAutoUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Force update semua SW yang terdaftar saat app start
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) reg.update()
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Update SW saat tab kembali aktif
        navigator.serviceWorker.getRegistrations().then(regs => {
          for (const reg of regs) reg.update()
        })
      }
    }
    const handleOnline = () => {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) reg.update()
      })
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [])
}

function UpdateBanner() {
  const [showBanner, setShowBanner] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            setShowBanner(true)
            // Auto reload setelah 2 detik
            setTimeout(() => window.location.reload(), 2000)
          }
        })
      })
    })
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload() }
    })
  }, [])
  if (!showBanner) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gray-900 text-white text-xs text-center py-2 px-4">
      Memperbarui aplikasi... Mohon tunggu
    </div>
  )
}

// ── Dexie Error Recovery ──────────────────────────────────────
// Kalau IndexedDB corrupt / schema conflict → auto clear + reload
function useDexieErrorRecovery() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const msg = event.message || ''
      if (
        msg.includes('IDBDatabase') ||
        msg.includes('IndexedDB') ||
        msg.includes('VersionError') ||
        msg.includes('DatabaseClosedError') ||
        msg.includes('AbortError')
      ) {
        console.error('[DEXIE] Error detected, clearing IndexedDB...', msg)
        // Hapus semua IndexedDB database
        indexedDB.databases().then(dbs => {
          Promise.all(dbs.map(db => {
            if (db.name) return indexedDB.deleteDatabase(db.name)
            return Promise.resolve()
          })).then(() => {
            console.log('[DEXIE] IndexedDB cleared, reloading...')
            window.location.reload()
          })
        }).catch(() => window.location.reload())
      }
    }
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])
}

export default function App() {
  const user = useAuthStore(s => s.user)
  useAutoUpdate()
  useDexieErrorRecovery()
  useEffect(() => { seedIfEmpty() }, [])
  useEffect(() => {
    if (user?.store_id) startSyncWorker(user.store_id)
    else stopSyncWorker()
  }, [user?.store_id])

  return (
    <ErrorBoundary>
      <UpdateBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<RoleRedirect />} />

          <Route path="owner"         element={<RequireRole roles={['owner','manager']}><OwnerPage /></RequireRole>} />
          <Route path="kasir"         element={<CashierPage />} />
          <Route path="tutup-toko"    element={<CloseOrderAllPage />} />

          <Route path="stok"          element={<UnifiedStokPage />} />
          <Route path="pembelian"     element={<UnifiedPembelianPage />} />
          <Route path="mutasi"        element={<UnifiedMutasiPage />} />
          <Route path="biaya"         element={<UnifiedBiayaPage />} />

          <Route path="laporan"       element={<RequireRole roles={['owner','manager']}><ReportsPage /></RequireRole>} />
          <Route path="laporan-gudang" element={<RequireRole roles={['owner','manager','gudang']}><LaporanGudangPage /></RequireRole>} />
          <Route path="resep"         element={<RequireRole roles={['owner','manager']}><ResepPage /></RequireRole>} />
          <Route path="produk"        element={<RequireRole roles={['owner','manager']}><ProductsPage /></RequireRole>} />
          <Route path="resep-toko"    element={<RequireRole roles={['owner','manager']}><StoreRecipePage /></RequireRole>} />
          <Route path="pengaturan"    element={<RequireRole roles={['owner','manager']}><SettingsPage /></RequireRole>} />
          <Route path="accounting"    element={<AccountingPage />} />

          <Route path="gudang"        element={<Navigate to="/stok" replace />} />
          <Route path="produksi"      element={<RequireRole roles={['owner','manager','produksi']}><ProduksiPage /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

function CloseOrderAllPage() {
  const { user } = useAuthStore()
  const isOwnerManager = ['owner','manager','gudang','produksi'].includes(user?.role || '')
  if (!isOwnerManager) return <EndOfDayPage />
  return <CloseOrderPage />
}

function RoleRedirect() {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  const roleMap: Record<string, string> = {
    owner:    '/owner',
    manager:  '/owner',
    kasir:    '/kasir',
    gudang:   '/stok',
    produksi: '/stok',
  }
  return <Navigate to={roleMap[user.role] || '/kasir'} replace />
}
