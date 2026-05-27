// src/pages/owner/OwnerPage.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { formatRupiah } from '@/lib/utils'
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle, ChevronRight } from 'lucide-react'

interface StoreSummary {
  store_id:    string
  store_name:  string
  total_trx:   number
  total_omzet: number
}

interface LowStockItem {
  name: string
  qty: number
  unit: string
  min_stock: number
}

interface ProductionSummary {
  total_yield: number
  batch_count: number
  recipe_name: string
}

export default function OwnerPage() {
  const [summaries, setSummaries]     = useState<StoreSummary[]>([])
  const [lowStock, setLowStock]       = useState<LowStockItem[]>([])
  const [produksi, setProduksi]       = useState<ProductionSummary[]>([])
  const [biayaBulanIni, setBiaya]     = useState(0)
  const [totalPembelian, setPembelian]= useState(0)
  const [loading, setLoading]         = useState(true)
  const [activeSection, setActive]    = useState<string | null>(null)

  const today     = new Date().toISOString().slice(0, 10)
  const firstDay  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  async function fetchAll() {
    setLoading(true)
    try {
      await Promise.all([
        fetchSales(),
        fetchLowStock(),
        fetchProduksi(),
        fetchBiaya(),
        fetchPembelian(),
      ])
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
      results.push({
        store_id: store.id, store_name: store.name,
        total_trx: txs?.length || 0,
        total_omzet: txs?.reduce((s, t) => s + t.total, 0) || 0,
      })
    }
    setSummaries(results)
  }

  async function fetchLowStock() {
    const mats   = await db.materials.filter(m => m.is_active).toArray()
    const stocks = await db.warehouse_stock.toArray()
    const stockMap = Object.fromEntries(stocks.map(s => [s.material_id, s]))
    const low = mats
      .map(m => ({ name: m.name, qty: stockMap[m.id]?.qty_on_hand ?? 0, unit: m.unit, min_stock: m.min_stock }))
      .filter(m => m.qty <= m.min_stock)
      .sort((a, b) => a.qty - b.qty)
    setLowStock(low)
  }

  async function fetchProduksi() {
    const { data: logs } = await supabase.from('production_logs')
      .select('*, production_recipes(name)')
      .gte('created_at', today + 'T00:00:00')
    if (!logs) return
    const result = logs.map((l: any) => ({
      total_yield: l.total_yield,
      batch_count: l.batch_count,
      recipe_name: l.production_recipes?.name || '-',
    }))
    setProduksi(result)
  }

  async function fetchBiaya() {
    const { data } = await supabase.from('warehouse_expenses')
      .select('amount').gte('expense_date', firstDay).lte('expense_date', today)
    setBiaya(data?.reduce((s, e) => s + e.amount, 0) || 0)
  }

  async function fetchPembelian() {
    const { data } = await supabase.from('purchases')
      .select('total_amount').gte('created_at', firstDay + 'T00:00:00')
    setPembelian(data?.reduce((s, p) => s + p.total_amount, 0) || 0)
  }

  useEffect(() => { fetchAll() }, [])

  const grandOmzet = summaries.reduce((s, r) => s + r.total_omzet, 0)
  const grandTrx   = summaries.reduce((s, r) => s + r.total_trx, 0)
  const totalProduksi = produksi.reduce((s, p) => s + p.total_yield, 0)

  return (
    <div className="flex flex-col h-full bg-white">
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
        <div className="p-4 space-y-3">

          {/* Omzet hari ini */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Omzet Hari Ini</p>
              <p className="text-xl font-semibold text-gray-900">{formatRupiah(grandOmzet)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{grandTrx} transaksi</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Produksi Hari Ini</p>
              <p className="text-xl font-semibold text-gray-900">{totalProduksi} pcs</p>
              <p className="text-xs text-gray-400 mt-0.5">{produksi.length} batch</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Pembelian Bulan Ini</p>
              <p className="text-lg font-semibold text-gray-900">{formatRupiah(totalPembelian)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Biaya Operasional</p>
              <p className="text-lg font-semibold text-gray-900">{formatRupiah(biayaBulanIni)}</p>
              <p className="text-xs text-gray-400 mt-0.5">bulan ini</p>
            </div>
          </div>

          {/* Alert stok rendah */}
          {lowStock.length > 0 && (
            <button onClick={() => setActive(activeSection === 'lowstock' ? null : 'lowstock')}
              className="w-full bg-white rounded-xl border border-red-100 overflow-hidden text-left">
              <div className="px-4 py-3 flex items-center gap-2">
                <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700">{lowStock.length} item stok rendah</p>
                  <p className="text-xs text-red-400 truncate">{lowStock.map(s => s.name).join(', ')}</p>
                </div>
                <ChevronRight size={14} className={`text-gray-300 transition-transform ${activeSection === 'lowstock' ? 'rotate-90' : ''}`} />
              </div>
              {activeSection === 'lowstock' && (
                <div className="border-t border-red-50">
                  {lowStock.map((s, i) => (
                    <div key={i} className={`px-4 py-2.5 flex items-center justify-between ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                      <p className="text-sm text-gray-800">{s.name}</p>
                      <p className="text-sm font-medium text-red-500">{s.qty} / {s.min_stock} {s.unit}</p>
                    </div>
                  ))}
                </div>
              )}
            </button>
          )}

          {/* Per toko */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <TrendingUp size={14} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Omzet per Toko</p>
            </div>
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
              <div className="px-4 py-3 text-center text-sm text-gray-400">Belum ada transaksi hari ini</div>
            )}
          </div>

          {/* Produksi hari ini */}
          {produksi.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <TrendingDown size={14} className="text-gray-400" />
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Produksi Hari Ini</p>
              </div>
              {produksi.map((p, idx) => (
                <div key={idx} className={`px-4 py-3 flex items-center justify-between ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.recipe_name}</p>
                    <p className="text-xs text-gray-400">{p.batch_count} batch</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{p.total_yield} pcs</p>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
