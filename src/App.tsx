import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { seedIfEmpty } from '@/lib/seed'
import { startSyncWorker, stopSyncWorker } from '@/lib/sync'
import { setWriteRegion, purgeOtherRegions } from '@/lib/db'
import { getActiveRegion, getVisibleRegions } from '@/lib/regions'
import { setActiveQueryRegions } from '@/lib/supabase'
import { useAppSettings, applyFavicon } from '@/hooks/useAppSettings'

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
import DebugPage            from '@/pages/debug/DebugPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const user      = useAuthStore(s => s.user)
  const hydrated  = useAuthStore.persist?.hasHydrated?.() ?? true
  if (!hydrated) return null
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

// ── Auto-update notifier ──────────────────────────────────────
function useAutoUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then(reg => { if (reg) reg.update() })
      }
    }
    const handleOnline = () => {
      navigator.serviceWorker.getRegistration().then(reg => { if (reg) reg.update() })
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
      Memperbarui aplikasi...
    </div>
  )
}

// ── Apply favicon & app name dari settings ────────────────────
function AppSettingsApplier() {
  const { settings } = useAppSettings()
  useEffect(() => {
    // Apply favicon
    if (settings.app_icon_url) {
      applyFavicon(settings.app_icon_url)
    }
    // Apply app name di tab browser
    if (settings.app_name) {
      document.title = settings.app_name
    }
  }, [settings.app_icon_url, settings.app_name])
  return null
}

export default function App() {
  const user = useAuthStore(s => s.user)
  useAutoUpdate()
  useEffect(() => { seedIfEmpty() }, [])
  useEffect(() => {
    if (user?.store_id) {
      const visible = getVisibleRegions(user)
      setActiveQueryRegions(visible)          // multi-region: filter query (juga saat reload/rehydrate)
      setWriteRegion(getActiveRegion(user))   // baris baru di-stamp region user
      purgeOtherRegions(visible).catch(() => {}) // bersihkan sisa cache region lain (juga saat reload)
      startSyncWorker(user.store_id)
    } else stopSyncWorker()
  }, [user?.store_id])

  return (
    <>
      <AppSettingsApplier />
      <UpdateBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<RoleRedirect />} />

          {/* Halaman utama per role */}
          <Route path="owner"         element={<RequireRole roles={['owner','manager']}><OwnerPage /></RequireRole>} />
          <Route path="kasir"         element={<CashierPage />} />
          <Route path="tutup-toko"    element={<CloseOrderAllPage />} />

          {/* Unified pages — akses per role dikontrol di dalam komponen */}
          <Route path="stok"          element={<UnifiedStokPage />} />
          <Route path="pembelian"     element={<UnifiedPembelianPage />} />
          <Route path="mutasi"        element={<UnifiedMutasiPage />} />
          <Route path="biaya"         element={<UnifiedBiayaPage />} />

          {/* Owner/Manager only */}
          <Route path="laporan"       element={<RequireRole roles={['owner','manager']}><ReportsPage /></RequireRole>} />
          <Route path="laporan-gudang" element={<RequireRole roles={['owner','manager','gudang']}><LaporanGudangPage /></RequireRole>} />
          <Route path="resep"         element={<RequireRole roles={['owner','manager']}><ResepPage /></RequireRole>} />
          <Route path="produk"        element={<RequireRole roles={['owner','manager']}><ProductsPage /></RequireRole>} />
          <Route path="resep-toko"    element={<RequireRole roles={['owner','manager']}><StoreRecipePage /></RequireRole>} />
          <Route path="pengaturan"    element={<RequireRole roles={['owner','manager']}><SettingsPage /></RequireRole>} />
          <Route path="accounting"    element={<AccountingPage />} />
          <Route path="debug" element={<RequireRole roles={['owner','manager']}><DebugPage /></RequireRole>} />

          {/* Legacy routes */}
          <Route path="gudang"        element={<Navigate to="/stok" replace />} />
          <Route path="produksi" element={<RequireRole roles={['owner','manager','produksi','kasir']}><ProduksiPage /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
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
