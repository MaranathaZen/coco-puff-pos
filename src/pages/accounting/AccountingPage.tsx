// src/pages/accounting/AccountingPage.tsx
// CHANGELOG v3:
// - FIX: gudang tidak tampil tab Laporan Keuangan (hanya owner/manager)
// - FIX: setoran default pending untuk approver, all untuk kasir
// - Setoran semua toko tampil untuk gudang/owner

import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { CheckCircle, Clock, X, Plus, RefreshCw, TrendingUp, Package, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'setoran' | 'laporan' | 'tutup_bulan'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
    {children}{required && <span className="text-red-500 font-bold ml-0.5">*</span>}
  </label>
}

export default function AccountingPage() {
  const { user } = useAuthStore()
  const role = user?.role || 'kasir'
  const isOwnerManager = ['owner', 'manager'].includes(role)
  const isGudang = role === 'gudang'
  const isKasir  = role === 'kasir'

  const defaultTab: Tab = 'setoran'
  const [tab, setTab] = useState<Tab>(defaultTab)
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const [deps, periods, stores] = await Promise.all([
        supabase.from('cash_deposits').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('accounting_periods').select('*').order('year', { ascending: false }),
        supabase.from('stores').select('*'),
      ])
      if (deps.data?.length)    await (db as any).cash_deposits?.bulkPut(deps.data)
      if (periods.data?.length) await (db as any).accounting_periods?.bulkPut(periods.data)
      if (stores.data?.length)  await db.stores.bulkPut(stores.data)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  // FIX: gudang hanya lihat setoran, TIDAK lihat laporan keuangan
  const tabs = [
    { id: 'setoran'    as Tab, label: 'Setoran Kas' },
    // Laporan Keuangan: hanya owner/manager
    ...(isOwnerManager ? [{ id: 'laporan'     as Tab, label: 'Laporan Keuangan' }] : []),
    ...(isOwnerManager ? [{ id: 'tutup_bulan' as Tab, label: 'Tutup Bulan'      }] : []),
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Accounting</h1>
        <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400 rounded-full">
          <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>
      <div className="bg-white border-b border-gray-100 flex overflow-x-auto scrollbar-hide flex-shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===t.id?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto bg-gray-50">
        {tab === 'setoran'     && <SetoranTab role={role} userId={user!.id} storeId={user?.store_id||''} />}
        {tab === 'laporan'     && <LaporanKeuanganTab />}
        {tab === 'tutup_bulan' && <TutupBulanTab userId={user!.id} />}
      </div>
    </div>
  )
}

