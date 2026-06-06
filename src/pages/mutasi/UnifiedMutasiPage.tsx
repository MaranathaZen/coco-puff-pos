// src/pages/mutasi/UnifiedMutasiPage.tsx
// CHANGELOG v6:
// - FIX: produksi lihat mutasi yang diterima (destination_id === storeId)
// - FIX: owner/manager default ke gudang saat buka form mutasi
// - FIX: template mutasi tampil pengirim → penerima setelah ID

import { useState, useMemo, useEffect, useContext, createContext } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, type WarehouseMutationItem } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'

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
  const ds = new Date().toISOString().slice(0,10).replace(/-/g,'')
  const prefix = `MUT-${ds}-`
  const ex = await db.warehouse_mutations.filter(m => (m as any).mutation_number?.startsWith(prefix)).toArray()
  return `${prefix}${String(ex.length+1).padStart(3,'0')}`
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  to_production: { label: 'ke Produksi',  color: 'text-blue-600 bg-blue-50'     },
  to_store:      { label: 'ke Toko',      color: 'text-green-600 bg-green-50'   },
  to_partner:    { label: 'ke Franchise', color: 'text-purple-600 bg-purple-50' },
  internal_use:  { label: 'Pemakaian',    color: 'text-amber-600 bg-amber-50'   },
  adjustment:    { label: 'Retur',        color: 'text-red-600 bg-red-50'       },
  opening_stock: { label: 'Stok Awal',    color: 'text-orange-600 bg-orange-50' },
}
const ROLE_TYPES: Record<string, string[]> = {
  owner:    ['to_production','to_store','to_partner','internal_use','adjustment'],
  manager:  ['to_production','to_store','to_partner','internal_use','adjustment'],
  gudang:   ['to_production','to_store','to_partner','internal_use','adjustment'],
  produksi: ['to_store','to_partner','internal_use','adjustment'],
  kasir:    ['to_store','internal_use','adjustment'],
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

export default function UnifiedMutasiPage() {
  const { user } = useAuthStore()
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const [m, mi, mats, stores, partners, prods, fgStock, wstock, pstock, stock] = await Promise.all([
        supabase.from('warehouse_mutations').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('warehouse_mutation_items').select('*'),
        supabase.from('materials').select('*'),
        supabase.from('stores').select('*'),
        supabase.from('partners').select('*'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('finished_goods_stock').select('*'),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('production_stock').select('*'),
        supabase.from('stock').select('*'),
      ])
      if (m.data !== null)   { await db.warehouse_mutations.clear();      if (m.data.length)   await db.warehouse_mutations.bulkPut(m.data)      }
      if (mi.data !== null)  { await db.warehouse_mutation_items.clear(); if (mi.data.length)  await db.warehouse_mutation_items.bulkPut(mi.data) }
      if (mats.data?.length)     await db.materials.bulkPut(mats.data)
      if (stores.data?.length)   await db.stores.bulkPut(stores.data)
      if (partners.data?.length) await db.partners.bulkPut(partners.data)
      if (prods.data?.length)    await db.products.bulkPut(prods.data)
      if (fgStock.data?.length)  await db.finished_goods_stock.bulkPut(fgStock.data)
      if (wstock.data?.length)   await db.warehouse_stock.bulkPut(wstock.data)
      if (pstock.data?.length)   await db.production_stock.bulkPut(pstock.data)
      if (stock.data !== null)   { await db.stock.clear(); if (stock.data.length) await db.stock.bulkPut(stock.data) }
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
          <MutasiList userId={user!.id} role={user!.role} storeId={user!.store_id || ''} />
        </div>
      </ToolbarCtx.Provider>
    </div>
  )
}

function MutasiList({ userId, role, storeId }: { userId: string; role: string; storeId: string }) {
  const setToolbar  = useContext(ToolbarCtx)
  const [showForm,  setShowForm]  = useState(false)
  const [groupMode, setGroupMode] = useState<Period>('hari')
  const [filterType,  setFilterType]  = useState('semua')
  const [filterStore, setFilterStore] = useState('')
  const [search,      setSearch]      = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const today = new Date().toLocaleDateString('sv-SE')
    return { [today]: true }
  })

  const isOwnerManager = ['owner','manager'].includes(role)
  const isKasir = role === 'kasir'

  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])

  useEffect(() => {
    if (!isOwnerManager) return
    if (stores && stores.length > 0 && !filterStore) setFilterStore('semua')
  }, [stores, isOwnerManager])

  useEffect(() => {
    setToolbar(
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
    return () => setToolbar(null)
  }, [groupMode, isKasir])

  const mutations = useLiveQuery(async () => {
    let m = await db.warehouse_mutations.orderBy('created_at').reverse().toArray()
    if (role === 'kasir') {
      const today = new Date().toLocaleDateString('sv-SE')
      m = m.filter(x =>
        x.created_at.slice(0, 10) === today && (
          x.destination_id === storeId ||
          x.created_by === userId ||
          (x as any).acting_store_id === storeId
        )
      )
    } else if (role === 'produksi') {
      // FIX: produksi lihat yang dibuat sendiri DAN yang diterima
      m = m.filter(x =>
        x.created_by === userId ||
        x.destination_id === storeId ||
        (x as any).acting_store_id === storeId
      )
    } else if (role === 'gudang') {
      m = m.filter(x => x.created_by === userId || x.destination_id === storeId)
    }
    const mi    = await db.warehouse_mutation_items.toArray()
    const mats  = await db.materials.toArray()
    const prods = await db.products.toArray()
    const mMap  = Object.fromEntries(mats.map(m => [m.id, m]))
    const pMap  = Object.fromEntries(prods.map(p => [p.id, p]))
    return m.map(x => ({
      ...x,
      items: mi.filter(i => i.mutation_id === x.id).map(i => ({
        ...i, material: mMap[i.material_id] || pMap[i.material_id] || null,
      })),
    }))
  }, [role, userId, storeId])

  const storeMap = Object.fromEntries((stores||[]).map(s => [s.id, s.name]))

  const filtered = useMemo(() => {
    if (!mutations) return []
    let list = mutations
    if (filterType !== 'semua') list = list.filter(m => m.mutation_type === filterType)
    if (isOwnerManager && filterStore && filterStore !== 'semua') {
      list = list.filter(m =>
        m.destination_id === filterStore ||
        (m as any).acting_store_id === filterStore ||
        (m as any).created_by_store === filterStore
      )
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.destination_name?.toLowerCase().includes(q) ||
        (m as any).mutation_number?.toLowerCase().includes(q) ||
        m.items.some(i => (i.material as any)?.name?.toLowerCase().includes(q))
      )
    }
    return list
  }, [mutations, filterType, filterStore, search, isOwnerManager])

  const grouped = useMemo(() => groupBy(filtered, m => groupKey(m.created_at, groupMode)), [filtered, groupMode])

  const { totalNilaiMutasi, totalCountCard } = useMemo(() => {
    const now2 = new Date()
    const todayStr = now2.toLocaleDateString('sv-SE')
    const baseList = mutations || []
    if (isKasir) {
      const todayMuts = baseList.filter(m => new Date(m.created_at).toLocaleDateString('sv-SE') === todayStr)
      return {
        totalNilaiMutasi: todayMuts.reduce((s, m) => s + m.items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0), 0),
        totalCountCard: todayMuts.length,
      }
    } else {
      const monthMuts = baseList.filter(m => {
        const d = new Date(m.created_at)
        return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
      })
      return {
        totalNilaiMutasi: monthMuts.reduce((s, m) => s + m.items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0), 0),
        totalCountCard: baseList.length,
      }
    }
  }, [mutations, isKasir])

  function MutasiItem({ m, idx }: { m: any; idx: number }) {
    const tc         = TYPE_CONFIG[m.mutation_type] || { label: m.mutation_type, color: 'text-gray-600 bg-gray-100' }
    const totalNilai = m.items.reduce((s: number, i: any) => s + i.qty * i.unit_cost, 0)
    const mutNo      = (m as any).mutation_number
    const pengirim   = storeMap[(m as any).acting_store_id || ''] || (m as any).acting_store_id || ''
    const penerima   = m.destination_name || storeMap[m.destination_id || ''] || TYPE_CONFIG[m.mutation_type]?.label || ''
    return (
      <div className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {mutNo && <p className="text-xs font-mono text-blue-600 mb-0.5">{mutNo}<CopyBtn text={mutNo} /></p>}
            {/* FIX: baris pengirim → penerima */}
            {(pengirim || penerima) && (
              <div className="flex items-center gap-1 text-xs mb-0.5">
                <span className="font-medium text-gray-700">{pengirim || '—'}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-gray-700">{penerima || '—'}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tc.color}`}>{tc.label}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(m.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })},{' '}
              {new Date(m.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12:false })}
            </p>
            {(m as any).notes && <p className="text-xs text-gray-500 italic mt-0.5">📝 {(m as any).notes}</p>}
          </div>
          {totalNilai > 0 && <p className="text-sm font-semibold text-gray-900 flex-shrink-0 ml-3">{formatRupiah(totalNilai)}</p>}
        </div>
        {m.items.length > 0 && (
          <div className="mt-2 space-y-0.5 border-t border-gray-50 pt-1.5">
            {m.items.map((i: any) => {
              const mat      = i.material as any
              const subtotal = i.qty * i.unit_cost
              return (
                <div key={i.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">
                    {mat?.name || '—'} × {i.qty}{mat?.unit ? ` ${mat.unit}` : ''}{i.unit_cost > 0 ? ` @ ${formatRupiah(i.unit_cost)}` : ''}
                  </span>
                  {subtotal > 0 && <span className="text-gray-500 ml-2 flex-shrink-0">{formatRupiah(subtotal)}</span>}
                </div>
              )
            })}
            {m.items.length > 1 && totalNilai > 0 && (
              <div className="flex justify-between text-xs font-semibold text-gray-700 pt-1 border-t border-gray-100 mt-1">
                <span>Total Nilai</span><span>{formatRupiah(totalNilai)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">
          {isKasir ? 'Total Nilai Mutasi Hari Ini' : 'Total Nilai Mutasi Bulan Ini'}
        </p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalNilaiMutasi)}</p>
        <p className="text-xs text-gray-400 mt-0.5">{totalCountCard} transaksi</p>
      </div>

      {isOwnerManager && stores && stores.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilterStore('semua')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore==='semua'?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
            Semua
          </button>
          {[
            ...((stores||[]).filter(s => s.id.includes('gudang'))),
            ...((stores||[]).filter(s => s.id.includes('produksi'))),
            ...((stores||[]).filter(s => !s.id.includes('gudang') && !s.id.includes('produksi'))),
          ].map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name.replace(' Malang','').replace(' Bali','')}
            </button>
          ))}
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari tujuan, nama bahan, ID mutasi..." />

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {['semua', ...Object.keys(TYPE_CONFIG)].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType === t ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {t === 'semua' ? 'Semua' : (TYPE_CONFIG[t]?.label || t)}
          </button>
        ))}
      </div>

      {isKasir ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.length === 0
            ? <div className="py-12 text-center text-sm text-gray-400">Belum ada mutasi hari ini</div>
            : filtered.map((m, idx) => <MutasiItem key={m.id} m={m} idx={idx} />)
          }
        </div>
      ) : (
        <>
          {grouped.map(({ key, items: grpItems }) => {
            const total    = grpItems.reduce((s, m) => s + m.items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0), 0)
            const today    = new Date().toLocaleDateString('sv-SE')
            const isFirst  = grouped[0]?.key === key
            const expanded = expandedGroups[key] !== undefined ? expandedGroups[key] : (key === today || isFirst)
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
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ display: expanded ? undefined : 'none' }}>
                  {grpItems.map((m, idx) => <MutasiItem key={m.id} m={m} idx={idx} />)}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada mutasi</div>
          )}
        </>
      )}

      {showForm && <MutasiForm userId={userId} role={role} storeId={storeId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── FORM MUTASI ───────────────────────────────────────────────
function MutasiForm({ userId, role, storeId, onClose }: { userId: string; role: string; storeId: string; onClose: () => void }) {
  const isOwnerManager = ['owner','manager'].includes(role)
  const allStores = useLiveQuery(() =>
    isOwnerManager ? db.stores.filter(s => s.is_active).toArray() : Promise.resolve([])
  , [isOwnerManager])

  const [inputAsRole,  setInputAsRole]  = useState(role)
  const [inputAsStore, setInputAsStore] = useState(storeId)

  // FIX: owner/manager default ke gudang saat allStores tersedia
  useEffect(() => {
    if (!isOwnerManager || !allStores || allStores.length === 0) return
    if (inputAsStore === storeId || !inputAsStore) {
      const gudang = (allStores as any[]).find((s: any) => s.id.includes('gudang'))
      if (gudang) {
        setInputAsStore(gudang.id)
        setInputAsRole('gudang')
      }
    }
  }, [allStores])

  const effectiveRole    = isOwnerManager ? inputAsRole  : role
  const effectiveStoreId = isOwnerManager ? inputAsStore : storeId

  const materials  = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const partners   = useLiveQuery(() => db.partners.filter(p => p.is_active).toArray(), [])
  const stores     = useLiveQuery(() => db.stores.filter(s => s.is_active && !(s as any).is_virtual).toArray(), [])

  const warehouseStocks = useLiveQuery(async () => {
    if (!['owner','manager','gudang'].includes(effectiveRole)) return []
    const ws   = await db.warehouse_stock.toArray()
    const mats = await db.materials.filter(m => m.is_active).toArray()
    const mMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return ws.filter(s => s.qty_on_hand > 0).map(s => ({
      id: s.material_id, name: mMap[s.material_id]?.name || '',
      unit: mMap[s.material_id]?.unit || '', qty: s.qty_on_hand,
      avg_cost: (mMap[s.material_id] as any)?.avg_cost || mMap[s.material_id]?.unit_cost || 0,
    })).filter(s => s.name)
  }, [effectiveRole])

  const prodStocks = useLiveQuery(async () => {
    if (effectiveRole !== 'produksi') return []
    const ps   = await db.production_stock.toArray()
    const mats = await db.materials.toArray()
    const mMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return ps.filter(s => s.qty_on_hand > 0).map(s => ({
      id: s.material_id, name: mMap[s.material_id]?.name || '',
      unit: mMap[s.material_id]?.unit || '', qty: s.qty_on_hand,
      avg_cost: (s as any).avg_cost || mMap[s.material_id]?.unit_cost || 0,
      category: mMap[s.material_id]?.category || '',
    })).filter(s => s.name)
  }, [effectiveRole])

  const fgStocks = useLiveQuery(async () => {
    if (effectiveRole !== 'produksi') return []
    return await db.finished_goods_stock.filter(f => f.qty_on_hand > 0).toArray()
  }, [effectiveRole])

  const storeStocks = useLiveQuery(async () => {
    if (effectiveRole !== 'kasir') return []
    const stocks = await db.stock.where('store_id').equals(effectiveStoreId).toArray()
    const mats   = await db.materials.toArray()
    const mMap   = Object.fromEntries(mats.map(m => [m.id, m]))
    const result: { id: string; name: string; unit: string; qty: number }[] = []
    for (const s of stocks) {
      const qty = s.qty_on_hand || (s as any).qty || 0
      if (qty <= 0) continue
      const id  = (s as any).material_id || s.ingredient_id || ''
      const mat = mMap[id]
      if (!mat) continue
      result.push({ id, name: mat.name, unit: mat.unit || 'pcs', qty })
    }
    return result
  }, [effectiveStoreId, effectiveRole])

  const availableTypes = ROLE_TYPES[effectiveRole] || ROLE_TYPES.gudang
  const [type,   setType]   = useState(availableTypes[0])
  const [destId, setDest]   = useState('')
  const [notes,  setNotes]  = useState('')
  const [items,  setItems]  = useState([{ material_id: '', qty: '' }])
  const [saving, setSaving] = useState(false)

  function getOptions(): { id: string; name: string; unit: string; qty: number | null; avg_cost?: number }[] {
    if (effectiveRole === 'kasir') return (storeStocks || [])
    if (effectiveRole === 'produksi') {
      if (type === 'to_store' || type === 'to_partner') {
        return (fgStocks || []).map((f: any) => ({
          id: f.product_id ?? f.id, name: f.product_name ?? f.name, unit: 'pcs', qty: f.qty_on_hand,
        }))
      }
      const bahanOpts = (prodStocks || []).map(s => ({ id: s.id, name: s.name, unit: s.unit, qty: s.qty, avg_cost: s.avg_cost }))
      const fgOpts    = (fgStocks || []).map((f: any) => ({
        id: f.product_id ?? f.id, name: `${f.product_name ?? f.name} (Produk Jadi)`,
        unit: 'pcs', qty: f.qty_on_hand, avg_cost: (f as any).hpp_per_unit || 0,
      }))
      return [...bahanOpts, ...fgOpts]
    }
    return (warehouseStocks || []).map(s => ({ id: s.id, name: s.name, unit: s.unit, qty: s.qty, avg_cost: s.avg_cost }))
  }

  function getSnapshotCost(materialId: string): number {
    if (effectiveRole === 'produksi') {
      const fg = (fgStocks || []).find((f: any) => (f.product_id ?? f.id) === materialId)
      if (fg) return (fg as any).hpp_per_unit || 0
      const ps = (prodStocks || []).find(s => s.id === materialId)
      if (ps) return ps.avg_cost || 0
    }
    const ws = (warehouseStocks || []).find(s => s.id === materialId)
    if (ws) return ws.avg_cost || 0
    return materials?.find(m => m.id === materialId)?.unit_cost || 0
  }

  function getAvailableQty(materialId: string): number {
    if (effectiveRole === 'kasir') return (storeStocks || []).find(s => s.id === materialId)?.qty || 0
    if (effectiveRole === 'produksi') {
      if (type === 'to_store' || type === 'to_partner') {
        const fg = (fgStocks || []).find((f: any) => (f.product_id ?? f.id) === materialId)
        return fg?.qty_on_hand || 0
      }
      return (prodStocks || []).find(s => s.id === materialId)?.qty || 0
    }
    return (warehouseStocks || []).find(s => s.id === materialId)?.qty || 0
  }

  const totalNilai = items.reduce((s, item) => s + Number(item.qty) * getSnapshotCost(item.material_id), 0)

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length)                    return toast.error('Tambahkan minimal 1 item')
    if (type === 'to_store'   && !destId) return toast.error('Pilih toko tujuan')
    if (type === 'to_partner' && !destId) return toast.error('Pilih franchise tujuan')
    if (type !== 'adjustment') {
      const opts = getOptions()
      if (opts.length > 0) {
        for (const item of valid) {
          const available = getAvailableQty(item.material_id)
          const opt = opts.find(o => o.id === item.material_id)
          if (available > 0 && Number(item.qty) > available) {
            return toast.error(`Stok ${opt?.name || 'bahan'} tidak cukup (tersedia: ${available} ${opt?.unit || ''})`)
          }
        }
      }
    }
    setSaving(true)
    try {
      const destName =
        type === 'to_production' ? 'Produksi' :
        type === 'to_store'      ? (stores?.find(s => s.id === destId)?.name || '') :
        type === 'to_partner'    ? partners?.find(p => p.id === destId)?.name || '' :
        type === 'internal_use'  ? 'Pemakaian Internal' : ''
      const mutId     = generateId()
      const mutNumber = await generateMutationNumber()
      const mut: any  = {
        id: mutId, mutation_number: mutNumber, mutation_type: type,
        destination_id: destId || undefined, destination_name: destName || undefined,
        notes: notes || undefined, status: 'confirmed',
        created_by: userId, acting_store_id: effectiveStoreId,
        created_at: now(), confirmed_at: now(), confirmed_by: userId,
      }
      await db.warehouse_mutations.put(mut)
      const { error: mutErr } = await supabase.from('warehouse_mutations').upsert(mut)
      if (mutErr) { console.error('[MUT INSERT ERROR]', mutErr); throw new Error(mutErr.message) }

      for (const item of valid) {
        const snapshotCost = getSnapshotCost(item.material_id)
        const mi: WarehouseMutationItem = {
          id: generateId(), mutation_id: mutId, material_id: item.material_id,
          qty: Number(item.qty), unit_cost: snapshotCost,
        }
        await db.warehouse_mutation_items.put(mi as any)
        const { error: miErr } = await supabase.from('warehouse_mutation_items').upsert(mi)
        if (miErr) console.error('[MUT ITEM ERROR]', miErr)

        if (effectiveRole === 'kasir') {
          const ss = await db.stock.filter(s =>
            s.store_id === effectiveStoreId && (
              (s as any).material_id === item.material_id || s.ingredient_id === item.material_id
            )
          ).first()
          if (ss) {
            const newQty = Math.max(0, (ss.qty_on_hand || 0) - Number(item.qty))
            await db.stock.update(ss.id, { qty_on_hand: newQty, last_updated: now() } as any)
            await supabase.from('stock').update({ qty_on_hand: newQty }).eq('id', ss.id)
          }
        } else if (effectiveRole === 'produksi') {
          const isFg = (type === 'to_store' || type === 'to_partner') &&
            (fgStocks || []).some((f: any) => (f.product_id ?? f.id) === item.material_id)
          if (isFg) {
            const fg = await db.finished_goods_stock.filter((f: any) => (f.product_id ?? f.id) === item.material_id).first()
            if (fg) {
              const n = Math.max(0, fg.qty_on_hand - Number(item.qty))
              await db.finished_goods_stock.update(fg.id, { qty_on_hand: n, last_updated: now() })
              await supabase.from('finished_goods_stock').update({ qty_on_hand: n, last_updated: now() }).eq('id', fg.id)
            }
          } else {
            const ps = await db.production_stock.where('material_id').equals(item.material_id).first()
            if (ps) {
              const n = Math.max(0, ps.qty_on_hand - Number(item.qty))
              await db.production_stock.update(ps.id, { qty_on_hand: n, last_updated: now() })
              await supabase.from('production_stock').update({ qty_on_hand: n, last_updated: now() }).eq('id', ps.id)
            }
          }
        } else {
          const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
          if (ws) {
            const n = Math.max(0, ws.qty_on_hand - Number(item.qty))
            await db.warehouse_stock.update(ws.id, { qty_on_hand: n, last_updated: now() })
            await supabase.from('warehouse_stock').update({ qty_on_hand: n, last_updated: now() }).eq('id', ws.id)
          }
        }

        if (type === 'to_production') {
          const ps = await db.production_stock.where('material_id').equals(item.material_id).first()
          const prevQty  = ps?.qty_on_hand || 0
          const prevCost = (ps as any)?.avg_cost || 0
          const inQty    = Number(item.qty)
          const newQty   = prevQty + inQty
          const newAvg   = newQty > 0 ? (prevQty * prevCost + inQty * snapshotCost) / newQty : snapshotCost
          const psd: any = { id: ps?.id || generateId(), material_id: item.material_id, qty_on_hand: newQty, avg_cost: newAvg, last_updated: now() }
          await db.production_stock.put(psd)
          await supabase.from('production_stock').upsert(psd)
        }

        if (type === 'to_store' && destId) {
          const existingStock = await db.stock.filter(s =>
            s.store_id === destId && (
              (s as any).material_id === item.material_id || s.ingredient_id === item.material_id
            )
          ).first()
          const prevQty  = existingStock?.qty_on_hand || 0
          const prevCost = (existingStock as any)?.avg_cost ?? 0
          const inQty    = Number(item.qty)
          const newQty   = prevQty + inQty
          const newAvg   = newQty > 0 ? (prevQty * prevCost + inQty * snapshotCost) / newQty : snapshotCost
          if (existingStock) {
            await db.stock.update(existingStock.id, { qty_on_hand: newQty, avg_cost: newAvg, last_updated: now() } as any)
            await supabase.from('stock').update({ qty_on_hand: newQty, avg_cost: newAvg, last_updated: now() }).eq('id', existingStock.id)
          } else {
            const newStock: any = { id: generateId(), store_id: destId, ingredient_id: item.material_id, material_id: item.material_id, qty_on_hand: inQty, avg_cost: newAvg, last_updated: now() }
            await db.stock.add(newStock)
            await supabase.from('stock').upsert({ id: newStock.id, store_id: destId, ingredient_id: item.material_id, material_id: item.material_id, qty_on_hand: inQty, avg_cost: newAvg })
          }
        }
      }
      toast.success('Mutasi berhasil dicatat')
      onClose()
    } catch (e) {
      console.error('[MutasiForm]', e)
      toast.error('Gagal menyimpan: ' + String((e as any)?.message || e))
    } finally { setSaving(false) }
  }

  const opts = getOptions()

  return (
    <Modal title="Catat Mutasi" onClose={onClose}>
      {isOwnerManager && allStores && allStores.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Input Sebagai</label>
          <select className="input" value={inputAsStore} onChange={e => {
            const store = allStores.find(s => s.id === e.target.value)
            setInputAsStore(e.target.value)
            if (!store) return
            if (store.id.includes('gudang')) setInputAsRole('gudang')
            else if (store.id.includes('produksi')) setInputAsRole('produksi')
            else setInputAsRole('kasir')
          }}>
            {allStores.map(s => (
              <option key={s.id} value={s.id}>{s.name.replace(' Malang','').replace(' Bali','')}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
          Tujuan <span className="text-red-500 font-bold">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {availableTypes.map(t => (
            <button key={t} onClick={() => { setType(t); setDest(''); setItems([{ material_id:'', qty:'' }]) }}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${type === t ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
              {TYPE_CONFIG[t]?.label || t}
            </button>
          ))}
        </div>
      </div>
      {type === 'to_store' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Toko Tujuan *</label>
          <select className={`input ${!destId ? 'border-red-200' : ''}`} value={destId} onChange={e => setDest(e.target.value)}>
            <option value="">-- Pilih toko</option>
            {stores?.filter(s => s.id !== effectiveStoreId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {type === 'to_partner' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Franchise *</label>
          <select className={`input ${!destId ? 'border-red-200' : ''}`} value={destId} onChange={e => setDest(e.target.value)}>
            <option value="">-- Pilih franchise</option>
            {partners?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
          Item <span className="text-red-500 font-bold">*</span>
        </label>
        {opts.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400">
            {role === 'kasir' ? 'Tidak ada stok tersedia di toko ini' : 'Tidak ada bahan dengan stok tersedia'}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => {
              const selOpt    = opts.find(o => o.id === item.material_id)
              const cost      = getSnapshotCost(item.material_id)
              const available = item.material_id ? getAvailableQty(item.material_id) : null
              const isOver    = available !== null && available > 0 && Number(item.qty) > available
              return (
                <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                  <select className="input text-sm" value={item.material_id}
                    onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, material_id: e.target.value, qty: '' } : x))}>
                    <option value="">Pilih bahan / produk</option>
                    {opts.map(o => <option key={o.id} value={o.id}>{o.name} — stok: {o.qty} {o.unit}</option>)}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      className={`input text-sm flex-1 ${isOver ? 'border-red-300 bg-red-50' : ''}`}
                      inputMode="decimal"
                      placeholder={`Qty${selOpt ? ` (max ${selOpt.qty} ${selOpt.unit})` : ''}`}
                      value={item.qty}
                      onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, qty: e.target.value.replace(/[^0-9.]/g, '') } : x))}
                    />
                    {item.qty && cost > 0 && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatRupiah(Number(item.qty) * cost)}</span>
                    )}
                  </div>
                  {isOver && <p className="text-xs text-red-500">⚠ Melebihi stok tersedia ({available} {selOpt?.unit})</p>}
                  {items.length > 1 && (
                    <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-400">Hapus item ini</button>
                  )}
                </div>
              )
            })}
            <button onClick={() => setItems(p => [...p, { material_id: '', qty: '' }])} className="mt-1 text-sm text-blue-600 font-medium">+ Tambah Item</button>
          </div>
        )}
      </div>
      {totalNilai > 0 && (
        <div className="flex items-center justify-between py-2 bg-gray-50 rounded-xl px-3">
          <span className="text-sm text-gray-600">Total Nilai</span>
          <span className="text-sm font-semibold text-gray-900">{formatRupiah(totalNilai)}</span>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Catatan</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving || opts.length === 0}
          className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}
