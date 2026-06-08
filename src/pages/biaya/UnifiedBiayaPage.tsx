// src/pages/biaya/UnifiedBiayaPage.tsx
// CHANGELOG v6:
// - FEAT: Void biaya — owner/manager bisa void, tidak ada rollback stok (biaya = uang keluar)
// - UI: Row voided tampil strikethrough + badge "Dibatalkan"
// - Total biaya exclude voided

import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'

type Period = 'hari' | 'bulan'
function groupKey(d: string, m: Period) { return m === 'hari' ? d.slice(0,10) : d.slice(0,7) }
function groupLabel(d: string, m: Period) {
  const dt = new Date(d)
  return m === 'hari'
    ? dt.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : dt.toLocaleDateString('id-ID', { month:'long', year:'numeric' })
}
function groupBy<T>(arr: T[], fn: (i: T) => string) {
  const map = new Map<string, T[]>()
  for (const item of arr) { const k = fn(item); if (!map.has(k)) map.set(k,[]); map.get(k)!.push(item) }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
}

const KATEGORI_BIAYA = [
  { value: 'operasional',  label: 'Operasional'  },
  { value: 'utilitas',     label: 'Utilitas'      },
  { value: 'gaji',         label: 'Gaji/Upah'     },
  { value: 'transportasi', label: 'Transportasi'  },
  { value: 'lainnya',      label: 'Lainnya'       },
]

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-600 ml-1 align-middle">
      {copied ? '✓' : '⧉'}
    </button>
  )
}

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

