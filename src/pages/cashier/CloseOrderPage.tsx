// src/pages/cashier/CloseOrderPage.tsx
// Close Order — owner/manager/gudang lihat semua toko + detail collapse
import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Store, TrendingUp, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type Period = 'hari' | 'minggu' | 'bulan'

export default function CloseOrderPage() {
  const { user } = useAuthStore()
  const isOwnerManager = ['owner','manager','gudang'].includes(user?.role || '')
  const [period, setPeriod] = useState<Period>('hari')
  const [filterStore, setFilterStore] = useState('semua')
  const [syncing, setSyncing] = useState(false)
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({})

  async function syncData() {
    setSyncing(true)
    try {
      const [txRes, shiftsRes, storesRes, reportsRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('status', 'completed'),
        supabase.from('shifts').select('*').order('opened_at', { ascending: false }).limit(300),
        supabase.from('stores').select('*').eq('is_active', true),
        supabase.from('close_order_reports').select('*').order('report_date', { ascending: false }).limit(100),
      ])
      if (txRes.data?.length)     await db.transactions.bulkPut(txRes.data)
      if (shiftsRes.data?.length) await db.shifts.bulkPut(shiftsRes.data)
      if (storesRes.data?.length) await db.stores.bulkPut(storesRes.data)
      // Store close_order_reports in localStorage
      if (reportsRes.data?.length) {
        localStorage.setItem('close_order_reports', JSON.stringify(reportsRes.data))
      }
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
    return { start: start.toISOString(), end: end.toISOString() }
  }, [period])

  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])

  const shifts = useLiveQuery(async () => {
    const allShifts = await db.shifts.toArray()
    const txs = await db.transactions.filter(t => t.status === 'completed').toArray()
    const users = await db.users.toArray()
    const uMap = Object.fromEntries(users.map(u => [u.id, u]))
    return allShifts
      .filter(s => s.opened_at >= dateRange.start && s.opened_at <= dateRange.end)
      .map(s => {
        const shiftTxs = txs.filter(t => t.shift_id === s.id)
        const total = shiftTxs.reduce((sum, t) => sum + t.total, 0)
        return { ...s, txCount: shiftTxs.length, total, cashier: uMap[s.user_id] }
      })
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
  }, [dateRange])

  // Load close order reports from localStorage
  const closeReports: any[] = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('close_order_reports') || '[]') } catch { return [] }
  }, [])

  const filteredShifts = useMemo(() => {
    if (!shifts) return []
    let list = isOwnerManager ? shifts : shifts.filter(s => s.store_id === user?.store_id)
    if (filterStore !== 'semua') list = list.filter(s => s.store_id === filterStore)
    return list
  }, [shifts, isOwnerManager, user?.store_id, filterStore])

  const byStore = useMemo(() => {
    if (!stores) return []
    const storeList = isOwnerManager
      ? (filterStore === 'semua' ? stores : stores.filter(s => s.id === filterStore))
      : stores.filter(s => s.id === user?.store_id)

    return storeList.map(store => {
      const storeShifts = filteredShifts.filter(s => s.store_id === store.id)
      const storeReport = closeReports.find(r => r.store_id === store.id && r.report_date === new Date().toISOString().slice(0,10))
      const totalOmzet = storeShifts.reduce((s, sh) => s + sh.total, 0)
      return { store, shifts: storeShifts, totalOmzet, storeReport }
    })
  }, [stores, filteredShifts, closeReports, isOwnerManager, user?.store_id, filterStore])

  const grandTotal = byStore.reduce((s, b) => s + b.totalOmzet, 0)
  const periodLabel = { hari: 'Hari Ini', minggu: '7 Hari', bulan: 'Bulan Ini' }

  function toggleExpand(id: string) {
    setExpandedReports(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900">Close Order</h1>
          <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400 rounded-full">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          {(['hari','minggu','bulan'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                period === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}>{periodLabel[p]}</button>
          ))}
        </div>
        {/* Filter toko */}
        {isOwnerManager && stores && stores.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setFilterStore('semua')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore === 'semua' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Semua Toko
            </button>
            {stores.map(s => (
              <button key={s.id} onClick={() => setFilterStore(s.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore === s.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Summary */}
        {isOwnerManager && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={13} className="text-green-500" /><p className="text-xs text-gray-400">Total Omzet</p></div>
              <p className="text-base font-bold text-gray-900">{formatRupiah(grandTotal)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-1.5 mb-1"><Store size={13} className="text-blue-500" /><p className="text-xs text-gray-400">Toko Laporan</p></div>
              <p className="text-base font-bold text-gray-900">{byStore.filter(b => b.storeReport).length}/{byStore.length}</p>
            </div>
          </div>
        )}

        {byStore.map(({ store, shifts: storeShifts, totalOmzet, storeReport }) => (
          <div key={store.id}>
            {isOwnerManager && (
              <div className="flex items-center justify-between px-1 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Store size={13} className="text-gray-400" />
                  <p className="text-xs font-semibold text-gray-600">{store.name}</p>
                  <span className="text-xs text-gray-400">· {store.city}</span>
                </div>
                <p className="text-xs font-medium text-gray-700">{formatRupiah(totalOmzet)}</p>
              </div>
            )}

            {/* Close Order Report — jika ada */}
            {storeReport && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-2">
                <button onClick={() => toggleExpand(`report-${store.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    {expandedReports[`report-${store.id}`]
                      ? <ChevronDown size={14} className="text-gray-400" />
                      : <ChevronRight size={14} className="text-gray-400" />}
                    <div className="text-left">
                      <p className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full inline-block">✓ Close Order Submitted</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(storeReport.submitted_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatRupiah(storeReport.total_penjualan)}</p>
                    <p className={`text-xs font-medium ${storeReport.selisih === 0 ? 'text-green-600' : 'text-red-500'}`}>
                      Selisih: {storeReport.selisih > 0 ? '+' : ''}{formatRupiah(storeReport.selisih)}
                    </p>
                  </div>
                </button>

                {expandedReports[`report-${store.id}`] && (
                  <div className="border-t border-gray-50 px-4 py-3 space-y-1 bg-gray-50">
                    {[
                      { l: 'Saldo Awal',      v: storeReport.saldo_awal },
                      { l: 'Saldo Tambahan',  v: storeReport.saldo_tambahan },
                      { l: 'Total Penjualan', v: storeReport.total_penjualan, bold: true },
                      { l: 'Tunai',           v: storeReport.total_cash },
                      { l: 'QRIS',            v: storeReport.total_qris },
                      { l: 'GoPay/GoFood',    v: storeReport.total_gopay },
                      { l: 'GrabFood',        v: storeReport.total_grab },
                      { l: 'ShopeeFood',      v: storeReport.total_shopeefood },
                      { l: 'Transfer',        v: storeReport.total_transfer },
                      { l: 'Total Setor',     v: storeReport.total_setor, neg: true },
                      { l: 'Total Biaya',     v: storeReport.total_biaya, neg: true },
                      { l: 'Saldo Akhir',     v: storeReport.saldo_akhir, bold: true },
                      { l: 'Uang Fisik',      v: storeReport.uang_fisik },
                      { l: 'Selisih',         v: storeReport.selisih, bold: true },
                    ].filter(r => r.v > 0 || r.bold).map((row, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className={row.bold ? 'font-semibold text-gray-800' : 'text-gray-500'}>{row.l}</span>
                        <span className={`font-medium ${row.bold ? 'text-gray-900' : row.neg ? 'text-red-500' : 'text-gray-700'}`}>
                          {row.neg && row.v > 0 ? '- ' : ''}{formatRupiah(row.v)}
                        </span>
                      </div>
                    ))}
                    {storeReport.notes && <p className="text-xs text-gray-400 italic pt-1">📝 {storeReport.notes}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Shifts */}
            {storeShifts.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-4 text-center text-sm text-gray-400">
                Belum ada shift {periodLabel[period].toLowerCase()}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {storeShifts.map((shift, idx) => (
                  <div key={shift.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{shift.cashier?.name || 'Kasir'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(shift.opened_at).toLocaleDateString('id-ID', { day:'numeric', month:'short' })}, {new Date(shift.opened_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                          {shift.closed_at ? ` → ${new Date(shift.closed_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}` : ' · Aktif'}
                        </p>
                        <p className="text-xs text-gray-400">{shift.txCount} transaksi</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm font-semibold text-gray-900">{formatRupiah(shift.total)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${shift.status === 'closed' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                          {shift.status === 'closed' ? 'Tutup' : 'Aktif'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {byStore.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
            <p className="text-sm text-gray-400">Belum ada data</p>
            <button onClick={syncData} className="mt-3 text-xs text-blue-500 underline">Sync data</button>
          </div>
        )}
      </div>
    </div>
  )
}
