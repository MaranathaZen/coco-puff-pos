// src/pages/cashier/CloseOrderPage.tsx
// CHANGELOG v2:
// - Filter toko virtual (gudang/produksi) dari tampilan
// - Filter by region — gudang Malang tidak lihat data Bali
// - Auto expand hari ini

import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Store, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type Period = 'hari' | 'minggu' | 'bulan'

const PAY_METHODS = [
  { key: 'total_cash',       label: 'Tunai'        },
  { key: 'total_qris',       label: 'QRIS'         },
  { key: 'total_transfer',   label: 'Transfer'     },
  { key: 'total_gopay',      label: 'GoPay/GoFood' },
  { key: 'total_grab',       label: 'GrabFood'     },
  { key: 'total_shopeefood', label: 'ShopeeFood'   },
]

export default function CloseOrderPage() {
  const { user } = useAuthStore()
  const isOwnerManager = ['owner','manager','gudang'].includes(user?.role || '')
  const [period,       setPeriod]       = useState<Period>('hari')
  const [filterStore,  setFilterStore]  = useState('semua')
  const [syncing,      setSyncing]      = useState(false)
  const [closeReports, setCloseReports] = useState<any[]>([])
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({})
  const [expandedDays,    setExpandedDays]    = useState<Record<string, boolean>>(() => ({
    [new Date().toISOString().slice(0,10)]: true
  }))

  const today = new Date().toISOString().slice(0,10)

  useEffect(() => { loadReports() }, [])

  async function loadReports() {
    try {
      const { data } = await supabase
        .from('close_order_reports').select('*')
        .order('report_date', { ascending: false }).limit(200)
      if (data) setCloseReports(data)
    } catch {
      try {
        const local = await (db as any).close_order_reports?.toArray() ?? []
        if (local.length) setCloseReports(local)
      } catch {}
    }
  }

  async function syncData() {
    setSyncing(true)
    try {
      const [txRes, shiftsRes, storesRes, reportsRes, usersRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('status','completed').gte('created_at', (() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString() })()),
        supabase.from('shifts').select('*').order('opened_at',{ascending:false}).limit(500),
        supabase.from('stores').select('*').eq('is_active',true),
        supabase.from('close_order_reports').select('*').order('report_date',{ascending:false}).limit(200),
        supabase.from('users').select('id,name,role,store_id').eq('is_active',true),
      ])
      if (txRes.data?.length)     await db.transactions.bulkPut(txRes.data)
      if (shiftsRes.data?.length) await db.shifts.bulkPut(shiftsRes.data)
      if (storesRes.data !== null) { await db.stores.clear(); if (storesRes.data.length) await db.stores.bulkPut(storesRes.data) }
      if (usersRes.data?.length)  await db.users.bulkPut(usersRes.data)
      if (reportsRes.data?.length) setCloseReports(reportsRes.data)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  const dateRange = useMemo(() => {
    const now = new Date(); const end = new Date(now); end.setHours(23,59,59,999); const start = new Date(now)
    if (period === 'hari')   start.setHours(0,0,0,0)
    if (period === 'minggu') { start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
    if (period === 'bulan')  { start.setDate(1); start.setHours(0,0,0,0) }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [period])

  // Filter: hanya toko real (bukan virtual)
  const stores = useLiveQuery(() =>
    db.stores.filter(s => s.is_active && !(s as any).is_virtual).toArray()
  , [])

  const shifts = useLiveQuery(async () => {
    const allShifts = await db.shifts.toArray()
    const txs       = await db.transactions.filter(t => t.status==='completed').toArray()
    const users     = await db.users.toArray()
    const uMap      = Object.fromEntries(users.map(u => [u.id, u]))
    return allShifts
      .filter(s => s.opened_at >= dateRange.start && s.opened_at <= dateRange.end)
      .map(s => {
        const shiftTxs = txs.filter(t => t.shift_id === s.id)
        const byMethod: Record<string,number> = {}
        for (const tx of shiftTxs) byMethod[tx.payment_method] = (byMethod[tx.payment_method]||0) + tx.total
        return { ...s, txCount: shiftTxs.length, total: shiftTxs.reduce((s,t)=>s+t.total,0), cashier: uMap[s.user_id], byMethod }
      })
      .sort((a,b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
  }, [dateRange])

  const filteredShifts = useMemo(() => {
    if (!shifts || !stores) return []
    // Ambil store_id yang valid (real stores di region ini)
    const validStoreIds = new Set(stores.map(s => s.id))
    let list = isOwnerManager
      ? shifts.filter(s => validStoreIds.has(s.store_id))  // hanya shift dari toko valid
      : shifts.filter(s => s.store_id === user?.store_id)
    if (filterStore !== 'semua') list = list.filter(s => s.store_id === filterStore)
    return list
  }, [shifts, stores, isOwnerManager, user?.store_id, filterStore])

  const byStore = useMemo(() => {
    if (!stores) return []
    const storeList = isOwnerManager
      ? (filterStore === 'semua' ? stores : stores.filter(s => s.id === filterStore))
      : stores.filter(s => s.id === user?.store_id)
    return storeList.map(store => ({
      store,
      shifts: filteredShifts.filter(s => s.store_id === store.id),
      storeReports: closeReports
        .filter(r => r.store_id === store.id && r.report_date >= dateRange.start.slice(0,10) && r.report_date <= dateRange.end.slice(0,10))
        .sort((a,b) => b.report_date.localeCompare(a.report_date))
    }))
  }, [stores, filteredShifts, closeReports, isOwnerManager, user?.store_id, filterStore, dateRange])

  const periodLabel = { hari:'Hari Ini', minggu:'7 Hari', bulan:'Bulan Ini' }

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
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${period===p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {periodLabel[p]}
            </button>
          ))}
        </div>
        {isOwnerManager && stores && stores.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setFilterStore('semua')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore==='semua' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Semua Toko
            </button>
            {stores.map(s => (
              <button key={s.id} onClick={() => setFilterStore(s.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {byStore.map(({ store, shifts: storeShifts, storeReports }) => {
          const shiftsByDay: Record<string, typeof storeShifts> = {}
          for (const s of storeShifts) {
            const day = s.opened_at.slice(0,10)
            if (!shiftsByDay[day]) shiftsByDay[day] = []
            shiftsByDay[day].push(s)
          }
          const sortedDays = Object.keys(shiftsByDay).sort((a,b) => b.localeCompare(a))

          return (
            <div key={store.id}>
              {isOwnerManager && (
                <div className="flex items-center gap-1.5 px-1 mb-1.5">
                  <Store size={13} className="text-gray-400" />
                  <p className="text-xs font-semibold text-gray-600">{store.name}</p>
                  <span className="text-xs text-gray-400">· {store.city}</span>
                </div>
              )}

              {storeReports.map(report => {
                const reportKey  = `report-${report.id}`
                const isExpanded = expandedReports[reportKey] !== undefined ? expandedReports[reportKey] : report.report_date === today
                return (
                  <div key={report.id} className="bg-white rounded-xl border border-green-100 overflow-hidden mb-2">
                    <button onClick={() => setExpandedReports(prev => ({...prev,[reportKey]:!isExpanded}))}
                      className="w-full flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown size={14} className="text-gray-400"/> : <ChevronRight size={14} className="text-gray-400"/>}
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">✓ Close Order</span>
                            <span className="text-xs text-gray-400">
                              {new Date(report.report_date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
                            </span>
                          </div>
                          {report.submitted_at && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(report.submitted_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{formatRupiah(report.total_penjualan||0)}</p>
                        <p className={`text-xs font-medium ${(report.selisih||0)===0 ? 'text-green-600' : 'text-red-500'}`}>
                          Selisih: {(report.selisih||0)>=0?'+':''}{formatRupiah(report.selisih||0)}
                        </p>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Penjualan per Metode</p>
                          <div className="space-y-1">
                            {PAY_METHODS.map(m => {
                              const val = report[m.key]||0
                              if (!val) return null
                              return (
                                <div key={m.key} className="flex justify-between text-xs">
                                  <span className="text-gray-500">{m.label}</span>
                                  <span className="font-medium text-gray-800">{formatRupiah(val)}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Void Transaksi</p>
                          {(report.voided_count||0) > 0 ? (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Jumlah Void</span>
                                <span className="font-medium text-red-600">{report.voided_count} transaksi</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Total Void</span>
                                <span className="font-medium text-red-600">-{formatRupiah(report.voided_amount||0)}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">Tidak ada void</p>
                          )}
                        </div>
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Laporan Kas</p>
                          <div className="space-y-1">
                            {[
                              {l:'Total Penjualan', v:report.total_penjualan, bold:true},
                              {l:'Saldo Awal',      v:report.saldo_awal},
                              {l:'Saldo Tambahan',  v:report.saldo_tambahan},
                              {l:'Penjualan Tunai', v:report.total_cash},
                               {l:'Non Tunai',     v:(report.total_penjualan||0)-(report.total_cash||0)},
                              {l:'Total Setor',     v:report.total_setor,    neg:true},
                              {l:'Total Biaya',     v:report.total_biaya,    neg:true},
                              {l:'Saldo Akhir',     v:report.saldo_akhir,    bold:true},
                              {l:'Uang Fisik',      v:report.uang_fisik},
                            ].filter(r=>(r.v??0)>0||r.bold).map((row,i)=>(
                              <div key={i} className={`flex justify-between text-xs ${row.bold?'font-semibold pt-1 border-t border-gray-200 mt-1':''}`}>
                                <span className={row.bold?'text-gray-800':'text-gray-500'}>{row.l}</span>
                                <span className={row.bold?'text-gray-900':row.neg?'text-red-500':'text-gray-700'}>
                                  {row.neg&&(row.v||0)>0?'- ':''}{formatRupiah(row.v||0)}
                                </span>
                              </div>
                            ))}
                            <div className="flex justify-between text-xs font-bold pt-1 border-t border-gray-200 mt-1">
                              <span className="text-gray-800">Selisih</span>
                              <span className={(report.selisih||0)===0?'text-green-600':(report.selisih||0)>0?'text-blue-600':'text-red-600'}>
                                {(report.selisih||0)>=0?'+':''}{formatRupiah(report.selisih||0)}
                              </span>
                            </div>
                          </div>
                        </div>
                        {report.notes && <div className="px-4 py-2"><p className="text-xs text-gray-500 italic">📝 {report.notes}</p></div>}
                      </div>
                    )}
                  </div>
                )
              })}

              {sortedDays.map(day => {
                const dayShifts  = shiftsByDay[day]
                const dayTotal   = dayShifts.reduce((s,sh)=>s+sh.total,0)
                const dayKey     = `${store.id}-${day}`
                const isExpanded = expandedDays[dayKey]!==undefined ? expandedDays[dayKey] : day===today
                const dayLabel   = new Date(day+'T00:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
                return (
                  <div key={day} className="mb-2">
                    <button onClick={() => setExpandedDays(prev=>({...prev,[dayKey]:!isExpanded}))}
                      className="w-full flex items-center justify-between px-1 py-1.5">
                      <div className="flex items-center gap-2">
                        {isExpanded?<ChevronDown size={13} className="text-gray-400"/>:<ChevronRight size={13} className="text-gray-400"/>}
                        <p className="text-xs font-semibold text-gray-600">{dayLabel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{dayShifts.length} shift</span>
                        <span className="text-xs font-medium text-gray-700">{formatRupiah(dayTotal)}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        {dayShifts.map((shift,idx) => (
                          <div key={shift.id} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900">{shift.cashier?.name||'Kasir'}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {new Date(shift.opened_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}
                                  {shift.closed_at?` → ${new Date(shift.closed_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}`:' · Aktif'}
                                </p>
                                <p className="text-xs text-gray-400">{shift.txCount} transaksi</p>
                              </div>
                              <div className="text-right flex-shrink-0 ml-2">
                                <p className="text-sm font-semibold text-gray-900">{formatRupiah(shift.total)}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${shift.status==='closed'?'bg-green-50 text-green-600':'bg-blue-50 text-blue-600'}`}>
                                  {shift.status==='closed'?'Tutup':'Aktif'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {storeShifts.length===0 && storeReports.length===0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 text-center text-sm text-gray-400 mb-2">
                  Belum ada data {periodLabel[period].toLowerCase()}
                </div>
              )}
            </div>
          )
        })}

        {byStore.length===0 && (
          <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
            <p className="text-sm text-gray-400">Belum ada data</p>
            <button onClick={syncData} className="mt-3 text-xs text-blue-500 underline">Sync data</button>
          </div>
        )}
      </div>
    </div>
  )
}
