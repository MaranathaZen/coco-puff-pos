import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuthStore } from '@/store/auth'
import { db } from '@/lib/db'
import { supabase, APP_NAME } from '@/lib/supabase'
import { isOnline } from '@/lib/sync'
import { cn } from '@/lib/utils'
import { LogOut, Wifi, WifiOff, FileText,
  ShoppingCart, Package, Warehouse, FlaskConical,
  BarChart3, LayoutDashboard, Settings, Layers,
  LucideIcon } from 'lucide-react'
import { useEffect } from 'react'

const ICON_MAP: Record<string, LucideIcon> = {
  '/kasir':     ShoppingCart,
  '/produk':    Package,
  '/stok':      Layers,
  '/gudang':    Warehouse,
  '/produksi':  FlaskConical,
  '/laporan':        BarChart3,
  '/laporan-gudang': FileText,
  '/owner':     LayoutDashboard,
  '/pengaturan': Settings,
}

export default function Layout() {
  const { user, store, logout } = useAuthStore()
  const navigate = useNavigate()
  const online   = isOnline()

  // Pull menu config dari Supabase saat pertama kali
  useEffect(() => {
    async function pullMenuConfig() {
      const { data } = await supabase.from('menu_role_config').select('*')
      if (data?.length) await db.menu_role_config.bulkPut(data)
    }
    pullMenuConfig()
  }, [])

  // Ambil menu dari DB berdasarkan role user
  const menus = useLiveQuery(async () => {
    if (!user) return []
    const configs = await db.menu_role_config
      .where('role').equals(user.role)
      .filter(m => m.is_visible)
      .sortBy('sort_order')
    return configs
  }, [user?.role]) || []

  function handleLogout() {
    if (confirm('Yakin ingin keluar?')) { logout(); navigate('/login') }
  }

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
      <nav className="bg-white border-t border-gray-100 flex-shrink-0 overflow-x-auto">
        <div className="flex">
          {menus.map((menu) => {
            const Icon = ICON_MAP[menu.menu_path] || Package
            return (
              <NavLink key={menu.menu_path} to={menu.menu_path}
                className={({ isActive }) => cn(
                  'flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors min-w-[56px]',
                  isActive ? 'text-brand-600' : 'text-gray-400'
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
        </div>
      </nav>
    </div>
  )
}
