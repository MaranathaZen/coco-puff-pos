// src/pages/gudang/GudangPage.tsx
import { useState, useEffect, createContext, useContext, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah, formatDate } from '@/lib/utils'
import { Plus, RefreshCw, X, ChevronRight, AlertCircle, Package, Search, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Material, WarehouseStock, Purchase, WarehouseMutation, WarehouseMutationItem, WarehouseExpense } from '@/lib/db'

type Tab = 'stok' | 'pembelian' | 'mutasi' | 'pakai' | 'biaya'

const SATUAN = ['kg','gram','ons','liter','ml','butir','pcs','buah','dus','karton','pack','sachet','roll','lembar','loyang','batch']

const KATEGORI = [
  { value: 'bahan_baku',          label: 'Bahan Baku',        desc: 'Tepung, gula, telur, dll' },
  { value: 'bahan_setengah_jadi', label: 'Setengah Jadi',     desc: 'Premix, adonan siap pakai' },
  { value: 'packaging',           label: 'Packaging',          desc: 'Dus, plastik, kresek, dll' },
  { value: 'non_produksi',        label: 'Non Produksi / ATK', desc: 'Alat tulis, kebersihan' },
  { value: 'operasional',         label: 'Operasional',        desc: 'Bahan bakar, gas, dll' },
]

async function generatePONumber(): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `PO-${dateStr}-`
  const existing = await db.purchases.filter(p => (p as any).po_number?.startsWith(prefix)).toArray()
  return `${prefix}${String(existing.length + 1).padStart(3, '0')}`
}

