// src/pages/accounting/AccountingPage.tsx
// CHANGELOG:
// - Fix: setoranList props bug (SetoranTab menghandle state sendiri)
// - Owner: bisa input setoran untuk toko mana saja (store selector)
// - Owner/Manager: filter toko di list setoran
// - Approve/Reject hanya owner

import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X, CheckCircle, Clock, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

type SetoranStatus = 'pending' | 'approved' | 'rejected'
type Tab = 'setoran' | 'ringkasan'

interface Setoran {
  id: string; store_id: string; store_name?: string; amount: number
  bank_account?: string; transfer_date: string; status: SetoranStatus
  notes?: string; submitted_by: string; submitted_at: string
  approved_by?: string; approved_at?: string; rejection_reason?: string
}

function useSetoran() {
  const [list, setList] = useState<Setoran[]>([])
  const [loaded, setLoaded] = useState(false)
  async function load() {
    try {
      const { data } = await supabase.from('setoran').select('*').order('submitted_at', { ascending: false })
      if (data) { setList(data); localStorage.setItem('setoran_cache', JSON.stringify(data)) }
      else throw new Error('no data')
    } catch {
      try { setList(JSON.parse(localStorage.getItem('setoran_cache') || '[]')) } catch {}
    }
    setLoaded(true)
  }
  useEffect(() => { load() }, [])
  return { list, setList, loaded, reload: load }
}

