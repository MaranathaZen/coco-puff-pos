// src/components/layout/Layout.tsx
// CHANGELOG v2:
// - Kasir: urutan Kasir, Stok, Produksi, Mutasi, Close Order, Lainnya(Pembelian+Biaya)
// - Produksi: hapus menu Biaya
// - Desktop sidebar + mobile bottom nav

import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuthStore } from '@/store/auth'
import { db } from '@/lib/db'
import {
  LogOut, Wifi, WifiOff,
  ShoppingCart, FlaskConical,
  BarChart3, LayoutDashboard, Settings,
  MoreHorizontal, X, Receipt, ArrowRightLeft,
  Package, Calculator, BookOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  '/owner':          LayoutDashboard,
  '/stok':           Package,
  '/pembelian':      ShoppingCart,
  '/mutasi':         ArrowRightLeft,
  '/biaya':          Receipt,
  '/kasir':          ShoppingCart,
  '/tutup-toko':     BarChart3,
  '/laporan':        BarChart3,
  '/laporan-gudang': BarChart3,
  '/pengaturan':     Settings,
  '/resep':          FlaskConical,
  '/produk':         Package,
  '/produksi':       FlaskConical,
  '/accounting':     Calculator,
}

const DEFAULT_MENUS: Record<string, { path: string; label: string }[]> = {
  owner: [
    { path: '/owner',      label: 'Dashboard'   },
    { path: '/laporan',    label: 'Laporan'     },
    { path: '/accounting', label: 'Accounting'  },
    { path: '/kasir',      label: 'Kasir'       },
    { path: '/tutup-toko', label: 'Close Order' },
    { path: '/stok',       label: 'Stok'        },
    { path: '/pembelian',  label: 'Pembelian'   },
    { path: '/mutasi',     label: 'Mutasi'      },
    { path: '/biaya',      label: 'Biaya'       },
    { path: '/produksi',   label: 'Produksi'    },
    { path: '/resep',      label: 'Resep'       },
    { path: '/produk',     label: 'Produk'      },
    { path: '/pengaturan', label: 'Setting'     },
  ],
  manager: [
    { path: '/owner',      label: 'Dashboard'   },
    { path: '/laporan',    label: 'Laporan'     },
    { path: '/kasir',      label: 'Kasir'       },
    { path: '/tutup-toko', label: 'Close Order' },
    { path: '/stok',       label: 'Stok'        },
    { path: '/pembelian',  label: 'Pembelian'   },
    { path: '/mutasi',     label: 'Mutasi'      },
    { path: '/biaya',      label: 'Biaya'       },
    { path: '/produksi',   label: 'Produksi'    },
    { path: '/resep',      label: 'Resep'       },
    { path: '/produk',     label: 'Produk'      },
    { path: '/accounting', label: 'Accounting'  },
    { path: '/pengaturan', label: 'Setting'     },
  ],
  gudang: [
    { path: '/stok',           label: 'Stok'        },
    { path: '/pembelian',      label: 'Pembelian'   },
    { path: '/mutasi',         label: 'Mutasi'      },
    { path: '/biaya',          label: 'Biaya'       },
    { path: '/tutup-toko',     label: 'Close Order' },
    { path: '/accounting',     label: 'Accounting'  },
  ],
  produksi: [
    { path: '/stok',           label: 'Stok'        },
    { path: '/produksi',       label: 'Produksi'    },
    { path: '/mutasi',         label: 'Mutasi'      },
  ],
  kasir: [
    { path: '/kasir',      label: 'Kasir'       },
    { path: '/tutup-toko', label: 'Close Order' },
    { path: '/stok',       label: 'Stok'        },
    { path: '/produksi',   label: 'Produksi'    },
    { path: '/mutasi',     label: 'Mutasi'      },
    { path: '/pembelian',  label: 'Pembelian'   },
    { path: '/biaya',      label: 'Biaya'       },
    { path: '/laporan',    label: 'Laporan'     },
    { path: '/accounting', label: 'Accounting'  },
  ],
}

