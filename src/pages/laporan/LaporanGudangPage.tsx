// src/pages/laporan/LaporanGudangPage.tsx
// Laporan gudang — simple & fokus
import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Package, ShoppingCart, ArrowRightLeft, Receipt, TrendingDown } from 'lucide-react'

type Period = 'hari' | 'minggu' | 'bulan'

export default function LaporanGudangPage() {
  const { user } = useAuthStore()
  const [period, setPeriod] = useState<Period>('bulan')

  const dateRange = useMemo(() => {
    const now = new Date()
    const end = new Date(now); end.setHours(23,59,59,999)
    const start = new Date(now)
    if (period === 'hari')   start.setHours(0,0,0,0)
    if (period === 'minggu') { start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
    if (period === 'bulan')  { start.setDate(1); start.setHours(0,0,0,0) }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [period])

  // Stok saat ini
  const stokData = useLiveQuery(async () => {
    const mats   = await db.materials.filter(m => m.is_active).toArray()
    const stocks = await db.warehouse_stock.toArray()
    const sMap   = Object.fromEntries(stocks.map(s => [s.material_id, s.qty_on_hand]))
    const items  = mats.map(m => ({
      ...m, qty: sMap[m.id] ?? 0,
      nilai: (sMap[m.id] ?? 0) * (m.unit_cost || 0)
    }))
    const totalNilai = items.reduce((s, i) => s + i.nilai, 0)
    const lowStock   = items.filter(i => i.qty <= i.min_stock)
    return { items, totalNilai, lowStock }
  }, [])

  // Pembelian dalam periode
  const pembelianData = useLiveQuery(async () => {
    const purchases = await db.purchases
      .filter(p => (p as any).status !== 'voided' && p.created_at >= dateRange.start && p.created_at <= dateRange.end)
      .toArray()
    const items = await db.purchase_items.toArray()
    const mats  = await db.materials.toArray()
    const sups  = await db.suppliers.toArray()
    const mMap  = Object.fromEntries(mats.map(m => [m.id, m]))
    const supMap = Object.fromEntries(sups.map(s => [s.id, s]))

    const total = purchases.reduce((s, p) => s + p.total_amount, 0)

    // Per bahan
    const bahanMap: Record<string, { name: string; qty: number; nilai: number; unit: string }> = {}
    for (const p of purchases) {
      const pItems = items.filter(i => i.purchase_id === p.id)
      for (const i of pItems) {
        const mat = mMap[i.material_id]
        if (!bahanMap[i.material_id]) bahanMap[i.material_id] = { name: mat?.name || '-', qty: 0, nilai: 0, unit: mat?.unit || '' }
        bahanMap[i.material_id].qty   += i.qty
        bahanMap[i.material_id].nilai += i.subtotal
      }
    }
    const topBahan = Object.values(bahanMap).sort((a, b) => b.nilai - a.nilai).slice(0, 10)
    return { total, count: purchases.length, topBahan }
  }, [dateRange])

  // Mutasi dalam periode
  const mutasiData = useLiveQuery(async () => {
    const muts = await db.warehouse_mutations
      .filter(m => (m as any).status !== 'voided' && m.created_at >= dateRange.start && m.created_at <= dateRange.end && m.mutation_type !== 'internal_use')
      .toArray()
    const items = await db.warehouse_mutation_items.toArray()

    // Group by type
    const byType: Record<string, number> = {}
    let totalNilai = 0
    for (const m of muts) {
      const mItems = items.filter(i => i.mutation_id === m.id)
      const nilai = mItems.reduce((s, i) => s + i.qty * i.unit_cost, 0)
      byType[m.mutation_type] = (byType[m.mutation_type] || 0) + nilai
      totalNilai += nilai
    }
    return { totalNilai, count: muts.length, byType }
  }, [dateRange])

  // Pemakaian dalam periode
  const pemakaianData = useLiveQuery(async () => {
    const muts = await db.warehouse_mutations
      .filter(m => (m as any).status !== 'voided' && m.created_at >= dateRange.start && m.created_at <= dateRange.end && m.mutation_type === 'internal_use')
      .toArray()
    const items = await db.warehouse_mutation_items.toArray()
    const total = muts.reduce((s, m) => {
      return s + items.filter(i => i.mutation_id === m.id).reduce((ss, i) => ss + i.qty * i.unit_cost, 0)
    }, 0)
    return { total, count: muts.length }
  }, [dateRange])

  // Biaya dalam periode
  const biayaData = useLiveQuery(async () => {
    const expenses = await db.warehouse_expenses
      .filter(e => (e as any).status !== 'voided' && e.created_at >= dateRange.start && e.created_at <= dateRange.end)
      .toArray()
    const total = expenses.reduce((s, e) => s + e.amount, 0)
    const byKat: Record<string, number> = {}
    for (const e of expenses) {
      byKat[e.category] = (byKat[e.category] || 0) + e.amount
    }
    return { total, count: expenses.length, byKat }
  }, [dateRange])

  const periodLabel = { hari: 'Hari Ini', minggu: '7 Hari', bulan: 'Bulan Ini' }

  const katLabel: Record<string, string> = {
    beban_bahan_baku: 'Bahan Baku', beban_tenaga_kerja: 'Tenaga Kerja',
    beban_sewa: 'Sewa', beban_utilitas: 'Utilitas',
    beban_packaging: 'Packaging', beban_transport: 'Transport',
    beban_pemasaran: 'Pemasaran', beban_lainnya: 'Lainnya',
  }

  const mutLabel: Record<string, string> = {
    to_production: 'ke Produksi', to_store: 'ke Toko',
    to_partner: 'ke Franchise', adjustment: 'Retur', opening_stock: 'Stok Awal',
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-4 pt-4 pb-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900 mb-3">Laporan Gudang</h1>
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

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Package size={13} className="text-blue-500" />
              <p className="text-xs text-gray-400">Nilai Stok</p>
            </div>
            <p className="text-base font-semibold text-gray-900">{formatRupiah(stokData?.totalNilai || 0)}</p>
            {stokData?.lowStock && stokData.lowStock.length > 0 && (
              <p className="text-xs text-red-500 mt-0.5">{stokData.lowStock.length} item rendah</p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ShoppingCart size={13} className="text-green-500" />
              <p className="text-xs text-gray-400">Pembelian</p>
            </div>
            <p className="text-base font-semibold text-gray-900">{formatRupiah(pembelianData?.total || 0)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{pembelianData?.count || 0} transaksi</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowRightLeft size={13} className="text-purple-500" />
              <p className="text-xs text-gray-400">Mutasi</p>
            </div>
            <p className="text-base font-semibold text-gray-900">{formatRupiah(mutasiData?.totalNilai || 0)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{mutasiData?.count || 0} mutasi</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Receipt size={13} className="text-orange-500" />
              <p className="text-xs text-gray-400">Biaya</p>
            </div>
            <p className="text-base font-semibold text-gray-900">{formatRupiah(biayaData?.total || 0)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{biayaData?.count || 0} pos biaya</p>
          </div>
        </div>

        {/* Stok per item — top 10 by nilai */}
        {stokData && stokData.items.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stok Gudang (Nilai Tertinggi)</p>
            </div>
            {stokData.items
              .filter(i => i.qty > 0)
              .sort((a, b) => b.nilai - a.nilai)
              .slice(0, 10)
              .map((item, idx) => (
                <div key={item.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">Avg {formatRupiah(item.unit_cost || 0)}/{item.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{formatRupiah(item.nilai)}</p>
                    <p className="text-xs text-gray-400">{item.qty} {item.unit}</p>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Pembelian per bahan */}
        {pembelianData && pembelianData.topBahan.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pembelian per Bahan</p>
            </div>
            {pembelianData.topBahan.map((b, idx) => (
              <div key={b.name} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{b.name}</p>
                  <p className="text-xs text-gray-400">{b.qty} {b.unit}</p>
                </div>
                <p className="text-sm font-medium text-gray-900">{formatRupiah(b.nilai)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Mutasi breakdown */}
        {mutasiData && Object.keys(mutasiData.byType).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mutasi per Tujuan</p>
            </div>
            {Object.entries(mutasiData.byType).map(([type, nilai], idx) => (
              <div key={type} className={`flex items-center justify-between px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                <p className="text-sm text-gray-700">{mutLabel[type] || type}</p>
                <p className="text-sm font-medium text-gray-900">{formatRupiah(nilai)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Biaya breakdown */}
        {biayaData && Object.keys(biayaData.byKat).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Biaya per Kategori</p>
            </div>
            {Object.entries(biayaData.byKat)
              .sort(([,a],[,b]) => b - a)
              .map(([kat, nilai], idx) => {
                const pct = biayaData.total > 0 ? (nilai / biayaData.total) * 100 : 0
                return (
                  <div key={kat} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{katLabel[kat] || kat}</span>
                      <span className="font-medium text-gray-900">{formatRupiah(nilai)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1">
                      <div className="bg-gray-900 h-1 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            <div className="flex justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-sm font-medium text-gray-700">Total Biaya</span>
              <span className="text-sm font-semibold text-gray-900">{formatRupiah(biayaData.total)}</span>
            </div>
          </div>
        )}

        {/* Pemakaian */}
        {pemakaianData && pemakaianData.count > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown size={16} className="text-amber-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">Pemakaian Internal</p>
                <p className="text-xs text-gray-400">{pemakaianData.count} catatan</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-gray-900">{formatRupiah(pemakaianData.total)}</p>
          </div>
        )}

      </div>
    </div>
  )
}
