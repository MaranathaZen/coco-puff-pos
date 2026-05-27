// src/pages/gudang/GudangPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah, formatDate } from '@/lib/utils'
import { Plus, Package, ShoppingCart, ArrowRightLeft, RotateCcw, RefreshCw, X, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Material, WarehouseStock, Purchase, WarehouseMutation, WarehouseMutationItem, WarehouseExpense } from '@/lib/db'

type Tab = 'stok' | 'pembelian' | 'mutasi' | 'biaya'

// Satuan standard Bakery/F&B
const SATUAN_STANDARD = [
  'kg', 'gram', 'ons',
  'liter', 'ml',
  'butir', 'pcs', 'buah',
  'dus', 'karton', 'pack', 'sachet',
  'roll', 'lembar',
  'sdm', 'sdt',
  'loyang', 'batch',
]

// Kategori standard POS Bakery
const KATEGORI_BAHAN = [
  { value: 'bahan_baku',         label: 'Bahan Baku',          desc: 'Tepung, gula, telur, dll',       emoji: '🌾' },
  { value: 'bahan_setengah_jadi',label: 'Bahan Setengah Jadi', desc: 'Premix, adonan siap pakai, dll', emoji: '🥣' },
  { value: 'packaging',          label: 'Packaging',            desc: 'Dus, plastik, kresek, dll',      emoji: '📦' },
  { value: 'non_produksi',       label: 'Non Produksi / ATK',   desc: 'Alat tulis, kebersihan, dll',    emoji: '🖊️' },
  { value: 'operasional',        label: 'Operasional',          desc: 'Bahan bakar, gas, dll',          emoji: '⚙️' },
]