// ── TAB SETORAN ───────────────────────────────────────────────
function SetoranTab({ role, userId, storeId }: { role: string; userId: string; storeId: string }) {
  const isGudang   = role === 'gudang'
  const isOwnerMgr = ['owner','manager'].includes(role)
  const canApprove = isGudang || isOwnerMgr
  const [showForm, setShowForm] = useState(false)

  // FIX: default pending untuk approver (gudang/owner), all untuk kasir
  const [filterStatus, setFilterStatus] = useState<'all'|'pending'|'approved'>(canApprove ? 'pending' : 'all')

  const stores = useLiveQuery(() =>
    db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
  , [])

  const [deposits, setDeposits] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  async function loadDeposits() {
    setLoading(true)
    try {
      // FIX: gudang/owner lihat semua toko, kasir hanya toko sendiri
      let q = supabase.from('cash_deposits').select('*').order('created_at', { ascending: false }).limit(200)
      if (!canApprove) q = q.eq('store_id', storeId)
      const { data } = await q
      setDeposits(data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadDeposits() }, [storeId])

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return deposits
    return deposits.filter(d => d.status === filterStatus)
  }, [deposits, filterStatus])

  const storeMap      = Object.fromEntries((stores||[]).map(s => [s.id, s.name]))
  const totalPending  = deposits.filter(d => d.status === 'pending').reduce((s, d) => s + d.amount, 0)
  const totalApproved = deposits.filter(d => d.status === 'approved').reduce((s, d) => s + d.amount, 0)

  async function handleApprove(dep: any) {
    if (!canApprove) return
    const { error } = await supabase.from('cash_deposits')
      .update({ status: 'approved', approved_by: userId, approved_at: now() }).eq('id', dep.id)
    if (error) return toast.error('Gagal approve')
    toast.success('Setoran disetujui')
    loadDeposits()
  }

  async function handleReject(dep: any) {
    if (!canApprove) return
    if (!confirm('Tolak setoran ini?')) return
    const { error } = await supabase.from('cash_deposits')
      .update({ status: 'rejected', approved_by: userId, approved_at: now() }).eq('id', dep.id)
    if (error) return toast.error('Gagal')
    toast.success('Setoran ditolak')
    loadDeposits()
  }

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><Clock size={13} className="text-amber-500" /><p className="text-xs text-amber-600">Menunggu Approve</p></div>
          <p className="text-lg font-bold text-amber-700">{formatRupiah(totalPending)}</p>
          <p className="text-xs text-amber-500">{deposits.filter(d=>d.status==='pending').length} setoran</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><CheckCircle size={13} className="text-green-500" /><p className="text-xs text-green-600">Sudah Disetujui</p></div>
          <p className="text-lg font-bold text-green-700">{formatRupiah(totalApproved)}</p>
          <p className="text-xs text-green-500">{deposits.filter(d=>d.status==='approved').length} setoran</p>
        </div>
      </div>

      {!canApprove && (
        <button onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold">
          <Plus size={16} /> Catat Setoran
        </button>
      )}

      {canApprove && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          <p className="text-xs text-blue-700 font-medium">Setoran dari semua toko</p>
          <p className="text-xs text-blue-500">Klik ✓ untuk approve, ✗ untuk tolak.</p>
        </div>
      )}

      <div className="flex gap-1.5">
        {(['all','pending','approved'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${filterStatus===s?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
            {s === 'all' ? 'Semua' : s === 'pending' ? 'Pending' : 'Disetujui'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400">Memuat...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.map((d, idx) => (
            <div key={d.id} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-semibold text-gray-900">{formatRupiah(d.amount)}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      d.status==='approved' ? 'bg-green-100 text-green-700' :
                      d.status==='rejected' ? 'bg-red-100 text-red-600' :
                      'bg-amber-100 text-amber-700'}`}>
                      {d.status==='approved'?'✓ Disetujui':d.status==='rejected'?'✗ Ditolak':'⏳ Pending'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {canApprove && storeMap[d.store_id] ? `${storeMap[d.store_id]} · ` : ''}
                    {new Date(d.deposit_date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
                  </p>
                  {d.notes && <p className="text-xs text-gray-500 italic mt-0.5">📝 {d.notes}</p>}
                </div>
                {canApprove && d.status === 'pending' && (
                  <div className="flex gap-1.5 ml-2 flex-shrink-0">
                    <button onClick={() => handleApprove(d)}
                      className="px-2.5 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg">✓</button>
                    <button onClick={() => handleReject(d)}
                      className="px-2.5 py-1.5 bg-red-100 text-red-600 text-xs font-medium rounded-lg">✗</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">
              {filterStatus === 'pending' ? 'Tidak ada setoran pending' : 'Belum ada setoran'}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <SetoranForm storeId={storeId} userId={userId} onClose={() => setShowForm(false)} onSaved={loadDeposits} />
      )}
    </div>
  )
}

function SetoranForm({ storeId, userId, onClose, onSaved }: {
  storeId: string; userId: string; onClose: () => void; onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [date,   setDate]   = useState(new Date().toISOString().slice(0,10))
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!amount || Number(amount) <= 0) return toast.error('Jumlah wajib diisi')
    setSaving(true)
    try {
      const data = {
        id:           generateId(),
        store_id:     storeId,
        amount:       Number(amount),
        deposit_date: date,
        notes:        notes || null,
        status:       'pending',
        created_by:   userId,
        created_at:   now(),
      }
      const { error } = await supabase.from('cash_deposits').insert(data)
      if (error) throw error
      toast.success('Setoran dicatat')
      onSaved(); onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Setoran Kas" onClose={onClose}>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700">Catat uang tunai yang disetor ke kurir gudang hari ini.</p>
      </div>
      <div><Label required>Jumlah Setor (Rp)</Label>
        <input className="input text-lg font-semibold" inputMode="decimal" value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9]/g,''))} placeholder="0" autoFocus />
      </div>
      <div><Label required>Tanggal Setor</Label>
        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div><Label>Catatan</Label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── TAB LAPORAN KEUANGAN (owner/manager only) ─────────────────
function LaporanKeuanganTab() {
  const now2 = new Date()
  const [year,  setYear]  = useState(now2.getFullYear())
  const [month, setMonth] = useState(now2.getMonth() + 1)

  const stores = useLiveQuery(() =>
    db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
  , [])

  const [periods, setPeriods] = useState<any[]>([])
  useEffect(() => {
    supabase.from('accounting_periods').select('*').eq('year', year).eq('month', month)
      .then(({ data }) => setPeriods(data || []))
  }, [year, month])

  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2 items-center">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm">
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm">
          {months.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
      </div>
      {(stores||[]).map(store => (
        <StoreLaporanCard key={store.id} store={store} year={year} month={month}
          period={periods.find(p => p.store_id === store.id)} />
      ))}
      {(stores||[]).length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-10 text-center text-sm text-gray-400">Memuat data toko...</div>
      )}
    </div>
  )
}

function StoreLaporanCard({ store, year, month, period }: { store: any; year: number; month: number; period: any }) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`
  const endDate   = new Date(year, month, 0).toISOString().slice(0,10)
  const startISO  = `${startDate}T00:00:00.000Z`
  const endISO    = `${endDate}T23:59:59.999Z`

  const data = useLiveQuery(async () => {
    const txs = await db.transactions
      .filter(t => t.store_id === store.id && t.status === 'completed' &&
        t.created_at >= startISO && t.created_at <= endISO).toArray()
    const omzet     = txs.reduce((s, t) => s + t.total, 0)
    const totalCash = txs.filter(t => t.payment_method === 'cash').reduce((s, t) => s + t.total, 0)

    const expenses = await db.warehouse_expenses
      .filter(e => (e as any).store_id === store.id && e.created_at >= startISO && e.created_at <= endISO).toArray()
    const totalBiaya = expenses.reduce((s, e) => s + e.amount, 0)

    const mutations = await db.warehouse_mutations
      .filter(m => m.destination_id === store.id && m.mutation_type === 'to_store' &&
        m.created_at >= startISO && m.created_at <= endISO).toArray()
    const mutItems = await db.warehouse_mutation_items.toArray()
    const totalMutasi = mutations.reduce((s, m) => {
      const items = mutItems.filter(i => i.mutation_id === m.id)
      return s + items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0)
    }, 0)

    const stocks = await db.stock.where('store_id').equals(store.id).toArray()
    const mats   = await db.materials.toArray()
    const mMap   = Object.fromEntries(mats.map(m => [m.id, m]))
    const nilaiStokNow = stocks.reduce((s, st) => {
      const mid = (st as any).material_id || st.ingredient_id
      const avg = (st as any).avg_cost || mMap[mid]?.unit_cost || 0
      return s + st.qty_on_hand * avg
    }, 0)

    const { data: deps } = await supabase.from('cash_deposits').select('amount')
      .eq('store_id', store.id).eq('status', 'approved')
      .gte('deposit_date', startDate).lte('deposit_date', endDate)
    const totalSetor = (deps||[]).reduce((s: number, d: any) => s + d.amount, 0)

    const persediaanAwal  = period?.opening_stock_value || 0
    const persediaanAkhir = period?.status === 'closed' ? (period?.closing_stock_value || 0) : nilaiStokNow
    const hpp             = persediaanAwal + totalMutasi - persediaanAkhir
    const labaKotor       = omzet - Math.max(0, hpp)
    const labaBersih      = labaKotor - totalBiaya
    const piutangSetor    = totalCash - totalSetor

    return {
      omzet, totalCash, totalBiaya, totalMutasi,
      persediaanAwal, persediaanAkhir, hpp: Math.max(0, hpp),
      labaKotor, labaBersih, totalSetor, piutangSetor,
      txCount: txs.length, isClosed: period?.status === 'closed',
    }
  }, [store.id, startISO, endISO, period])

  if (!data) return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 text-center text-sm text-gray-400">Memuat {store.name}...</div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-50 flex items-center justify-between ${data.isClosed?'bg-gray-50':''}`}>
        <p className="text-sm font-semibold text-gray-900">{store.name}</p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${data.isClosed?'bg-gray-200 text-gray-600':'bg-green-100 text-green-700'}`}>
          {data.isClosed ? 'Closed' : 'Open'}
        </span>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <LRow label="Persediaan Awal"        value={data.persediaanAwal}  note={data.persediaanAwal===0?'Belum ada snapshot':''} />
        <LRow label="+ Bahan Masuk (Mutasi)" value={data.totalMutasi} />
        <LRow label="- Persediaan Akhir"     value={data.persediaanAkhir} note={!data.isClosed?'(estimasi saat ini)':''} />
        <div className="flex justify-between py-1 border-t border-dashed border-gray-200 mt-1">
          <span className="text-sm font-semibold text-gray-700">= HPP</span>
          <span className="text-sm font-semibold text-orange-600">{formatRupiah(data.hpp)}</span>
        </div>
        <div className="border-t border-gray-100 pt-1.5 mt-1.5 space-y-1">
          <LRow label="Omzet Penjualan" value={data.omzet} note={`${data.txCount} transaksi`} />
          <div className="flex justify-between">
            <span className="text-sm font-semibold text-gray-700">Laba Kotor</span>
            <span className={`text-sm font-semibold ${data.labaKotor>=0?'text-green-600':'text-red-600'}`}>{formatRupiah(data.labaKotor)}</span>
          </div>
          <LRow label="- Biaya Operasional" value={data.totalBiaya} />
          <div className="flex justify-between py-1 border-t border-dashed border-gray-200">
            <span className="text-sm font-bold text-gray-900">= Laba Bersih</span>
            <span className={`text-sm font-bold ${data.labaBersih>=0?'text-green-700':'text-red-600'}`}>{formatRupiah(data.labaBersih)}</span>
          </div>
        </div>
        <div className="border-t border-gray-100 pt-1.5 mt-1.5 space-y-1">
          <LRow label="Total Cash Masuk"        value={data.totalCash} />
          <LRow label="Total Setor (Approved)"  value={data.totalSetor} />
          <div className="flex justify-between">
            <span className="text-sm font-medium text-gray-700">Piutang Setor</span>
            <span className={`text-sm font-semibold ${data.piutangSetor>0?'text-amber-600':'text-gray-500'}`}>
              {formatRupiah(Math.max(0, data.piutangSetor))}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function LRow({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <div>
        <span className="text-xs text-gray-600">{label}</span>
        {note && <span className="text-[10px] text-gray-400 ml-1">({note})</span>}
      </div>
      <span className="text-xs font-medium text-gray-700">{formatRupiah(value)}</span>
    </div>
  )
}

// ── TAB TUTUP BULAN ───────────────────────────────────────────
function TutupBulanTab({ userId }: { userId: string }) {
  const now2  = new Date()
  const [year,    setYear]    = useState(now2.getFullYear())
  const [month,   setMonth]   = useState(now2.getMonth() + 1)
  const [closing, setClosing] = useState(false)

  const stores = useLiveQuery(() =>
    db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
  , [])

  const [periods, setPeriods] = useState<any[]>([])
  async function loadPeriods() {
    const { data } = await supabase.from('accounting_periods').select('*').eq('year', year).eq('month', month)
    setPeriods(data || [])
  }
  useEffect(() => { loadPeriods() }, [year, month])

  async function handleClose(store: any) {
    if (!confirm(`Tutup bulan ${month}/${year} untuk ${store.name}?`)) return
    setClosing(true)
    try {
      const stocks = await db.stock.where('store_id').equals(store.id).toArray()
      const mats   = await db.materials.toArray()
      const mMap   = Object.fromEntries(mats.map(m => [m.id, m]))
      const nilaiStok = stocks.reduce((s, st) => {
        const mid = (st as any).material_id || st.ingredient_id
        const avg = (st as any).avg_cost || mMap[mid]?.unit_cost || 0
        return s + st.qty_on_hand * avg
      }, 0)
      const existingPeriod = periods.find(p => p.store_id === store.id)
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear  = month === 1 ? year - 1 : year
      const { data: prevPeriod } = await supabase.from('accounting_periods').select('closing_stock_value')
        .eq('store_id', store.id).eq('year', prevYear).eq('month', prevMonth).single()
      const periodData: any = {
        id:                  existingPeriod?.id || generateId(),
        store_id:            store.id, year, month,
        status:              'closed',
        opening_stock_value: prevPeriod?.closing_stock_value || existingPeriod?.opening_stock_value || 0,
        closing_stock_value: nilaiStok,
        closed_at:           now(),
        closed_by:           userId,
      }
      if (existingPeriod) {
        await supabase.from('accounting_periods').update(periodData).eq('id', existingPeriod.id)
      } else {
        await supabase.from('accounting_periods').insert(periodData)
      }
      toast.success(`${store.name} — periode ${month}/${year} ditutup`)
      loadPeriods()
    } catch (e) { toast.error('Gagal: ' + String((e as any)?.message || e)) }
    finally { setClosing(false) }
  }

  async function handleOpen(store: any) {
    const p = periods.find(p => p.store_id === store.id)
    if (!p) return
    if (!confirm(`Buka kembali periode ${month}/${year} untuk ${store.name}?`)) return
    await supabase.from('accounting_periods').update({ status: 'open' }).eq('id', p.id)
    toast.success('Periode dibuka kembali')
    loadPeriods()
  }

  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

  return (
    <div className="p-4 space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
        <p className="text-xs font-semibold text-amber-800">Tutup Bulan = Snapshot Persediaan</p>
        <p className="text-xs text-amber-700 mt-0.5">Sistem menyimpan nilai persediaan akhir sebagai data permanen untuk laporan keuangan.</p>
      </div>
      <div className="flex gap-2">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm">
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm">
          {months.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {(stores||[]).map((store, idx) => {
          const period   = periods.find(p => p.store_id === store.id)
          const isClosed = period?.status === 'closed'
          return (
            <div key={store.id} className={`flex items-center px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{store.name}</p>
                {isClosed ? (
                  <p className="text-xs text-gray-400">
                    Ditutup {new Date(period.closed_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'})}
                    {' · '}Persediaan Akhir: {formatRupiah(period.closing_stock_value)}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">Status: Open</p>
                )}
              </div>
              {isClosed ? (
                <button onClick={() => handleOpen(store)} disabled={closing}
                  className="px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-600 rounded-lg">
                  Buka Kembali
                </button>
              ) : (
                <button onClick={() => handleClose(store)} disabled={closing}
                  className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                  {closing ? '...' : 'Tutup Bulan'}
                </button>
              )}
            </div>
          )
        })}
        {(stores||[]).length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">Memuat toko...</div>
        )}
      </div>
    </div>
  )
}