// Group helper: kelompokkan array by key
function groupBy<T>(arr: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const k = keyFn(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
}

function groupLabel(dateStr: string, mode: 'hari' | 'bulan' | 'tahun'): string {
  const d = new Date(dateStr)
  if (mode === 'hari') return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (mode === 'bulan') return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  return String(d.getFullYear())
}

function groupKey(dateStr: string, mode: 'hari' | 'bulan' | 'tahun'): string {
  const d = new Date(dateStr)
  if (mode === 'hari')   return dateStr.slice(0, 10)
  if (mode === 'bulan')  return dateStr.slice(0, 7)
  return dateStr.slice(0, 4)
}

// Context untuk toolbar actions dari child tabs ke parent header
const ToolbarCtx = createContext<(node: React.ReactNode) => void>(() => {})

export default function GudangPage() {
  const { user } = useAuthStore()
  const [tab, setTab]             = useState<Tab>('stok')
  const [syncing, setSyncing]     = useState(false)
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)

  async function syncData() {
    setSyncing(true)
    try {
      const pulls = await Promise.all([
        supabase.from('materials').select('*'),
        supabase.from('suppliers').select('*'),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('purchase_items').select('*'),
        supabase.from('warehouse_mutations').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('warehouse_mutation_items').select('*'),
        supabase.from('partners').select('*'),
        supabase.from('warehouse_expenses').select('*').order('expense_date', { ascending: false }).limit(200),
      ])
      const tables = ['materials','suppliers','warehouse_stock','purchases','purchase_items',
        'warehouse_mutations','warehouse_mutation_items','partners','warehouse_expenses']
      for (let i = 0; i < tables.length; i++) {
        const data = pulls[i].data
        if (data?.length) await (db as any)[tables[i]].bulkPut(data)
      }
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'stok',      label: 'Stok' },
    { id: 'pembelian', label: 'Pembelian' },
    { id: 'mutasi',    label: 'Mutasi' },
    { id: 'pakai',     label: 'Pemakaian' },
    { id: 'biaya',     label: 'Biaya' },
  ]

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Gudang</h1>
        <div className="flex items-center gap-2">
          {toolbarActions}
          <button onClick={syncData} disabled={syncing}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs — scrollable */}
      <div className="px-4 mt-3 flex gap-0 border-b border-gray-100 overflow-x-auto flex-shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`pb-2.5 mr-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'
            }`}>{t.label}</button>
        ))}
      </div>

      <ToolbarCtx.Provider value={setToolbarActions}>
        <div className="flex-1 overflow-auto bg-gray-50">
          {tab === 'stok'      && <StokTab userId={user!.id} />}
          {tab === 'pembelian' && <PembelianTab userId={user!.id} />}
          {tab === 'mutasi'    && <MutasiTab userId={user!.id} />}
          {tab === 'pakai'     && <PakaiTab userId={user!.id} />}
          {tab === 'biaya'     && <BiayaTab userId={user!.id} />}
        </div>
      </ToolbarCtx.Provider>
    </div>
  )
}

// ── Shared: Search + Group toolbar ───────────────────────────
function TabToolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg active:bg-gray-50 transition-colors whitespace-nowrap">
      <Plus size={13} /> {label}
    </button>
  )
}

function GroupSelect({ value, onChange }: { value: 'hari'|'bulan'|'tahun'; onChange: (v: 'hari'|'bulan'|'tahun') => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value as any)}
        className="appearance-none text-xs font-medium text-gray-600 border border-gray-200 bg-white pl-2.5 pr-6 py-1.5 rounded-lg focus:outline-none">
        <option value="hari">Per Hari</option>
        <option value="bulan">Per Bulan</option>
        <option value="tahun">Per Tahun</option>
      </select>
      <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-100 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-300"
        placeholder={placeholder || 'Cari...'}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

function GroupHeader({ label, total, count }: { label: string; total?: number; count: number }) {
  return (
    <div className="flex items-center justify-between px-1 py-1.5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{count} item</span>
        {total !== undefined && <span className="text-xs font-medium text-gray-700">{formatRupiah(total)}</span>}
      </div>
    </div>
  )
}

// ── STOK ──────────────────────────────────────────────────────
function StokTab({ userId }: { userId: string }) {
  const setToolbar  = useContext(ToolbarCtx)
  const [showForm, setShowForm]       = useState(false)
  const [showOpening, setShowOpening] = useState(false)
  const [editMat, setEditMat]         = useState<Material | null>(null)
  const [filter, setFilter]           = useState('semua')
  const [search, setSearch]           = useState('')

  useEffect(() => {
    setToolbar(
      <TabToolbar>
        <button onClick={() => setShowOpening(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 px-2.5 py-1.5 rounded-lg active:bg-blue-100 transition-colors">
          <Package size={13} /> Stok Awal
        </button>
        <AddButton label="Tambah" onClick={() => { setEditMat(null); setShowForm(true) }} />
      </TabToolbar>
    )
    return () => setToolbar(null)
  }, [])

  const allItems = useLiveQuery(async () => {
    const mats   = await db.materials.toArray()
    const stocks = await db.warehouse_stock.toArray()
    const map    = Object.fromEntries(stocks.map(s => [s.material_id, s]))
    return mats.map(m => ({ ...m, qty: map[m.id]?.qty_on_hand ?? 0 }))
  }, [])

  const items = useMemo(() => {
    if (!allItems) return []
    return allItems
      .filter(m => filter === 'semua' || m.category === filter)
      .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()))
  }, [allItems, filter, search])

  const lowStock   = items.filter(i => i.qty <= i.min_stock && i.is_active)
  const totalNilai = items.reduce((s, i) => s + i.qty * (i.unit_cost || 0), 0)

  return (
    <div className="p-4 space-y-3">
      {lowStock.length > 0 && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">{lowStock.length} item stok rendah</p>
            <p className="text-xs text-red-500 mt-0.5">{lowStock.map(s => s.name).join(', ')}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Total Nilai Stok Gudang</p>
          <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalNilai)}</p>
        </div>
        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
          <Package size={18} className="text-gray-400" />
        </div>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Cari nama bahan..." />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ value: 'semua', label: 'Semua' }, ...KATEGORI.map(k => ({ value: k.value, label: k.label }))].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
              filter === f.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {items.map((item, idx) => (
          <button key={item.id} onClick={() => { setEditMat(item as any); setShowForm(true) }}
            className={`w-full flex items-center px-4 py-3 text-left transition-colors active:bg-gray-50 ${
              idx !== 0 ? 'border-t border-gray-50' : ''
            } ${!item.is_active ? 'opacity-40' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {KATEGORI.find(k => k.value === item.category)?.label} · {formatRupiah(item.unit_cost)}/{item.unit}
              </p>
            </div>
            <div className="text-right mr-3">
              <p className={`text-sm font-semibold ${item.qty <= item.min_stock ? 'text-red-500' : 'text-gray-900'}`}>
                {item.qty} <span className="font-normal text-gray-400">{item.unit}</span>
              </p>
              <p className="text-xs text-gray-400">{formatRupiah(item.qty * (item.unit_cost || 0))}</p>
            </div>
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
          </button>
        ))}
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada data bahan'}
          </div>
        )}
      </div>

      {showForm    && <MaterialForm material={editMat} onClose={() => { setShowForm(false); setEditMat(null) }} />}
      {showOpening && <OpeningStockForm onClose={() => setShowOpening(false)} />}
    </div>
  )
}

