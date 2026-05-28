// src/pages/gudang/GudangPage.tsx
import { useState, useEffect, createContext, useContext, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah, formatDate } from '@/lib/utils'
import {
  Plus, RefreshCw, X, ChevronRight, AlertCircle, Package,
  Search, ChevronDown, Warehouse, ShoppingCart, ArrowRightLeft,
  Wrench, Receipt, LucideIcon
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { Material, WarehouseStock, Purchase, WarehouseMutation, WarehouseMutationItem, WarehouseExpense } from '@/lib/db'

type Tab = 'stok' | 'pembelian' | 'mutasi' | 'biaya'

// ── Satuan & Kategori dari data nyata Coco Puff ───────────────
const SATUAN = ['Gram', 'Ml', 'Pcs', 'Kg', 'Liter', 'Pack', 'Lembar', 'Roll']

const KATEGORI_GUDANG = [
  { value: 'bahan_baku',          label: 'Bahan Baku',        icon: '🌾', desc: 'Tepung, gula, telur, susu, dll' },
  { value: 'bahan_setengah_jadi', label: 'Setengah Jadi',     icon: '🧪', desc: 'Premix, fla, adonan siap pakai' },
  { value: 'packaging',           label: 'Packaging',          icon: '📦', desc: 'Dus, gelas, kresek, kertas roti' },
  { value: 'non_produksi',        label: 'Non Produksi / ATK', icon: '🖊️', desc: 'Stiker, kertas kasir, sabun, dll' },
]

const KATEGORI_BIAYA = [
  { value: 'beban_bahan_baku',      label: 'Bahan Baku',       desc: 'Pembelian bahan produksi' },
  { value: 'beban_tenaga_kerja',    label: 'Tenaga Kerja',     desc: 'Gaji, upah harian' },
  { value: 'beban_sewa',            label: 'Sewa',             desc: 'Sewa tempat, kontrak' },
  { value: 'beban_utilitas',        label: 'Utilitas',         desc: 'Listrik, air, gas' },
  { value: 'beban_packaging',       label: 'Packaging',        desc: 'Dus, plastik, stiker' },
  { value: 'beban_transport',       label: 'Transport',        desc: 'Ongkir, bensin' },
  { value: 'beban_pemasaran',       label: 'Pemasaran',        desc: 'Promosi, iklan' },
  { value: 'beban_lainnya',         label: 'Lainnya',          desc: 'Pengeluaran lain-lain' },
]

const METODE_BAYAR = [
  { value: 'tunai',    label: 'Tunai' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'kredit',   label: 'Kredit / Tempo' },
]

async function generateMutationNumber(): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `MUT-${dateStr}-`
  const existing = await db.warehouse_mutations
    .filter(m => (m as any).mutation_number?.startsWith(prefix))
    .toArray()
  return `${prefix}${String(existing.length + 1).padStart(3, '0')}`
}

async function generateUsageNumber(): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `PAK-${dateStr}-`
  const existing = await db.warehouse_mutations
    .filter(m => (m as any).mutation_number?.startsWith(prefix))
    .toArray()
  return `${prefix}${String(existing.length + 1).padStart(3, '0')}`
}

async function generateExpenseNumber(): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `BIA-${dateStr}-`
  const existing = await db.warehouse_expenses
    .filter(e => (e as any).expense_number?.startsWith(prefix))
    .toArray()
  return `${prefix}${String(existing.length + 1).padStart(3, '0')}`
}

async function generatePONumber(): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `PO-${dateStr}-`
  const existing = await db.purchases.filter(p => (p as any).po_number?.startsWith(prefix)).toArray()
  return `${prefix}${String(existing.length + 1).padStart(3, '0')}`
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const k = keyFn(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
}

function groupLabel(dateStr: string, mode: 'hari'|'bulan'|'tahun'): string {
  const d = new Date(dateStr)
  if (mode === 'hari')   return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (mode === 'bulan')  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  return String(d.getFullYear())
}

