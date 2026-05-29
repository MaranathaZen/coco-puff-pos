// src/pages/mutasi/UnifiedMutasiPage.tsx
import { useState, useMemo, useEffect, useContext, createContext } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { WarehouseStock, WarehouseMutationItem } from '@/lib/db'

const ToolbarCtx = createContext<(n: React.ReactNode) => void>(() => {})

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

async function generateMutationNumber() {
  const today = new Date()
  const ds = today.toISOString().slice(0,10).replace(/-/g,'')
  const prefix = `MUT-${ds}-`
  const ex = await db.warehouse_mutations.filter(m => (m as any).mutation_number?.startsWith(prefix)).toArray()
  return `${prefix}${String(ex.length+1).padStart(3,'0')}`
}

function Modal({ title, onClose, children }: any) {
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

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  to_production:  { label: 'ke Produksi',  color: 'text-blue-600 bg-blue-50' },
  to_store:       { label: 'ke Toko',      color: 'text-green-600 bg-green-50' },
  to_partner:     { label: 'ke Franchise', color: 'text-purple-600 bg-purple-50' },
  internal_use:   { label: 'Pemakaian',    color: 'text-amber-600 bg-amber-50' },
  adjustment:     { label: 'Retur',        color: 'text-red-600 bg-red-50' },
  opening_stock:  { label: 'Stok Awal',    color: 'text-orange-600 bg-orange-50' },
}

// Types available per role
const ROLE_TYPES: Record<string, string[]> = {
  owner:    ['to_production','to_store','to_partner','internal_use','adjustment'],
  manager:  ['to_production','to_store','to_partner','internal_use','adjustment'],
  gudang:   ['to_production','to_store','to_partner','internal_use','adjustment'],
  produksi: ['to_store','to_partner','internal_use','adjustment'],
  kasir:    ['to_store','internal_use','adjustment'],
}

export default function UnifiedMutasiPage() {
  const { user } = useAuthStore()
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const [m, mi, mats, stores, partners] = await Promise.all([
        supabase.from('warehouse_mutations').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('warehouse_mutation_items').select('*'),
        supabase.from('materials').select('*'),
        supabase.from('stores').select('*'),
        supabase.from('partners').select('*'),
      ])
      if (m.data?.length)       { await db.warehouse_mutations.clear(); await db.warehouse_mutations.bulkPut(m.data) }
      if (mi.data?.length)      { await db.warehouse_mutation_items.clear(); await db.warehouse_mutation_items.bulkPut(mi.data) }
      if (mats.data?.length)    await db.materials.bulkPut(mats.data)
      if (stores.data?.length)  await db.stores.bulkPut(stores.data)
      if (partners.data?.length) await db.partners.bulkPut(partners.data)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Mutasi</h1>
        <div className="flex items-center gap-2">
          {toolbarActions}
          <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400 rounded-full">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>
      <ToolbarCtx.Provider value={setToolbarActions}>
        <div className="flex-1 overflow-auto bg-gray-50">
          <MutasiList userId={user!.id} role={user!.role} />
        </div>
      </ToolbarCtx.Provider>
    </div>
  )
}

