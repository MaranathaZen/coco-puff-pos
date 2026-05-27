// src/pages/reports/ReportsPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { RefreshCw, Printer } from 'lucide-react'
import { PrintReceipt } from '@/components/PrintReceipt'
import toast from 'react-hot-toast'

type Tab = 'ringkasan' | 'transaksi' | 'produk' | 'kasir'

export default function ReportsPage() {
  const { user } = useAuthStore()
  const STORE_ID = user?.store_id || ''
  const today    = new Date().toISOString().slice(0, 10)
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const [tab, setTab]           = useState<Tab>('ringkasan')
  const [dateFrom, setFrom]     = useState(firstDay)
  const [dateTo, setTo]         = useState(today)
  const [syncing, setSyncing]   = useState(false)
  const [printData, setPrintData] = useState<any>(null)

  async function syncData() {
    setSyncing(true)
    try {
      const from = dateFrom + 'T00:00:00.000Z'
      const to   = dateTo   + 'T23:59:59.999Z'
      const { data: txs } = await supabase.from('transactions')
        .select('*').eq('store_id', STORE_ID)
        .gte('created_at', from).lte('created_at', to)
      if (txs?.length) await db.transactions.bulkPut(txs)
      const { data: items } = await supabase.from('transaction_items').select('*')
      if (items?.length) await db.transaction_items.bulkPut(items)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  const from = new Date(dateFrom + 'T00:00:00').toISOString()
  const to   = new Date(dateTo   + 'T23:59:59').toISOString()

  const transactions = useLiveQuery(async () => {
    return db.transactions
      .where('store_id').equals(STORE_ID)
      .filter(t => t.created_at >= from && t.created_at <= to)
      .reverse().sortBy('created_at')
  }, [dateFrom, dateTo, STORE_ID])

  const completed = transactions?.filter(t => t.status === 'completed') || []
  const totalOmzet    = completed.reduce((s, t) => s + t.total, 0)
  const totalDiscount = completed.reduce((s, t) => s + (t.discount || 0), 0)
  const totalCash     = completed.filter(t => t.payment_method === 'cash').reduce((s, t) => s + t.total, 0)
  const totalQris     = completed.filter(t => t.payment_method === 'qris').reduce((s, t) => s + t.total, 0)
  const totalTransfer = completed.filter(t => t.payment_method === 'transfer').reduce((s, t) => s + t.total, 0)
  const totalVoid     = transactions?.filter(t => t.status === 'voided').length || 0

  // Per produk
  const perProduk = useLiveQuery(async () => {
    const txIds = new Set(completed.map(t => t.id))
    const items = await db.transaction_items.toArray()
    const filtered = items.filter(i => txIds.has(i.transaction_id))
    const map: Record<string, { name: string; qty: number; total: number }> = {}
    for (const i of filtered) {
      if (!map[i.product_id]) map[i.product_id] = { name: i.product_name, qty: 0, total: 0 }
      map[i.product_id].qty   += i.qty_eceran || 1
      map[i.product_id].total += i.subtotal
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [transactions])

  // Per kasir
  const perKasir = useLiveQuery(async () => {
    const users = await db.users.toArray()
    const userMap = Object.fromEntries(users.map(u => [u.id, u]))
    const map: Record<string, { name: string; trx: number; total: number }> = {}
    for (const t of completed) {
      const key = t.cashier_id
      const name = userMap[key]?.name || key
      if (!map[key]) map[key] = { name, trx: 0, total: 0 }
      map[key].trx   += 1
      map[key].total += t.total
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [transactions])

  async function handlePrint(tx: any) {
    const items = await db.transaction_items
      .where('transaction_id').equals(tx.id).toArray()
    const users = await db.users.toArray()
    const stores = await db.stores.toArray()
    const userMap = Object.fromEntries(users.map(u => [u.id, u]))
    const storeMap = Object.fromEntries(stores.map(s => [s.id, s]))
    setPrintData({
      receipt_no:     tx.receipt_no,
      store_name:     storeMap[tx.store_id]?.name || 'Coco Puff POS',
      cashier_name:   userMap[tx.cashier_id]?.name || '-',
      created_at:     tx.created_at,
      items:          items,
      subtotal:       tx.subtotal,
      discount:       tx.discount || 0,
      total:          tx.total,
      payment_method: tx.payment_method,
      cash_paid:      tx.cash_paid || tx.total,
      change_given:   tx.change_given || 0,
    })
  }

  async function handleVoid(txId: string) {
    if (!['owner', 'manager'].includes(user?.role || '')) return toast.error('Tidak ada akses void')
    const reason = prompt('Alasan void:')
    if (!reason) return
    const updated = { status: 'voided' as const, void_reason: reason, voided_by: user!.id, voided_at: new Date().toISOString() }
    await db.transactions.update(txId, updated)
    await supabase.from('transactions').update(updated).eq('id', txId)
    toast.success('Transaksi di-void')
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ringkasan',  label: 'Ringkasan' },
    { id: 'transaksi',  label: 'Transaksi' },
    { id: 'produk',     label: 'Per Produk' },
    { id: 'kasir',      label: 'Per Kasir' },
  ]

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Laporan Penjualan</h1>
        <button onClick={syncData} disabled={syncing} className="p-2 rounded-full text-gray-400">
          <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>

      {/* Filter tanggal */}
      <div className="px-4 mt-3 grid grid-cols-2 gap-2 flex-shrink-0">
        <div>
          <p className="text-xs text-gray-400 mb-1">Dari</p>
          <input className="input text-sm" type="date" value={dateFrom} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Sampai</p>
          <input className="input text-sm" type="date" value={dateTo} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-3 flex gap-0 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`pb-2.5 mr-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'
            }`}>{t.label}</button>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="p-4 space-y-3">

          {/* ── RINGKASAN ── */}
          {tab === 'ringkasan' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Omzet</p>
                  <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalOmzet)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">Transaksi</p>
                  <p className="text-xl font-semibold text-gray-900">{completed.length}</p>
                  {totalVoid > 0 && <p className="text-xs text-red-400">{totalVoid} void</p>}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">Rata-rata / Transaksi</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatRupiah(completed.length > 0 ? totalOmzet / completed.length : 0)}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Diskon</p>
                  <p className="text-lg font-semibold text-gray-900">{formatRupiah(totalDiscount)}</p>
                </div>
              </div>

              {/* Metode bayar */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Metode Pembayaran</p>
                </div>
                {[
                  { label: 'Tunai',    value: totalCash },
                  { label: 'QRIS',     value: totalQris },
                  { label: 'Transfer', value: totalTransfer },
                ].map((m, i) => (
                  <div key={i} className={`px-4 py-3 flex justify-between ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <p className="text-sm text-gray-700">{m.label}</p>
                    <p className="text-sm font-medium text-gray-900">{formatRupiah(m.value)}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── TRANSAKSI ── */}
          {tab === 'transaksi' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {transactions?.map((tx, idx) => (
                <div key={tx.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tx.receipt_no}</p>
                      <p className="text-xs text-gray-400">{formatDate(tx.created_at)}</p>
                      <p className="text-xs text-gray-400 capitalize">{tx.payment_method}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatRupiah(tx.total)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        tx.status === 'voided' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                      }`}>{tx.status === 'voided' ? 'Void' : 'Selesai'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button onClick={() => handlePrint(tx)}
                      className="text-xs text-gray-400 flex items-center gap-1">
                      <Printer size={11} /> Cetak
                    </button>
                    {tx.status === 'completed' && ['owner','manager'].includes(user?.role || '') && (
                      <button onClick={() => handleVoid(tx.id)} className="text-xs text-red-400 underline">
                        Void
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {transactions?.length === 0 && (
                <div className="py-12 text-center text-sm text-gray-400">Tidak ada transaksi</div>
              )}
            </div>
          )}

          {/* ── PER PRODUK ── */}
          {tab === 'produk' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Produk Terlaris</p>
              </div>
              {perProduk?.map((p, idx) => (
                <div key={idx} className={`px-4 py-3 flex items-center justify-between ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.qty} pcs terjual</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{formatRupiah(p.total)}</p>
                </div>
              ))}
              {perProduk?.length === 0 && (
                <div className="py-12 text-center text-sm text-gray-400">Tidak ada data produk</div>
              )}
            </div>
          )}

          {/* ── PER KASIR ── */}
          {tab === 'kasir' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Performa Kasir</p>
              </div>
              {perKasir?.map((k, idx) => (
                <div key={idx} className={`px-4 py-3 flex items-center justify-between ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{k.name}</p>
                    <p className="text-xs text-gray-400">{k.trx} transaksi</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatRupiah(k.total)}</p>
                    <p className="text-xs text-gray-400">{formatRupiah(k.trx > 0 ? k.total / k.trx : 0)}/trx</p>
                  </div>
                </div>
              ))}
              {perKasir?.length === 0 && (
                <div className="py-12 text-center text-sm text-gray-400">Tidak ada data kasir</div>
              )}
            </div>
          )}

        </div>
      </div>
      {printData && <PrintReceipt data={printData} onClose={() => setPrintData(null)} />}
    </div>
  )
}