function groupKey(dateStr: string, mode: 'hari'|'bulan'|'tahun'): string {
  if (mode === 'hari')  return dateStr.slice(0, 10)
  if (mode === 'bulan') return dateStr.slice(0, 7)
  return dateStr.slice(0, 4)
}

const ToolbarCtx = createContext<(node: React.ReactNode) => void>(() => {})

// ── Tab config dengan icon ────────────────────────────────────
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'stok',      label: 'Stok',      icon: Warehouse },
  { id: 'pembelian', label: 'Pembelian', icon: ShoppingCart },
  { id: 'mutasi',    label: 'Mutasi',    icon: ArrowRightLeft },
  { id: 'biaya',     label: 'Biaya',     icon: Receipt },
]

export default function GudangPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('stok')
  const [syncing, setSyncing] = useState(false)
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
        supabase.from('warehouse_expenses').select('*').order('created_at', { ascending: false }).limit(200),
      ])

      // Master data: sync full (bulkPut + hapus yang sudah tidak ada di server)
      if (pulls[0].data !== null) {
        await db.materials.bulkPut(pulls[0].data || [])
        // Hapus lokal yang sudah dihapus di server
        const serverIds = new Set((pulls[0].data || []).map((m: any) => m.id))
        const localMats = await db.materials.toArray()
        const toDelete = localMats.filter(m => !serverIds.has(m.id)).map(m => m.id)
        if (toDelete.length) await db.materials.bulkDelete(toDelete)
      }
      if (pulls[1].data?.length) await db.suppliers.bulkPut(pulls[1].data)
      if (pulls[7].data?.length) await db.partners.bulkPut(pulls[7].data)

      // Transactional data: clear dulu lalu bulkPut agar reflect Supabase exactly
      // Ini mencegah data lama yang sudah dihapus di Supabase muncul lagi lokal
      const transactional: [any, any][] = [
        [db.warehouse_stock,           pulls[2].data],
        [db.purchases,                 pulls[3].data],
        [db.purchase_items,            pulls[4].data],
        [db.warehouse_mutations,       pulls[5].data],
        [db.warehouse_mutation_items,  pulls[6].data],
        [db.warehouse_expenses,        pulls[8].data],
      ]
      for (const [table, data] of transactional) {
        if (data !== null) { // null = error, skip; [] = empty = clear
          await table.clear()
          if (data.length) await table.bulkPut(data)
        }
      }
      toast.success('Data diperbarui')
    } catch (e) {
      console.error('[SYNC]', e)
      toast.error('Gagal sync')
    }
    finally { setSyncing(false) }
  }

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

      {/* Tabs dengan icon — sama style dengan produksi */}
      <div className="bg-white border-b border-gray-100 flex mt-2 flex-shrink-0">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium transition-colors border-b-2 ${
                tab === t.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400'
              }`}>
              <Icon size={18} />
              {t.label}
            </button>
          )
        })}
      </div>

      <ToolbarCtx.Provider value={setToolbarActions}>
        <div className="flex-1 overflow-auto bg-gray-50">
          {tab === 'stok'      && <StokTab userId={user!.id} />}
          {tab === 'pembelian' && <PembelianTab userId={user!.id} />}
          {tab === 'mutasi'    && <MutasiTab userId={user!.id} />}
          {tab === 'biaya'     && <BiayaTab userId={user!.id} />}
        </div>
      </ToolbarCtx.Provider>
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────
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
      <select value={value} onChange={e => onChange(e.target.value as any)}
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

function GroupHeader({ label, total, count, expanded, onToggle }: {
  label: string; total?: number; count: number; expanded: boolean; onToggle: () => void
}) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-1 py-2 active:opacity-70">
      <div className="flex items-center gap-2">
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        <p className="text-xs font-semibold text-gray-600">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{count} item</span>
        {total !== undefined && <span className="text-xs font-medium text-gray-700">{formatRupiah(total)}</span>}
      </div>
    </button>
  )
}

// ── STOK ──────────────────────────────────────────────────────
function StokTab({ userId }: { userId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm]       = useState(false)
  const [showOpening, setShowOpening] = useState(false)
  const [editMat, setEditMat]         = useState<Material | null>(null)
  const [filter, setFilter]           = useState('semua')
  const [search, setSearch]           = useState('')

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <button onClick={() => setShowOpening(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 px-2.5 py-1.5 rounded-lg active:bg-blue-100 transition-colors">
          <Package size={13} /> Stok Awal
        </button>
        <AddButton label="Tambah" onClick={() => { setEditMat(null); setShowForm(true) }} />
      </div>
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
          <p className="text-xs text-gray-400 mt-0.5">{items.filter(i => i.is_active).length} item aktif</p>
        </div>
        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
          <Package size={18} className="text-gray-400" />
        </div>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Cari nama bahan..." />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ value: 'semua', label: 'Semua' }, ...KATEGORI_GUDANG.map(k => ({ value: k.value, label: k.label }))].map(f => (
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
                {KATEGORI_GUDANG.find(k => k.value === item.category)?.label || item.category} · Avg {formatRupiah((item as any).avg_cost || item.unit_cost)}/{item.unit}
              </p>
            </div>
            <div className="text-right mr-3">
              <p className={`text-sm font-semibold ${item.qty <= item.min_stock ? 'text-red-500' : 'text-gray-900'}`}>
                {item.qty} <span className="font-normal text-gray-400 text-xs">{item.unit}</span>
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
  const [showForm, setShowForm]     = useState(false)
  const [search, setSearch]         = useState('')
  const [groupMode, setGroupMode]   = useState<'hari'|'bulan'|'tahun'>('hari')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <AddButton label="Baru" onClick={() => setShowForm(true)} />
      </div>
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
      {grouped.map(({ key, items: grpItems }, gIdx) => {
        const total = grpItems.reduce((s, p) => s + p.total_amount, 0)
        const expanded = expandedGroups[key] !== false // default expanded
        return (
          <div key={key}>
            <GroupHeader label={groupLabel(grpItems[0].created_at, groupMode)} total={total} count={grpItems.length}
              expanded={expanded} onToggle={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))} />
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{display: expanded ? undefined : "none"}}>
              {grpItems.map((p, idx) => (
                <div key={p.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      {(p as any).po_number && <p className="text-xs font-mono font-medium text-blue-600 mb-0.5">{(p as any).po_number}</p>}
                      <p className="text-sm font-medium text-gray-900">{p.supplier?.name || 'Tanpa Supplier'}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(p.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' }) + ', ' + new Date(p.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                        {p.invoice_no ? ` · ${p.invoice_no}` : ''}
                        {(p as any).payment_method ? ` · ${(p as any).payment_method}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(p.total_amount)}</p>
                  </div>
                  {p.items.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 border-t border-gray-50 pt-1.5">
                      {p.items.map(i => (
                        <div key={i.id} className="flex justify-between text-xs text-gray-400">
                          <span>{i.material?.name} × {i.qty} {i.material?.unit} @ {formatRupiah(i.unit_cost)}</span>
                          <span>{formatRupiah(i.subtotal)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-medium text-gray-600 pt-1 border-t border-gray-50 mt-1">
                        <span>Total</span>
                        <span>{formatRupiah(p.items.reduce((s, i) => s + i.subtotal, 0))}</span>
                      </div>
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
  const [showForm, setShowForm]     = useState(false)
  const [search, setSearch]         = useState('')
  const [groupMode, setGroupMode]   = useState<'hari'|'bulan'|'tahun'>('hari')
  const [filterType, setFilterType] = useState('semua')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <AddButton label="Baru" onClick={() => setShowForm(true)} />
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const typeConfig: Record<string, { label: string; color: string }> = {
    to_production: { label: 'ke Produksi',  color: 'text-blue-600 bg-blue-50' },
    to_store:      { label: 'ke Toko',      color: 'text-green-600 bg-green-50' },
    to_partner:    { label: 'ke Franchise', color: 'text-purple-600 bg-purple-50' },
    adjustment:    { label: 'Retur',        color: 'text-red-600 bg-red-50' },
    opening_stock: { label: 'Stok Awal',    color: 'text-orange-600 bg-orange-50' },
    internal_use:  { label: 'Pemakaian',    color: 'text-amber-600 bg-amber-50' },
  }

  const mutations = useLiveQuery(async () => {
    const m    = await db.warehouse_mutations.orderBy('created_at').reverse().limit(200).toArray()
    const its  = await db.warehouse_mutation_items.toArray()
    const mats = await db.materials.toArray()
    const mm   = Object.fromEntries(mats.map(m => [m.id, m]))
    return m
      // Semua tipe termasuk pemakaian dan retur
      .map(x => ({
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

  return (
    <div className="p-4 space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Cari tujuan, nama bahan..." />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { v: 'semua', l: 'Semua' },
          { v: 'to_production', l: 'Produksi' },
          { v: 'to_store', l: 'Toko' },
          { v: 'to_partner', l: 'Franchise' },
          { v: 'adjustment', l: 'Retur' },
          { v: 'internal_use', l: 'Pemakaian' },
        ].map(f => (
          <button key={f.v} onClick={() => setFilterType(f.v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
              filterType === f.v ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}>{f.l}</button>
        ))}
      </div>
      {grouped.map(({ key, items: grpItems }) => {
        const expanded = expandedGroups[key] !== false
        return (
        <div key={key}>
          <GroupHeader label={groupLabel(grpItems[0].created_at, groupMode)} count={grpItems.length}
            expanded={expanded} onToggle={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))} />
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{display: expanded ? undefined : "none"}}>
            {grpItems.map((m, idx) => {
              const tc = typeConfig[m.mutation_type] || { label: m.mutation_type, color: 'text-gray-600 bg-gray-100' }
              const totalNilai = m.items.reduce((s, i) => s + i.qty * i.unit_cost, 0)
              return (
                <div key={m.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      {(m as any).mutation_number && (
                        <p className="text-xs font-mono text-blue-600 mb-0.5">{(m as any).mutation_number}</p>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tc.color}`}>{tc.label}</span>
                        {m.destination_name && <span className="text-xs text-gray-700 font-medium">{m.destination_name}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(m.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' }) + ', ' + new Date(m.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                        {m.notes ? ` · ${m.notes}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 flex-shrink-0 ml-2">{formatRupiah(totalNilai)}</p>
                  </div>
                  {m.items.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 border-t border-gray-50 pt-1.5">
                      {m.items.map(i => (
                        <div key={i.id} className="flex justify-between text-xs text-gray-400">
                          <span>{i.material?.name}</span>
                          <span>{i.qty} {i.material?.unit} · {formatRupiah(i.qty * i.unit_cost)}</span>
                        </div>
                      ))}
                      {totalNilai > 0 && (
                        <div className="flex justify-between text-xs font-medium text-gray-600 pt-1 border-t border-gray-50 mt-1">
                          <span>Total Nilai</span>
                          <span>{formatRupiah(totalNilai)}</span>
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
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
          {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada mutasi'}
        </div>
      )}
      {showForm && <MutasiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── PEMAKAIAN ─────────────────────────────────────────────────
function PakaiTab({ userId }: { userId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm]     = useState(false)
  const [search, setSearch]         = useState('')
  const [groupMode, setGroupMode]   = useState<'hari'|'bulan'|'tahun'>('hari')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg active:bg-gray-50 whitespace-nowrap">
          <Plus size={13} /> Catat
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode, showForm])

  const usages = useLiveQuery(async () => {
    const m    = await db.warehouse_mutations.filter(x => x.mutation_type === 'internal_use').reverse().sortBy('created_at')
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
        <p className="text-xs text-gray-400 mt-0.5">ATK, kebersihan, operasional gudang</p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Cari nama bahan, keterangan..." />

      {grouped.map(({ key, items: grpItems }) => {
        const total = grpItems.reduce((s, u) => s + u.items.reduce((ss, i) => ss + i.qty * i.unit_cost, 0), 0)
        const expanded = expandedGroups[key] !== false
        return (
          <div key={key}>
            <GroupHeader
              label={groupLabel(grpItems[0].created_at, groupMode)}
              total={total}
              count={grpItems.length}
              expanded={expanded}
              onToggle={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))}
            />
            <div
              className="bg-white rounded-xl border border-gray-100 overflow-hidden"
              style={{ display: expanded ? undefined : 'none' }}
            >
              {grpItems.map((u, idx) => (
                <div key={u.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      {(u as any).mutation_number && (
                        <p className="text-xs font-mono text-blue-600 mb-0.5">{(u as any).mutation_number}</p>
                      )}
                      <p className="text-sm font-medium text-gray-900">{u.notes || 'Pemakaian internal'}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(u.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' }) + ', ' + new Date(u.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-gray-600 flex-shrink-0 ml-2">
                      {formatRupiah(u.items.reduce((s, i) => s + i.qty * i.unit_cost, 0))}
                    </p>
                  </div>
                  {u.items.length > 0 && (
                    <div className="mt-1 space-y-0.5 border-t border-gray-50 pt-1">
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
  const [showForm, setShowForm]     = useState(false)
  const [search, setSearch]         = useState('')
  const [groupMode, setGroupMode]   = useState<'hari'|'bulan'|'tahun'>('hari')
  const [filterCat, setFilterCat]   = useState('semua')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg active:bg-gray-50 whitespace-nowrap">
          <Plus size={13} /> Catat
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode, showForm])

  const expenses = useLiveQuery(() =>
    db.warehouse_expenses.orderBy('expense_date').reverse().limit(200).toArray(), [])

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
    groupBy(filtered, e => groupKey(e.created_at || e.expense_date, groupMode)), [filtered, groupMode])

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">Total Biaya Bulan Ini</p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalBulanIni)}</p>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Cari keterangan biaya..." />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ v: 'semua', l: 'Semua' }, ...KATEGORI_BIAYA.map(k => ({ v: k.value, l: k.label }))].map(f => (
          <button key={f.v} onClick={() => setFilterCat(f.v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
              filterCat === f.v ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}>{f.l}</button>
        ))}
      </div>
      {grouped.map(({ key, items: grpItems }) => {
        const total = grpItems.reduce((s, e) => s + e.amount, 0)
        const expanded = expandedGroups[key] !== false
        return (
          <div key={key}>
            <GroupHeader label={groupLabel(grpItems[0].expense_date || grpItems[0].created_at, groupMode)} total={total} count={grpItems.length}
              expanded={expanded} onToggle={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))} />
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{display: expanded ? undefined : "none"}}>
              {grpItems.map((e, idx) => (
                <div key={e.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      {(e as any).expense_number && (
                        <p className="text-xs font-mono text-blue-600 mb-0.5">{(e as any).expense_number}</p>
                      )}
                      <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                      <p className="text-xs text-gray-400">
                        {KATEGORI_BIAYA.find(k => k.value === e.category)?.label || e.category}
                        {' · '}{new Date(e.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }) + ', ' + new Date(e.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                        {(e as any).payment_method ? ` · ${(e as any).payment_method}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(e.amount)}</p>
                  </div>
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

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

// ── FORM: Bahan ───────────────────────────────────────────────
function MaterialForm({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const [name, setName]       = useState(material?.name || '')
  const [category, setCat]    = useState(material?.category || 'bahan_baku')
  const [unit, setUnit]       = useState(material?.unit || '')
  const [unitCost, setCost]   = useState(String(material?.unit_cost || ''))
  const [minStock, setMin]    = useState(String(material?.min_stock || '0'))
  const [customUnit, setCustom] = useState(material ? !SATUAN.map(s => s.toLowerCase()).includes((material.unit || '').toLowerCase()) : false)
  const [isActive, setIsActive] = useState(material?.is_active ?? true)
  const [saving, setSaving]   = useState(false)

  async function handleDelete() {
    if (!material || !confirm(`Hapus "${material.name}" permanen dari database?\nData pembelian & mutasi terkait juga akan dihapus.`)) return
    try {
      // Cascade: hapus relasi dulu baru material
      await supabase.from('warehouse_mutation_items').delete().eq('material_id', material.id)
      await supabase.from('purchase_items').delete().eq('material_id', material.id)
      await supabase.from('warehouse_stock').delete().eq('material_id', material.id)
      await supabase.from('production_stock').delete().eq('material_id', material.id)
      await supabase.from('store_recipe_items').delete().eq('material_id', material.id)
      await supabase.from('production_recipe_items').delete().eq('material_id', material.id)
      const { error } = await supabase.from('materials').delete().eq('id', material.id)
      if (error) throw error
      // IndexedDB
      await db.warehouse_mutation_items.where('material_id').equals(material.id).delete()
      await db.purchase_items.where('material_id').equals(material.id).delete()
      await db.warehouse_stock.where('material_id').equals(material.id).delete()
      await db.production_stock.where('material_id').equals(material.id).delete()
      await db.materials.delete(material.id)
      toast.success(`"${material.name}" dihapus dari database`)
      onClose()
    } catch (e) {
      console.error('[DELETE]', e)
      toast.error('Gagal hapus: ' + String((e as any)?.message || e))
    }
  }

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama bahan wajib diisi')
    if (!unit)        return toast.error('Satuan wajib diisi')
    if (!category)    return toast.error('Kategori wajib diisi')

    // Anti duplikat: cek nama yang sama (case insensitive), kecuali diri sendiri
    const existing = await db.materials
      .filter(m => m.name.toLowerCase() === name.trim().toLowerCase() && m.id !== (material?.id || ''))
      .first()
    if (existing) return toast.error(`Bahan "${name.trim()}" sudah ada`)

    setSaving(true)
    try {
      const data: any = {
        id: material?.id || generateId(), name: name.trim(),
        category, unit, unit_cost: Number(unitCost) || 0,
        min_stock: Number(minStock) || 0, is_active: isActive,
        created_at: material?.created_at || now(), updated_at: now(),
      }
      await db.materials.put(data)
      await supabase.from('materials').upsert(data)
      toast.success(material ? `"${name.trim()}" diperbarui` : `"${name.trim()}" ditambahkan`)
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={material ? 'Edit Bahan' : 'Tambah Bahan'} onClose={onClose}>
      <div>
        <Label required>Nama Bahan</Label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Tepung Terigu" autoFocus />
      </div>
      <div>
        <Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {KATEGORI_GUDANG.map(k => (
            <button key={k.value} onClick={() => setCat(k.value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                category === k.value ? 'border-gray-900 bg-gray-50' : 'border-gray-100 bg-white'
              }`}>
              <span className="text-base">{k.icon}</span>
              <div>
                <p className="text-xs font-medium text-gray-800 leading-tight">{k.label}</p>
                <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{k.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
      <d
      {material && (
        <div className="flex items-center justify-between py-2 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-800">Aktif</p>
            <p className="text-xs text-gray-400">Nonaktif = tidak muncul di daftar stok</p>
          </div>
          <button onClick={() => setIsActive(!isActive)}
            className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-1 border-t border-gray-100">
        {material && isOwner && (
          <button onClick={handleDelete}
            className="px-4 py-3 rounded-xl border border-red-200 text-sm font-medium text-red-500 active:bg-red-50">
            Hapus
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}