// ── PEMBELIAN ─────────────────────────────────────────────────
function PembelianTab({ userId }: { userId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch]     = useState('')
  const [groupMode, setGroupMode] = useState<'hari'|'bulan'|'tahun'>('hari')

  useEffect(() => {
    setToolbar(
      <TabToolbar>
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <AddButton label="Baru" onClick={() => setShowForm(true)} />
      </TabToolbar>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const purchases = useLiveQuery(async () => {
    const p    = await db.purchases.orderBy('created_at').reverse().limit(200).toArray()
    const sups = await db.suppliers.toArray()
    const its  = await db.purchase_items.toArray()
    const mats = await db.materials.toArray()
    const sm   = Object.fromEntries(sups.map(s => [s.id, s]))
    const mm   = Object.fromEntries(mats.map(m => [m.id, m]))
    return p.map(x => ({
      ...x,
      supplier: x.supplier_id ? sm[x.supplier_id] : null,
      items: its.filter(i => i.purchase_id === x.id).map(i => ({ ...i, material: mm[i.material_id] }))
    }))
  }, [])

  const filtered = useMemo(() => {
    if (!purchases) return []
    if (!search) return purchases
    const q = search.toLowerCase()
    return purchases.filter(p =>
      p.supplier?.name?.toLowerCase().includes(q) ||
      (p as any).po_number?.toLowerCase().includes(q) ||
      p.invoice_no?.toLowerCase().includes(q) ||
      p.items.some(i => i.material?.name?.toLowerCase().includes(q))
    )
  }, [purchases, search])

  const grouped = useMemo(() =>
    groupBy(filtered, p => groupKey(p.created_at, groupMode)), [filtered, groupMode])

  return (
    <div className="p-4 space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Cari supplier, PO, bahan..." />

      {grouped.map(({ key, items: grpItems }) => {
        const total = grpItems.reduce((s, p) => s + p.total_amount, 0)
        const label = groupLabel(grpItems[0].created_at, groupMode)
        return (
          <div key={key}>
            <GroupHeader label={label} total={total} count={grpItems.length} />
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {grpItems.map((p, idx) => (
                <div key={p.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      {(p as any).po_number && (
                        <p className="text-xs font-mono font-medium text-blue-600 mb-0.5">{(p as any).po_number}</p>
                      )}
                      <p className="text-sm font-medium text-gray-900">{p.supplier?.name || 'Tanpa Supplier'}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(p.created_at)}{p.invoice_no ? ` · ${p.invoice_no}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(p.total_amount)}</p>
                  </div>
                  {p.items.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {p.items.map(i => (
                        <div key={i.id} className="flex justify-between text-xs text-gray-400">
                          <span>{i.material?.name} × {i.qty} {i.material?.unit}</span>
                          <span>{formatRupiah(i.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
          {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada pembelian'}
        </div>
      )}

      {showForm && <PembelianForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── MUTASI ────────────────────────────────────────────────────
function MutasiTab({ userId }: { userId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm]   = useState(false)
  const [search, setSearch]       = useState('')
  const [groupMode, setGroupMode] = useState<'hari'|'bulan'|'tahun'>('hari')
  const [filterType, setFilterType] = useState('semua')

  useEffect(() => {
    setToolbar(
      <TabToolbar>
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <AddButton label="Baru" onClick={() => setShowForm(true)} />
      </TabToolbar>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const typeConfig: Record<string, { label: string; color: string }> = {
    to_production: { label: 'ke Produksi', color: 'text-blue-600 bg-blue-50' },
    to_store:      { label: 'ke Toko',     color: 'text-green-600 bg-green-50' },
    to_partner:    { label: 'ke Mitra',    color: 'text-purple-600 bg-purple-50' },
    adjustment:    { label: 'Koreksi',     color: 'text-gray-600 bg-gray-100' },
    opening_stock: { label: 'Stok Awal',   color: 'text-orange-600 bg-orange-50' },
  }

  const mutations = useLiveQuery(async () => {
    const m    = await db.warehouse_mutations.orderBy('created_at').reverse().limit(200).toArray()
    const its  = await db.warehouse_mutation_items.toArray()
    const mats = await db.materials.toArray()
    const mm   = Object.fromEntries(mats.map(m => [m.id, m]))
    return m.map(x => ({
      ...x,
      items: its.filter(i => i.mutation_id === x.id).map(i => ({ ...i, material: mm[i.material_id] }))
    }))
  }, [])

  const filtered = useMemo(() => {
    if (!mutations) return []
    return mutations
      .filter(m => filterType === 'semua' || m.mutation_type === filterType)
      .filter(m => !search || (
        m.destination_name?.toLowerCase().includes(search.toLowerCase()) ||
        m.items.some(i => i.material?.name?.toLowerCase().includes(search.toLowerCase()))
      ))
  }, [mutations, filterType, search])

  const grouped = useMemo(() =>
    groupBy(filtered, m => groupKey(m.created_at, groupMode)), [filtered, groupMode])

  const filterTypes = [
    { v: 'semua', l: 'Semua' },
    { v: 'to_production', l: 'Produksi' },
    { v: 'to_store', l: 'Toko' },
    { v: 'to_partner', l: 'Mitra' },
    { v: 'adjustment', l: 'Koreksi' },
  ]

  return (
    <div className="p-4 space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Cari tujuan, nama bahan..." />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterTypes.map(f => (
          <button key={f.v} onClick={() => setFilterType(f.v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
              filterType === f.v ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}>{f.l}</button>
        ))}
      </div>

      {grouped.map(({ key, items: grpItems }) => {
        const label = groupLabel(grpItems[0].created_at, groupMode)
        return (
          <div key={key}>
            <GroupHeader label={label} count={grpItems.length} />
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {grpItems.map((m, idx) => {
                const tc = typeConfig[m.mutation_type] || { label: m.mutation_type, color: 'text-gray-600 bg-gray-100' }
                return (
                  <div key={m.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tc.color}`}>{tc.label}</span>
                        {m.destination_name && <span className="text-xs text-gray-500">{m.destination_name}</span>}
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0">{formatDate(m.created_at)}</p>
                    </div>
                    {m.items.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {m.items.map(i => (
                          <div key={i.id} className="flex justify-between text-xs text-gray-400">
                            <span>{i.material?.name}</span>
                            <span>{i.qty} {i.material?.unit}</span>
                          </div>
                        ))}
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
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
          {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada mutasi'}
        </div>
      )}

      {showForm && <MutasiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── PEMAKAIAN (non-produksi) ──────────────────────────────────
interface UsageRecord {
  id: string; material_id: string; qty: number; unit_cost: number
  notes?: string; used_date: string; created_by: string; created_at: string
}

function PakaiTab({ userId }: { userId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm]   = useState(false)
  const [search, setSearch]       = useState('')
  const [groupMode, setGroupMode] = useState<'hari'|'bulan'|'tahun'>('hari')

  useEffect(() => {
    setToolbar(
      <TabToolbar>
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <AddButton label="Catat" onClick={() => setShowForm(true)} />
      </TabToolbar>
    )
    return () => setToolbar(null)
  }, [groupMode])

  // Ambil dari warehouse_mutations dengan tipe 'internal_use'
  const usages = useLiveQuery(async () => {
    const m    = await db.warehouse_mutations
      .filter(x => x.mutation_type === 'internal_use')
      .reverse().sortBy('created_at')
    const its  = await db.warehouse_mutation_items.toArray()
    const mats = await db.materials.toArray()
    const mm   = Object.fromEntries(mats.map(m => [m.id, m]))
    return m.map(x => ({
      ...x,
      items: its.filter(i => i.mutation_id === x.id).map(i => ({ ...i, material: mm[i.material_id] }))
    }))
  }, [])

  const filtered = useMemo(() => {
    if (!usages) return []
    if (!search) return usages
    const q = search.toLowerCase()
    return usages.filter(u =>
      u.notes?.toLowerCase().includes(q) ||
      u.items.some(i => i.material?.name?.toLowerCase().includes(q))
    )
  }, [usages, search])

  const grouped = useMemo(() =>
    groupBy(filtered, u => groupKey(u.created_at, groupMode)), [filtered, groupMode])

  const totalBulanIni = useMemo(() => {
    const now2 = new Date()
    return (usages || []).filter(u => {
      const d = new Date(u.created_at)
      return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
    }).reduce((s, u) => s + u.items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0), 0)
  }, [usages])

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">Total Pemakaian Bulan Ini</p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalBulanIni)}</p>
        <p className="text-xs text-gray-400 mt-0.5">Kertas, tinta, ATK, dll</p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Cari nama bahan, keterangan..." />

      {grouped.map(({ key, items: grpItems }) => {
        const total = grpItems.reduce((s, u) => s + u.items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0), 0)
        const label = groupLabel(grpItems[0].created_at, groupMode)
        return (
          <div key={key}>
            <GroupHeader label={label} total={total} count={grpItems.length} />
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {grpItems.map((u, idx) => (
                <div key={u.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{u.notes || 'Pemakaian internal'}</p>
                      <p className="text-xs text-gray-400">{formatDate(u.created_at)}</p>
                    </div>
                    <p className="text-xs font-medium text-gray-600 flex-shrink-0 ml-2">
                      {formatRupiah(u.items.reduce((s, i) => s + i.qty * i.unit_cost, 0))}
                    </p>
                  </div>
                  {u.items.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {u.items.map(i => (
                        <div key={i.id} className="flex justify-between text-xs text-gray-400">
                          <span>{i.material?.name}</span>
                          <span>{i.qty} {i.material?.unit} · {formatRupiah(i.qty * i.unit_cost)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
          {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada catatan pemakaian'}
        </div>
      )}

      {showForm && <PakaiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── BIAYA ─────────────────────────────────────────────────────
function BiayaTab({ userId }: { userId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm]   = useState(false)
  const [search, setSearch]       = useState('')
  const [groupMode, setGroupMode] = useState<'hari'|'bulan'|'tahun'>('bulan')
  const [filterCat, setFilterCat] = useState('semua')

  useEffect(() => {
    setToolbar(
      <TabToolbar>
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <AddButton label="Catat" onClick={() => setShowForm(true)} />
      </TabToolbar>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const expenses = useLiveQuery(() =>
    db.warehouse_expenses.orderBy('expense_date').reverse().limit(200).toArray(), [])

  const catLabel: Record<string, string> = {
    listrik: 'Listrik', sewa: 'Sewa', gaji: 'Gaji',
    transport: 'Transport', lainnya: 'Lainnya',
  }

  const now2 = new Date()
  const totalBulanIni = useMemo(() =>
    (expenses || []).filter(e => {
      const d = new Date(e.expense_date)
      return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
    }).reduce((s, e) => s + e.amount, 0), [expenses])

  const filtered = useMemo(() => {
    if (!expenses) return []
    return expenses
      .filter(e => filterCat === 'semua' || e.category === filterCat)
      .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))
  }, [expenses, filterCat, search])

  const grouped = useMemo(() =>
    groupBy(filtered, e => groupKey(e.expense_date, groupMode)), [filtered, groupMode])

  const filterCats = [
    { v: 'semua', l: 'Semua' }, { v: 'listrik', l: 'Listrik' },
    { v: 'sewa', l: 'Sewa' }, { v: 'gaji', l: 'Gaji' },
    { v: 'transport', l: 'Transport' }, { v: 'lainnya', l: 'Lainnya' },
  ]

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">Total Biaya Bulan Ini</p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalBulanIni)}</p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Cari keterangan biaya..." />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterCats.map(f => (
          <button key={f.v} onClick={() => setFilterCat(f.v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
              filterCat === f.v ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}>{f.l}</button>
        ))}
      </div>

      {grouped.map(({ key, items: grpItems }) => {
        const total = grpItems.reduce((s, e) => s + e.amount, 0)
        const label = groupLabel(grpItems[0].expense_date, groupMode)
        return (
          <div key={key}>
            <GroupHeader label={label} total={total} count={grpItems.length} />
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {grpItems.map((e, idx) => (
                <div key={e.id} className={`px-4 py-3 flex items-center justify-between ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                    <p className="text-xs text-gray-400">{catLabel[e.category] || e.category} · {e.expense_date}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(e.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
          {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada catatan biaya'}
        </div>
      )}

      {showForm && <BiayaForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── MODAL BASE ────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{children}</label>
}

// ── FORM: Opening Stock ───────────────────────────────────────
function OpeningStockForm({ onClose }: { onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const [items, setItems] = useState([{ material_id: '', qty: '', unit_cost: '' }])
  const [date, setDate]   = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('Saldo awal migrasi')
  const [saving, setSaving] = useState(false)

  function addItem() { setItems(p => [...p, { material_id: '', qty: '', unit_cost: '' }]) }
  function updateItem(i: number, f: string, v: string) {
    setItems(p => p.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [f]: v }
      if (f === 'material_id') {
        const mat = materials?.find(m => m.id === v)
        if (mat?.unit_cost) updated.unit_cost = String(mat.unit_cost)
      }
      return updated
    }))
  }

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      for (const item of valid) {
        const qty = Number(item.qty), cost = Number(item.unit_cost) || 0
        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        const wsd: WarehouseStock = { id: ws?.id || generateId(), material_id: item.material_id, qty_on_hand: qty, last_updated: now() }
        await db.warehouse_stock.put(wsd)
        await supabase.from('warehouse_stock').upsert(wsd)
        if (cost > 0) {
          await db.materials.update(item.material_id, { unit_cost: cost, updated_at: now() })
          await supabase.from('materials').update({ unit_cost: cost }).eq('id', item.material_id)
        }
        const mutId = generateId()
        const mut = { id: mutId, mutation_type: 'opening_stock', destination_name: 'Saldo Awal', notes: notes || 'Stok awal', status: 'confirmed', created_by: 'system', created_at: `${date}T00:00:00.000Z`, confirmed_at: now(), confirmed_by: 'system' }
        await db.warehouse_mutations.add(mut as any)
        await supabase.from('warehouse_mutations').insert(mut)
        const mi = { id: generateId(), mutation_id: mutId, material_id: item.material_id, qty, unit_cost: cost }
        await db.warehouse_mutation_items.add(mi)
        await supabase.from('warehouse_mutation_items').insert(mi)
      }
      toast.success(`${valid.length} item stok awal disimpan`)
      onClose()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Input Stok Awal" onClose={onClose}>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-medium mb-0.5">Untuk migrasi dari sistem lama</p>
        <p className="text-xs text-blue-500">Qty akan di-set langsung. Harga akan update harga default bahan.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tanggal Efektif</Label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><Label>Keterangan</Label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <div>
        <Label>Item Stok Awal</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id} onChange={e => updateItem(i, 'material_id', e.target.value)}>
                  <option value="">Pilih bahan</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || 'unit'})`} value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  <input className="input text-sm" type="number" placeholder="Harga/unit" value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} />
                </div>
                {item.qty && item.unit_cost && <p className="text-xs text-gray-400">Nilai: {formatRupiah(Number(item.qty) * Number(item.unit_cost))}</p>}
                {items.length > 1 && <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-400">Hapus</button>}
              </div>
            )
          })}
        </div>
        <button onClick={addItem} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Stok Awal'}</button>
      </div>
    </Modal>
  )
}

// ── FORM: Bahan ───────────────────────────────────────────────
function MaterialForm({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const [name, setName]     = useState(material?.name || '')
  const [category, setCat]  = useState(material?.category || 'bahan_baku')
  const [unit, setUnit]     = useState(material?.unit || '')
  const [unitCost, setCost] = useState(String(material?.unit_cost || ''))
  const [minStock, setMin]  = useState(String(material?.min_stock || '0'))
  const [isActive, setActive] = useState(material?.is_active ?? true)
  const [customUnit, setCustom] = useState(!SATUAN.includes(material?.unit || ''))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim() || !unit) return toast.error('Nama dan satuan wajib diisi')
    setSaving(true)
    try {
      const data: any = { id: material?.id || generateId(), name: name.trim(), category, unit, unit_cost: Number(unitCost) || 0, min_stock: Number(minStock) || 0, is_active: isActive, created_at: material?.created_at || now(), updated_at: now() }
      await db.materials.put(data)
      await supabase.from('materials').upsert(data)
      toast.success(material ? 'Bahan diperbarui' : 'Bahan ditambahkan')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={material ? 'Edit Bahan' : 'Tambah Bahan'} onClose={onClose}>
      <div><Label>Nama Bahan</Label><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Tepung Terigu" autoFocus /></div>
      <div>
        <Label>Kategori</Label>
        <div className="space-y-1.5">
          {KATEGORI.map(k => (
            <button key={k.value} onClick={() => setCat(k.value)} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-colors ${category === k.value ? 'border-gray-900 bg-gray-50' : 'border-gray-100 bg-white'}`}>
              <div><p className="text-sm font-medium text-gray-800">{k.label}</p><p className="text-xs text-gray-400">{k.desc}</p></div>
              {category === k.value && <div className="w-4 h-4 rounded-full bg-gray-900 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Satuan</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SATUAN.map(s => (
            <button key={s} onClick={() => { setUnit(s); setCustom(false) }} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${unit === s && !customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 bg-white'}`}>{s}</button>
          ))}
          <button onClick={() => setCustom(true)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 bg-white'}`}>Lainnya</button>
        </div>
        {customUnit && <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ketik satuan..." autoFocus />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Harga Default / Satuan</Label><input className="input" type="number" value={unitCost} onChange={e => setCost(e.target.value)} placeholder="0" /></div>
        <div><Label>Min. Stok (alert)</Label><input className="input" type="number" value={minStock} onChange={e => setMin(e.target.value)} placeholder="0" /></div>
      </div>
      <div className="flex items-center justify-between py-3 border-t border-gray-100">
        <div><p className="text-sm font-medium text-gray-800">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di daftar</p></div>
        <button onClick={() => setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-5.5' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM: Pembelian ───────────────────────────────────────────
function PembelianForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const suppliers = useLiveQuery(() => db.suppliers.filter(s => s.is_active).toArray(), [])
  const [supplierId, setSupp] = useState('')
  const [invoiceNo, setInv]   = useState('')
  const [notes, setNotes]     = useState('')
  const [items, setItems]     = useState([{ material_id: '', qty: '', unit_cost: '' }])
  const [saving, setSaving]   = useState(false)

  const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_cost), 0)
  function addItem() { setItems(p => [...p, { material_id: '', qty: '', unit_cost: '' }]) }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, f: string, v: string) {
    setItems(p => p.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [f]: v }
      if (f === 'material_id') { const m = materials?.find(m => m.id === v); if (m?.unit_cost) updated.unit_cost = String(m.unit_cost) }
      return updated
    }))
  }

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      const poNumber = await generatePONumber()
      const purchId  = generateId()
      const purch: any = { id: purchId, po_number: poNumber, supplier_id: supplierId || undefined, invoice_no: invoiceNo || undefined, total_amount: total, status: 'received', notes: notes || undefined, created_by: userId, created_at: now() }
      await db.purchases.add(purch)
      await supabase.from('purchases').insert(purch)
      for (const item of valid) {
        const pi = { id: generateId(), purchase_id: purchId, material_id: item.material_id, qty: Number(item.qty), unit_cost: Number(item.unit_cost), subtotal: Number(item.qty) * Number(item.unit_cost), qty_returned: 0 }
        await db.purchase_items.add(pi); await supabase.from('purchase_items').insert(pi)
        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        const wsd: WarehouseStock = { id: ws?.id || generateId(), material_id: item.material_id, qty_on_hand: (ws?.qty_on_hand || 0) + Number(item.qty), last_updated: now() }
        await db.warehouse_stock.put(wsd); await supabase.from('warehouse_stock').upsert(wsd)
        if (Number(item.unit_cost) > 0) {
          const mat = await db.materials.get(item.material_id)
          if (mat) {
            const prevQty = (mat as any).total_qty_purchased || 0, prevCost = (mat as any).total_cost_purchased || 0
            const newQty = prevQty + Number(item.qty), newCost = prevCost + Number(item.qty) * Number(item.unit_cost)
            const avgCost = newQty > 0 ? newCost / newQty : Number(item.unit_cost)
            const upd = { unit_cost: avgCost, avg_cost: avgCost, total_qty_purchased: newQty, total_cost_purchased: newCost, updated_at: now() }
            await db.materials.update(item.material_id, upd)
            await supabase.from('materials').update({ unit_cost: avgCost, avg_cost: avgCost, total_qty_purchased: newQty, total_cost_purchased: newCost }).eq('id', item.material_id)
          }
        }
      }
      toast.success(`Pembelian ${poNumber} dicatat`); onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Pembelian Baru" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Supplier</Label>
          <select className="input" value={supplierId} onChange={e => setSupp(e.target.value)}>
            <option value="">Tanpa Supplier</option>
            {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><Label>No. Invoice</Label><input className="input" value={invoiceNo} onChange={e => setInv(e.target.value)} placeholder="INV-001" /></div>
      </div>
      <div>
        <Label>Item Pembelian</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id} onChange={e => updateItem(i, 'material_id', e.target.value)}>
                  <option value="">Pilih bahan</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || ''})`} value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  <input className="input text-sm" type="number" placeholder="Harga/unit" value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} />
                </div>
                {item.qty && item.unit_cost && <p className="text-xs text-gray-400">Subtotal: {formatRupiah(Number(item.qty) * Number(item.unit_cost))}</p>}
                {items.length > 1 && <button onClick={() => removeItem(i)} className="text-xs text-red-400">Hapus item</button>}
              </div>
            )
          })}
        </div>
        <button onClick={addItem} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>
      <div><Label>Catatan</Label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex items-center justify-between py-3 border-t border-gray-100">
        <span className="text-sm font-medium text-gray-700">Total</span>
        <span className="text-base font-semibold text-gray-900">{formatRupiah(total)}</span>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM: Pemakaian ───────────────────────────────────────────
function PakaiForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active && (m.category === 'non_produksi' || m.category === 'operasional' || m.category === 'packaging')).toArray(), [])
  const allMats   = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const [notes, setNotes]   = useState('')
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [items, setItems]   = useState([{ material_id: '', qty: '' }])
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const matList = showAll ? allMats : materials

  function addItem() { setItems(p => [...p, { material_id: '', qty: '' }]) }
  function updateItem(i: number, f: string, v: string) {
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [f]: v } : item))
  }

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      const mutId = generateId()
      const mut = { id: mutId, mutation_type: 'internal_use', destination_name: 'Pemakaian Internal', notes: notes || 'Pemakaian gudang', status: 'confirmed', created_by: userId, created_at: `${date}T${new Date().toTimeString().slice(0,8)}.000Z`, confirmed_at: now(), confirmed_by: userId }
      await db.warehouse_mutations.add(mut as any)
      await supabase.from('warehouse_mutations').insert(mut)
      for (const item of valid) {
        const mat = allMats?.find(m => m.id === item.material_id)
        const mi = { id: generateId(), mutation_id: mutId, material_id: item.material_id, qty: Number(item.qty), unit_cost: mat?.unit_cost || 0 }
        await db.warehouse_mutation_items.add(mi); await supabase.from('warehouse_mutation_items').insert(mi)
        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        if (ws) {
          const newQty = Math.max(0, ws.qty_on_hand - Number(item.qty))
          await db.warehouse_stock.update(ws.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('warehouse_stock').update({ qty_on_hand: newQty }).eq('id', ws.id)
        }
      }
      toast.success('Pemakaian dicatat'); onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Pemakaian" onClose={onClose}>
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
        <p className="text-xs text-amber-700">Pemakaian bahan untuk operasional gudang — kertas, tinta, ATK, dll. Stok akan berkurang otomatis.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tanggal</Label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><Label>Keterangan</Label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Cetak label, dll" /></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>Item</Label>
          <button onClick={() => setShowAll(!showAll)} className="text-xs text-blue-500">{showAll ? 'Filter ATK/Operasional' : 'Tampilkan semua bahan'}</button>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = allMats?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id} onChange={e => updateItem(i, 'material_id', e.target.value)}>
                  <option value="">Pilih bahan</option>
                  {matList?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || ''})`} value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                {items.length > 1 && <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-400">Hapus</button>}
              </div>
            )
          })}
        </div>
        <button onClick={addItem} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM: Mutasi ──────────────────────────────────────────────
function MutasiForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const partners  = useLiveQuery(() => db.partners.filter(p => p.is_active).toArray(), [])
  const stores    = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])
  const [type, setType]   = useState<'to_production'|'to_store'|'to_partner'|'adjustment'>('to_production')
  const [destId, setDest] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ material_id: '', qty: '' }])
  const [saving, setSaving] = useState(false)

  function addItem() { setItems(p => [...p, { material_id: '', qty: '' }]) }
  function updateItem(i: number, f: string, v: string) { setItems(p => p.map((item, idx) => idx === i ? { ...item, [f]: v } : item)) }

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      const destName = type === 'to_production' ? 'Produksi' : type === 'to_store' ? stores?.find(s => s.id === destId)?.name || '' : type === 'to_partner' ? partners?.find(p => p.id === destId)?.name || '' : ''
      const mutId = generateId()
      const mut: WarehouseMutation = { id: mutId, mutation_type: type, destination_id: destId || undefined, destination_name: destName || undefined, notes: notes || undefined, status: 'confirmed', created_by: userId, created_at: now(), confirmed_at: now(), confirmed_by: userId }
      await db.warehouse_mutations.add(mut); await supabase.from('warehouse_mutations').insert(mut)
      for (const item of valid) {
        const mat = materials?.find(m => m.id === item.material_id)
        const mi: WarehouseMutationItem = { id: generateId(), mutation_id: mutId, material_id: item.material_id, qty: Number(item.qty), unit_cost: mat?.unit_cost || 0 }
        await db.warehouse_mutation_items.add(mi); await supabase.from('warehouse_mutation_items').insert(mi)
        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        if (ws) { const newQty = Math.max(0, ws.qty_on_hand - Number(item.qty)); await db.warehouse_stock.update(ws.id, { qty_on_hand: newQty, last_updated: now() }); await supabase.from('warehouse_stock').update({ qty_on_hand: newQty }).eq('id', ws.id) }
        if (type === 'to_production') {
          const ps = await db.production_stock.where('material_id').equals(item.material_id).first()
          const psd: any = { id: ps?.id || generateId(), material_id: item.material_id, qty_on_hand: (ps?.qty_on_hand || 0) + Number(item.qty), last_updated: now() }
          await db.production_stock.put(psd); await supabase.from('production_stock').upsert(psd)
        }
      }
      toast.success('Mutasi dicatat'); onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Mutasi Gudang" onClose={onClose}>
      <div>
        <Label>Tujuan</Label>
        <div className="grid grid-cols-2 gap-2">
          {([{ v: 'to_production', l: 'ke Produksi' },{ v: 'to_store', l: 'ke Toko' },{ v: 'to_partner', l: 'ke Mitra' },{ v: 'adjustment', l: 'Koreksi' }] as const).map(t => (
            <button key={t.v} onClick={() => setType(t.v)} className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${type === t.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>{t.l}</button>
          ))}
        </div>
      </div>
      {type === 'to_store' && <div><Label>Toko Tujuan</Label><select className="input" value={destId} onChange={e => setDest(e.target.value)}><option value="">Pilih toko</option>{stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
      {type === 'to_partner' && <div><Label>Mitra Tujuan</Label><select className="input" value={destId} onChange={e => setDest(e.target.value)}><option value="">Pilih mitra</option>{partners?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
      <div>
        <Label>Item</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id} onChange={e => updateItem(i, 'material_id', e.target.value)}><option value="">Pilih bahan</option>{materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select>
                <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || ''})`} value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                {items.length > 1 && <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-400">Hapus item</button>}
              </div>
            )
          })}
        </div>
        <button onClick={addItem} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>
      <div><Label>Catatan</Label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM: Biaya ───────────────────────────────────────────────
function BiayaForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [name, setName]     = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCat]  = useState('lainnya')
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name || !amount) return toast.error('Keterangan dan jumlah wajib diisi')
    setSaving(true)
    try {
      const data: WarehouseExpense = { id: generateId(), name, amount: Number(amount), expense_date: date, category, notes: notes || undefined, created_by: userId, created_at: now() }
      await db.warehouse_expenses.add(data); await supabase.from('warehouse_expenses').insert(data)
      toast.success('Biaya dicatat'); onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Biaya" onClose={onClose}>
      <div><Label>Keterangan</Label><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Bayar listrik bulan Mei" autoFocus /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Jumlah (Rp)</Label><input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /></div>
        <div><Label>Tanggal</Label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      </div>
      <div>
        <Label>Kategori</Label>
        <div className="flex flex-wrap gap-2">
          {[{ v: 'listrik', l: 'Listrik' },{ v: 'sewa', l: 'Sewa' },{ v: 'gaji', l: 'Gaji' },{ v: 'transport', l: 'Transport' },{ v: 'lainnya', l: 'Lainnya' }].map(c => (
            <button key={c.v} onClick={() => setCat(c.v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${category === c.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>{c.l}</button>
          ))}
        </div>
      </div>
      <div><Label>Catatan</Label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}