function MutasiList({ userId, role }: { userId: string; role: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm] = useState(false)
  const [groupMode, setGroupMode] = useState<Period>('hari')
  const [filterType, setFilterType] = useState('semua')
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <select value={groupMode} onChange={e => setGroupMode(e.target.value as Period)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600">
          <option value="hari">Per Hari</option>
          <option value="bulan">Per Bulan</option>
        </select>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={13} /> Baru
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const mutations = useLiveQuery(async () => {
    const m    = await db.warehouse_mutations.orderBy('created_at').reverse().toArray()
    const mi   = await db.warehouse_mutation_items.toArray()
    const mats = await db.materials.toArray()
    const mMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return m.map(x => ({
      ...x,
      items: mi.filter(i => i.mutation_id === x.id).map(i => ({ ...i, material: mMap[i.material_id] }))
    }))
  }, [])

  const filtered = useMemo(() => {
    if (!mutations) return []
    let list = mutations
    if (filterType !== 'semua') list = list.filter(m => m.mutation_type === filterType)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.destination_name?.toLowerCase().includes(q) ||
        (m as any).mutation_number?.toLowerCase().includes(q) ||
        m.items.some(i => i.material?.name?.toLowerCase().includes(q))
      )
    }
    return list
  }, [mutations, filterType, search])

  const grouped = useMemo(() => groupBy(filtered, m => groupKey(m.created_at, groupMode)), [filtered, groupMode])

  const totalNilaiMutasi = useMemo(() => {
    const now2 = new Date()
    return (mutations || []).filter(m => {
      const d = new Date(m.created_at)
      return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
    }).reduce((s, m) => s + m.items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0), 0)
  }, [mutations])

  const filterTypes = ['semua', ...Object.keys(TYPE_CONFIG)]

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">Total Nilai Mutasi Bulan Ini</p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalNilaiMutasi)}</p>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari tujuan, nama bahan, ID mutasi..." />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {filterTypes.map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterType === t ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            {t === 'semua' ? 'Semua' : (TYPE_CONFIG[t]?.label || t)}
          </button>
        ))}
      </div>

      {grouped.map(({ key, items: grpItems }) => {
        const total = grpItems.reduce((s, m) => s + m.items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0), 0)
        const expanded = expandedGroups[key] !== false
        return (
          <div key={key}>
            <button onClick={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))}
              className="w-full flex items-center justify-between px-1 py-2">
              <div className="flex items-center gap-2">
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
                <p className="text-xs font-semibold text-gray-600">{groupLabel(grpItems[0].created_at, groupMode)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{grpItems.length} item</span>
                {total > 0 && <span className="text-xs font-medium text-gray-700">{formatRupiah(total)}</span>}
              </div>
            </button>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden"
              style={{ display: expanded ? undefined : 'none' }}>
              {grpItems.map((m, idx) => {
                const tc = TYPE_CONFIG[m.mutation_type] || { label: m.mutation_type, color: 'text-gray-600 bg-gray-100' }
                const totalNilai = m.items.reduce((s, i) => s + i.qty * i.unit_cost, 0)
                return (
                  <div key={m.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex-1 min-w-0">
                        {(m as any).mutation_number && <p className="text-xs font-mono text-blue-600 mb-0.5">{(m as any).mutation_number}</p>}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tc.color}`}>{tc.label}</span>
                          {m.destination_name && <span className="text-xs text-gray-700 font-medium">{m.destination_name}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(m.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}, {new Date(m.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                          {m.notes ? ` · ${m.notes}` : ''}
                        </p>
                      </div>
                      {totalNilai > 0 && <p className="text-sm font-semibold text-gray-900 flex-shrink-0 ml-2">{formatRupiah(totalNilai)}</p>}
                    </div>
                    {m.items.length > 0 && (
                      <div className="mt-1.5 border-t border-gray-50 pt-1.5 space-y-0.5">
                        {m.items.map(i => (
                          <div key={i.id} className="flex justify-between text-xs text-gray-400">
                            <span>{i.material?.name} × {i.qty} {i.material?.unit}{i.unit_cost > 0 ? ` @ ${formatRupiah(i.unit_cost)}` : ''}</span>
                            <span>{formatRupiah(i.qty * i.unit_cost)}</span>
                          </div>
                        ))}
                        {m.items.length > 1 && (
                          <div className="flex justify-between text-xs font-medium text-gray-600 pt-1 border-t border-gray-50 mt-1">
                            <span>Total Nilai</span><span>{formatRupiah(totalNilai)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada mutasi</div>
      )}

      {showForm && <MutasiForm userId={userId} role={role} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function MutasiForm({ userId, role, onClose }: { userId: string; role: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const partners  = useLiveQuery(() => db.partners.filter(p => p.is_active).toArray(), [])
  const stores    = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])

  const availableTypes = ROLE_TYPES[role] || ROLE_TYPES.gudang
  const [type, setType]     = useState(availableTypes[0])
  const [destId, setDest]   = useState('')
  const [notes, setNotes]   = useState('')
  const [items, setItems]   = useState([{ material_id: '', qty: '' }])
  const [saving, setSaving] = useState(false)

  const totalNilai = items.reduce((s, item) => {
    const mat = materials?.find(m => m.id === item.material_id)
    return s + Number(item.qty) * (mat?.unit_cost || 0)
  }, 0)

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      const destName = type === 'to_production' ? 'Produksi' :
        type === 'to_store'   ? stores?.find(s => s.id === destId)?.name || '' :
        type === 'to_partner' ? partners?.find(p => p.id === destId)?.name || '' :
        type === 'internal_use' ? 'Pemakaian Internal' : ''

      const mutId = generateId()
      const mutNumber = await generateMutationNumber()
      const mut: any = { id: mutId, mutation_number: mutNumber, mutation_type: type, destination_id: destId || undefined, destination_name: destName || undefined, notes: notes || undefined, status: 'confirmed', created_by: userId, created_at: now(), confirmed_at: now(), confirmed_by: userId }
      await db.warehouse_mutations.add(mut)
      await supabase.from('warehouse_mutations').insert(mut)

      for (const item of valid) {
        const mat = materials?.find(m => m.id === item.material_id)
        const mi: WarehouseMutationItem = { id: generateId(), mutation_id: mutId, material_id: item.material_id, qty: Number(item.qty), unit_cost: mat?.unit_cost || 0 }
        await db.warehouse_mutation_items.add(mi)
        await supabase.from('warehouse_mutation_items').insert(mi)

        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        if (ws) {
          const newQty = type === 'adjustment'
            ? ws.qty_on_hand + Number(item.qty)
            : Math.max(0, ws.qty_on_hand - Number(item.qty))
          await db.warehouse_stock.update(ws.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('warehouse_stock').update({ qty_on_hand: newQty }).eq('id', ws.id)
        } else if (type === 'adjustment') {
          const wsd: WarehouseStock = { id: generateId(), material_id: item.material_id, qty_on_hand: Number(item.qty), last_updated: now() }
          await db.warehouse_stock.add(wsd)
          await supabase.from('warehouse_stock').insert(wsd)
        }

        if (type === 'to_production') {
          const ps = await db.production_stock.where('material_id').equals(item.material_id).first()
          const psd: any = { id: ps?.id || generateId(), material_id: item.material_id, qty_on_hand: (ps?.qty_on_hand || 0) + Number(item.qty), last_updated: now() }
          await db.production_stock.put(psd)
          await supabase.from('production_stock').upsert(psd)
        }
      }
      toast.success('Mutasi dicatat')
      onClose()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Mutasi" onClose={onClose}>
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Tujuan <span className="text-red-400">*</span></label>
        <div className="grid grid-cols-2 gap-2">
          {availableTypes.map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${type === t ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
              {TYPE_CONFIG[t]?.label || t}
            </button>
          ))}
        </div>
      </div>
      {type === 'to_store' && (
        <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Toko Tujuan</label>
          <select className="input" value={destId} onChange={e => setDest(e.target.value)}>
            <option value="">Pilih toko</option>
            {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {type === 'to_partner' && (
        <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Franchise</label>
          <select className="input" value={destId} onChange={e => setDest(e.target.value)}>
            <option value="">Pilih franchise</option>
            {partners?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Item <span className="text-red-400">*</span></label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id} onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x, material_id: e.target.value} : x))}>
                  <option value="">Pilih bahan</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <input className="input text-sm flex-1" type="number" placeholder={`Qty (${mat?.unit || ''})`}
                    value={item.qty} onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x, qty: e.target.value} : x))} />
                  {mat && item.qty && <span className="text-xs text-gray-400 flex-shrink-0">{formatRupiah(Number(item.qty) * mat.unit_cost)}</span>}
                </div>
                {items.length > 1 && <button onClick={() => setItems(p => p.filter((_,idx) => idx !== i))} className="text-xs text-red-400">Hapus</button>}
              </div>
            )
          })}
        </div>
        <button onClick={() => setItems(p => [...p, { material_id:'', qty:'' }])} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>
      {totalNilai > 0 && (
        <div className="flex items-center justify-between py-2 bg-gray-50 rounded-xl px-3">
          <span className="text-sm text-gray-600">Total Nilai</span>
          <span className="text-sm font-semibold text-gray-900">{formatRupiah(totalNilai)}</span>
        </div>
      )}
      <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Catatan</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}
