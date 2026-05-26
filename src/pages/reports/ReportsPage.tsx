// src/pages/reports/ReportsPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { STORE_ID } from '@/lib/supabase'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function ReportsPage() {
  const { user } = useAuthStore()
  const today    = new Date().toISOString().slice(0, 10)
  const [dateFrom, setFrom] = useState(today)
  const [dateTo, setTo]     = useState(today)

  const transactions = useLiveQuery(async () => {
    const from = new Date(dateFrom + 'T00:00:00').toISOString()
    const to   = new Date(dateTo   + 'T23:59:59').toISOString()
    return db.transactions
      .where('store_id').equals(STORE_ID)
      .filter(t => t.created_at >= from && t.created_at <= to)
      .reverse().sortBy('created_at')
  }, [dateFrom, dateTo])

  const totalOmzet = transactions?.filter(t => t.status === 'completed')
    .reduce((s, t) => s + t.total, 0) || 0
  const totalTrx   = transactions?.filter(t => t.status === 'completed').length || 0

  async function handleVoid(txId: string) {
    if (!['owner', 'manager'].includes(user?.role || '')) {
      return toast.error('Tidak ada akses void')
    }
    const reason = prompt('Alasan void:')
    if (!reason) return
    const updated = {
      status: 'voided' as const,
      void_reason: reason,
      voided_by: user!.id,
      voided_at: new Date().toISOString(),
    }
    await db.transactions.update(txId, updated)
    await supabase.from('transactions').update(updated).eq('id', txId)
    toast.success('Transaksi berhasil di-void')
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-gray-800">Laporan Penjualan</h2>

      {/* Filter tanggal */}
      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Dari</label>
            <input className="input" type="date" value={dateFrom} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Sampai</label>
            <input className="input" type="date" value={dateTo} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center">
          <p className="text-2xl font-bold text-brand-600">{totalTrx}</p>
          <p className="text-xs text-gray-500 mt-1">Total Transaksi</p>
        </div>
        <div className="card text-center">
          <p className="text-lg font-bold text-gray-800">{formatRupiah(totalOmzet)}</p>
          <p className="text-xs text-gray-500 mt-1">Total Omzet</p>
        </div>
      </div>

      {/* List transaksi */}
      <div className="space-y-2">
        {transactions?.map(tx => (
          <div key={tx.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm text-gray-800">{tx.receipt_no}</p>
                <p className="text-xs text-gray-500">{formatDate(tx.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-800">{formatRupiah(tx.total)}</p>
                <span className={tx.status === 'voided' ? 'badge-red' : 'badge-green'}>
                  {tx.status === 'voided' ? 'Void' : 'Selesai'}
                </span>
              </div>
            </div>
            {tx.status === 'completed' && ['owner', 'manager'].includes(user?.role || '') && (
              <button
                onClick={() => handleVoid(tx.id)}
                className="mt-2 text-xs text-red-500 underline"
              >
                Void transaksi
              </button>
            )}
          </div>
        ))}
        {transactions?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">
            Tidak ada transaksi di periode ini
          </div>
        )}
      </div>
    </div>
  )
}
