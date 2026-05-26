import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { seedIfEmpty } from '@/lib/seed'
import { startSyncWorker } from '@/lib/sync'

// Pages
import LoginPage       from '@/pages/auth/LoginPage'
import Layout          from '@/components/layout/Layout'
import CashierPage     from '@/pages/cashier/CashierPage'
import ProductsPage    from '@/pages/products/ProductsPage'
import StockPage       from '@/pages/stock/StockPage'
import ReportsPage     from '@/pages/reports/ReportsPage'
import SettingsPage    from '@/pages/settings/SettingsPage'
import OwnerPage       from '@/pages/owner/OwnerPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({
  roles, children
}: {
  roles: string[], children: React.ReactNode
}) {
  const user = useAuthStore(s => s.user)
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  useEffect(() => {
    seedIfEmpty()
    startSyncWorker()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }>
        {/* Default redirect berdasarkan role */}
        <Route index element={<RoleRedirect />} />

        {/* Kasir */}
        <Route path="kasir" element={<CashierPage />} />

        {/* Produk — owner & manager */}
        <Route path="produk" element={
          <RequireRole roles={['owner', 'manager']}>
            <ProductsPage />
          </RequireRole>
        } />

        {/* Stok — owner, manager, gudang */}
        <Route path="stok" element={
          <RequireRole roles={['owner', 'manager', 'gudang']}>
            <StockPage />
          </RequireRole>
        } />

        {/* Laporan — owner & manager */}
        <Route path="laporan" element={
          <RequireRole roles={['owner', 'manager']}>
            <ReportsPage />
          </RequireRole>
        } />

        {/* Pengaturan — owner & manager */}
        <Route path="pengaturan" element={
          <RequireRole roles={['owner', 'manager']}>
            <SettingsPage />
          </RequireRole>
        } />

        {/* Owner dashboard — owner only */}
        <Route path="owner" element={
          <RequireRole roles={['owner']}>
            <OwnerPage />
          </RequireRole>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RoleRedirect() {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />

  const roleMap: Record<string, string> = {
    owner:   '/owner',
    manager: '/laporan',
    kasir:   '/kasir',
    gudang:  '/stok',
  }
  return <Navigate to={roleMap[user.role] || '/kasir'} replace />
}
