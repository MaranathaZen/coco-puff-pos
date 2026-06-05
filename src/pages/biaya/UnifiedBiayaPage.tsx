// src/pages/biaya/UnifiedBiayaPage.tsx
// CHANGELOG v3:
// - FIX CRITICAL: syntax error kurung tutup kurang di useLiveQuery filter kasir → halaman crash
// - FIX: label card "Total Biaya Bulan Ini" → "Total Biaya Hari Ini" untuk kasir
// - FIX: subtitle card kasir tampilkan jumlah transaksi (bukan "Data milik Anda saja")
// - FIX: totalBulanIni untuk kasir hitung hari ini saja
// - Semua fix v2 tetap berlaku

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

async function generateExpenseNumber() {
  const ds = new Date().toISOString().slice(0,10).replace(/-/g,'')
  const prefix = `BIA-${ds}-`
  const ex = await db.warehouse_expenses.filter(e => (e as any).expense_number?.startsWith(prefix)).toArray()
  return `${prefix}${String(ex.length+1).padStart(3,'0')}`
}

const KATEGORI_BIAYA = [
  { value: 'beban_bahan_baku',   label: 'Bahan Baku',   desc: 'Bahan produksi' },
  { value: 'beban_tenaga_kerja', label: 'Tenaga Kerja', desc: 'Gaji, upah' },
  { value: 'beban_sewa',         label: 'Sewa',         desc: 'Sewa tempat' },
  { value: 'beban_utilitas',     label: 'Utilitas',     desc: 'Listrik, air, gas' },
  { value: 'beban_packaging',    label: 'Packaging',    desc: 'Dus, plastik' },
  { value: 'beban_transport',    label: 'Transport',    desc: 'Pengiriman, bbm' },
  { value: 'beban_pemasaran',    label: 'Pemasaran',    desc: 'Iklan, promo' },
  { value: 'beban_lainnya',      label: 'Lainnya',      desc: 'ATK, kebersihan' },
]
const METODE_BAYAR = [
  { value: 'tunai',    label: 'Tunai'    },
  { value: 'transfer', label: 'Transfer' },
  { value: 'kredit',   label: 'Kredit'   },
]

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
  return (
    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
      {children}{required && <span className="text-red-500 font-bold ml-0.5">*</span>}
    </label>
  )
}
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-600 ml-1 align-middle">
      {copied ? '✓' : '⧉'}
    </button>
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
        : await supabase.from('warehouse_expenses').select('*')
            .eq('store_id', user?.store_id || '')
            .order('created_at', { ascending: false }).limit(200)

      if (data !== null) {
        if (isOwnerManager) {
          await db.warehouse_expenses.clear()
          if (data.length) await db.warehouse_expenses.bulkPut(data)
        } else {
          const local = await db.warehouse_expenses
            .filter(e => (e as any).store_id === user?.store_id || e.created_by === user?.id)
            .primaryKeys()
          if (local.length) await db.warehouse_expenses.bulkDelete(local)
          if (data.length) await db.warehouse_expenses.bulkPut(data)
        }
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
          <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400 rounded-full">
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

function BiayaList({ userId, role, storeId, setToolbarActions }: { userId: string; role: string; storeId: string; setToolbarActions: (n: React.ReactNode) => void }) {
  const setToolbar = setToolbarActions
  const [showForm,  setShowForm]  = useState(false)
  const [groupMode, setGroupMode] = useState<Period>('hari')
  const [filterCat, setFilterCat] = useState('semua')
  const [search,    setSearch]    = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({
    [new Date().toISOString().slice(0, 10)]: true
  }))

  const isOwnerManager = ['owner','manager','gudang'].includes(role)
  const isKasir = role === 'kasir'
  const [filterStore, setFilterStore] = useState(() => role === 'gudang' ? storeId : '')

  const stores = useLiveQuery(() =>
    isOwnerManager
      ? db.stores.filter(s => s.is_active && !s.id.includes('produksi')).toArray()
      : Promise.resolve([])
  , [isOwnerManager])

  useEffect(() => {
    if (stores && stores.length > 0 && !filterStore) {
      setFilterStore(stores[0].id)
    }
  }, [stores])

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        {/* FIX #1: kasir tidak perlu dropdown per hari/bulan */}
        {!isKasir && (
          <select value={groupMode} onChange={e => setGroupMode(e.target.value as Period)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600">
            <option value="hari">Per Hari</option>
            <option value="bulan">Per Bulan</option>
          </select>
        )}
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={13} /> Catat
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode, isKasir])

  const expenses = useLiveQuery(async () => {
    let list = await db.warehouse_expenses.orderBy('created_at').reverse().toArray()
    if (role === 'kasir') {
      // FIX: kurung tutup yang kurang menyebabkan syntax error — halaman crash
      list = list.filter(e => (e as any).store_id === storeId || e.created_by === userId)
    } else if (role === 'produksi') {
      list = list.filter(e => e.created_by === userId)
    }
    // owner/manager/gudang: lihat semua
    return list
  }, [role, userId, storeId])

  const filteredByStore = useMemo(() => {
    if (!expenses) return []
    if (!isOwnerManager || !filterStore) return expenses
    return expenses.filter(e => (e as any).store_id === filterStore)
  }, [expenses, isOwnerManager, filterStore])

  const filtered = useMemo(() => {
    if (!filteredByStore) return []
    let list = filteredByStore
    if (filterCat !== 'semua') list = list.filter(e => e.category === filterCat)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e as any).expense_number?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q)
      )
    }
    return list
  }, [filteredByStore, filterCat, search])

  const grouped = useMemo(() => groupBy(filtered, e => groupKey(e.created_at, groupMode)), [filtered, groupMode])

  // FIX: kasir hitung total hari ini, owner/manager hitung bulan ini
  const { totalCardAmount, totalCardCount } = useMemo(() => {
    const now2 = new Date()
    const todayStr = now2.toLocaleDateString('sv-SE')
    const baseList = filteredByStore || []
    if (isKasir) {
      const todayList = baseList.filter(e => {
        const d = new Date(e.created_at)
        return d.toLocaleDateString('sv-SE') === todayStr
      })
      return { totalCardAmount: todayList.reduce((s, e) => s + e.amount, 0), totalCardCount: todayList.length }
    } else {
      const monthList = baseList.filter(e => {
        const d = new Date(e.created_at)
        return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
      })
      return { totalCardAmount: monthList.reduce((s, e) => s + e.amount, 0), totalCardCount: monthList.length }
    }
  }, [filteredByStore, isKasir])

  return (
    <div className="p-4 space-y-3">
      {/* FIX: label dan subtitle card */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">
          {isKasir ? 'Total Biaya Hari Ini' : 'Total Biaya Bulan Ini'}
        </p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalCardAmount)}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {isKasir
            ? `${totalCardCount} transaksi hari ini`
            : `${totalCardCount} transaksi`}
        </p>
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

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari keterangan biaya..." />

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        <button onClick={() => setFilterCat('semua')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterCat==='semua'?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
          Semua
        </button>
        {KATEGORI_BIAYA.map(k => (
          <button key={k.value} onClick={() => setFilterCat(k.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterCat===k.value?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
            {k.label}
          </button>
        ))}
      </div>

      {/* FIX #4: kasir tampil flat tanpa group/collapse */}
      {isKasir ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.length === 0
            ? <div className="py-12 text-center text-sm text-gray-400">Belum ada biaya hari ini</div>
            : filtered.map((e, idx) => (
              <div key={e.id} className={`flex items-start justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                <div className="flex-1 min-w-0">
                  {(e as any).expense_number && (
                    <p className="text-xs font-mono text-blue-600 mb-0.5">{(e as any).expense_number}<CopyBtn text={(e as any).expense_number} /></p>
                  )}
                  <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {KATEGORI_BIAYA.find(k => k.value === e.category)?.label || e.category}
                    {' · '}{new Date(e.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}
                    {(e as any).payment_method ? ` · ${(e as any).payment_method}` : ''}
                  </p>
                  {e.notes && <p className="text-xs text-gray-500 italic mt-0.5">📝 {e.notes}</p>}
                </div>
                <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(e.amount)}</p>
              </div>
            ))
          }
        </div>
      ) : (
        <>
          {grouped.map(({ key, items: grpItems }) => {
            const total    = grpItems.reduce((s, e) => s + e.amount, 0)
            const today    = new Date().toLocaleDateString('sv-SE')
            const isFirst  = grouped.indexOf(grouped.find(g => g.key === key)!) === 0
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
                  {grpItems.map((e, idx) => (
                    <div key={e.id} className={`flex items-start justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                      <div className="flex-1 min-w-0">
                        {(e as any).expense_number && (
                          <p className="text-xs font-mono text-blue-600 mb-0.5">{(e as any).expense_number}<CopyBtn text={(e as any).expense_number} /></p>
                        )}
                        <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {KATEGORI_BIAYA.find(k => k.value === e.category)?.label || e.category}
                          {' · '}{new Date(e.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})},{' '}
                          {new Date(e.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}
                          {(e as any).payment_method ? ` · ${(e as any).payment_method}` : ''}
                        </p>
                        {e.notes && <p className="text-xs text-gray-500 italic mt-0.5">📝 {e.notes}</p>}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(e.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada catatan biaya</div>
          )}
        </>
      )}
      {showForm && <BiayaForm userId={userId} storeId={storeId} role={role} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function BiayaForm({ userId, storeId, role, onClose }: { userId: string; storeId: string; role: string; onClose: () => void }) {
  const isOwnerManager = ['owner','manager'].includes(role)
  const allStores = useLiveQuery(() =>
    isOwnerManager ? db.stores.filter(s => s.is_active).toArray() : Promise.resolve([])
  , [isOwnerManager])
  const [inputAsStore, setInputAsStore] = useState(storeId)
  const activeStoreId = isOwnerManager ? inputAsStore : storeId

  const [name,       setName]       = useState('')
  const [amount,     setAmount]     = useState('')
  const [category,   setCat]        = useState('beban_lainnya')
  const [payMethod,  setPay]        = useState('tunai')
  const [transferTo, setTransferTo] = useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    if (!name.trim())               return toast.error('Keterangan wajib diisi')
    if (!amount || Number(amount) <= 0) return toast.error('Jumlah wajib diisi')
    setSaving(true)
    try {
      const expNumber = await generateExpenseNumber()
      const data: any = {
        id: generateId(), expense_number: expNumber,
        store_id: activeStoreId, name: name.trim(),
        amount: Number(amount), expense_date: new Date().toLocaleDateString('sv-SE'),
        category, payment_method: payMethod,
        transfer_to: transferTo || undefined,
        due_date:    dueDate    || undefined,
        notes:       notes      || undefined,
        created_by: userId, created_at: now(),
      }
      await db.warehouse_expenses.add(data)
      const { error } = await supabase.from('warehouse_expenses').insert(data)
      if (error) console.error('[BIAYA INSERT ERROR]', error)
      toast.success('Biaya dicatat')
      onClose()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Biaya" onClose={onClose}>
      {isOwnerManager && allStores && allStores.length > 0 && (
        <div>
          <Label>Input Sebagai</Label>
          <select className="input" value={inputAsStore} onChange={e => setInputAsStore(e.target.value)}>
            {allStores
              .filter(s => !s.id.includes('produksi'))
              .map(s => (
                <option key={s.id} value={s.id}>
                  {s.name.replace(' Malang','').replace(' Bali','')}
                </option>
              ))}
          </select>
        </div>
      )}
      <div><Label required>Keterangan</Label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Bayar listrik Mei 2026" autoFocus />
      </div>
      <div><Label required>Jumlah (Rp)</Label>
        <input className="input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g,''))} placeholder="0" />
      </div>
      <div><Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {KATEGORI_BIAYA.map(c => (
            <button key={c.value} onClick={() => setCat(c.value)}
              className={`px-3 py-2 rounded-xl text-left border transition-colors ${category===c.value?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>
              <p className="text-xs font-medium">{c.label}</p>
              <p className={`text-[10px] leading-tight mt-0.5 ${category===c.value?'text-gray-300':'text-gray-400'}`}>{c.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div><Label required>Metode Bayar</Label>
        <div className="flex gap-2">
          {METODE_BAYAR.map(m => (
            <button key={m.value} onClick={() => setPay(m.value)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${payMethod===m.value?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {payMethod === 'transfer' && (
        <div><Label>Transfer ke</Label>
          <input className="input" value={transferTo} onChange={e => setTransferTo(e.target.value)} placeholder="BCA 1234567890" />
        </div>
      )}
      {payMethod === 'kredit' && (
        <div><Label>Jatuh Tempo</Label>
          <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      )}
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
