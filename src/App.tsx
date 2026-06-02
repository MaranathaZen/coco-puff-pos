import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { seedIfEmpty } from '@/lib/seed'
import { startSyncWorker, stopSyncWorker } from '@/lib/sync'

import LoginPage            from '@/pages/auth/LoginPage'
import Layout               from '@/components/layout/Layout'
import CashierPage          from '@/pages/cashier/CashierPage'
import ProductsPage         from '@/pages/settings/SettingsProductPage'
import SettingsPage         from '@/pages/settings/SettingsPage'
import OwnerPage            from '@/pages/owner/OwnerPage'
import ProduksiPage         from '@/pages/produksi/ProduksiPage'
import LaporanPage          from '@/pages/laporan/LaporanPage'
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

export default function App() {
  const user = useAuthStore(s => s.user)
  useAutoUpdate()
  useEffect(() => { seedIfEmpty() }, [])
  useEffect(() => {
    if (user?.store_id) startSyncWorker(user.store_id)
    else stopSyncWorker()
  }, [user?.store_id])

  return (
    <>
      <UpdateBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<RoleRedirect />} />

          {/* Halaman utama per role */}
          <Route path="owner"      element={<RequireRole roles={['owner','manager']}><OwnerPage /></RequireRole>} />
          <Route path="kasir"      element={<CashierPage />} />
          <Route path="tutup-toko" element={<CloseOrderAllPage />} />

          {/* Unified pages — akses per role dikontrol di dalam komponen */}
          <Route path="stok"      element={<UnifiedStokPage />} />
          <Route path="pembelian" element={<UnifiedPembelianPage />} />
          <Route path="mutasi"    element={<UnifiedMutasiPage />} />
          <Route path="biaya"     element={<UnifiedBiayaPage />} />
          <Route path="produksi"  element={<RequireRole roles={['owner','manager','produksi']}><ProduksiPage /></RequireRole>} />

          {/* Laporan — LaporanPage baru (toko+produksi+gudang) */}
          <Route path="laporan"        element={<RequireRole roles={['owner','manager','kasir','gudang','produksi']}><LaporanPage /></RequireRole>} />
          {/* Laporan gudang lama — redirect ke laporan baru */}
          <Route path="laporan-gudang" element={<Navigate to="/laporan" replace />} />

          {/* Owner/Manager only */}
          <Route path="resep"      element={<RequireRole roles={['owner','manager']}><ResepPage /></RequireRole>} />
          <Route path="produk"     element={<RequireRole roles={['owner','manager']}><ProductsPage /></RequireRole>} />
          <Route path="pengaturan" element={<RequireRole roles={['owner','manager']}><SettingsPage /></RequireRole>} />
          <Route path="accounting" element={<AccountingPage />} />

          {/* Legacy redirects */}
          <Route path="gudang"    element={<Navigate to="/stok" replace />} />
          <Route path="laporan-owner" element={<Navigate to="/laporan" replace />} />
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