// ── VOID CONFIRM MODAL ────────────────────────────────────────
function VoidConfirmModal({ expNumber, description, onConfirm, onClose }: {
  expNumber: string; description: string; onConfirm: () => Promise<void>; onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  async function handleConfirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <span className="text-red-600 text-lg">⚠</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Batalkan Biaya?</p>
            <p className="text-xs text-gray-500 mt-0.5">{expNumber}</p>
            <p className="text-xs text-gray-700 mt-0.5 font-medium">{description}</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Biaya ini akan ditandai sebagai dibatalkan dan tidak terhitung di total. Aksi ini tidak bisa diurungkan.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">
            Batal
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50">
            {loading ? 'Memproses...' : 'Ya, Batalkan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UnifiedBiayaPage() {
  const { user } = useAuthStore()
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const isOwnerManager = ['owner','manager','gudang'].includes(user?.role || '')
      const { data } = isOwnerManager
        ? await supabase.from('warehouse_expenses').select('*').order('created_at', { ascending: false }).limit(500)
        : await supabase.from('warehouse_expenses').select('*').eq('store_id', user?.store_id).order('created_at', { ascending: false }).limit(200)
      if (data !== null) {
        await db.warehouse_expenses.clear()
        if (data.length) await db.warehouse_expenses.bulkPut(data)
      }
    } catch { /* silent on mount */ }
    finally { setSyncing(false) }
  }

  useEffect(() => { syncData() }, [])

  async function syncDataWithToast() {
    setSyncing(true)
    try {
      const isOwnerManager = ['owner','manager','gudang'].includes(user?.role || '')
      const { data } = isOwnerManager
        ? await supabase.from('warehouse_expenses').select('*').order('created_at', { ascending: false }).limit(500)
        : await supabase.from('warehouse_expenses').select('*').eq('store_id', user?.store_id).order('created_at', { ascending: false }).limit(200)
      if (data !== null) {
        await db.warehouse_expenses.clear()
        if (data.length) await db.warehouse_expenses.bulkPut(data)
      }
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Biaya</h1>
        <div className="flex items-center gap-2">
          {toolbarActions}
          <button onClick={syncDataWithToast} disabled={syncing} className="p-2 text-gray-400 rounded-full">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-50">
        <BiayaList userId={user!.id} role={user!.role} storeId={user!.store_id || ''} setToolbarActions={setToolbarActions} />
      </div>
    </div>
  )
}

function BiayaList({ userId, role, storeId, setToolbarActions }: {
  userId: string; role: string; storeId: string; setToolbarActions: (n: React.ReactNode) => void
}) {
  const [showForm,    setShowForm]    = useState(false)
  const [groupMode,   setGroupMode]   = useState<Period>('hari')
  const [search,      setSearch]      = useState('')
  const [filterStore, setFilterStore] = useState('')
  const [filterKat,   setFilterKat]   = useState('semua')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({
    [new Date().toLocaleDateString('sv-SE')]: true
  }))
  const [voidTarget, setVoidTarget] = useState<{ id: string; expNumber: string; description: string } | null>(null)

  const isOwnerManager = ['owner','manager','gudang'].includes(role)
  const isKasir = role === 'kasir'

  const stores = useLiveQuery(() =>
    isOwnerManager
      ? db.stores.filter(s => s.is_active && !s.id.includes('produksi')).toArray()
      : Promise.resolve([])
  , [isOwnerManager])

  useEffect(() => {
    if (stores && stores.length > 0 && !filterStore) setFilterStore(stores[0].id)
  }, [stores])

  useEffect(() => {
    setToolbarActions(
      <div className="flex items-center gap-2">
        {!isKasir && (
          <select value={groupMode} onChange={e => setGroupMode(e.target.value as Period)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600">
            <option value="hari">Per Hari</option>
            <option value="bulan">Per Bulan</option>
          </select>
        )}
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={13} /> Baru
        </button>
      </div>
    )
    return () => setToolbarActions(null)
  }, [groupMode, isKasir])

  const expenses = useLiveQuery(async () => {
    let list = await db.warehouse_expenses.orderBy('created_at').reverse().toArray()
    if (role === 'kasir') {
      const today = new Date().toLocaleDateString('sv-SE')
      list = list.filter(e => {
        const belongsToStore = (e as any).store_id === storeId || e.created_by === userId
        const dateStr = e.created_at
          ? e.created_at.slice(0, 10)
          : ((e as any).expense_date || '').slice(0, 10)
        return belongsToStore && dateStr === today
      })
    } else if (role === 'produksi') {
      list = list.filter(e => e.created_by === userId)
    }
    return list
  }, [role, userId, storeId])

  const storeMap = Object.fromEntries((stores || []).map(s => [s.id, s.name]))

  const filtered = useMemo(() => {
    if (!expenses) return []
    let list = expenses
    if (isOwnerManager && filterStore) list = list.filter(e => (e as any).store_id === filterStore || e.created_by === userId)
    if (filterKat !== 'semua') list = list.filter(e => (e as any).category === filterKat)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.description?.toLowerCase().includes(q) ||
        (e as any).name?.toLowerCase().includes(q) ||
        (e as any).category?.toLowerCase().includes(q)
      )
    }
    return list
  }, [expenses, filterStore, filterKat, search, isOwnerManager])

  const grouped = useMemo(() => groupBy(filtered, e => groupKey(e.created_at, groupMode)), [filtered, groupMode])

  // Exclude voided dari total
  const totalCard = filtered.filter(e => (e as any).status !== 'voided').reduce((s, e) => s + e.amount, 0)
  const totalCount = filtered.filter(e => (e as any).status !== 'voided').length

  // ── VOID HANDLER ─────────────────────────────────────────
  async function handleVoidBiaya(expenseId: string) {
    try {
      await db.warehouse_expenses.update(expenseId, { status: 'voided', voided_at: now() } as any)
      await supabase.from('warehouse_expenses').update({
        status: 'voided',
        voided_at: new Date().toISOString(),
      }).eq('id', expenseId)

      toast.success('Biaya dibatalkan')
      setVoidTarget(null)
    } catch (e) {
      console.error('[VoidBiaya]', e)
      toast.error('Gagal membatalkan biaya')
    }
  }

  function BiayaRow({ e, idx }: { e: any; idx: number }) {
    const isVoided    = (e as any).status === 'voided'
    const katLabel    = KATEGORI_BIAYA.find(k => k.value === e.category)?.label || e.category || 'Lainnya'
    const displayName = e.description || e.name || 'Biaya'
    const expNo       = (e as any).expense_number
    return (
      <div className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${isVoided ? 'opacity-50 bg-gray-50' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {expNo && (
                <p className={`text-xs font-mono text-blue-600 ${isVoided ? 'line-through' : ''}`}>
                  {expNo}
                  {!isVoided && <CopyBtn text={expNo} />}
                </p>
              )}
              {isVoided && (
                <span className="text-[10px] font-medium text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                  Dibatalkan
                </span>
              )}
            </div>
            <p className={`text-sm font-medium text-gray-900 ${isVoided ? 'line-through' : ''}`}>{displayName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{katLabel}</span>
              {isOwnerManager && storeMap[(e as any).store_id] && (
                <span className="text-xs text-gray-300">· {storeMap[(e as any).store_id]}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(e.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})},{' '}
              {new Date(e.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}
            </p>
            {e.notes && <p className="text-xs text-gray-500 italic mt-0.5">📝 {e.notes}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <p className={`text-sm font-semibold text-gray-900 ${isVoided ? 'line-through' : ''}`}>
              {formatRupiah(e.amount)}
            </p>
            {isOwnerManager && !isVoided && (
              <button
                onClick={() => setVoidTarget({ id: e.id, expNumber: expNo || e.id, description: displayName })}
                className="text-[10px] font-medium text-red-400 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                Void
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">{isKasir ? 'Total Biaya Hari Ini' : 'Total Biaya'}</p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalCard)}</p>
        <p className="text-xs text-gray-400 mt-0.5">{totalCount} transaksi</p>
      </div>

      {isOwnerManager && stores && stores.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {stores.map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name.replace(' Malang','').replace(' Bali','')}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        <button onClick={() => setFilterKat('semua')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterKat==='semua'?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
          Semua
        </button>
        {KATEGORI_BIAYA.map(k => (
          <button key={k.value} onClick={() => setFilterKat(k.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterKat===k.value?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
            {k.label}
          </button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari deskripsi biaya..." />

      {isKasir ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.length === 0
            ? <div className="py-12 text-center text-sm text-gray-400">Belum ada biaya hari ini</div>
            : filtered.map((e, idx) => <BiayaRow key={e.id} e={e} idx={idx} />)
          }
        </div>
      ) : (
        <>
          {grouped.map(({ key, items: grpItems }) => {
            // Total per grup exclude voided
            const total   = grpItems.filter(e => (e as any).status !== 'voided').reduce((s, e) => s + e.amount, 0)
            const today   = new Date().toLocaleDateString('sv-SE')
            const isFirst = grouped[0]?.key === key
            const expanded = expandedGroups[key] !== undefined ? expandedGroups[key] : (key === today || isFirst)
            return (
              <div key={key}>
                <button onClick={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))}
                  className="w-full flex items-center justify-between px-1 py-2">
                  <div className="flex items-center gap-2">
                    <svg className={`w-3 h-3 text-gray-400 transition-transform ${expanded?'rotate-90':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                    <p className="text-xs font-semibold text-gray-600">{groupLabel(grpItems[0].created_at, groupMode)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{grpItems.length} item</span>
                    <span className="text-xs font-medium text-gray-700">{formatRupiah(total)}</span>
                  </div>
                </button>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ display: expanded ? undefined : 'none' }}>
                  {grpItems.map((e, idx) => <BiayaRow key={e.id} e={e} idx={idx} />)}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada biaya</div>
          )}
        </>
      )}

      {showForm && <BiayaForm userId={userId} storeId={storeId} role={role} onClose={() => setShowForm(false)} />}

      {voidTarget && (
        <VoidConfirmModal
          expNumber={voidTarget.expNumber}
          description={voidTarget.description}
          onConfirm={() => handleVoidBiaya(voidTarget.id)}
          onClose={() => setVoidTarget(null)}
        />
      )}
    </div>
  )
}

function BiayaForm({ userId, storeId, role, onClose }: {
  userId: string; storeId: string; role: string; onClose: () => void
}) {
  const isOwnerManager = ['owner','manager'].includes(role)
  const allStores = useLiveQuery(() =>
    isOwnerManager ? db.stores.filter(s => s.is_active && !s.id.includes('produksi')).toArray() : Promise.resolve([])
  , [isOwnerManager])
  const [inputAsStore, setInputAsStore] = useState(storeId)
  const activeStoreId = isOwnerManager ? inputAsStore : storeId

  const [description, setDescription] = useState('')
  const [amount,      setAmount]      = useState('')
  const [category,    setCategory]    = useState('operasional')
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  async function handleSave() {
    if (!description.trim()) return toast.error('Deskripsi wajib diisi')
    if (!amount || Number(amount) <= 0) return toast.error('Jumlah wajib diisi')
    setSaving(true)
    try {
      const nowStr    = now()
      const todayDate = new Date().toLocaleDateString('sv-SE')
      const ds        = todayDate.replace(/-/g, '')
      const prefix    = `BIA-${ds}-`
      const existing  = await db.warehouse_expenses.filter(e => (e as any).expense_number?.startsWith(prefix)).toArray()
      const expNumber = `${prefix}${String(existing.length + 1).padStart(3, '0')}`
      const data: any = {
        id:             generateId(),
        store_id:       activeStoreId,
        description:    description.trim(),
        name:           description.trim(),
        amount:         Number(amount),
        category:       category,
        expense_date:   todayDate,
        expense_number: expNumber,
        status:         'done',
        created_by:     userId,
        created_at:     nowStr,
      }
      if (notes?.trim()) data.notes = notes.trim()
      await db.warehouse_expenses.put(data)
      const { error } = await supabase.from('warehouse_expenses').upsert(data)
      if (error) {
        console.error('[BIAYA ERROR]', error)
        toast.error('Tersimpan lokal, gagal sync: ' + error.message)
      } else {
        toast.success('Biaya dicatat')
      }
      onClose()
    } catch (e) {
      console.error('[BIAYA]', e)
      toast.error('Gagal menyimpan')
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Biaya" onClose={onClose}>
      {isOwnerManager && allStores && allStores.length > 0 && (
        <div>
          <Label>Input Sebagai</Label>
          <select className="input" value={inputAsStore} onChange={e => setInputAsStore(e.target.value)}>
            {allStores.map(s => <option key={s.id} value={s.id}>{s.name.replace(' Malang','').replace(' Bali','')}</option>)}
          </select>
        </div>
      )}
      <div><Label required>Deskripsi</Label>
        <input className="input" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Contoh: Bensin motor, Sabun cuci, dll" autoFocus />
      </div>
      <div><Label required>Jumlah (Rp)</Label>
        <input className="input text-lg font-semibold" inputMode="decimal" value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9]/g,''))} placeholder="0" />
      </div>
      <div><Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {KATEGORI_BIAYA.map(k => (
            <button key={k.value} onClick={() => setCategory(k.value)}
              className={`py-2.5 rounded-xl text-xs font-medium border text-left px-3 transition-colors ${category===k.value?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div><Label>Catatan</Label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}
