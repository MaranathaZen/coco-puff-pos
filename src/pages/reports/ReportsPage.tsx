// src/pages/reports/ReportsPage.tsx
// CHANGELOG v2:
// - FEAT: Export Excel (.xlsx) dan PDF — tombol di header
// Laporan lengkap: per toko, per divisi, per periode

import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { exportExcel, exportPDF, type LaporanData } from '@/hooks/useExportLaporan'
import { RefreshCw, TrendingUp, ShoppingBag, Package, Receipt, FlaskConical, FileSpreadsheet, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

type Period = 'hari' | 'minggu' | 'bulan' | 'custom'
type DivisiTab = 'ringkasan' | 'penjualan' | 'gudang' | 'produksi' | 'biaya'

export default function ReportsPage() {
  const { user } = useAuthStore()
  const [period,      setPeriod]      = useState<Period>('bulan')
  const [divTab,      setDivTab]      = useState<DivisiTab>('ringkasan')
  const [storeFilter, setStoreFilter] = useState('semua')
  const [customFrom,  setCustomFrom]  = useState('')
  const [customTo,    setCustomTo]    = useState('')
  const [syncing,     setSyncing]     = useState(false)
  const [exporting,   setExporting]   = useState(false)

  const isGudang = user?.role === 'gudang'

  async function syncAll() {
    setSyncing(true)
    try {
      const [txRes, storesRes, matsRes, wsRes, purRes, expRes, mutRes, mutItemRes, prodRes, fgsRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('status','completed'),
        supabase.from('stores').select('*').eq('is_active', true),
        supabase.from('materials').select('*'),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('purchases').select('*'),
        supabase.from('warehouse_expenses').select('*'),
        supabase.from('warehouse_mutations').select('*'),
        supabase.from('warehouse_mutation_items').select('*'),
        supabase.from('production_logs').select('*'),
        supabase.from('finished_goods_stock').select('*'),
      ])
      if (txRes.data?.length)      await db.transactions.bulkPut(txRes.data)
      if (storesRes.data?.length)  await db.stores.bulkPut(storesRes.data)
      if (matsRes.data?.length)    await db.materials.bulkPut(matsRes.data)
      if (wsRes.data?.length)      await db.warehouse_stock.bulkPut(wsRes.data)
      if (purRes.data?.length)     await db.purchases.bulkPut(purRes.data)
      if (expRes.data?.length)     await db.warehouse_expenses.bulkPut(expRes.data)
      if (mutRes.data?.length)     await db.warehouse_mutations.bulkPut(mutRes.data)
      if (mutItemRes.data?.length) await db.warehouse_mutation_items.bulkPut(mutItemRes.data)
      if (prodRes.data?.length)    await db.production_logs.bulkPut(prodRes.data)
      if (fgsRes.data?.length)     await db.finished_goods_stock.bulkPut(fgsRes.data)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  const dateRange = useMemo(() => {
    const now = new Date()
    const end = new Date(now); end.setHours(23,59,59,999)
    const start = new Date(now)
    if (period === 'hari')   start.setHours(0,0,0,0)
    if (period === 'minggu') { start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
    if (period === 'bulan')  { start.setDate(1); start.setHours(0,0,0,0) }
    if (period === 'custom' && customFrom && customTo) {
      return { start: new Date(customFrom).toISOString(), end: new Date(customTo + 'T23:59:59').toISOString() }
    }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [period, customFrom, customTo])

  const periodLabel: Record<Period, string> = {
    hari: 'Hari Ini', minggu: '7 Hari Terakhir',
    bulan: `Bulan ${new Date().toLocaleDateString('id-ID',{month:'long',year:'numeric'})}`,
    custom: customFrom && customTo ? `${customFrom} s/d ${customTo}` : 'Custom',
  }

  const stores       = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])
  const transactions = useLiveQuery(async () =>
    db.transactions.filter(t =>
      t.status === 'completed' && t.created_at >= dateRange.start && t.created_at <= dateRange.end &&
      (storeFilter === 'semua' || t.store_id === storeFilter)
    ).toArray()
  , [dateRange, storeFilter])
  const purchases    = useLiveQuery(async () =>
    db.purchases.filter(p => p.created_at >= dateRange.start && p.created_at <= dateRange.end).toArray()
  , [dateRange])
  const expenses     = useLiveQuery(async () =>
    db.warehouse_expenses.filter(e => e.created_at >= dateRange.start && e.created_at <= dateRange.end).toArray()
  , [dateRange])
  const productionLogs = useLiveQuery(async () =>
    db.production_logs.filter(l => l.created_at >= dateRange.start && l.created_at <= dateRange.end).toArray()
  , [dateRange])
  const materials      = useLiveQuery(() => db.materials.toArray(), [])
  const warehouseStock = useLiveQuery(() => db.warehouse_stock.toArray(), [])
  const fgStocks       = useLiveQuery(() => db.finished_goods_stock.toArray(), [])

  const summary = useMemo(() => {
    const totalOmzet    = (transactions || []).reduce((s, t) => s + t.total, 0)
    const totalTrx      = (transactions || []).length
    const totalBeli     = (purchases    || []).reduce((s, p) => s + p.total_amount, 0)
    const totalBiaya    = (expenses     || []).reduce((s, e) => s + e.amount, 0)
    const totalProduksi = (productionLogs || []).reduce((s, l) => s + l.total_yield, 0)
    const nilaiStok     = (materials || []).reduce((s, m) => {
      const ws = (warehouseStock || []).find(w => w.material_id === m.id)
      return s + (ws?.qty_on_hand || 0) * (m.unit_cost || 0)
    }, 0)
    const labaKotor = totalOmzet - totalBeli - totalBiaya
    return { totalOmzet, totalTrx, totalBeli, totalBiaya, totalProduksi, nilaiStok, labaKotor }
  }, [transactions, purchases, expenses, productionLogs, materials, warehouseStock])

  const storeStats = useMemo(() => {
    if (!stores || !transactions) return []
    return stores.map(store => {
      const storeTxs = (transactions || []).filter(t => t.store_id === store.id)
      return { store, omzet: storeTxs.reduce((s,t) => s+t.total, 0), count: storeTxs.length }
    }).sort((a, b) => b.omzet - a.omzet)
  }, [stores, transactions])

  const byMethod = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of transactions || []) map[t.payment_method] = (map[t.payment_method] || 0) + t.total
    return map
  }, [transactions])

  const byExpenseCat = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of expenses || []) map[e.category] = (map[e.category] || 0) + e.amount
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  const methodLabels: Record<string, string> = {
    cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer',
    gopay: 'GoPay/GoFood', grab: 'GrabFood', shopeefood: 'ShopeeFood',
  }
  const katLabel: Record<string, string> = {
    beban_bahan_baku: 'Bahan Baku', beban_tenaga_kerja: 'Tenaga Kerja',
    beban_sewa: 'Sewa', beban_utilitas: 'Utilitas', beban_packaging: 'Packaging',
    beban_transport: 'Transport', beban_pemasaran: 'Pemasaran', beban_lainnya: 'Lainnya',
  }

  // ── Build LaporanData untuk export ───────────────────────
  function buildLaporanData(): LaporanData {
    return {
      periode: periodLabel[period],
      totalOmzet:  summary.totalOmzet,
      totalTrx:    summary.totalTrx,
      totalBeli:   summary.totalBeli,
      totalBiaya:  summary.totalBiaya,
      nilaiStok:   summary.nilaiStok,
      labaKotor:   summary.labaKotor,
      storeStats:  storeStats.map(s => ({
        nama: s.store.name, kota: s.store.city || '', omzet: s.omzet, count: s.count,
      })),
      byMethod,
      byExpenseCat,
      expenses: (expenses || []).map(e => ({
        nama: e.name, kategori: katLabel[e.category] || e.category,
        tanggal: new Date(e.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' }),
        jumlah: e.amount,
      })),
      stokGudang: (materials || [])
        .filter(m => m.is_active)
        .map(m => {
          const ws  = (warehouseStock || []).find(w => w.material_id === m.id)
          const qty = ws?.qty_on_hand || 0
          return { nama: m.name, qty, unit: m.unit, avgCost: m.unit_cost || 0, nilai: qty * (m.unit_cost || 0) }
        })
        .sort((a, b) => b.nilai - a.nilai),
      totalProduksi: summary.totalProduksi,
      stokProdukJadi: (fgStocks || []).map(f => ({
        nama: f.product_name, qty: f.qty_on_hand, hppPerUnit: (f as any).hpp_per_unit || 0,
      })),
    }
  }

  async function handleExportExcel() {
    setExporting(true)
    try {
      exportExcel(buildLaporanData())
      toast.success('File Excel didownload')
    } catch (e) { toast.error('Gagal export: ' + String(e)) }
    finally { setExporting(false) }
  }

  function handleExportPDF() {
    exportPDF(buildLaporanData())
  }

  const divTabs: { id: DivisiTab; label: string; icon: any; hidden?: boolean }[] = [
    { id: 'ringkasan', label: 'Ringkasan', icon: TrendingUp },
    { id: 'penjualan', label: 'Penjualan', icon: ShoppingBag, hidden: isGudang },
    { id: 'gudang',    label: 'Gudang',    icon: Package },
    { id: 'produksi',  label: 'Produksi',  icon: FlaskConical, hidden: isGudang },
    { id: 'biaya',     label: 'Biaya',     icon: Receipt },
  ].filter(t => !t.hidden)

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900">Laporan</h1>
          <div className="flex items-center gap-2">
            {/* Export buttons */}
            <button onClick={handleExportExcel} disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 disabled:opacity-50">
              <FileSpreadsheet size={13} />
              <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Excel'}</span>
            </button>
            <button onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100">
              <FileText size={13} />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={syncAll} disabled={syncing} className="p-2 text-gray-400 rounded-full">
              <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
            </button>
          </div>
        </div>

        {/* Period filter */}
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          {(['hari','minggu','bulan','custom'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${period===p?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
              {p === 'hari' ? 'Hari Ini' : p === 'minggu' ? '7 Hari' : p === 'bulan' ? 'Bulan Ini' : 'Custom'}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex gap-2 mb-3">
            <input type="date" className="input flex-1 text-xs" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="self-center text-xs text-gray-400">s/d</span>
            <input type="date" className="input flex-1 text-xs" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}

        {!isGudang && stores && stores.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            <button onClick={() => setStoreFilter('semua')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${storeFilter==='semua'?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              Semua Toko
            </button>
            {stores.map(s => (
              <button key={s.id} onClick={() => setStoreFilter(s.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${storeFilter===s.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divisi tabs */}
      <div className="bg-white border-b border-gray-100 flex flex-shrink-0 overflow-x-auto scrollbar-hide">
        {divTabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setDivTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${divTab===t.id?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* ── RINGKASAN ── */}
        {divTab === 'ringkasan' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {!isGudang && (
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Omzet</p>
                  <p className="text-lg font-bold text-gray-900">{formatRupiah(summary.totalOmzet)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{summary.totalTrx} transaksi</p>
                </div>
              )}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-1">Total Pembelian</p>
                <p className="text-lg font-bold text-gray-900">{formatRupiah(summary.totalBeli)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-1">Total Biaya</p>
                <p className="text-lg font-bold text-gray-900">{formatRupiah(summary.totalBiaya)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-1">Nilai Stok Gudang</p>
                <p className="text-lg font-bold text-gray-900">{formatRupiah(summary.nilaiStok)}</p>
              </div>
              {!isGudang && (
                <div className={`col-span-2 rounded-xl border p-4 ${summary.labaKotor>=0?'bg-green-50 border-green-100':'bg-red-50 border-red-100'}`}>
                  <p className={`text-xs mb-1 ${summary.labaKotor>=0?'text-green-600':'text-red-500'}`}>Laba Kotor (Omzet - Beli - Biaya)</p>
                  <p className={`text-xl font-bold ${summary.labaKotor>=0?'text-green-700':'text-red-600'}`}>{formatRupiah(summary.labaKotor)}</p>
                </div>
              )}
            </div>
            {!isGudang && storeStats.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Omzet per Toko</p>
                {storeStats.map((s, idx) => {
                  const pct = summary.totalOmzet > 0 ? (s.omzet / summary.totalOmzet) * 100 : 0
                  return (
                    <div key={s.store.id} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.store.name}</p>
                          <p className="text-xs text-gray-400">{s.store.city} · {s.count} transaksi</p>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{formatRupiah(s.omzet)}</p>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1">
                        <div className="bg-gray-900 h-1 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── PENJUALAN ── */}
        {divTab === 'penjualan' && !isGudang && (
          <>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Omzet</p>
              <p className="text-2xl font-bold text-gray-900">{formatRupiah(summary.totalOmzet)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{summary.totalTrx} transaksi</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Per Metode Bayar</p>
              {Object.entries(byMethod).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([k,v],idx)=>(
                <div key={k} className={`flex items-center justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                  <p className="text-sm text-gray-700">{methodLabels[k]||k}</p>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatRupiah(v)}</p>
                    <p className="text-xs text-gray-400">{summary.totalOmzet>0?((v/summary.totalOmzet)*100).toFixed(1):0}%</p>
                  </div>
                </div>
              ))}
              {Object.keys(byMethod).length===0&&<div className="py-8 text-center text-sm text-gray-400">Belum ada data transaksi</div>}
            </div>
            {storeStats.length>1&&storeFilter==='semua'&&(
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Per Toko</p>
                {storeStats.map((s,idx)=>(
                  <div key={s.store.id} className={`flex items-center justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                    <div><p className="text-sm font-medium text-gray-900">{s.store.name}</p><p className="text-xs text-gray-400">{s.count} transaksi</p></div>
                    <p className="text-sm font-semibold text-gray-900">{formatRupiah(s.omzet)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── GUDANG ── */}
        {divTab === 'gudang' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-1">Total Pembelian</p>
                <p className="text-lg font-bold text-gray-900">{formatRupiah(summary.totalBeli)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(purchases||[]).length} PO</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-1">Nilai Stok</p>
                <p className="text-lg font-bold text-gray-900">{formatRupiah(summary.nilaiStok)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(materials||[]).filter(m=>m.is_active).length} jenis</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Stok Gudang Saat Ini</p>
              {(materials||[]).map(m=>{const ws=(warehouseStock||[]).find(w=>w.material_id===m.id);const qty=ws?.qty_on_hand||0;return{...m,qty,nilai:qty*(m.unit_cost||0)}}).filter(m=>m.is_active).sort((a,b)=>b.nilai-a.nilai).slice(0,20).map((m,idx)=>(
                <div key={m.id} className={`flex items-center justify-between px-4 py-2.5 ${idx!==0?'border-t border-gray-50':''} ${m.qty<=m.min_stock&&m.min_stock>0?'bg-red-50/30':''}`}>
                  <div><p className="text-sm text-gray-900">{m.name}</p><p className="text-xs text-gray-400">Avg {formatRupiah(m.unit_cost||0)}/{m.unit}</p></div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${m.qty<=m.min_stock&&m.min_stock>0?'text-red-500':'text-gray-900'}`}>{m.qty} {m.unit}</p>
                    <p className="text-xs text-gray-400">{formatRupiah(m.nilai)}</p>
                  </div>
                </div>
              ))}
              {(materials||[]).length===0&&<div className="py-8 text-center text-sm text-gray-400">Belum ada data bahan</div>}
            </div>
          </>
        )}

        {/* ── PRODUKSI ── */}
        {divTab === 'produksi' && !isGudang && (
          <>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Produksi</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalProduksi} pcs</p>
              <p className="text-xs text-gray-400 mt-0.5">{(productionLogs||[]).length} batch</p>
            </div>
            <ProductionStokSection />
          </>
        )}

        {/* ── BIAYA ── */}
        {divTab === 'biaya' && (
          <>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Biaya</p>
              <p className="text-2xl font-bold text-gray-900">{formatRupiah(summary.totalBiaya)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{(expenses||[]).length} item</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Per Kategori</p>
              {byExpenseCat.map(([k,v],idx)=>(
                <div key={k} className={`flex items-center justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                  <p className="text-sm text-gray-700">{katLabel[k]||k}</p>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatRupiah(v)}</p>
                    <p className="text-xs text-gray-400">{summary.totalBiaya>0?((v/summary.totalBiaya)*100).toFixed(1):0}%</p>
                  </div>
                </div>
              ))}
              {byExpenseCat.length===0&&<div className="py-8 text-center text-sm text-gray-400">Belum ada data biaya</div>}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Detail Biaya</p>
              {(expenses||[]).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map((e,idx)=>(
                <div key={e.id} className={`flex items-center justify-between px-4 py-2.5 ${idx!==0?'border-t border-gray-50':''}`}>
                  <div>
                    <p className="text-sm text-gray-900">{e.name}</p>
                    <p className="text-xs text-gray-400">{katLabel[e.category]||e.category} · {new Date(e.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{formatRupiah(e.amount)}</p>
                </div>
              ))}
              {(expenses||[]).length===0&&<div className="py-8 text-center text-sm text-gray-400">Belum ada data biaya</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ProductionStokSection() {
  const fgStocks = useLiveQuery(() => db.finished_goods_stock.toArray(), [])
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Stok Produk Jadi</p>
      {(fgStocks||[]).map((f,idx)=>(
        <div key={f.id} className={`flex items-center justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
          <p className="text-sm text-gray-900">{f.product_name}</p>
          <div className="text-right">
            <p className="text-sm font-bold text-blue-600">{f.qty_on_hand} pcs</p>
            {(f as any).hpp_per_unit>0&&<p className="text-xs text-gray-400">HPP {formatRupiah((f as any).hpp_per_unit)}/pcs</p>}
          </div>
        </div>
      ))}
      {(fgStocks||[]).length===0&&<div className="py-8 text-center text-sm text-gray-400">Belum ada produk jadi</div>}
    </div>
  )
}
