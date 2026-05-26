import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import {
  ShoppingCart, Package, BarChart3, Settings,
  Layers, LogOut, Wifi, WifiOff, LayoutDashboard
} from 'lucide-react'
import { STORE_NAME } from '@/lib/supabase'
import { isOnline } from '@/lib/sync'
import { cn } from '@/lib/utils'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const online   = isOnline()

  function handleLogout() {
    if (confirm('Yakin ingin keluar?')) {
      logout()
      navigate('/login')
    }
  }

  // Menu berdasarkan role
  const menus = [
    {
      to: '/kasir', icon: ShoppingCart, label: 'Kasir',
      roles: ['owner', 'manager', 'kasir']
    },
    {
      to: '/produk', icon: Package, label: 'Produk',
      roles: ['owner', 'manager']
    },
    {
      to: '/stok', icon: Layers, label: 'Stok',
      roles: ['owner', 'manager', 'gudang']
    },
    {
      to: '/laporan', icon: BarChart3, label: 'Laporan',
      roles: ['owner', 'manager']
    },
    {
      to: '/owner', icon: LayoutDashboard, label: 'Dashboard',
      roles: ['owner']
    },
    {
      to: '/pengaturan', icon: Settings, label: 'Pengaturan',
      roles: ['owner', 'manager']
    },
  ].filter(m => user && m.roles.includes(user.role))

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 px-4 py-3
                          flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-semibold text-gray-800 text-sm">{STORE_NAME}</h1>
          <p className="text-xs text-gray-500 capitalize">{user?.name} · {user?.role}</p>
        </div>
        <div className="flex items-center gap-3">
          {online
            ? <Wifi size={16} className="text-green-500" />
            : <WifiOff size={16} className="text-gray-400" />
          }
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-gray-500 active:bg-gray-100"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="bg-white border-t border-gray-100 flex-shrink-0
                       pb-safe">
        <div className="flex">
          {menus.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex-1 flex flex-col items-center py-2.5 gap-1 text-xs',
                'transition-colors touch-manipulation',
                isActive
                  ? 'text-brand-600'
                  : 'text-gray-400 active:text-gray-600'
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className={cn('font-medium', isActive && 'font-semibold')}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
