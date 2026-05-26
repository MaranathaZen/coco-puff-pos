import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { seedIfEmpty } from '@/lib/seed'
import { startSyncWorker, stopSyncWorker } from '@/lib/sync'

import LoginPage    from '@/pages/auth/LoginPage'
import Layout       from '@/components/layout/Layout'
import CashierPage  from '@/pages/cashier/CashierPage'
import ProductsPage from '@/pages/products/ProductsPage'
import StockPage    from '@/pages/stock/StockPage'
import ReportsPage  from '@/pages/reports/ReportsPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import OwnerPage    from '@/pages/owner/OwnerPage'
import GudangPage   from '@/pages/gudang/GudangPage'
import ProduksiPage from '@/pages/produksi/ProduksiPage'

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

export default function App() {
  const user = useAuthStore(s => s.user)

  useEffect(() => { seedIfEmpty() }, [])

  useEffect(() => {
    if (user?.store_id) startSyncWorker(user.store_id)
    else stopSyncWorker()
  }, [user?.store_id])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<RoleRedirect />} />
        <Route path="kasir" element={<CashierPage />} />
        <Route path="produk" element={<RequireRole roles={['owner','manager']}><ProductsPage /></RequireRole>} />
        <Route path="stok" element={<RequireRole roles={['owner','manager','gudang']}><StockPage /></RequireRole>} />
        <Route path="laporan" element={<RequireRole roles={['owner','manager']}><ReportsPage /></RequireRole>} />
        <Route path="pengaturan" element={<RequireRole roles={['owner','manager']}><SettingsPage /></RequireRole>} />
        <Route path="owner" element={<RequireRole roles={['owner']}><OwnerPage /></RequireRole>} />
        <Route path="gudang" element={<RequireRole roles={['owner','manager','gudang']}><GudangPage /></RequireRole>} />
        <Route path="produksi" element={<RequireRole roles={['owner','manager','produksi']}><ProduksiPage /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