const MAX_NAV = 4

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate   = useNavigate()
  const location   = useLocation()
  const [showMore, setShowMore] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const up = () => setIsOnline(true)
    const dn = () => setIsOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', dn)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn) }
  }, [])

  const dbMenus = useLiveQuery(async () => {
    if (!user?.role) return []
    return db.menu_role_config.where('role').equals(user.role).toArray()
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

  const navMenus     = allMenus.slice(0, MAX_NAV)
  const moreMenus    = allMenus.slice(MAX_NAV)
  const isMoreActive = moreMenus.some(m => location.pathname.startsWith(m.menu_path))

  function handleLogout() {
    if (!confirm('Yakin ingin keluar?')) return
    logout()
    navigate('/login')
  }

  function NavItem({ menu_path, menu_label, onClick }: { menu_path: string; menu_label: string; onClick?: () => void }) {
    const Icon     = ICON_MAP[menu_path] || Package
    const isActive = location.pathname === menu_path || location.pathname.startsWith(menu_path + '/')
    return (
      <NavLink to={menu_path} onClick={onClick}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
        }`}>
        <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
        <span>{menu_label}</span>
      </NavLink>
    )
  }

  return (
    <div className="flex h-[100dvh] bg-gray-50">
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-100 flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">CP</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">Coco Puff POS</p>
              <p className="text-xs text-gray-400 capitalize truncate">{user?.name}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-auto p-2 space-y-0.5">
          {allMenus.map(menu => (
            <NavItem key={menu.menu_path} menu_path={menu.menu_path} menu_label={menu.menu_label} />
          ))}
        </nav>
        <div className="p-2 border-t border-gray-100 space-y-1">
          <div className="flex items-center gap-2 px-3 py-2">
            {isOnline
              ? <><Wifi size={14} className="text-green-500" /><span className="text-xs text-green-600">Online</span></>
              : <><WifiOff size={14} className="text-amber-500" /><span className="text-xs text-amber-600">Offline</span></>}
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
            <LogOut size={18} /><span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {!isOnline && (
          <div className="bg-amber-500 text-white text-xs text-center py-1 px-3 flex items-center justify-center gap-1.5 flex-shrink-0">
            <WifiOff size={12} /><span>Offline — data tersimpan lokal</span>
          </div>
        )}
        <div className="flex-1 overflow-hidden relative max-w-lg mx-auto w-full md:max-w-none">
          <Outlet />
        </div>

        {/* ── MOBILE BOTTOM NAV ── */}
        <div className="md:hidden bg-white border-t border-gray-100 flex-shrink-0 safe-area-pb">
          <div className="flex">
            {navMenus.map(menu => {
              const Icon     = ICON_MAP[menu.menu_path] || Package
              const isActive = location.pathname === menu.menu_path || location.pathname.startsWith(menu.menu_path + '/')
              return (
                <NavLink key={menu.menu_path} to={menu.menu_path}
                  className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                  <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                  <span>{menu.menu_label}</span>
                </NavLink>
              )
            })}
            {/* Selalu tampilkan tombol Lainnya — untuk logout + menu overflow */}
            <button onClick={() => setShowMore(true)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition-colors ${isMoreActive ? 'text-gray-900' : 'text-gray-400'}`}>
              <MoreHorizontal size={20} strokeWidth={isMoreActive ? 2 : 1.5} />
              <span>Lainnya</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── MOBILE MORE SHEET ── */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl p-4 pb-8 max-w-lg mx-auto w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
              </div>
              <div className="flex items-center gap-3">
                {isOnline ? <Wifi size={16} className="text-green-500" /> : <WifiOff size={16} className="text-amber-500" />}
                <button onClick={() => setShowMore(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>
            {moreMenus.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {moreMenus.map(menu => {
                  const Icon     = ICON_MAP[menu.menu_path] || Package
                  const isActive = location.pathname.startsWith(menu.menu_path)
                  return (
                    <NavLink key={menu.menu_path} to={menu.menu_path} onClick={() => setShowMore(false)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600'}`}>
                      <Icon size={22} />
                      <span className="text-[10px] font-medium text-center leading-tight">{menu.menu_label}</span>
                    </NavLink>
                  )
                })}
              </div>
            )}
            <button onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-sm font-medium text-red-500 active:bg-red-50">
              <LogOut size={16} />Keluar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
