// src/pages/owner/OwnerPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { formatRupiah } from '@/lib/utils'
import { RefreshCw, AlertCircle, ChevronRight, ChevronDown } from 'lucide-react'

interface StoreSummary { store_id: string; store_name: string; total_trx: number; total_omzet: number }
interface LowStockItem { name: string; qty: number; unit: string; min_stock: number }
interface ProductionSummary { total_yield: number; batch_count: number; recipe_name: string }

function SectionHeader({ title, expanded, onToggle }: { title: string; expanded: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between py-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      <ChevronDown size={14} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
  )
}

export default function OwnerPage() {
  const navigate = useNavigate()
  const [summaries, setSummaries]     = useState<StoreSummary[]>([])
  const [lowStock, setLowStock]       = useState<LowStockItem[]>([])
  const [produksi, setProduksi]       = useState<ProductionSummary[]>([])
  const [biayaBulanIni, setBiaya]     = useState(0)
  const [totalPembelian, setPembelian]= useState(0)
  const [loading, setLoading]         = useState(true)

  // Section expanded state
  const [secDashboard, setSecDash]  = useState(true)
  const [secGudang, setSecGudang]   = useState(true)
  const [secProduksi, setSecProd]   = useState(true)
  const [secToko, setSecToko]       = useState(true)
  const [secSetting, setSecSetting] = useState(false)

  const [showLowStock, setShowLow]  = useState(false)

  const today    = new Date().toISOString().slice(0, 10)
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  async function fetchAll() {
    setLoading(true)
    try {
      await Promise.all([fetchSales(), fetchLowStock(), fetchProduksi(), fetchBiaya(), fetchPembelian()])
    } finally { setLoading(false) }
  }

  async function fetchSales() {
    const { data: stores } = await supabase.from('stores').select('id, name').eq('is_active', true)
    if (!stores) return
    const results: StoreSummary[] = []
    for (const store of stores) {
      const { data: txs } = await supabase.from('transactions')
        .select('total').eq('store_id', store.id).eq('status', 'completed')
        .gte('created_at', today + 'T00:00:00')
      results.push({ store_id: store.id, store_name: store.name, total_trx: txs?.length || 0, total_omzet: txs?.reduce((s, t) => s + t.total, 0) || 0 })
    }
    setSummaries(results)
  }

  async function fetchLowStock() {
    const mats = await db.materials.filter(m => m.is_active).toArray()
    const stocks = await db.warehouse_stock.toArray()
    const stockMap = Object.fromEntries(stocks.map(s => [s.material_id, s]))
    setLowStock(mats.map(m => ({ name: m.name, qty: stockMap[m.id]?.qty_on_hand ?? 0, unit: m.unit, min_stock: m.min_stock })).filter(m => m.qty <= m.min_stock).sort((a, b) => a.qty - b.qty))
  }

  async function fetchProduksi() {
    const { data: logs } = await supabase.from('production_logs').select('*, production_recipes(name)').gte('created_at', today + 'T00:00:00')
    if (!logs) return
    setProduksi(logs.map((l: any) => ({ total_yield: l.total_yield, batch_count: l.batch_count, recipe_name: l.production_recipes?.name || '-' })))
  }

  async function fetchBiaya() {
    const { data } = await supabase.from('warehouse_expenses').select('amount').gte('expense_date', firstDay).lte('expense_date', today)
    setBiaya(data?.reduce((s, e) => s + e.amount, 0) || 0)
  }

  async function fetchPembelian() {
    const { data } = await supabase.from('purchases').select('total_amount').gte('created_at', firstDay + 'T00:00:00')
    setPembelian(data?.reduce((s, p) => s + p.total_amount, 0) || 0)
  }

  useEffect(() => { fetchAll() }, [])

  const grandOmzet    = summaries.reduce((s, r) => s + r.total_omzet, 0)
  const grandTrx      = summaries.reduce((s, r) => s + r.total_trx, 0)
  const totalProduksi = produksi.reduce((s, p) => s + p.total_yield, 0)

  const settingLinks = [
    { label: 'Kelola User',     path: '/pengaturan' },
    { label: 'Supplier',        path: '/pengaturan' },
    { label: 'Franchise',       path: '/pengaturan' },
    { label: 'Konfigurasi Menu',path: '/pengaturan' },
  ]

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button onClick={fetchAll} className="p-2 rounded-full text-gray-400">
          <RefreshCw size={16} className={loading ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 mt-3">
        <div className="px-4 pb-6 space-y-1">

          {/* ── SECTION: DASHBOARD ── */}
          <SectionHeader title="Dashboard" expanded={secDashboard} onToggle={() => setSecDash(!secDashboard)} />
          {secDashboard && (
            <div className="space-y-2 pb-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">Omzet Hari Ini</p>
                  <p className="text-lg font-semibold text-gray-900 mt-0.5">{formatRupiah(grandOmzet)}</p>
                  <p className="text-xs text-gray-400">{grandTrx} transaksi</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">Rata-rata/Trx</p>
                  <p className="text-lg font-semibold text-gray-900 mt-0.5">{formatRupiah(grandTrx > 0 ? grandOmzet / grandTrx : 0)}</p>
                  <p className="text-xs text-gray-400">hari ini</p>
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION: GUDANG ── */}
          <SectionHeader title="Gudang" expanded={secGudang} onToggle={() => setSecGudang(!secGudang)} />
          {secGudang && (
            <div className="space-y-2 pb-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">Pembelian Bulan Ini</p>
                  <p className="text-base font-semibold text-gray-900 mt-0.5">{formatRupiah(totalPembelian)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">Biaya Operasional</p>
                  <p className="text-base font-semibold text-gray-900 mt-0.5">{formatRupiah(biayaBulanIni)}</p>
                  <p className="text-xs text-gray-400">bulan ini</p>
                </div>
              </div>

              {lowStock.length > 0 && (
                <button onClick={() => setShowLow(!showLowStock)}
                  className="w-full bg-white rounded-xl border border-red-100 overflow-hidden text-left">
                  <div className="px-4 py-3 flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-700">{lowStock.length} item stok rendah</p>
                      <p className="text-xs text-red-400 truncate">{lowStock.map(s => s.name).join(', ')}</p>
                    </div>
                    <ChevronRight size={14} className={`text-gray-300 transition-transform ${showLowStock ? 'rotate-90' : ''}`} />
                  </div>
                  {showLowStock && (
                    <div className="border-t border-red-50">
                      {lowStock.map((s, i) => (
                        <div key={i} className={`px-4 py-2 flex justify-between ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                          <p className="text-sm text-gray-800">{s.name}</p>
                          <p className="text-sm font-medium text-red-500">{s.qty}/{s.min_stock} {s.unit}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              )}

              <button onClick={() => navigate('/gudang')}
                className="w-full bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-700">Buka Gudang</p>
                <ChevronRight size={14} className="text-gray-300" />
              </button>
            </div>
          )}

          {/* ── SECTION: PRODUKSI ── */}
          <SectionHeader title="Produksi" expanded={secProduksi} onToggle={() => setSecProd(!secProduksi)} />
          {secProduksi && (
            <div className="space-y-2 pb-2">
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <p className="text-xs text-gray-400">Produksi Hari Ini</p>
                <p className="text-lg font-semibold text-gray-900 mt-0.5">{totalProduksi} pcs</p>
                <p className="text-xs text-gray-400">{produksi.length} batch</p>
              </div>

              {produksi.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {produksi.map((p, idx) => (
                    <div key={idx} className={`px-4 py-2.5 flex justify-between ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                      <p className="text-sm text-gray-800">{p.recipe_name}</p>
                      <p className="text-sm font-medium text-gray-900">{p.total_yield} pcs</p>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => navigate('/produksi')}
                className="w-full bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-700">Buka Produksi</p>
                <ChevronRight size={14} className="text-gray-300" />
              </button>
            </div>
          )}

          {/* ── SECTION: TOKO / OUTLET ── */}
          <SectionHeader title="Toko / Outlet" expanded={secToko} onToggle={() => setSecToko(!secToko)} />
          {secToko && (
            <div className="pb-2">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {loading ? (
                  <div className="py-8 text-center text-sm text-gray-400">Memuat...</div>
                ) : summaries.map((s, idx) => (
                  <div key={s.store_id} className={`px-4 py-3 flex items-center justify-between ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.store_name}</p>
                      <p className="text-xs text-gray-400">{s.total_trx} transaksi</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{formatRupiah(s.total_omzet)}</p>
                  </div>
                ))}
                {!loading && summaries.every(s => s.total_omzet === 0) && (
                  <div className="px-4 py-4 text-center text-sm text-gray-400">Belum ada transaksi hari ini</div>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION: SETTING ── */}
          <SectionHeader title="Setting" expanded={secSetting} onToggle={() => setSecSetting(!secSetting)} />
          {secSetting && (
            <div className="pb-2">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {settingLinks.map((s, idx) => (
                  <button key={idx} onClick={() => navigate(s.path)}
                    className={`w-full px-4 py-3 flex items-center justify-between text-left active:bg-gray-50 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <p className="text-sm text-gray-700">{s.label}</p>
                    <ChevronRight size={14} className="text-gray-300" />
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