export default function GudangPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('stok')
  const [isSyncing, setIsSyncing] = useState(false)

  async function syncData() {
    setIsSyncing(true)
    try {
      const pulls = [
        supabase.from('materials').select('*'),
        supabase.from('suppliers').select('*'),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('purchase_items').select('*'),
        supabase.from('warehouse_mutations').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('warehouse_mutation_items').select('*'),
        supabase.from('partners').select('*'),
        supabase.from('warehouse_expenses').select('*').order('expense_date', { ascending: false }).limit(100),
      ]
      const results = await Promise.all(pulls)
      const tables = ['materials','suppliers','warehouse_stock','purchases','purchase_items','warehouse_mutations','warehouse_mutation_items','partners','warehouse_expenses']
      for (let i = 0; i < tables.length; i++) {
        const data = results[i].data
        if (data?.length) await (db as any)[tables[i]].bulkPut(data)
      }
      toast.success('Data gudang diperbarui')
    } catch (e) {
      toast.error('Gagal sync')
    } finally {
      setIsSyncing(false)
    }
  }

  const tabs = [
    { id: 'stok',      label: 'Stok',   icon: Package },
    { id: 'pembelian', label: 'Beli',   icon: ShoppingCart },
    { id: 'mutasi',    label: 'Mutasi', icon: ArrowRightLeft },
    { id: 'biaya',     label: 'Biaya',  icon: Wallet },
  ] as const

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h2 className="font-semibold text-gray-800">Gudang</h2>
        <button onClick={syncData} disabled={isSyncing} className="p-2 rounded-xl text-gray-500 active:bg-gray-100">
          <RefreshCw size={18} className={isSyncing ? 'animate-spin text-brand-600' : ''} />
        </button>
      </div>

      <div className="bg-white border-b border-gray-100 flex flex-shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400'
            }`}>
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'stok'      && <StokTab userId={user!.id} />}
        {tab === 'pembelian' && <PembelianTab userId={user!.id} />}
        {tab === 'mutasi'    && <MutasiTab userId={user!.id} />}
        {tab === 'biaya'     && <BiayaTab userId={user!.id} />}
      </div>
    </div>
  )
}

// ── TAB STOK ─────────────────────────────────────────────────
function StokTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)
  const [editMat, setEditMat]   = useState<Material | null>(null)
  const [filter, setFilter]     = useState<string>('semua')

  const data = useLiveQuery(async () => {
    const mats   = await db.materials.toArray()
    const stocks = await db.warehouse_stock.toArray()
    const stockMap = Object.fromEntries(stocks.map(s => [s.material_id, s]))
    return mats.filter(m =>
      filter === 'semua' || m.category === filter
    ).map(m => ({ ...m, stock: stockMap[m.id] || null }))
  }, [filter])

  const lowStock = data?.filter(d => (d.stock?.qty_on_hand || 0) <= d.min_stock) || []
  const filterTabs = [{ value: 'semua', label: 'Semua' }, ...KATEGORI_BAHAN.map(k => ({ value: k.value, label: k.label.split('/')[0].trim() }))]

  return (
    <div className="p-4 space-y-3">
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-3">
          <p className="text-sm font-semibold text-red-700">⚠️ Stok Rendah ({lowStock.length} item)</p>
          <p className="text-xs text-red-500 mt-0.5 line-clamp-2">{lowStock.map(s => s.name).join(', ')}</p>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-1.5 pb-1">
            {filterTabs.map(f => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f.value ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}>{f.label}</button>
            ))}
          </div>
        </div>
        <button onClick={() => { setEditMat(null); setShowForm(true) }}
          className="btn-primary px-3 py-2 flex items-center gap-1 text-sm flex-shrink-0">
          <Plus size={14} /> Bahan
        </button>
      </div>

      <div className="space-y-2">
        {data?.map(item => {
          const qty    = item.stock?.qty_on_hand || 0
          const isLow  = qty <= item.min_stock
          const kat    = KATEGORI_BAHAN.find(k => k.value === item.category)
          return (
            <div key={item.id} className={`card flex items-center gap-3 ${!item.is_active ? 'opacity-50' : ''}`}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-gray-50">
                {kat?.emoji || '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-gray-800 truncate text-sm">{item.name}</p>
                  {!item.is_active && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">nonaktif</span>}
                </div>
                <p className="text-xs text-gray-400">{kat?.label} · {formatRupiah(item.unit_cost)}/{item.unit}</p>
              </div>
              <div className="text-right flex-shrink-0 mr-1">
                <p className={`font-bold text-base ${isLow ? 'text-red-500' : 'text-gray-800'}`}>{qty}</p>
                <p className="text-xs text-gray-400">{item.unit}</p>
              </div>
              <button onClick={() => { setEditMat(item); setShowForm(true) }}
                className="text-xs text-brand-600 font-medium px-2 py-1 rounded-lg active:bg-brand-50">Edit</button>
            </div>
          )
        })}
        {data?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">Belum ada data bahan</div>
        )}
      </div>

      {showForm && (
        <MaterialForm material={editMat} onClose={() => { setShowForm(false); setEditMat(null) }} />
      )}
    </div>
  )
}

// ── TAB PEMBELIAN ─────────────────────────────────────────────
function PembelianTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const purchases = useLiveQuery(async () => {
    const purch  = await db.purchases.orderBy('created_at').reverse().limit(50).toArray()
    const sups   = await db.suppliers.toArray()
    const items  = await db.purchase_items.toArray()
    const mats   = await db.materials.toArray()
    const supMap = Object.fromEntries(sups.map(s => [s.id, s]))
    const matMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return purch.map(p => ({
      ...p,
      supplier: p.supplier_id ? supMap[p.supplier_id] : null,
      items: items.filter(i => i.purchase_id === p.id).map(i => ({ ...i, material: matMap[i.material_id] }))
    }))
  }, [])

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Pembelian Baru
        </button>
      </div>

      <div className="space-y-2">
        {purchases?.map(p => (
          <div key={p.id} className="card space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-gray-800 text-sm">{p.supplier?.name || 'Tanpa Supplier'}</p>
                <p className="text-xs text-gray-400">{formatDate(p.created_at)}</p>
                {p.invoice_no && <p className="text-xs text-gray-400">Invoice: {p.invoice_no}</p>}
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-800">{formatRupiah(p.total_amount)}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{p.status}</span>
              </div>
            </div>
            {p.items.length > 0 && (
              <div className="border-t border-gray-50 pt-2 space-y-1">
                {p.items.map(i => (
                  <div key={i.id} className="flex justify-between text-xs text-gray-500">
                    <span>{i.material?.name} × {i.qty} {i.material?.unit}</span>
                    <span>{formatRupiah(i.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {purchases?.length === 0 && <div className="text-center text-gray-400 py-12 text-sm">Belum ada pembelian</div>}
      </div>

      {showForm && <PembelianForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── TAB MUTASI ────────────────────────────────────────────────
function MutasiTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const mutations = useLiveQuery(async () => {
    const muts  = await db.warehouse_mutations.orderBy('created_at').reverse().limit(50).toArray()
    const items = await db.warehouse_mutation_items.toArray()
    const mats  = await db.materials.toArray()
    const matMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return muts.map(m => ({
      ...m,
      items: items.filter(i => i.mutation_id === m.id).map(i => ({ ...i, material: matMap[i.material_id] }))
    }))
  }, [])

  const typeLabel: Record<string, { label: string; color: string }> = {
    to_production: { label: '→ Produksi', color: 'bg-blue-100 text-blue-700' },
    to_store:      { label: '→ Toko',     color: 'bg-green-100 text-green-700' },
    to_partner:    { label: '→ Mitra',    color: 'bg-purple-100 text-purple-700' },
    adjustment:    { label: 'Koreksi',    color: 'bg-gray-100 text-gray-600' },
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Mutasi Baru
        </button>
      </div>

      <div className="space-y-2">
        {mutations?.map(m => {
          const t = typeLabel[m.mutation_type] || { label: m.mutation_type, color: 'bg-gray-100 text-gray-600' }
          return (
            <div key={m.id} className="card space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.color}`}>{t.label}</span>
                    {m.destination_name && <span className="text-xs text-gray-500">{m.destination_name}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(m.created_at)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  m.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>{m.status}</span>
              </div>
              {m.items.length > 0 && (
                <div className="border-t border-gray-50 pt-2 space-y-1">
                  {m.items.map(i => (
                    <div key={i.id} className="flex justify-between text-xs text-gray-500">
                      <span>{i.material?.name}</span>
                      <span>{i.qty} {i.material?.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {mutations?.length === 0 && <div className="text-center text-gray-400 py-12 text-sm">Belum ada mutasi</div>}
      </div>

      {showForm && <MutasiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── TAB BIAYA OPERASIONAL ─────────────────────────────────────
function BiayaTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const expenses = useLiveQuery(async () => {
    return db.warehouse_expenses.orderBy('expense_date').reverse().limit(50).toArray()
  }, [])

  const totalBulanIni = expenses?.filter(e => {
    const d = new Date(e.expense_date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s, e) => s + e.amount, 0) || 0

  const catLabel: Record<string, string> = {
    listrik: '💡 Listrik', sewa: '🏠 Sewa', gaji: '👤 Gaji',
    transport: '🚗 Transport', lainnya: '📌 Lainnya',
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="card flex-1 mr-3 text-center py-3">
          <p className="text-xs text-gray-500 mb-1">Biaya Bulan Ini</p>
          <p className="font-bold text-lg text-red-600">{formatRupiah(totalBulanIni)}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Catat
        </button>
      </div>

      <div className="space-y-2">
        {expenses?.map(e => (
          <div key={e.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 text-sm">{e.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">{catLabel[e.category] || e.category}</span>
                <span className="text-xs text-gray-400">{e.expense_date}</span>
              </div>
              {e.notes && <p className="text-xs text-gray-400">{e.notes}</p>}
            </div>
            <p className="font-semibold text-red-600">{formatRupiah(e.amount)}</p>
          </div>
        ))}
        {expenses?.length === 0 && <div className="text-center text-gray-400 py-12 text-sm">Belum ada catatan biaya</div>}
      </div>

      {showForm && <BiayaForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── MODAL: Form Bahan ─────────────────────────────────────────
function MaterialForm({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const [name, setName]         = useState(material?.name || '')
  const [category, setCategory] = useState(material?.category || 'bahan_baku')
  const [unit, setUnit]         = useState(material?.unit || '')
  const [unitCost, setUnitCost] = useState(String(material?.unit_cost || ''))
  const [minStock, setMinStock] = useState(String(material?.min_stock || '0'))
  const [isActive, setIsActive] = useState(material?.is_active ?? true)
  const [saving, setSaving]     = useState(false)
  const [customUnit, setCustomUnit] = useState(!SATUAN_STANDARD.includes(material?.unit || ''))

  async function handleSave() {
    if (!name.trim() || !unit) return toast.error('Nama dan satuan wajib diisi')
    setSaving(true)
    try {
      const data: any = {
        id: material?.id || generateId(),
        name: name.trim(), category, unit,
        unit_cost: Number(unitCost) || 0,
        min_stock: Number(minStock) || 0,
        is_active: isActive,
        created_at: material?.created_at || now(),
        updated_at: now(),
      }
      await db.materials.put(data)
      await supabase.from('materials').upsert(data)
      toast.success(material ? 'Bahan diupdate' : 'Bahan ditambahkan')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">{material ? 'Edit Bahan' : 'Tambah Bahan'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Nama Bahan</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Tepung Terigu" autoFocus />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Kategori</label>
            <div className="grid grid-cols-1 gap-2">
              {KATEGORI_BAHAN.map(k => (
                <button key={k.value} onClick={() => setCategory(k.value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    category === k.value ? 'border-brand-500 bg-brand-50' : 'border-gray-100 bg-gray-50'
                  }`}>
                  <span className="text-xl">{k.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{k.label}</p>
                    <p className="text-xs text-gray-400">{k.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Satuan</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SATUAN_STANDARD.map(s => (
                <button key={s} onClick={() => { setUnit(s); setCustomUnit(false) }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    unit === s && !customUnit ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'
                  }`}>{s}</button>
              ))}
              <button onClick={() => setCustomUnit(true)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  customUnit ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'
                }`}>lainnya...</button>
            </div>
            {customUnit && (
              <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ketik satuan..." />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Harga Default/Satuan</label>
              <input className="input" type="number" value={unitCost}
                onChange={e => setUnitCost(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Min. Stok (alert)</label>
              <input className="input" type="number" value={minStock}
                onChange={e => setMinStock(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-700">Status Aktif</p>
              <p className="text-xs text-gray-400">Nonaktif = tidak muncul di daftar</p>
            </div>
            <button onClick={() => setIsActive(!isActive)}
              className={`w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-brand-600' : 'bg-gray-300'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isActive ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODAL: Pembelian ──────────────────────────────────────────
function PembelianForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const suppliers = useLiveQuery(() => db.suppliers.filter(s => s.is_active).toArray(), [])

  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo]   = useState('')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState([{ material_id: '', qty: '', unit_cost: '' }])
  const [saving, setSaving]         = useState(false)

  const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_cost), 0)

  function addItem() { setItems(p => [...p, { material_id: '', qty: '', unit_cost: '' }]) }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, f: string, v: string) {
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [f]: v } : item))
  }

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      const purchId = generateId()
      const purch: Purchase = {
        id: purchId, supplier_id: supplierId || undefined,
        invoice_no: invoiceNo || undefined,
        total_amount: total, status: 'received',
        notes: notes || undefined, created_by: userId, created_at: now(),
      }
      await db.purchases.add(purch)
      await supabase.from('purchases').insert(purch)

      for (const item of valid) {
        const pi = {
          id: generateId(), purchase_id: purchId,
          material_id: item.material_id,
          qty: Number(item.qty), unit_cost: Number(item.unit_cost),
          subtotal: Number(item.qty) * Number(item.unit_cost),
          qty_returned: 0,
        }
        await db.purchase_items.add(pi)
        await supabase.from('purchase_items').insert(pi)

        const existing = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        const stockData: WarehouseStock = {
          id: existing?.id || generateId(),
          material_id: item.material_id,
          qty_on_hand: (existing?.qty_on_hand || 0) + Number(item.qty),
          last_updated: now(),
        }
        await db.warehouse_stock.put(stockData)
        await supabase.from('warehouse_stock').upsert(stockData)

        if (Number(item.unit_cost) > 0) {
          await db.materials.update(item.material_id, { unit_cost: Number(item.unit_cost), updated_at: now() })
          await supabase.from('materials').update({ unit_cost: Number(item.unit_cost) }).eq('id', item.material_id)
        }
      }
      toast.success('Pembelian berhasil dicatat')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Pembelian Baru</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Supplier</label>
              <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Tanpa Supplier</option>
                {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">No. Invoice</label>
              <input className="input" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="INV-001" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Item Pembelian</label>
            {items.map((item, i) => {
              const mat = materials?.find(m => m.id === item.material_id)
              return (
                <div key={i} className="bg-gray-50 rounded-2xl p-3 space-y-2">
                  <select className="input text-sm" value={item.material_id}
                    onChange={e => {
                      const m = materials?.find(m => m.id === e.target.value)
                      updateItem(i, 'material_id', e.target.value)
                      if (m?.unit_cost) updateItem(i, 'unit_cost', String(m.unit_cost))
                    }}>
                    <option value="">-- Pilih Bahan --</option>
                    {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || 'unit'})`}
                      value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                    <input className="input text-sm" type="number" placeholder="Harga/unit"
                      value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} />
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="text-xs text-red-400 font-medium">− Hapus item</button>
                  )}
                </div>
              )
            })}
            <button onClick={addItem} className="text-sm text-brand-600 font-medium">+ Tambah Item</button>
          </div>

          <input className="input text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (opsional)" />

          <div className="bg-brand-50 rounded-2xl p-3 flex justify-between items-center">
            <span className="font-medium text-gray-700">Total Pembelian</span>
            <span className="font-bold text-brand-700 text-lg">{formatRupiah(total)}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODAL: Mutasi ─────────────────────────────────────────────
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
  function updateItem(i: number, f: string, v: string) {
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [f]: v } : item))
  }

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      let destName = type === 'to_production' ? 'Produksi' :
        type === 'to_store' ? stores?.find(s => s.id === destId)?.name || '' :
        type === 'to_partner' ? partners?.find(p => p.id === destId)?.name || '' : ''

      const mutId = generateId()
      const mut: WarehouseMutation = {
        id: mutId, mutation_type: type,
        destination_id: destId || undefined,
        destination_name: destName || undefined,
        notes: notes || undefined, status: 'confirmed',
        created_by: userId, created_at: now(),
        confirmed_at: now(), confirmed_by: userId,
      }
      await db.warehouse_mutations.add(mut)
      await supabase.from('warehouse_mutations').insert(mut)

      for (const item of valid) {
        const mat = materials?.find(m => m.id === item.material_id)
        const mi: WarehouseMutationItem = {
          id: generateId(), mutation_id: mutId,
          material_id: item.material_id,
          qty: Number(item.qty), unit_cost: mat?.unit_cost || 0,
        }
        await db.warehouse_mutation_items.add(mi)
        await supabase.from('warehouse_mutation_items').insert(mi)

        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        if (ws) {
          const newQty = Math.max(0, ws.qty_on_hand - Number(item.qty))
          await db.warehouse_stock.update(ws.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('warehouse_stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', ws.id)
        }

        if (type === 'to_production') {
          const ps = await db.production_stock.where('material_id').equals(item.material_id).first()
          const psData: any = {
            id: ps?.id || generateId(), material_id: item.material_id,
            qty_on_hand: (ps?.qty_on_hand || 0) + Number(item.qty),
            last_updated: now(),
          }
          await db.production_stock.put(psData)
          await supabase.from('production_stock').upsert(psData)
        }
      }
      toast.success('Mutasi berhasil dicatat')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Mutasi Gudang</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Tujuan</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'to_production', l: '→ Produksi' },
                { v: 'to_store',      l: '→ Toko' },
                { v: 'to_partner',    l: '→ Mitra' },
                { v: 'adjustment',    l: 'Koreksi' },
              ] as const).map(t => (
                <button key={t.v} onClick={() => setType(t.v)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    type === t.v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'
                  }`}>{t.l}</button>
              ))}
            </div>
          </div>

          {type === 'to_store' && (
            <select className="input" value={destId} onChange={e => setDest(e.target.value)}>
              <option value="">-- Pilih Toko --</option>
              {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {type === 'to_partner' && (
            <select className="input" value={destId} onChange={e => setDest(e.target.value)}>
              <option value="">-- Pilih Mitra --</option>
              {partners?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Item</label>
            {items.map((item, i) => {
              const mat = materials?.find(m => m.id === item.material_id)
              return (
                <div key={i} className="bg-gray-50 rounded-2xl p-3 space-y-2">
                  <select className="input text-sm" value={item.material_id}
                    onChange={e => updateItem(i, 'material_id', e.target.value)}>
                    <option value="">-- Pilih Bahan --</option>
                    {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </select>
                  <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || 'unit'})`}
                    value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  {items.length > 1 && (
                    <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-400 font-medium">− Hapus</button>
                  )}
                </div>
              )
            })}
            <button onClick={addItem} className="text-sm text-brand-600 font-medium">+ Tambah Item</button>
          </div>

          <input className="input text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (opsional)" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODAL: Biaya Operasional ──────────────────────────────────
function BiayaForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [name, setName]     = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCat]  = useState('lainnya')
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name || !amount) return toast.error('Nama dan jumlah wajib diisi')
    setSaving(true)
    try {
      const data: WarehouseExpense = {
        id: generateId(), name, amount: Number(amount),
        expense_date: date, category,
        notes: notes || undefined, created_by: userId, created_at: now(),
      }
      await db.warehouse_expenses.add(data)
      await supabase.from('warehouse_expenses').insert(data)
      toast.success('Biaya dicatat')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const cats = [
    { v: 'listrik', l: '💡 Listrik' },
    { v: 'sewa',    l: '🏠 Sewa' },
    { v: 'gaji',    l: '👤 Gaji' },
    { v: 'transport', l: '🚗 Transport' },
    { v: 'lainnya', l: '📌 Lainnya' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Catat Biaya</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Keterangan</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Bayar listrik bulan Mei" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Jumlah (Rp)</label>
              <input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Tanggal</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Kategori</label>
            <div className="flex flex-wrap gap-2">
              {cats.map(c => (
                <button key={c.v} onClick={() => setCat(c.v)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    category === c.v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600'
                  }`}>{c.l}</button>
              ))}
            </div>
          </div>
          <input className="input text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Catatan (opsional)" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}
