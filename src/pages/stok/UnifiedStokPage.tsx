// src/pages/stok/UnifiedStokPage.tsx
// CHANGELOG v4:
// - FIX: Tab Produksi stok bahan bisa diklik untuk edit
// - FIX: Tab Toko item stok bisa diklik untuk edit

import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue, type Material, type WarehouseStock } from '@/lib/db'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Warehouse, FlaskConical, Store, RefreshCw, AlertCircle, Plus, Package, X, Trash2, Edit } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type StokTab = 'gudang' | 'produksi' | 'toko'

const TAB_ACCESS: Record<string, StokTab[]> = {
  owner: ['gudang', 'produksi', 'toko'],
  manager: ['gudang', 'produksi', 'toko'],
  gudang: ['gudang', 'produksi', 'toko'],
  produksi: ['produksi'],
  kasir: ['toko'],
}

const KAT_LABEL: Record<string, string> = {
  bahan_baku: 'Bahan Baku',
  bahan_setengah_jadi: 'Bahan Setengah Jadi',
  packaging: 'Packaging',
  non_produksi: 'Non-Produksi',
}
function formatKategori(raw: string | undefined): string {
  if (!raw) return ''
  if (KAT_LABEL[raw]) return KAT_LABEL[raw]
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const SATUAN = ['Gram', 'Ml', 'Pcs', 'Kg', 'Liter', 'Pack', 'Lembar', 'Roll']
const KATEGORI = [
  { value: 'bahan_baku', label: 'Bahan Baku' },
  { value: 'bahan_setengah_jadi', label: 'Bahan Setengah Jadi' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'non_produksi', label: 'Non Produksi / ATK' },
]

function formatAvgCost(cost: number, unit: string): string {
  if (!cost || cost === 0) return `Rp 0/${unit}`
  if (cost < 100) {
    const formatted = parseFloat(cost.toFixed(3)).toString()
    return `Rp ${formatted}/${unit}`
  }
  return `Rp ${Math.round(cost).toLocaleString('id-ID')}/${unit}`
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 rounded-full"><X size={18} /></button>
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

export default function UnifiedStokPage() {
  const { user } = useAuthStore()
  const role = user?.role || 'kasir'
  const tabs = TAB_ACCESS[role] || ['toko']
  const [tab, setTab] = useState<StokTab>(tabs[0])
  const [syncing, setSyncing] = useState(false)
  const isOwnerManager = ['owner', 'manager'].includes(role)
  const [headerActions, setHeaderActions] = useState<React.ReactNode>(null)

  async function syncAll() {
    setSyncing(true)
    try {
      const [mats, ws, ps, fgs, prods, stocks, cats, stores] = await Promise.all([
        supabase.from('materials').select('*'),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('production_stock').select('*'),
        supabase.from('finished_goods_stock').select('*'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('stock').select('*'),
        supabase.from('categories').select('*'),
        supabase.from('stores').select('*'),
      ])
      if (mats.data?.length) await db.materials.bulkPut(mats.data)
      const recipes = await supabase.from('store_recipes').select('*')
      const recipeItems = await supabase.from('store_recipe_items').select('*')
      if (recipes.data?.length) await db.store_recipes.bulkPut(recipes.data)
      if (recipeItems.data?.length) await db.store_recipe_items.bulkPut(recipeItems.data)
      if (ws.data?.length) await db.warehouse_stock.bulkPut(ws.data)
      if (ps.data?.length) await db.production_stock.bulkPut(ps.data)
      if (fgs.data?.length) await db.finished_goods_stock.bulkPut(fgs.data)
      if (stores.data?.length) await db.stores.bulkPut(stores.data)
      if (prods.data !== null) { await db.products.clear(); if (prods.data.length) await db.products.bulkPut(prods.data) }
      if (stocks.data !== null) { await db.stock.clear(); if (stocks.data.length) await db.stock.bulkPut(stocks.data) }
      if (cats.data !== null) { await db.categories.clear(); if (cats.data.length) await db.categories.bulkPut(cats.data) }
      toast.success('Stok diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  const tabConfig = [
    { id: 'gudang' as StokTab, label: 'Gudang', icon: Warehouse },
    { id: 'produksi' as StokTab, label: 'Produksi', icon: FlaskConical },
    { id: 'toko' as StokTab, label: 'Toko', icon: Store },
  ].filter(t => tabs.includes(t.id))

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Stok</h1>
        <div className="flex items-center gap-2">
          {headerActions}
          <button onClick={syncAll} disabled={syncing} className="p-2 text-gray-400 rounded-full">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>
      {tabConfig.length > 1 && (
        <div className="bg-white border-b border-gray-100 flex flex-shrink-0">
          {tabConfig.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setHeaderActions(null) }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto bg-gray-50">
        {tab === 'gudang' && <StokGudangView isOwnerManager={isOwnerManager} isOwner={role === 'owner'} setHeaderActions={setHeaderActions} />}
        {tab === 'produksi' && <StokProduksiView isOwnerManager={isOwnerManager} isOwner={role === 'owner'} setHeaderActions={setHeaderActions} />}
        {tab === 'toko' && <StokTokoView storeId={user?.store_id || ''} role={role} isOwner={role === 'owner'} isOwnerManager={isOwnerManager} setHeaderActions={setHeaderActions} />}
      </div>
    </div>
  )
}

const KAT_FILTERS = [
  { k: 'semua', l: 'Semua' },
  { k: 'stok_rendah', l: '⚠ Stok Rendah' },
  { k: 'bahan_baku', l: 'Bahan Baku' },
  { k: 'bahan_setengah_jadi', l: 'Bahan Setengah Jadi' },
  { k: 'packaging', l: 'Packaging' },
  { k: 'non_produksi', l: 'Non-Produksi' },
]

// ── STOK GUDANG ───────────────────────────────────────────────
function StokGudangView({ isOwnerManager, isOwner, setHeaderActions }: {
  isOwnerManager: boolean; isOwner: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {
  const [search, setSearch] = useState('')
  const [filterKat, setFilterKat] = useState('semua')
  const [showForm, setShowForm] = useState(false)
  const [showOpening, setShowOpening] = useState(false)
  const [editMat, setEditMat] = useState<Material | null>(null)
  const [showEditStok, setShowEditStok] = useState(false)
  const [editStokItem, setEditStokItem] = useState<any>(null)

  useEffect(() => {
    if (!isOwnerManager) { setHeaderActions(null); return }
    setHeaderActions(
      <div className="flex items-center gap-1.5">
        <button onClick={() => setShowOpening(true)}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 px-2.5 py-1.5 rounded-lg">
          <Package size={12} /> Stok Awal
        </button>
        <button onClick={() => { setEditMat(null); setShowForm(true) }}
          className="flex items-center gap-1 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={12} /> Tambah
        </button>
      </div>
    )
    return () => setHeaderActions(null)
  }, [isOwnerManager])

  const data = useLiveQuery(async () => {
    const mats = await db.materials.filter(m => m.is_active).toArray()
    const stocks = await db.warehouse_stock.toArray()
    const sMap = Object.fromEntries(stocks.map(s => [s.material_id, s.qty_on_hand]))
    const items = mats.map(m => ({ ...m, qty: sMap[m.id] ?? 0, avg_cost: m.avg_cost || m.unit_cost || 0 }))
    const totalNilai = items.reduce((s, i) => s + i.qty * i.avg_cost, 0)
    const lowStock = items.filter(i => i.qty <= i.min_stock && i.min_stock > 0)
    return { items, totalNilai, lowStock }
  }, [])

  const filteredItems = (data?.items || []).filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    const matchKat = filterKat === 'semua' ? true
      : filterKat === 'stok_rendah' ? item.qty <= item.min_stock && item.min_stock > 0
        : item.category === filterKat
    return matchSearch && matchKat
  })

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Nilai Stok</p>
          <p className="text-base font-semibold text-gray-900">{formatRupiah(data?.totalNilai || 0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{data?.items.filter(i => i.qty > 0).length || 0} item</p>
        </div>
        {data?.lowStock && data.lowStock.length > 0 ? (
          <div className="bg-red-50 rounded-xl border border-red-100 p-3">
            <div className="flex items-center gap-1 mb-1"><AlertCircle size={12} className="text-red-500" /><p className="text-xs text-red-600 font-medium">Stok Rendah</p></div>
            <p className="text-base font-semibold text-red-700">{data.lowStock.length} item</p>
          </div>
        ) : (
          <div className="bg-green-50 rounded-xl border border-green-100 p-3">
            <p className="text-xs text-green-600">Stok Normal</p>
            <p className="text-xs text-gray-400 mt-1">{data?.items.length || 0} jenis bahan</p>
          </div>
        )}
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari nama bahan..." />
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {KAT_FILTERS.map(({ k, l }) => {
          const label = k === 'stok_rendah' ? `⚠ Stok Rendah${data?.lowStock?.length ? ` (${data.lowStock.length})` : ''}` : l
          return (
            <button key={k} onClick={() => setFilterKat(k)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterKat === k ? k === 'stok_rendah' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white' : k === 'stok_rendah' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {label}
            </button>
          )
        })}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filteredItems.sort((a, b) => (b.qty * b.avg_cost) - (a.qty * a.avg_cost)).map((item, idx) => (
          <button key={item.id}
            onClick={() => isOwnerManager && (setEditStokItem(item), setShowEditStok(true))}
            className={`w-full flex items-center px-4 py-3 text-left ${idx !== 0 ? 'border-t border-gray-50' : ''} ${item.qty <= item.min_stock && item.min_stock > 0 ? 'bg-red-50/30' : ''} ${isOwnerManager ? 'active:bg-gray-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
              <p className="text-xs text-gray-400">{formatKategori(item.category)} · Avg {formatAvgCost(item.avg_cost, item.unit)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-semibold ${item.qty <= item.min_stock && item.min_stock > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {item.qty} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
              </p>
              <p className="text-xs text-gray-400">{formatRupiah(item.qty * item.avg_cost)}</p>
            </div>

          </button>
        ))}
        {filteredItems.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">
            {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada stok'}
          </div>
        )}
      </div>
      {showForm && isOwnerManager && <MaterialForm material={editMat} isOwner={isOwner} onClose={() => { setShowForm(false); setEditMat(null) }} />}
      {showEditStok && editStokItem && <EditStokGudangForm item={editStokItem} onClose={() => { setShowEditStok(false); setEditStokItem(null) }} />}
      {showOpening && isOwnerManager && <OpeningStockForm onClose={() => setShowOpening(false)} />}
    </div>
  )
}

// ── STOK PRODUKSI ─────────────────────────────────────────────
function StokProduksiView({ isOwnerManager, isOwner, setHeaderActions }: {
  isOwnerManager: boolean; isOwner?: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {
  const [search, setSearch] = useState('')
  const [filterKat, setFilterKat] = useState('semua')
  const [showFgsForm, setShowFgsForm] = useState(false)
  const [showPsForm, setShowPsForm] = useState(false)
  const [editFgs, setEditFgs] = useState<any>(null)
  const [editPs, setEditPs] = useState<any>(null)

  useEffect(() => {
    if (!isOwnerManager) { setHeaderActions(null); return }
    setHeaderActions(
      <div className="flex items-center gap-1.5">
        <button onClick={() => { setEditFgs(null); setShowFgsForm(true) }}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 px-2.5 py-1.5 rounded-lg">
          <Package size={12} /> Produk Jadi
        </button>
        <button onClick={() => { setEditPs(null); setShowPsForm(true) }}
          className="flex items-center gap-1 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={12} /> Stok Bahan
        </button>
      </div>
    )
    return () => setHeaderActions(null)
  }, [isOwnerManager])

  const data = useLiveQuery(async () => {
    const ps = await db.production_stock.toArray()
    const fgs = await db.finished_goods_stock.toArray()
    const mats = await db.materials.toArray()
    const mMap = Object.fromEntries(mats.map(m => [m.id, m]))
    const bahan = ps.map(s => ({
      ...s, material: mMap[s.material_id],
      displayAvgCost: (s as any).avg_cost || mMap[s.material_id]?.unit_cost || 0,
    })).filter(s => s.material?.name)
    const totalBahan = bahan.reduce((s, i) => s + i.qty_on_hand * i.displayAvgCost, 0)
    return { bahan, fgs, totalBahan }
  }, [])

  const filteredBahan = (data?.bahan || []).filter(s => {
    const matchSearch = !search || s.material?.name?.toLowerCase().includes(search.toLowerCase())
    const matchKat = filterKat === 'semua' ? true
      : filterKat === 'stok_rendah' ? s.qty_on_hand <= (s.material?.min_stock || 0) && (s.material?.min_stock || 0) > 0
        : s.material?.category === filterKat
    return matchSearch && matchKat
  })

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Nilai Bahan</p>
          <p className="text-base font-semibold text-gray-900">{formatRupiah(data?.totalBahan || 0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{data?.bahan.length || 0} jenis</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Produk Jadi</p>
          <p className="text-base font-semibold text-blue-600">{data?.fgs.reduce((s, f) => s + f.qty_on_hand, 0) || 0} pcs</p>
          <p className="text-xs text-gray-400 mt-0.5">{data?.fgs.length || 0} jenis</p>
        </div>
      </div>

      {/* Produk Jadi */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Produk Siap Kirim</p>
        {data?.fgs && data.fgs.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {data.fgs.map((f, idx) => (
              <div key={f.id}
                onClick={() => { if (isOwnerManager) { setEditFgs(f); setShowFgsForm(true) } }}
                className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${isOwnerManager ? 'cursor-pointer active:bg-gray-50' : ''}`}>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{f.product_name}</p>
                  {(f as any).hpp_per_unit > 0 && <p className="text-xs text-gray-400">HPP {formatRupiah((f as any).hpp_per_unit)}/pcs</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">{f.qty_on_hand} pcs</p>
                  <p className="text-xs text-gray-400">{formatRupiah(f.qty_on_hand * ((f as any).hpp_per_unit || 0))}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 py-6 text-center text-sm text-gray-400">Belum ada produk jadi</div>
        )}
      </div>

      {/* Stok Bahan */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Stok Bahan</p>
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none mb-2"
          placeholder="Cari nama bahan..." />
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide mb-2">
          {KAT_FILTERS.map(({ k, l }) => (
            <button key={k} onClick={() => setFilterKat(k)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterKat === k ? k === 'stok_rendah' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white' : k === 'stok_rendah' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filteredBahan.map((s, idx) => (
            <div key={s.id}
              onClick={() => { if (isOwnerManager) { setEditPs(s); setShowPsForm(true) } }}
              className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${isOwnerManager ? 'cursor-pointer active:bg-gray-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{s.material?.name}</p>
                <p className="text-xs text-gray-400">{formatKategori(s.material?.category)} · Avg {formatAvgCost(s.displayAvgCost, s.material?.unit || '')}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{s.qty_on_hand} <span className="text-xs font-normal text-gray-400">{s.material?.unit}</span></p>
                <p className="text-xs text-gray-400">{formatRupiah(s.qty_on_hand * s.displayAvgCost)}</p>
              </div>
            </div>
          ))}
          {filteredBahan.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">{search ? 'Tidak ada hasil' : 'Belum ada stok bahan'}</div>
          )}
        </div>
      </div>

      {showFgsForm && isOwnerManager && <FgsEditForm fgs={editFgs} onClose={() => { setShowFgsForm(false); setEditFgs(null) }} />}
      {showPsForm && isOwnerManager && <PsEditForm ps={editPs} isOwner={isOwner} onClose={() => { setShowPsForm(false); setEditPs(null) }} />}
    </div>
  )
}

// ── FORM: Edit Produk Jadi ─────────────────────────────────────
function FgsEditForm({ fgs, onClose }: { fgs: any; onClose: () => void }) {
  const [name, setName] = useState(fgs?.product_name || '')
  const [qty, setQty] = useState(String(fgs?.qty_on_hand || ''))
  const [hpp, setHpp] = useState(String(fgs?.hpp_per_unit || ''))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama produk wajib diisi')
    if (Number(qty) < 0) return toast.error('Qty tidak boleh negatif')
    setSaving(true)
    try {
      const data: any = {
        id: fgs?.id || generateId(),
        product_id: fgs?.product_id || `fgs-${generateId().slice(0, 8)}`,
        product_name: name.trim(),
        qty_on_hand: Number(qty),
        hpp_per_unit: Number(hpp) || 0,
        last_updated: now(),
      }
      await db.finished_goods_stock.put(data)
      await addToSyncQueue('finished_goods_stock', data.id, 'upsert' as any, data, 'gudang')
      toast.success(fgs ? 'Stok produk jadi diupdate' : 'Produk jadi ditambahkan')
      onClose()
    } catch (e) { toast.error('Gagal: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={fgs ? 'Edit Produk Jadi' : 'Tambah Produk Jadi'} onClose={onClose}>
      <div><Label required>Nama Produk</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>Qty (pcs)</Label><input className="input" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div><Label>HPP/pcs (Rp)</Label><input className="input" type="number" value={hpp} onChange={e => setHpp(e.target.value)} /></div>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM: Edit Stok Bahan Produksi ────────────────────────────
// ── FORM: Edit Stok Bahan Produksi (FULL - sama dengan gudang) ────────────────────────
// ── FORM: Edit Stok Bahan Produksi (FULL - sama dengan gudang) ────────────────────────
function PsEditForm({ ps, isOwner, onClose }: { ps: any; isOwner?: boolean; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const mat = materials?.find(m => m.id === ps?.material_id)

  const [matId, setMatId] = useState(ps?.material_id || '')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('bahan_baku')
  const [unit, setUnit] = useState('')
  const [unitCost, setUnitCost] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [customUnit, setCustom] = useState(false)
  const [qty, setQty] = useState(String(ps?.qty_on_hand || ''))
  const [avg, setAvg] = useState(String((ps as any)?.avg_cost || ''))
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  // Load material data when mat changes
  useEffect(() => {
    if (!mat) return
    setName(mat.name)
    setCategory(mat.category || 'bahan_baku')
    setUnit(mat.unit || '')
    setUnitCost(String(mat.unit_cost || 0))
    setMinStock(String(mat.min_stock || 0))
    setCustom(!SATUAN.map(s => s.toLowerCase()).includes((mat.unit || '').toLowerCase()))
    setIsActive(mat.is_active ?? true)
  }, [mat?.id])

  async function handleDelete() {
    if (!matId || !mat) return
    if (!confirm(`Hapus permanen "${mat.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setSaving(true)
    try {
      await db.production_stock.where('material_id').equals(matId).delete()
      await supabase.from('production_stock').delete().eq('material_id', matId)
      await db.materials.delete(matId)
      await supabase.from('materials').delete().eq('id', matId)
      toast.success(`"${mat.name}" dihapus`)
      onClose()
    } catch (e) { toast.error('Gagal hapus: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  async function handleSave() {
    if (!matId) return toast.error('Pilih bahan')
    if (!name.trim()) return toast.error('Nama wajib diisi')
    if (!unit) return toast.error('Satuan wajib diisi')
    if (Number(qty) < 0) return toast.error('Qty tidak boleh negatif')
    setSaving(true)
    try {
      // Update material data
      const matData: any = {
        id: matId, name: name.trim(), category, unit,
        unit_cost: Number(unitCost), min_stock: Number(minStock),
        is_active: isActive, updated_at: now(),
      }
      const hasHistoryPs = (mat as any)?.total_qty_purchased > 0
      const newAvgPs = hasHistoryPs ? (mat as any)?.avg_cost : Number(unitCost)
      await db.materials.update(matId, { ...matData, avg_cost: newAvgPs })
      const matFull = await db.materials.get(matId)
      if (matFull) await addToSyncQueue('materials', matId, 'upsert' as any, matFull, 'gudang')

      // Update production stock
      const existing = ps || await db.production_stock.where('material_id').equals(matId).first()
      const data: any = {
        id: existing?.id || generateId(),
        material_id: matId,
        qty_on_hand: Number(qty),
        avg_cost: Number(avg) || Number(unitCost) || 0,
        last_updated: now(),
      }
      await db.production_stock.put(data)
      await addToSyncQueue('production_stock', data.id, 'upsert' as any, data, 'gudang')
      toast.success('Stok bahan produksi diupdate')
      onClose()
    } catch (e) { toast.error('Gagal: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={ps ? `Edit: ${mat?.name || 'Bahan'}` : 'Tambah Stok Bahan'} onClose={onClose}>
      {!ps && (
        <div><Label required>Bahan</Label>
          <select className="input" value={matId} onChange={e => setMatId(e.target.value)}>
            <option value="">Pilih bahan</option>
            {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
          </select>
        </div>
      )}
      <div><Label required>Nama Bahan</Label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus={!!ps} />
      </div>
      <div><Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {KATEGORI.map(k => (
            <button key={k.value} onClick={() => setCategory(k.value)}
              className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-left transition-colors ${category === k.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div><Label required>Satuan</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SATUAN.map(s => (
            <button key={s} onClick={() => { setUnit(s); setCustom(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${unit === s && !customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 bg-white'}`}>{s}</button>
          ))}
          <button onClick={() => setCustom(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 bg-white'}`}>Lainnya</button>
        </div>
        {customUnit && <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ketik satuan..." />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>Qty Stok</Label><input className="input" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div><Label>Avg Cost (Rp)</Label><input className="input" type="number" value={avg} onChange={e => setAvg(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Harga Default/Satuan (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
        <div><Label>Min. Stok (alert)</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
      </div>
      {isOwner && ps && (
        <div className="flex items-center justify-between py-2">
          <div><p className="text-sm font-medium text-gray-700">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di stok</p></div>
          <button onClick={() => setIsActive(!isActive)} className={`w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isActive ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      )}
      <div className="flex gap-3">
        {isOwner && ps && (
          <button onClick={handleDelete} disabled={saving} className="px-4 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium flex items-center gap-1"><Trash2 size={14}/>Hapus</button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

function StokTokoView({ storeId, role, isOwner, isOwnerManager, setHeaderActions }: {
  storeId: string; role: string; isOwner?: boolean; isOwnerManager: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {
  const canSeeAllStores = ['owner', 'manager', 'gudang', 'produksi'].includes(role)
  const stores = useLiveQuery(() =>
    db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
    , [])
  const [selectedStore, setSelectedStore] = useState('')

  useEffect(() => {
    if (!canSeeAllStores) {
      setSelectedStore(storeId)
    } else if (stores && stores.length > 0) {
      setSelectedStore(prev => {
        if (!prev) return stores[0].id
        return stores.some(s => s.id === prev) ? prev : stores[0].id
      })
    }
  }, [stores, canSeeAllStores, storeId])

  const activeStoreId = canSeeAllStores ? selectedStore : storeId

  return (
    <div className="flex flex-col h-full">
      {canSeeAllStores && stores && stores.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide flex-shrink-0">
          {stores.map(s => (
            <button key={s.id} onClick={() => setSelectedStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedStore === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {activeStoreId ? (
        <StokTokoContent
          key={activeStoreId}
          storeId={activeStoreId}
          isOwnerManager={isOwnerManager}
          isOwner={isOwner}
          setHeaderActions={setHeaderActions}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Pilih toko</div>
      )}
    </div>
  )
}

function StokTokoContent({ storeId, isOwnerManager, isOwner, setHeaderActions }: {
  storeId: string; isOwnerManager: boolean; isOwner?: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {
  const [search, setSearch] = useState('')
  const [filterTokoKat, setFilterTokoKat] = useState('semua')
  const [showStokAwal, setShowStokAwal] = useState(false)
  const [editStock, setEditStock] = useState<any>(null)

  useEffect(() => {
    if (!storeId) return
    supabase.from('stock').select('*').eq('store_id', storeId).then(({ data }) => {
      if (data?.length) db.stock.bulkPut(data).catch(() => { })
    })
  }, [storeId])

  useEffect(() => {
    if (!isOwnerManager) { setHeaderActions(null); return }
    setHeaderActions(
      <button onClick={() => setShowStokAwal(true)}
        className="flex items-center gap-1 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 px-2.5 py-1.5 rounded-lg">
        <Package size={12} /> Stok Awal
      </button>
    )
    return () => setHeaderActions(null)
  }, [isOwnerManager])

  const data = useLiveQuery(async () => {
    if (!storeId) return []
    const stocks = await db.stock.where('store_id').equals(storeId).toArray()
    const prods = await db.products.toArray()
    const cats = await db.categories.toArray()
    const mats = await db.materials.toArray()
    const pMap = Object.fromEntries(prods.map(p => [p.id, p]))
    const cMap = Object.fromEntries(cats.map(c => [c.id, c]))
    const mMap = Object.fromEntries(mats.map(m => [m.id, m]))
    const fgsList = await db.finished_goods_stock.toArray()
    const fgsMap = Object.fromEntries(fgsList.map((f: any) => [f.product_id ?? f.id, f]))
    return stocks.map(s => {
      const id = (s as any).material_id || s.ingredient_id || ''
      const prod = pMap[id]; const mat = mMap[id]; const fgs = fgsMap[id]
      if (!prod && !mat && !fgs) return null
      return {
        id: s.id, stockId: s.id, ingredient_id: id,
        qty_on_hand: s.qty_on_hand,
        avg_cost: (s as any).avg_cost || 0,
        displayName: prod?.name || mat?.name || fgs?.product_name || '',
        displayUnit: prod?.unit || mat?.unit || 'pcs',
        categoryName: prod ? (cMap[prod.category_id || '']?.name || 'Produk') : fgs ? 'Produk Jadi' : formatKategori(mat?.category),
        categoryRaw: prod ? '' : fgs ? 'produk_jadi' : (mat?.category || ''),
        isProduk: !!(prod || fgs),
      }
    }).filter(Boolean) as any[]
  }, [storeId])

  const TOKO_FILTERS = [
    { k: 'semua', l: 'Semua' },
    { k: 'stok_rendah', l: '⚠ Stok Rendah' },
    { k: 'stok_habis', l: 'Habis' },
    { k: 'produk_jadi', l: 'Produk Jadi' },
    { k: 'bahan_baku', l: 'Bahan Baku' },
    { k: 'bahan_setengah_jadi', l: 'Bahan Setengah' },
    { k: 'packaging', l: 'Packaging' },
    { k: 'non_produksi', l: 'Non-Produksi' },
  ]

  const filtered = (data || []).filter(s => {
    const matchSearch = !search || s.displayName.toLowerCase().includes(search.toLowerCase())
    const matchKat =
      filterTokoKat === 'semua' ? true :
        filterTokoKat === 'stok_rendah' ? s.qty_on_hand > 0 && s.qty_on_hand <= 5 :
          filterTokoKat === 'stok_habis' ? s.qty_on_hand <= 0 :
            filterTokoKat === 'produk_jadi' ? s.isProduk :
              s.categoryRaw === filterTokoKat
    return matchSearch && matchKat
  })

  const totalNilai = filtered.reduce((s, i) => s + i.qty_on_hand * (i.avg_cost || 0), 0)

  return (
    <div className="flex-1 overflow-auto p-4 space-y-3">
      {filtered.length > 0 && totalNilai > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Nilai Stok Toko</p>
          <p className="text-base font-semibold text-gray-900">{formatRupiah(totalNilai)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} item</p>
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {TOKO_FILTERS.map(({ k, l }) => (
          <button key={k} onClick={() => setFilterTokoKat(k)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterTokoKat === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari nama produk / bahan..." />
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filtered.map((s, idx) => (
          <div key={s.id}
            onClick={() => { if (isOwnerManager) setEditStock(s) }}
            className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${isOwnerManager ? 'cursor-pointer active:bg-gray-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{s.displayName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {s.isProduk
                  ? <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">Produk Jadi</span>
                  : s.categoryName ? <p className="text-xs text-gray-400">{s.categoryName}</p> : null}
                {s.avg_cost > 0 && <p className="text-xs text-gray-300">· Avg {formatAvgCost(s.avg_cost, s.displayUnit)}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${s.qty_on_hand <= 0 ? 'text-red-500' : 'text-gray-900'}`}>
                {Math.round(s.qty_on_hand * 1000) / 1000} <span className="text-xs font-normal text-gray-400">{s.displayUnit}</span>
              </p>
              {s.avg_cost > 0 && <p className="text-xs text-gray-400">{formatRupiah(s.qty_on_hand * s.avg_cost)}</p>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada data stok toko'}
          </div>
        )}
      </div>
      {showStokAwal && isOwnerManager && <StokAwalTokoForm storeId={storeId} onClose={() => setShowStokAwal(false)} />}
      {editStock && isOwnerManager && <EditStokTokoForm stock={editStock} isOwner={isOwner} onClose={() => setEditStock(null)} />}
    </div>
  )
}

// ── FORM: Stok Awal Toko ──────────────────────────────────────
function StokAwalTokoForm({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const [items, setItems] = useState([{ material_id: '', qty: '', avg_cost: '' }])
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) >= 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      for (const item of valid) {
        const existing = await db.stock.filter(s =>
          s.store_id === storeId && (
            (s as any).material_id === item.material_id ||
            s.ingredient_id === item.material_id
          )
        ).first()
        const data: any = {
          id: existing?.id || generateId(),
          store_id: storeId,
          ingredient_id: item.material_id,
          material_id: item.material_id,
          qty_on_hand: Number(item.qty),
          avg_cost: Number(item.avg_cost) || 0,
          last_updated: now(),
        }
        await db.stock.put(data)
        await addToSyncQueue('stock', data.id, 'upsert' as any, data, storeId)
      }
      toast.success(`${valid.length} item stok toko disimpan`)
      onClose()
    } catch (e) { toast.error('Gagal: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Stok Awal Toko" onClose={onClose}>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-medium">Set stok awal toko</p>
        <p className="text-xs text-blue-500 mt-0.5">Qty akan di-set langsung ke nilai yang dimasukkan.</p>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => {
          const mat = materials?.find(m => m.id === item.material_id)
          return (
            <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
              <select className="input text-sm" value={item.material_id}
                onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, material_id: e.target.value } : x))}>
                <option value="">Pilih bahan / produk</option>
                {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || 'unit'})`}
                  value={item.qty} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x))} />
                <input className="input text-sm" type="number" placeholder="Harga avg"
                  value={item.avg_cost} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, avg_cost: e.target.value } : x))} />
              </div>
              {items.length > 1 && (
                <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-400">Hapus</button>
              )}
            </div>
          )
        })}
        <button onClick={() => setItems(p => [...p, { material_id: '', qty: '', avg_cost: '' }])}
          className="text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM: Edit Stok Toko ──────────────────────────────────────
// ── FORM: Edit Stok Toko (FULL - sama dengan gudang) ──────────────────────────────────
// ── FORM: Edit Stok Toko (FULL - sama dengan gudang) ──────────────────────────────────
function EditStokTokoForm({ stock, isOwner, onClose }: { stock: any; isOwner?: boolean; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const mat = materials?.find(m => m.id === stock.ingredient_id)

  const [name, setName] = useState(stock.displayName || '')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState(stock.displayUnit || '')
  const [unitCost, setUnitCost] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [customUnit, setCustom] = useState(false)
  const [qty, setQty] = useState(String(stock.qty_on_hand || 0))
  const [avg, setAvg] = useState(String(stock.avg_cost || 0))
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!mat) return
    setName(mat.name)
    setCategory(mat.category || 'bahan_baku')
    setUnit(mat.unit || stock.displayUnit || '')
    setUnitCost(String(mat.unit_cost || 0))
    setMinStock(String(mat.min_stock || 0))
    setCustom(!SATUAN.map(s => s.toLowerCase()).includes((mat.unit || '').toLowerCase()))
    setIsActive(mat.is_active ?? true)
  }, [mat?.id])

  async function handleDelete() {
    if (!mat) return
    if (!confirm(`Hapus permanen "${mat.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setSaving(true)
    try {
      await db.stock.delete(stock.stockId)
      await supabase.from('stock').delete().eq('id', stock.stockId)
      await db.materials.delete(mat.id)
      await supabase.from('materials').delete().eq('id', mat.id)
      toast.success(`"${mat.name}" dihapus`)
      onClose()
    } catch (e) { toast.error('Gagal hapus: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama wajib diisi')
    if (!unit) return toast.error('Satuan wajib diisi')
    setSaving(true)
    try {
      // Update material data kalau ada
      if (mat) {
        const hasHistoryToko = (mat as any)?.total_qty_purchased > 0
        const newAvgToko = hasHistoryToko ? (mat as any)?.avg_cost : Number(unitCost)
        await db.materials.update(mat.id, { name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgToko, min_stock: Number(minStock), is_active: isActive, updated_at: now() } as any)
        const matFull = await db.materials.get(mat.id)
        if (matFull) await addToSyncQueue('materials', mat.id, 'upsert' as any, matFull, 'gudang')
      }
      // Update stock toko
      await db.stock.update(stock.stockId, { qty_on_hand: Number(qty), avg_cost: Number(avg), last_updated: now() } as any)
      const stFull = await db.stock.get(stock.stockId)
      if (stFull) await addToSyncQueue('stock', stock.stockId, 'upsert' as any, stFull, (stFull as any).store_id || 'gudang')
      toast.success('Stok diupdate')
      onClose()
    } catch (e) { toast.error('Gagal: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`Edit: ${stock.displayName}`} onClose={onClose}>
      {!stock.isProduk && (
        <>
          <div><Label required>Nama Bahan</Label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div><Label required>Kategori</Label>
            <div className="grid grid-cols-2 gap-2">
              {KATEGORI.map(k => (
                <button key={k.value} onClick={() => setCategory(k.value)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-left transition-colors ${category === k.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div><Label required>Satuan</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SATUAN.map(s => (
                <button key={s} onClick={() => { setUnit(s); setCustom(false) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${unit === s && !customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 bg-white'}`}>{s}</button>
              ))}
              <button onClick={() => setCustom(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 bg-white'}`}>Lainnya</button>
            </div>
            {customUnit && <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ketik satuan..." />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Harga Default (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
            <div><Label>Min. Stok</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
          </div>
          {isOwner && (
            <div className="flex items-center justify-between py-2">
              <div><p className="text-sm font-medium text-gray-700">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di stok</p></div>
              <button onClick={() => setIsActive(!isActive)} className={`w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isActive ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          )}
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>Qty ({unit || stock.displayUnit})</Label><input className="input" type="number" value={qty} onChange={e => setQty(e.target.value)} autoFocus={stock.isProduk} /></div>
        <div><Label>Avg Cost (Rp)</Label><input className="input" type="number" value={avg} onChange={e => setAvg(e.target.value)} /></div>
      </div>
      <div className="flex gap-3">
        {isOwner && !stock.isProduk && mat && (
          <button onClick={handleDelete} disabled={saving} className="px-4 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium flex items-center gap-1"><Trash2 size={14}/>Hapus</button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

function MaterialForm({ material, isOwner, onClose }: { material: Material | null; isOwner: boolean; onClose: () => void }) {
  const [name, setName] = useState(material?.name || '')
  const [category, setCategory] = useState(material?.category || 'bahan_baku')
  const [unit, setUnit] = useState(material?.unit || '')
  const [unitCost, setUnitCost] = useState(String(material?.unit_cost || '0'))
  const [minStock, setMinStock] = useState(String(material?.min_stock || '0'))
  const [customUnit, setCustom] = useState(material ? !SATUAN.map(s => s.toLowerCase()).includes((material.unit || '').toLowerCase()) : false)
  const [isActive, setIsActive] = useState(material?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  async function handleDelete() {
    if (!material || !isOwner) return
    if (!confirm(`Hapus "${material.name}" permanen?`)) return
    try {
      for (const t of ['warehouse_mutation_items', 'purchase_items', 'warehouse_stock', 'production_stock', 'store_recipe_items']) {
        await supabase.from(t).delete().eq('material_id', material.id)
      }
      await supabase.from('stock').delete().eq('ingredient_id', material.id)
      await supabase.from('stock').delete().eq('material_id', material.id)
      await supabase.from('materials').delete().eq('id', material.id)
      await db.materials.delete(material.id)
      await db.warehouse_stock.where('material_id').equals(material.id).delete()
      await db.production_stock.where('material_id').equals(material.id).delete()
      await db.stock.where('ingredient_id').equals(material.id).delete()
      toast.success(`"${material.name}" dihapus`)
      onClose()
    } catch (e) { toast.error('Gagal hapus: ' + String((e as any)?.message || e)) }
  }

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama bahan wajib diisi')
    if (!unit) return toast.error('Satuan wajib diisi')
    if (!material) {
      const existing = await db.materials.filter(m => m.name.toLowerCase() === name.trim().toLowerCase() && m.is_active).first()
      if (existing) return toast.error(`Bahan "${name}" sudah ada`)
    }
    setSaving(true)
    try {
      const hasPurchaseHistory = ((material as any)?.total_qty_purchased || 0) > 0
      const data: any = {
        id: material?.id || generateId(), name: name.trim(), category, unit,
        unit_cost: Number(unitCost),
        avg_cost: hasPurchaseHistory ? (material as any)?.avg_cost : Number(unitCost),
        min_stock: Number(minStock),
        is_active: isActive, created_at: material?.created_at || now(), updated_at: now(),
      }
      await db.materials.put(data)
      await addToSyncQueue('materials', data.id, 'upsert' as any, data, 'gudang')
      toast.success(material ? `"${name.trim()}" diperbarui` : `"${name.trim()}" ditambahkan`)
      onClose()
    } catch (e) { toast.error('Gagal menyimpan: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={material ? 'Edit Bahan' : 'Tambah Bahan Baru'} onClose={onClose}>
      <div><Label required>Nama Bahan</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div><Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {KATEGORI.map(k => (
            <button key={k.value} onClick={() => setCategory(k.value as typeof category)}
              className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-left transition-colors ${category === k.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div><Label required>Satuan</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SATUAN.map(s => (
            <button key={s} onClick={() => { setUnit(s); setCustom(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${unit === s && !customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 bg-white'}`}>{s}</button>
          ))}
          <button onClick={() => setCustom(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 bg-white'}`}>Lainnya</button>
        </div>
        {customUnit && <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ketik satuan..." />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Harga Default / Satuan (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
        <div><Label>Min. Stok (alert)</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
      </div>
      {material && (
        <div className="flex items-center justify-between py-2 border-t border-gray-100">
          <div><p className="text-sm font-medium text-gray-800">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di stok</p></div>
          <button onClick={() => setIsActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      )}
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        {material && isOwner && (
          <button onClick={handleDelete} className="px-4 py-3 rounded-xl border border-red-200 text-sm font-medium text-red-500 flex items-center gap-1.5">
            <Trash2 size={14} /> Hapus
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM: Stok Awal Gudang ────────────────────────────────────
function OpeningStockForm({ onClose }: { onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const [items, setItems] = useState([{ material_id: '', qty: '', unit_cost: '' }])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('Saldo awal migrasi')
  const [saving, setSaving] = useState(false)

  function updateItem(i: number, f: string, v: string) {
    setItems(p => p.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [f]: v }
      if (f === 'material_id') {
        const mat = materials?.find(m => m.id === v)
        if (mat) updated.unit_cost = String(mat.avg_cost || mat.unit_cost || 0)
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
        const qty = Number(item.qty)
        const cost = Number(item.unit_cost) || 0
        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        const wsd: WarehouseStock = { id: ws?.id || generateId(), material_id: item.material_id, qty_on_hand: qty, last_updated: now() }
        await db.warehouse_stock.put(wsd)
        await addToSyncQueue('warehouse_stock', wsd.id, 'upsert' as any, wsd, 'gudang')
        if (cost > 0) {
          await db.materials.update(item.material_id, { unit_cost: cost, avg_cost: cost, updated_at: now() })
          const matFull = await db.materials.get(item.material_id)
          if (matFull) await addToSyncQueue('materials', item.material_id, 'upsert' as any, matFull, 'gudang')
        }
        const mutId = generateId()
        const mut = { id: mutId, mutation_type: 'opening_stock', destination_name: 'Saldo Awal', notes: notes || 'Stok awal', status: 'confirmed', created_by: 'system', created_at: `${date}T00:00:00.000Z`, confirmed_at: now(), confirmed_by: 'system' }
        await db.warehouse_mutations.add(mut as any)
        await addToSyncQueue('warehouse_mutations', mutId, 'upsert' as any, mut, 'gudang')
        const mi = { id: generateId(), mutation_id: mutId, material_id: item.material_id, qty, unit_cost: cost }
        await db.warehouse_mutation_items.add(mi)
        await addToSyncQueue('warehouse_mutation_items', mi.id, 'upsert' as any, mi, 'gudang')
      }
      toast.success(`${valid.length} item stok awal disimpan`)
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Input Stok Awal Gudang" onClose={onClose}>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-medium mb-0.5">Untuk migrasi dari sistem lama</p>
        <p className="text-xs text-blue-500">Qty akan di-set langsung. Harga update harga default bahan.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tanggal Efektif</Label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><Label>Keterangan</Label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <div>
        <Label>Item</Label>
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
                  <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || 'unit'})`}
                    value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  <input className="input text-sm" type="number" placeholder="Harga/unit"
                    value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} />
                </div>
                {item.qty && item.unit_cost && (
                  <p className="text-xs text-gray-400">Nilai: {formatRupiah(Number(item.qty) * Number(item.unit_cost))}</p>
                )}
                {items.length > 1 && (
                  <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-400">Hapus</button>
                )}
              </div>
            )
          })}
        </div>
        <button onClick={() => setItems(p => [...p, { material_id: '', qty: '', unit_cost: '' }])}
          className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Stok Awal'}</button>
      </div>
    </Modal>
  )
}

function EditStokGudangForm({ item, onClose }: { item: any; onClose: () => void }) {
  const [name, setName] = useState(item.name || '')
  const [category, setCategory] = useState(item.category || 'bahan_baku')
  const [unit, setUnit] = useState(item.unit || '')
  const [unitCost, setUnitCost] = useState(String(item.unit_cost || item.avg_cost || 0))
  const [minStock, setMinStock] = useState(String(item.min_stock || 0))
  const [qty, setQty] = useState(String(item.qty || 0))
  const [avg, setAvg] = useState(String(item.avg_cost || 0))
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!name.trim()) return toast.error('Nama wajib diisi')
    if (!unit) return toast.error('Satuan wajib diisi')
    if (Number(qty) < 0) return toast.error('Qty tidak boleh negatif')
    setSaving(true)
    try {
      await db.materials.update(item.id, { name: name.trim(), category, unit, unit_cost: Number(unitCost), min_stock: Number(minStock), updated_at: now() })
      const matFull = await db.materials.get(item.id)
      if (matFull) await addToSyncQueue('materials', item.id, 'upsert' as any, matFull, 'gudang')
      const ws = await db.warehouse_stock.where('material_id').equals(item.id).first()
      const wsd: any = { id: ws?.id || generateId(), material_id: item.id, qty_on_hand: Number(qty), avg_cost: Number(avg) || Number(unitCost) || 0, last_updated: now() }
      await db.warehouse_stock.put(wsd)
      await addToSyncQueue('warehouse_stock', wsd.id, 'upsert' as any, wsd, 'gudang')
      toast.success('Stok gudang diperbarui')
      onClose()
    } catch (e) { toast.error('Gagal: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }
  const CATS = ['bahan_baku','bahan_setengah_jadi','packaging','non_produksi']
  const SATUAN_LIST = ['Gram','Ml','Pcs','Kg','Liter','Pack','Lembar','Roll']
  const [isActive, setIsActive] = useState(item.is_active ?? true)
  const [customUnit, setCustom] = useState(!SATUAN_LIST.map(s => s.toLowerCase()).includes((item.unit||''). toLowerCase()))
  async function handleDelete() {
    if (!confirm(`Hapus "${name}" permanen?`)) return
    try {
      await supabase.from('warehouse_stock').delete().eq('material_id', item.id)
      await supabase.from('materials').delete().eq('id', item.id)
      await db.warehouse_stock.where('material_id').equals(item.id).delete()
      await db.materials.delete(item.id)
      toast.success(`"${name}" dihapus`)
      onClose()
    } catch (e) { toast.error('Gagal hapus') }
  }
  return (
    <Modal title="Edit Bahan" onClose={onClose}>
      <div><Label required>Nama Bahan</Label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
      <div><Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {CATS.map(k => <button key={k} onClick={() => setCategory(k)} className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${category===k?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200'}`}>{k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</button>)}
        </div>
      </div>
      <div><Label required>Satuan</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {SATUAN_LIST.map(s => <button key={s} onClick={() => { setUnit(s); setCustom(false) }} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${unit===s&&!customUnit?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200'}`}>{s}</button>)}
          <button onClick={() => setCustom(true)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${customUnit?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200'}`}>Lainnya</button>
        </div>
        {customUnit && <input className="input" placeholder="Satuan custom" value={unit} onChange={e => setUnit(e.target.value)} />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>QTY Stok</Label><input className="input" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div><Label>Avg Cost (Rp)</Label><input className="input" type="number" value={avg} onChange={e => setAvg(e.target.value)} /></div>
        <div><Label>Harga Default (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
        <div><Label>Min. Stok</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between py-2">
        <div><p className="text-sm font-medium text-gray-700">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di stok</p></div>
        <button onClick={() => setIsActive(!isActive)} className={`w-12 h-6 rounded-full transition-colors ${isActive?'bg-gray-900':'bg-gray-200'}`}>
          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isActive?'translate-x-6':'translate-x-0'}`} />
        </button>
      </div>
      <div className="flex gap-3">
        <button onClick={handleDelete} className="px-4 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium flex items-center gap-1"><Trash2 size={14}/>Hapus</button>
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}
