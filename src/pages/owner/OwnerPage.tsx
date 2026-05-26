// src/pages/owner/OwnerPage.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import { TrendingUp, Store, ShoppingBag, RefreshCw } from 'lucide-react'

interface StoreSummary {
  store_id:   string
  store_name: string
  total_trx:  number
  total_omzet: number
}

export default function OwnerPage() {
  const [summaries, setSummaries] = useState<StoreSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  async function fetchSummaries() {
    setLoading(true)
    try {
      // Ambil semua toko
      const { data: stores } = await supabase
        .from('stores').select('id, name').eq('is_active', true)

      if (!stores) return

      const results: StoreSummary[] = []
      for (const store of stores) {
        const { data: txs } = await supabase
          .from('transactions')
          .select('total, status')
          .eq('store_id', store.id)
          .eq('status', 'completed')
          .gte('created_at', today + 'T00:00:00')

        results.push({
          store_id:    store.id,
          store_name:  store.name,
          total_trx:   txs?.length || 0,
          total_omzet: txs?.reduce((s, t) => s + t.total, 0) || 0,
        })
      }
      setSummaries(results)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSummaries() }, [])

  const grandTotal = summaries.reduce((s, r) => s + r.total_omzet, 0)
  const grandTrx   = summaries.reduce((s, r) => s + r.total_trx, 0)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Owner Dashboard</h2>
        <button onClick={fetchSummaries}
          className="p-2 text-gray-500 active:bg-gray-100 rounded-xl">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Data hari ini · {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {/* Grand total */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center bg-brand-50 border-brand-100">
          <TrendingUp size={20} className="text-brand-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-brand-700">{formatRupiah(grandTotal)}</p>
          <p className="text-xs text-gray-500">Total Omzet Hari Ini</p>
        </div>
        <div className="card text-center">
          <ShoppingBag size={20} className="text-gray-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-800">{grandTrx}</p>
          <p className="text-xs text-gray-500">Total Transaksi</p>
        </div>
      </div>

      {/* Per toko */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Per Toko</p>
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Memuat data...</div>
        ) : summaries.map(s => (
          <div key={s.store_id} className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
              <Store size={18} className="text-brand-700" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-800 text-sm">{s.store_name}</p>
              <p className="text-xs text-gray-500">{s.total_trx} transaksi</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-800">{formatRupiah(s.total_omzet)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
