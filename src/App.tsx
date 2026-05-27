import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { seedIfEmpty } from '@/lib/seed'
import { startSyncWorker, stopSyncWorker } from '@/lib/sync'

import LoginPage         from '@/pages/auth/LoginPage'
import Layout            from '@/components/layout/Layout'
import CashierPage       from '@/pages/cashier/CashierPage'
import ProductsPage      from '@/pages/products/ProductsPage'
import StoreRecipePage   from '@/pages/products/StoreRecipePage'
import StockPage         from '@/pages/stock/StockPage'
import ReportsPage       from '@/pages/reports/ReportsPage'
import SettingsPage      from '@/pages/settings/SettingsPage'
import OwnerPage         from '@/pages/owner/OwnerPage'
import GudangPage        from '@/pages/gudang/GudangPage'
import ProduksiPage      from '@/pages/produksi/ProduksiPage'
import LaporanGudangPage from '@/pages/laporan/LaporanGudangPage'
import EndOfDayPage      from '@/pages/cashier/EndOfDayPage'

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


// ── Auto-update notifier ──────────────────────────────────────
// Deteksi saat service worker baru tersedia, reload otomatis
function useAutoUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Listen untuk pesan dari service worker baru
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        window.location.reload()
      }
    }
    navigator.serviceWorker.addEventListener('message', handleSWMessage)

    // Cek update setiap kali tab menjadi aktif kembali
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) reg.update()
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cek update saat online kembali
    const handleOnline = () => {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update()
      })
    }
    window.addEventListener('online', handleOnline)

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage)
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
      // Saat ada service worker baru menunggu
      const checkWaiting = () => {
        if (reg.waiting) {
          setShowBanner(true)
          // Kirim pesan ke SW baru untuk skipWaiting
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
      }

      checkWaiting()
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setShowBanner(true)
            // Auto reload setelah 2 detik
            setTimeout(() => window.location.reload(), 2000)
          }
        })
      })
    })

    // Reload otomatis saat SW baru aktif
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
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
        <Route path="kasir"         element={<CashierPage />} />
        <Route path="produk"        element={<RequireRole roles={['owner','manager']}><ProductsPage /></RequireRole>} />
        <Route path="resep-toko"    element={<RequireRole roles={['owner','manager']}><StoreRecipePage /></RequireRole>} />
        <Route path="stok"          element={<RequireRole roles={['owner','manager','gudang']}><StockPage /></RequireRole>} />
        <Route path="laporan"       element={<RequireRole roles={['owner','manager']}><ReportsPage /></RequireRole>} />
        <Route path="laporan-gudang" element={<RequireRole roles={['owner','manager','gudang']}><LaporanGudangPage /></RequireRole>} />
        <Route path="pengaturan"    element={<RequireRole roles={['owner','manager']}><SettingsPage /></RequireRole>} />
        <Route path="owner"         element={<RequireRole roles={['owner']}><OwnerPage /></RequireRole>} />
        <Route path="gudang"        element={<RequireRole roles={['owner','manager','gudang']}><GudangPage /></RequireRole>} />
        <Route path="produksi"      element={<RequireRole roles={['owner','manager','produksi']}><ProduksiPage /></RequireRole>} />
        <Route path="tutup-toko"    element={<RequireRole roles={['owner','manager','kasir']}><EndOfDayPage /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

function RoleRedirect() {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  const roleMap: Record<string, string> = {
    owner:    '/owner',
    manager:  '/laporan',
    kasir:    '/kasir',
    gudang:   '/gudang',
    produksi: '/produksi',
  }
  return <Navigate to={roleMap[user.role] || '/kasir'} replace />
}
