import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuthStore } from '@/store/auth'
import { db } from '@/lib/db'
import { supabase, APP_NAME } from '@/lib/supabase'
import { isOnline } from '@/lib/sync'
import { cn } from '@/lib/utils'
import { LogOut, Wifi, WifiOff, FileText, DoorClosed,
  ShoppingCart, Package, Warehouse, FlaskConical,
  BarChart3, LayoutDashboard, Settings, Layers,
  MoreHorizontal, X, LucideIcon } from 'lucide-react'
import { useEffect } from 'react'

const ICON_MAP: Record<string, LucideIcon> = {
  '/kasir':         ShoppingCart,
  '/produk':        Package,
  '/stok':          Layers,
  '/gudang':        Warehouse,
  '/produksi':      FlaskConical,
  '/laporan':       BarChart3,
  '/laporan-gudang':FileText,
  '/owner':         LayoutDashboard,
  '/pengaturan':    Settings,
  '/tutup-toko':    DoorClosed,
}

const MAX_NAV = 4 // max item di bottom nav sebelum "Lainnya"

export default function Layout() {
  const { user, store, logout } = useAuthStore()
  const navigate  = useNavigate()
  const location  = useLocation()
  const online    = isOnline()
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    async function pullMenuConfig() {
      const { data } = await supabase.from('menu_role_config').select('*')
      if (data?.length) await db.menu_role_config.bulkPut(data)
    }
    pullMenuConfig()
  }, [])

  const allMenus = useLiveQuery(async () => {
    if (!user) return []
    const configs = await db.menu_role_config
      .where('role').equals(user.role)
      .filter(m => m.is_visible)
      .sortBy('sort_order')
    return configs
  }, [user?.role]) || []

  // Split menu: max 4 di bottom, sisanya di "Lainnya"
  const navMenus  = allMenus.slice(0, MAX_NAV)
  const moreMenus = allMenus.slice(MAX_NAV)
  const hasMore   = moreMenus.length > 0

  // Cek apakah halaman aktif ada di "Lainnya"
  const activeInMore = moreMenus.some(m => location.pathname.startsWith(m.menu_path))

  function handleLogout() {
    if (confirm('Yakin ingin keluar?')) { logout(); navigate('/login') }
  }

  const storeName = user?.role === 'owner' ? APP_NAME : (store?.name || APP_NAME)
  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ''

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-semibold text-gray-800 text-sm leading-tight">{storeName}</h1>
          <p className="text-xs text-gray-500">{user?.role === 'owner' ? 'Owner' : `${user?.name} · ${roleLabel}`}</p>
        </div>
        <div className="flex items-center gap-3">
          {online ? <Wifi size={16} className="text-green-500" /> : <WifiOff size={16} className="text-gray-400" />}
          <button onClick={handleLogout} className="p-2 rounded-xl text-gray-500 active:bg-gray-100">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-h-0"><Outlet /></main>

      {/* Bottom navigation */}
      <nav className="bg-white border-t border-gray-100 flex-shrink-0">
        <div className="flex">
          {navMenus.map((menu) => {
            const Icon = ICON_MAP[menu.menu_path] || Package
            return (
              <NavLink key={menu.menu_path} to={menu.menu_path}
                className={({ isActive }) => cn(
                  'flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors min-w-[56px]',
                  isActive ? 'text-gray-900' : 'text-gray-400'
                )}>
                {({ isActive }) => (
                  <>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                    <span className={cn('font-medium text-[10px]', isActive && 'font-semibold')}>
                      {menu.menu_label}
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}

          {/* Tombol Lainnya */}
          {hasMore && (
            <button onClick={() => setShowMore(true)}
              className={cn(
                'flex-1 flex flex-col items-center py-2 gap-0.5 text-xs min-w-[56px] transition-colors',
                activeInMore ? 'text-gray-900' : 'text-gray-400'
              )}>
              <MoreHorizontal size={20} strokeWidth={activeInMore ? 2.5 : 1.8} />
              <span className={cn('font-medium text-[10px]', activeInMore && 'font-semibold')}>Lainnya</span>
            </button>
          )}
        </div>
      </nav>

      {/* Drawer "Lainnya" */}
      {showMore && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowMore(false)} />

          {/* Sheet */}
          <div className="relative bg-white rounded-t-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">Menu Lainnya</p>
              <button onClick={() => setShowMore(false)} className="p-1 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 p-4 pb-8">
              {moreMenus.map((menu) => {
                const Icon = ICON_MAP[menu.menu_path] || Package
                const isActive = location.pathname.startsWith(menu.menu_path)
                return (
                  <button key={menu.menu_path}
                    onClick={() => { navigate(menu.menu_path); setShowMore(false) }}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors',
                      isActive ? 'bg-gray-100' : 'active:bg-gray-50'
                    )}>
                    <Icon size={22} className={isActive ? 'text-gray-900' : 'text-gray-500'} strokeWidth={isActive ? 2.5 : 1.8} />
                    <span className={cn('text-[10px] font-medium text-center leading-tight', isActive ? 'text-gray-900' : 'text-gray-500')}>
                      {menu.menu_label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
