// src/pages/owner/OwnerPage.tsx
// Owner Dashboard — monitoring semua toko
import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah, formatDate } from '@/lib/utils'
import { TrendingUp, Store, Package, AlertCircle, RefreshCw, ShoppingBag } from 'lucide-react'

type Period = 'hari' | 'minggu' | 'bulan'

export default function OwnerPage() {
  const { user } = useAuthStore()
  const [period, setPeriod]   = useState<Period>('hari')
  const [syncing, setSyncing] = useState(false)

  async function syncAll() {
    setSyncing(true)
    try {
      const [txRes, storesRes, matsRes, stockRes, expRes] = await Promise.all([
        supabase.from('transactions').select('*, transaction_items(*)').eq('status', 'completed'),
        supabase.from('stores').select('*').eq('is_active', true),
        supabase.from('materials').select('*'),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('warehouse_expenses').select('*'),
      ])
      if (txRes.data?.length) {
        const txs = txRes.data.map(({ transaction_items: _, ...t }) => t)
        const items = txRes.data.flatMap(t => (t.transaction_items || []).map((i: any) => ({ ...i, transaction_id: t.id })))
        await db.transactions.bulkPut(txs)
        if (items.length) await db.transaction_items.bulkPut(items)
      }
      if (storesRes.data?.length) await db.stores.bulkPut(storesRes.data)
      if (matsRes.data?.length)   await db.materials.bulkPut(matsRes.data)
      if (stockRes.data?.length)  await db.warehouse_stock.bulkPut(stockRes.data)
      if (expRes.data?.length)    await db.warehouse_expenses.bulkPut(expRes.data)
    } finally { setSyncing(false) }
  }

  const dateRange = useMemo(() => {
    const now = new Date()
    const end = new Date(now); end.setHours(23,59,59,999)
    const start = new Date(now)
    if (period === 'hari')   start.setHours(0,0,0,0)
    if (period === 'minggu') { start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
    if (period === 'bulan')  { start.setDate(1); start.setHours(0,0,0,0) }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [period])

  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])

  const transactions = useLiveQuery(async () => {
    return db.transactions
      .filter(t => t.status === 'completed' &&
        t.created_at >= dateRange.start &&
        t.created_at <= dateRange.end)
      .toArray()
  }, [dateRange])

  const stockAlerts = useLiveQuery(async () => {
    const mats   = await db.materials.toArray()
    const stocks = await db.warehouse_stock.toArray()
    const sMap   = Object.fromEntries(stocks.map(s => [s.material_id, s.qty_on_hand]))
    return mats.filter(m => m.is_active && (sMap[m.id] ?? 0) <= m.min_stock)
  }, [])

  const warehouseValue = useLiveQuery(async () => {
    const mats   = await db.materials.toArray()
    const stocks = await db.warehouse_stock.toArray()
    const sMap   = Object.fromEntries(stocks.map(s => [s.material_id, s.qty_on_hand]))
    return mats.reduce((s, m) => s + (sMap[m.id] ?? 0) * (m.unit_cost || 0), 0)
  }, [])

  // Stats per toko
  const storeStats = useMemo(() => {
    if (!transactions || !stores) return []
    return stores.map(store => {
      const storeTxs = transactions.filter(t => t.store_id === store.id)
      const omzet    = storeTxs.reduce((s, t) => s + t.total, 0)
      const count    = storeTxs.length
      const avgTrx   = count > 0 ? omzet / count : 0
      return { store, omzet, count, avgTrx }
    }).sort((a, b) => b.omzet - a.omzet)
  }, [transactions, stores])

  const totalOmzet = storeStats.reduce((s, x) => s + x.omzet, 0)
  const totalTrx   = storeStats.reduce((s, x) => s + x.count, 0)

  const periodLabel = { hari: 'Hari Ini', minggu: '7 Hari', bulan: 'Bulan Ini' }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          <button onClick={syncAll} disabled={syncing}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
        <div className="flex gap-2">
          {(['hari','minggu','bulan'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                period === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}>{periodLabel[p]}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* Total summary */}
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
            {stockAlerts && stockAlerts.length > 0 && (
              <p className="text-xs text-red-500 mt-0.5">{stockAlerts.length} item stok rendah</p>
            )}
          </div>
        </div>

        {/* Stok rendah alert */}
        {stockAlerts && stockAlerts.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertCircle size={14} className="text-red-500" />
              <p className="text-sm font-medium text-red-700">{stockAlerts.length} Item Stok Rendah</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stockAlerts.map(m => (
                <span key={m.id} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Per toko */}
        {storeStats.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Omzet per Toko</p>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
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
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatRupiah(s.omzet)}</p>
                        <p className="text-xs text-gray-400">avg {formatRupiah(s.avgTrx)}</p>
                      </div>
                    </div>
                    {totalOmzet > 0 && (
                      <div className="w-full bg-gray-100 rounded-full h-1">
                        <div className="bg-gray-900 h-1 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {storeStats.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center">
            <ShoppingBag size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Belum ada data toko</p>
            <button onClick={syncAll} className="mt-3 text-xs text-blue-500 underline">Sync data</button>
          </div>
        )}

      </div>
    </div>
  )
}
