// src/pages/reports/ReportsPage.tsx
// Laporan simple — ringkasan harian, per produk, per kasir
import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { TrendingUp, ShoppingBag, Users, Calendar } from 'lucide-react'

type Period = 'hari' | 'minggu' | 'bulan'

export default function ReportsPage() {
  const { user } = useAuthStore()
  const STORE_ID = user?.store_id || ''
  const [period, setPeriod] = useState<Period>('hari')

  const dateRange = useMemo(() => {
    const now = new Date()
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    const start = new Date(now)
    if (period === 'hari')   start.setHours(0, 0, 0, 0)
    if (period === 'minggu') { start.setDate(now.getDate() - 6); start.setHours(0,0,0,0) }
    if (period === 'bulan')  { start.setDate(1); start.setHours(0,0,0,0) }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [period])

  const transactions = useLiveQuery(async () => {
    const txs = await db.transactions
      .where('store_id').equals(STORE_ID)
      .filter(t =>
        t.status === 'completed' &&
        t.created_at >= dateRange.start &&
        t.created_at <= dateRange.end
      ).toArray()
    const items = await db.transaction_items.toArray()
    const users = await db.users.toArray()
    const userMap = Object.fromEntries(users.map(u => [u.id, u]))
    return txs.map(t => ({
      ...t,
      items: items.filter(i => i.transaction_id === t.id),
      cashier: userMap[t.cashier_id],
    }))
  }, [STORE_ID, dateRange])

  const stats = useMemo(() => {
    if (!transactions) return null
    const total     = transactions.reduce((s, t) => s + t.total, 0)
    const count     = transactions.length
    const avgTrx    = count > 0 ? total / count : 0
    const byMethod  = transactions.reduce((acc, t) => {
      acc[t.payment_method] = (acc[t.payment_method] || 0) + t.total
      return acc
    }, {} as Record<string, number>)

    // Per produk
    const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {}
    for (const t of transactions) {
      for (const i of t.items) {
        if (!prodMap[i.product_id]) prodMap[i.product_id] = { name: i.product_name, qty: 0, revenue: 0 }
        prodMap[i.product_id].qty     += i.qty_eceran + (i.qty_dus || 0)
        prodMap[i.product_id].revenue += i.subtotal
      }
    }
    const topProducts = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

    // Per kasir
    const kasirMap: Record<string, { name: string; trx: number; revenue: number }> = {}
    for (const t of transactions) {
      const id = t.cashier_id
      if (!kasirMap[id]) kasirMap[id] = { name: t.cashier?.name || id, trx: 0, revenue: 0 }
      kasirMap[id].trx++
      kasirMap[id].revenue += t.total
    }
    const byCashier = Object.values(kasirMap).sort((a, b) => b.revenue - a.revenue)

    return { total, count, avgTrx, byMethod, topProducts, byCashier }
  }, [transactions])

  const periodLabel = { hari: 'Hari Ini', minggu: '7 Hari Terakhir', bulan: 'Bulan Ini' }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900 mb-3">Laporan</h1>
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
        {!stats ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat...</div>
        ) : stats.count === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
            <p className="text-sm text-gray-400">Belum ada transaksi {periodLabel[period].toLowerCase()}</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-green-500" />
                  <p className="text-xs text-gray-400">Total Omzet</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatRupiah(stats.total)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingBag size={16} className="text-blue-500" />
                  <p className="text-xs text-gray-400">Total Transaksi</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.count}</p>
                <p className="text-xs text-gray-400 mt-0.5">Rata-rata {formatRupiah(stats.avgTrx)}</p>
              </div>
            </div>

            {/* Metode bayar */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Metode Pembayaran</p>
              <div className="space-y-2">
                {Object.entries(stats.byMethod).map(([method, amount]) => {
                  const pct = stats.total > 0 ? (amount / stats.total) * 100 : 0
                  const label = method === 'cash' ? 'Tunai' : method === 'qris' ? 'QRIS' : 'Transfer'
                  return (
                    <div key={method}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{label}</span>
                        <span className="font-medium text-gray-900">{formatRupiah(amount)}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-gray-900 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top produk */}
            {stats.topProducts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Produk Terlaris</p>
                </div>
                {stats.topProducts.map((p, idx) => (
                  <div key={p.name} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <span className="text-xs text-gray-400 w-5 flex-shrink-0">{idx + 1}</span>
                    <p className="flex-1 text-sm text-gray-800 truncate ml-2">{p.name}</p>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{formatRupiah(p.revenue)}</p>
                      <p className="text-xs text-gray-400">{p.qty} pcs</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Per kasir */}
            {stats.byCashier.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                  <Users size={14} className="text-gray-400" />
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Per Kasir</p>
                </div>
                {stats.byCashier.map((k, idx) => (
                  <div key={k.name} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
                      {k.name[0]?.toUpperCase()}
                    </div>
                    <p className="flex-1 text-sm text-gray-800 ml-2.5">{k.name}</p>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{formatRupiah(k.revenue)}</p>
                      <p className="text-xs text-gray-400">{k.trx} transaksi</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* List transaksi */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Riwayat Transaksi</p>
              </div>
              {transactions?.slice(0, 50).map((t, idx) => (
                <div key={t.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 font-mono">{t.receipt_no}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{t.cashier?.name || '-'}
                      {' · '}{t.payment_method === 'cash' ? 'Tunai' : t.payment_method.toUpperCase()}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(t.total)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
