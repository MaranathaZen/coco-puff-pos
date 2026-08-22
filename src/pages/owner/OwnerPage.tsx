// src/pages/owner/OwnerPage.tsx
import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { syncAll } from '@/lib/sync-helpers'
import {
  TrendingUp, Store, Package, RefreshCw, ShoppingBag,
  ShoppingCart, FlaskConical, ArrowRightLeft, Receipt,
  BarChart3, Settings, BookOpen, ChevronRight,
} from 'lucide-react'

type Period = 'hari' | 'minggu' | 'bulan'

export default function OwnerPage() {
  const { user }    = useAuthStore()
  const navigate    = useNavigate()
  const [period,  setPeriod]  = useState<Period>('hari')
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    await syncAll(user?.store_id || '', true)
    setSyncing(false)
  }

  const dateRange = useMemo(() => {
    const now   = new Date()
    const end   = new Date(now); end.setHours(23,59,59,999)
    const start = new Date(now)
    if (period === 'hari')   start.setHours(0,0,0,0)
    if (period === 'minggu') { start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
    if (period === 'bulan')  { start.setDate(1); start.setHours(0,0,0,0) }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [period])

  // Akurasi omzet per toko: tarik SEMUA transaksi periode ini utk semua toko (otomatis
  // terfilter region). Cache lokal per-store tidak lengkap utk toko selain milik owner.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.from('transactions').select('*')
          .eq('status', 'completed')
          .gte('created_at', dateRange.start).lte('created_at', dateRange.end)
          .order('created_at', { ascending: false }).limit(10000)
        if (!cancelled && data?.length) await db.transactions.bulkPut(data as any)
      } catch { /* offline: pakai cache */ }
    })()
    return () => { cancelled = true }
  }, [dateRange])

  // Hanya toko real (bukan virtual gudang/produksi)
  const stores = useLiveQuery(() =>
    db.stores.filter(s => s.is_active && !(s as any).is_virtual).toArray()
  , [])

  const transactions = useLiveQuery(async () =>
    db.transactions.filter(t =>
      t.status === 'completed' &&
      t.created_at >= dateRange.start &&
      t.created_at <= dateRange.end
    ).toArray()
  , [dateRange])

  const warehouseValue = useLiveQuery(async () => {
    const mats   = await db.materials.toArray()
    const stocks = await db.warehouse_stock.toArray()
    const sMap   = Object.fromEntries(stocks.map(s => [s.material_id, s.qty_on_hand]))
    return mats.reduce((s, m) => s + (sMap[m.id] ?? 0) * (m.avg_cost || m.unit_cost || 0), 0)
  }, [])

  const storeStats = useMemo(() => {
    if (!transactions || !stores) return []
    return stores.map(store => {
      const storeTxs = transactions.filter(t => t.store_id === store.id)
      const omzet    = storeTxs.reduce((s, t) => s + t.total, 0)
      const count    = storeTxs.length
      return { store, omzet, count }
    }).sort((a, b) => b.omzet - a.omzet)
  }, [transactions, stores])

  const totalOmzet  = storeStats.reduce((s, x) => s + x.omzet, 0)
  const totalTrx    = storeStats.reduce((s, x) => s + x.count, 0)
  const periodLabel = { hari: 'Hari Ini', minggu: '7 Hari', bulan: 'Bulan Ini' }

  const quickActions = [
    {
      group: 'Kasir & Toko',
      items: [
        { label: 'Kasir',       icon: ShoppingBag,   path: '/kasir',      color: 'bg-blue-50 text-blue-600'     },
        { label: 'Close Order', icon: BarChart3,      path: '/tutup-toko', color: 'bg-green-50 text-green-600'   },
        { label: 'Mutasi',      icon: ArrowRightLeft, path: '/mutasi',     color: 'bg-purple-50 text-purple-600' },
        { label: 'Biaya',       icon: Receipt,        path: '/biaya',      color: 'bg-orange-50 text-orange-600' },
      ]
    },
    {
      group: 'Gudang',
      items: [
        { label: 'Pembelian',   icon: ShoppingCart,   path: '/pembelian',  color: 'bg-amber-50 text-amber-600'   },
        { label: 'Stok',        icon: Package,        path: '/stok',       color: 'bg-gray-100 text-gray-600'    },
      ]
    },
    {
      group: 'Produksi & Setting',
      items: [
        { label: 'Produksi',    icon: FlaskConical,   path: '/produksi',   color: 'bg-cyan-50 text-cyan-600'     },
        { label: 'Resep',       icon: BookOpen,       path: '/resep',      color: 'bg-pink-50 text-pink-600'     },
        { label: 'Produk',      icon: Package,        path: '/produk',     color: 'bg-indigo-50 text-indigo-600' },
        { label: 'Setting',     icon: Settings,       path: '/pengaturan', color: 'bg-gray-100 text-gray-600'    },
      ]
    },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-400 capitalize">{user?.name} · {user?.role}</p>
          </div>
          <button onClick={handleSync} disabled={syncing} className="p-2 rounded-full text-gray-400">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
        <div className="flex gap-2">
          {(['hari','minggu','bulan'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${period === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {periodLabel[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-green-500" />
              <p className="text-xs text-gray-400">Total Omzet</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatRupiah(totalOmzet)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{totalTrx} transaksi</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package size={14} className="text-blue-500" />
              <p className="text-xs text-gray-400">Nilai Stok Gudang</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatRupiah(warehouseValue || 0)}</p>
          </div>
        </div>

        {storeStats.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">
              Omzet per Toko
            </p>
            {storeStats.map((s, idx) => {
              const pct = totalOmzet > 0 ? (s.omzet / totalOmzet) * 100 : 0
              return (
                <div key={s.store.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Store size={13} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{s.store.name}</p>
                        <p className="text-xs text-gray-400">{s.store.city} · {s.count} transaksi</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{formatRupiah(s.omzet)}</p>
                  </div>
                  {totalOmzet > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-1">
                      <div className="bg-gray-900 h-1 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Aksi Cepat</p>
          {quickActions.map(group => (
            <div key={group.group}>
              <p className="text-xs text-gray-400 px-1 mb-1.5">{group.group}</p>
              <div className="grid grid-cols-4 gap-2">
                {group.items.map(action => {
                  const Icon = action.icon
                  return (
                    <button key={action.path} onClick={() => navigate(action.path)}
                      className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${action.color}`}>
                        <Icon size={18} />
                      </div>
                      <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">{action.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => navigate('/laporan')}
          className="w-full bg-gray-900 text-white rounded-xl p-4 flex items-center justify-between active:opacity-90">
          <div className="flex items-center gap-3">
            <BarChart3 size={20} />
            <div className="text-left">
              <p className="text-sm font-semibold">Lihat Laporan Lengkap</p>
              <p className="text-xs text-gray-400">Penjualan · Gudang · Produksi · Biaya</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400" />
        </button>

        {stores?.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center">
            <ShoppingBag size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Belum ada data</p>
            <button onClick={handleSync} className="mt-3 text-xs text-blue-500 underline">Sync data</button>
          </div>
        )}
      </div>
    </div>
  )
}
