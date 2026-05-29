import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuthStore } from '@/store/auth'
import { db } from '@/lib/db'
import {
  LogOut, Wifi, WifiOff,
  ShoppingCart, Warehouse, FlaskConical,
  BarChart3, LayoutDashboard, Settings,
  MoreHorizontal, X, Receipt, ArrowRightLeft,
  Package, BookOpen, Calculator
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Menu per role sesuai gambar ───────────────────────────────
// Owner/Manager: Dashboard · Stok · Pembelian · Mutasi · Biaya · Close Order · Setting · Resep · Produk · Accounting
// Gudang:        Dashboard · Stok · Pembelian · Mutasi · Biaya · Close Order
// Produksi:      Dashboard · Stok · Pembelian · Mutasi · Biaya · Close Order
// Kasir:         Dashboard · Stok · Pembelian · Mutasi · Biaya · Close Order

const ICON_MAP: Record<string, LucideIcon> = {
  '/owner':         LayoutDashboard,
  '/stok':          Package,
  '/pembelian':     ShoppingCart,
  '/mutasi':        ArrowRightLeft,
  '/biaya':         Receipt,
  '/kasir':         ShoppingCart,
  '/tutup-toko':    BarChart3,
  '/laporan':       BarChart3,
  '/laporan-gudang':BarChart3,
  '/pengaturan':    Settings,
  '/resep':         FlaskConical,
  '/produk':        Package,
  '/accounting':    Calculator,
  '/gudang':        Warehouse,
  '/produksi':      FlaskConical,
}

const DEFAULT_MENUS: Record<string, { path: string; label: string }[]> = {
  owner: [
    { path: '/owner',          label: 'Dashboard' },
    { path: '/stok',           label: 'Stok' },
    { path: '/pembelian',      label: 'Pembelian' },
    { path: '/mutasi',         label: 'Mutasi' },
    { path: '/biaya',          label: 'Biaya' },
    { path: '/kasir',          label: 'Kasir' },
    { path: '/tutup-toko',     label: 'Close Order' },
    { path: '/resep',          label: 'Resep' },
    { path: '/produk',         label: 'Produk' },
    { path: '/pengaturan',     label: 'Setting' },
    { path: '/accounting',     label: 'Accounting' },
    { path: '/laporan',        label: 'Laporan' },
    { path: '/laporan-gudang', label: 'Lap. Gudang' },
  ],
  manager: [
    { path: '/owner',          label: 'Dashboard' },
    { path: '/stok',           label: 'Stok' },
    { path: '/pembelian',      label: 'Pembelian' },
    { path: '/mutasi',         label: 'Mutasi' },
    { path: '/biaya',          label: 'Biaya' },
    { path: '/kasir',          label: 'Kasir' },
    { path: '/tutup-toko',     label: 'Close Order' },
    { path: '/resep',          label: 'Resep' },
    { path: '/pengaturan',     label: 'Setting' },
    { path: '/laporan',        label: 'Laporan' },
  ],
  gudang: [
    { path: '/stok',           label: 'Stok' },
    { path: '/pembelian',      label: 'Pembelian' },
    { path: '/mutasi',         label: 'Mutasi' },
    { path: '/biaya',          label: 'Biaya' },
    { path: '/tutup-toko',     label: 'Close Order' },
  ],
  produksi: [
    { path: '/stok',           label: 'Stok' },
    { path: '/pembelian',      label: 'Pembelian' },
    { path: '/mutasi',         label: 'Mutasi' },
    { path: '/biaya',          label: 'Biaya' },
    { path: '/tutup-toko',     label: 'Close Order' },
  ],
  kasir: [
    { path: '/kasir',          label: 'Kasir' },
    { path: '/stok',           label: 'Stok' },
    { path: '/pembelian',      label: 'Pembelian' },
    { path: '/mutasi',         label: 'Mutasi' },
    { path: '/biaya',          label: 'Biaya' },
    { path: '/tutup-toko',     label: 'Close Order' },
  ],
}

const MAX_NAV = 4  // Slot ke-5 selalu untuk 'Lainnya'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [showMore, setShowMore] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const up = () => setIsOnline(true)
    const dn = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', dn)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn) }
  }, [])

  const dbMenus = useLiveQuery(async () => {
    if (!user?.role) return []
    const configs = await db.menu_role_config
      .where('role').equals(user.role).toArray()
    return configs
  }, [user?.role])

  const allMenus = (() => {
    const defaults = DEFAULT_MENUS[user?.role || ''] || []
    if (!dbMenus || dbMenus.length === 0) {
      return defaults.map(d => ({ menu_path: d.path, menu_label: d.label }))
    }
    const dbMap = Object.fromEntries(dbMenus.map(m => [m.menu_path, m.is_visible]))
    return defaults
      .filter(d => dbMap[d.path] !== false)
      .map(d => ({ menu_path: d.path, menu_label: d.label }))
  })()

  const navMenus  = allMenus.slice(0, MAX_NAV)
  const moreMenus = allMenus.slice(MAX_NAV)
  const hasMore   = true  // Selalu tampilkan Lainnya untuk logout

  const isMoreActive = moreMenus.some(m => location.pathname.startsWith(m.menu_path))

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 max-w-lg mx-auto">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-xs text-center py-1 px-3 flex items-center justify-center gap-1.5 flex-shrink-0">
          <WifiOff size={12} />
          <span>Offline — data tersimpan lokal</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <Outlet />
      </div>

      {/* Bottom Nav */}
      <div className="bg-white border-t border-gray-100 flex-shrink-0 safe-area-pb">
        <div className="flex">
          {navMenus.map(menu => {
            const Icon = ICON_MAP[menu.menu_path] || Package
            const isActive = location.pathname === menu.menu_path || location.pathname.startsWith(menu.menu_path + '/')
            return (
              <NavLink key={menu.menu_path} to={menu.menu_path}
                className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-gray-900' : 'text-gray-400'
                }`}>
                <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                <span>{menu.menu_label}</span>
              </NavLink>
            )
          })}

          {hasMore && (
            <button onClick={() => setShowMore(true)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition-colors ${
                isMoreActive ? 'text-gray-900' : 'text-gray-400'
              }`}>
              <MoreHorizontal size={20} strokeWidth={isMoreActive ? 2 : 1.5} />
              <span>Lainnya</span>
            </button>
          )}
        </div>
      </div>

      {/* More Menu Sheet */}
      {showMore && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl p-4 pb-8 max-w-lg mx-auto w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
              </div>
              <div className="flex items-center gap-3">
                {isOnline
                  ? <Wifi size={16} className="text-green-500" />
                  : <WifiOff size={16} className="text-amber-500" />}
                <button onClick={() => setShowMore(false)} className="p-1 text-gray-400">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {moreMenus.map(menu => {
                const Icon = ICON_MAP[menu.menu_path] || Package
                const isActive = location.pathname.startsWith(menu.menu_path)
                return (
                  <NavLink key={menu.menu_path} to={menu.menu_path}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                      isActive ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                    }`}>
                    <Icon size={22} />
                    <span className="text-[10px] font-medium text-center leading-tight">{menu.menu_label}</span>
                  </NavLink>
                )
              })}
            </div>

            <button onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-sm font-medium text-red-500 active:bg-red-50">
              <LogOut size={16} />
              Keluar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