export default function AccountingPage() {
  const { user } = useAuthStore()
  const isOwner        = user?.role === 'owner'
  const isOwnerManager = ['owner','manager'].includes(user?.role || '')
  const [tab, setTab]       = useState<Tab>('setoran')
  const [syncing, setSyncing] = useState(false)
  const { list, setList, loaded, reload } = useSetoran()

  async function syncData() {
    setSyncing(true)
    try { await reload(); toast.success('Data diperbarui') }
    catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900">Accounting</h1>
          <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400 rounded-full">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
        <div className="flex gap-4 border-b border-gray-100">
          {([{id:'setoran',label:'Setoran'},{id:'ringkasan',label:'Ringkasan'}] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab===t.id?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'setoran'   && <SetoranTab userId={user!.id} storeId={user!.store_id} isOwner={isOwner} isOwnerManager={isOwnerManager} list={list} setList={setList} loaded={loaded} />}
        {tab === 'ringkasan' && <RingkasanTab isOwnerManager={isOwnerManager} storeId={user!.store_id} list={list} />}
      </div>
    </div>
  )
}

// ── TAB SETORAN ───────────────────────────────────────────────
function SetoranTab({ userId, storeId, isOwner, isOwnerManager, list, setList, loaded }: {
  userId: string; storeId: string; isOwner: boolean; isOwnerManager: boolean
  list: Setoran[]; setList: (l: Setoran[]) => void; loaded: boolean
}) {
  const [showForm,     setShowForm]     = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | SetoranStatus>('all')
  const [filterStore,  setFilterStore]  = useState('semua')
  const [search,       setSearch]       = useState('')
  // Owner: pilih toko mana yang mau di-input setoran
  const [inputStoreId, setInputStoreId] = useState(storeId)

  const stores   = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])
  const storeMap = Object.fromEntries((stores||[]).map(s => [s.id, s.name]))

  const filtered = useMemo(() => {
    let l = isOwnerManager ? list : list.filter(s => s.store_id === storeId)
    if (filterStatus !== 'all') l = l.filter(s => s.status === filterStatus)
    if (filterStore !== 'semua') l = l.filter(s => s.store_id === filterStore)
    if (search) {
      const q = search.toLowerCase()
      l = l.filter(s =>
        storeMap[s.store_id]?.toLowerCase().includes(q) ||
        s.bank_account?.toLowerCase().includes(q) ||
        String(s.amount).includes(q) ||
        s.notes?.toLowerCase().includes(q)
      )
    }
    return l.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
  }, [list, filterStatus, filterStore, search, isOwnerManager, storeId, storeMap])

  async function handleApprove(s: Setoran) {
    if (!isOwner) return toast.error('Hanya owner yang bisa approve')
    const upd = { ...s, status: 'approved' as SetoranStatus, approved_by: userId, approved_at: now() }
    try {
      await supabase.from('setoran').update({ status:'approved', approved_by:userId, approved_at:now() }).eq('id', s.id)
    } catch {}
    const newList = list.map(x => x.id === s.id ? upd : x)
    setList(newList); localStorage.setItem('setoran_cache', JSON.stringify(newList))
    toast.success('Setoran disetujui')
  }

  async function handleReject(s: Setoran) {
    if (!isOwner) return toast.error('Hanya owner yang bisa tolak')
    const reason = prompt('Alasan penolakan:')
    if (reason === null) return
    const upd = { ...s, status: 'rejected' as SetoranStatus, approved_by: userId, approved_at: now(), rejection_reason: reason }
    try {
      await supabase.from('setoran').update({ status:'rejected', approved_by:userId, approved_at:now(), rejection_reason:reason }).eq('id', s.id)
    } catch {}
    const newList = list.map(x => x.id === s.id ? upd : x)
    setList(newList); localStorage.setItem('setoran_cache', JSON.stringify(newList))
    toast.success('Setoran ditolak')
  }

  const statusConfig = {
    pending:  { label:'Menunggu',  color:'text-amber-600 bg-amber-50',  icon:Clock },
    approved: { label:'Disetujui', color:'text-green-600 bg-green-50',  icon:CheckCircle },
    rejected: { label:'Ditolak',   color:'text-red-600 bg-red-50',      icon:XCircle },
  }

  const totalPending  = filtered.filter(s => s.status==='pending').reduce((s,x) => s+x.amount, 0)
  const totalApproved = filtered.filter(s => s.status==='approved').reduce((s,x) => s+x.amount, 0)

  return (
    <div className="p-4 space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-xs text-amber-600 mb-1">Pending</p>
          <p className="text-base font-bold text-amber-700">{formatRupiah(totalPending)}</p>
          <p className="text-xs text-amber-500">{filtered.filter(s=>s.status==='pending').length} setoran</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3">
          <p className="text-xs text-green-600 mb-1">Disetujui</p>
          <p className="text-base font-bold text-green-700">{formatRupiah(totalApproved)}</p>
          <p className="text-xs text-green-500">{filtered.filter(s=>s.status==='approved').length} setoran</p>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari toko, jumlah, rekening..." />

      {/* Filter toko */}
      {isOwnerManager && stores && stores.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilterStore('semua')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore==='semua'?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
            Semua Toko
          </button>
          {stores.map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Filter status + tombol input */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto flex-1">
          {(['all','pending','approved','rejected'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStatus===s?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              {s==='all'?'Semua':statusConfig[s].label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex-shrink-0 flex items-center gap-1 text-xs font-medium border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={12} /> Input
        </button>
      </div>

      {/* List */}
      {!loaded ? (
        <div className="bg-white rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400">Memuat...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada setoran</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.map((s, idx) => {
            const sc   = statusConfig[s.status]
            const Icon = sc.icon
            return (
              <div key={s.id} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${sc.color}`}>
                        <Icon size={10} />{sc.label}
                      </span>
                      {isOwnerManager && (
                        <span className="text-xs font-medium text-gray-700">{storeMap[s.store_id] || s.store_id}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(s.submitted_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})},{' '}
                      {new Date(s.submitted_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}
                    </p>
                    {s.bank_account && <p className="text-xs text-gray-400">→ {s.bank_account}</p>}
                    {s.notes && <p className="text-xs text-gray-500 italic">{s.notes}</p>}
                    {s.status==='rejected' && s.rejection_reason && (
                      <p className="text-xs text-red-500 mt-0.5">Alasan: {s.rejection_reason}</p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(s.amount)}</p>
                </div>
                {/* Approve/Reject — hanya owner, hanya pending */}
                {isOwner && s.status==='pending' && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleApprove(s)}
                      className="flex-1 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium flex items-center justify-center gap-1">
                      <CheckCircle size={12} /> Setujui
                    </button>
                    <button onClick={() => handleReject(s)}
                      className="flex-1 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium flex items-center justify-center gap-1">
                      <XCircle size={12} /> Tolak
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Owner: pilih toko sebelum input */}
      {showForm && (
        <SetoranForm
          userId={userId}
          storeId={isOwnerManager ? inputStoreId : storeId}
          storeName={storeMap[isOwnerManager ? inputStoreId : storeId] || 'Toko'}
          isOwnerManager={isOwnerManager}
          stores={stores||[]}
          selectedStoreId={inputStoreId}
          onSelectStore={setInputStoreId}
          onClose={() => setShowForm(false)}
          onSaved={newS => {
            const newList = [newS, ...list]
            setList(newList); localStorage.setItem('setoran_cache', JSON.stringify(newList))
          }}
        />
      )}
    </div>
  )
}

// ── FORM SETORAN ──────────────────────────────────────────────
function SetoranForm({ userId, storeId, storeName, isOwnerManager, stores, selectedStoreId, onSelectStore, onClose, onSaved }: {
  userId: string; storeId: string; storeName: string
  isOwnerManager: boolean; stores: any[]; selectedStoreId: string
  onSelectStore: (id: string) => void
  onClose: () => void; onSaved: (s: Setoran) => void
}) {
  const [amount,       setAmount]   = useState('')
  const [bankAccount,  setBank]     = useState('')
  const [transferDate, setDate]     = useState(new Date().toISOString().slice(0,10))
  const [notes,        setNotes]    = useState('')
  const [saving,       setSaving]   = useState(false)
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]))

  async function handleSave() {
    if (!amount || Number(amount) <= 0) return toast.error('Jumlah setoran wajib diisi')
    setSaving(true)
    try {
      const setoran: Setoran = {
        id: generateId(), store_id: storeId, store_name: storeName,
        amount: Number(amount), bank_account: bankAccount||undefined,
        transfer_date: transferDate, status: 'pending',
        notes: notes||undefined, submitted_by: userId, submitted_at: now(),
      }
      try { await supabase.from('setoran').insert(setoran) } catch {}
      onSaved(setoran)
      toast.success('Setoran berhasil diinput')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Input Setoran</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Owner: pilih toko */}
          {isOwnerManager && stores.length > 1 ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Toko</label>
              <select className="input" value={selectedStoreId} onChange={e => onSelectStore(e.target.value)}>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs text-blue-700 font-medium">Toko: {storeName}</p>
              <p className="text-xs text-blue-500 mt-0.5">Setoran akan menunggu persetujuan owner</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Jumlah Setoran (Rp) *</label>
            <input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Rekening Tujuan</label>
            <input className="input" value={bankAccount} onChange={e => setBank(e.target.value)} placeholder="BCA 1234567890 a.n. CV Coco Puff" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Tanggal Transfer</label>
            <input className="input" type="date" value={transferDate} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Catatan</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Setoran kasir 29 Mei 2026..." />
          </div>
          <div className="flex gap-3 pt-1 border-t border-gray-100">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
              {saving?'Menyimpan...':'Submit Setoran'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TAB RINGKASAN ─────────────────────────────────────────────
function RingkasanTab({ isOwnerManager, storeId, list }: { isOwnerManager: boolean; storeId: string; list: Setoran[] }) {
  const stores   = useLiveQuery(() => db.stores.toArray(), [])
  const storeMap = Object.fromEntries((stores||[]).map(s => [s.id, s.name]))
  const filtered = isOwnerManager ? list : list.filter(s => s.store_id === storeId)

  const perToko = useMemo(() => {
    if (!isOwnerManager) return []
    const map: Record<string, { pending:number; approved:number; rejected:number; total:number }> = {}
    for (const s of filtered) {
      if (!map[s.store_id]) map[s.store_id] = { pending:0, approved:0, rejected:0, total:0 }
      map[s.store_id][s.status] += s.amount
      map[s.store_id].total     += s.amount
    }
    return Object.entries(map).map(([sid, vals]) => ({ storeId:sid, storeName:storeMap[sid]||sid, ...vals }))
      .sort((a,b) => b.total - a.total)
  }, [filtered, storeMap, isOwnerManager])

  const grandTotal    = filtered.reduce((s,x) => s+x.amount, 0)
  const totalApproved = filtered.filter(s=>s.status==='approved').reduce((s,x) => s+x.amount, 0)
  const totalPending  = filtered.filter(s=>s.status==='pending').reduce((s,x) => s+x.amount, 0)

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ringkasan Setoran</p></div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-gray-600">Total Setoran</span><span className="font-semibold text-gray-900">{formatRupiah(grandTotal)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-green-600">Disetujui</span><span className="font-medium text-green-700">{formatRupiah(totalApproved)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-amber-600">Menunggu</span><span className="font-medium text-amber-700">{formatRupiah(totalPending)}</span></div>
        </div>
      </div>

      {isOwnerManager && perToko.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Per Toko</p></div>
          {perToko.map((t, idx) => (
            <div key={t.storeId} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900">{t.storeName}</p>
                <p className="text-sm font-semibold text-gray-900">{formatRupiah(t.total)}</p>
              </div>
              <div className="flex gap-3 text-xs text-gray-400">
                <span className="text-green-600">✓ {formatRupiah(t.approved)}</span>
                <span className="text-amber-600">⏳ {formatRupiah(t.pending)}</span>
                {t.rejected > 0 && <span className="text-red-500">✗ {formatRupiah(t.rejected)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-medium mb-1">Setup Supabase (jika tabel belum ada)</p>
        <pre className="text-[10px] text-blue-500 mt-1.5 overflow-x-auto bg-blue-100 rounded p-2 whitespace-pre-wrap">{`CREATE TABLE IF NOT EXISTS setoran (
  id text PRIMARY KEY,
  store_id text NOT NULL,
  store_name text,
  amount numeric NOT NULL,
  bank_account text,
  transfer_date date,
  status text DEFAULT 'pending',
  notes text,
  submitted_by text,
  submitted_at timestamptz DEFAULT now(),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text
);`}</pre>
      </div>
    </div>
  )
}
