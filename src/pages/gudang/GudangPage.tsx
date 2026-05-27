// src/pages/gudang/GudangPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah, formatDate } from '@/lib/utils'
import { Plus, RefreshCw, X, ChevronRight, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Material, WarehouseStock, Purchase, WarehouseMutation, WarehouseMutationItem, WarehouseExpense } from '@/lib/db'

type Tab = 'stok' | 'pembelian' | 'mutasi' | 'biaya'

const SATUAN = ['kg','gram','liter','ml','butir','pcs','dus','pack']

const KATEGORI = [
  { value: 'bahan_baku',          label: 'Bahan Baku',          desc: 'Tepung, gula, telur, dll' },
  { value: 'bahan_setengah_jadi', label: 'Setengah Jadi',       desc: 'Premix, adonan siap pakai' },
  { value: 'packaging',           label: 'Packaging',            desc: 'Dus, plastik, kresek, dll' },
  { value: 'non_produksi',        label: 'Non Produksi / ATK',   desc: 'Alat tulis, kebersihan' },
  { value: 'operasional',         label: 'Operasional',          desc: 'Bahan bakar, gas, dll' },
]

export default function GudangPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('stok')
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const pulls = await Promise.all([
        supabase.from('materials').select('*'),
        supabase.from('suppliers').select('*'),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('purchase_items').select('*'),
        supabase.from('warehouse_mutations').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('warehouse_mutation_items').select('*'),
        supabase.from('partners').select('*'),
        supabase.from('warehouse_expenses').select('*').order('expense_date', { ascending: false }).limit(100),
      ])
      const tables = ['materials','suppliers','warehouse_stock','purchases','purchase_items','warehouse_mutations','warehouse_mutation_items','partners','warehouse_expenses']
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
    { id: 'biaya',     label: 'Biaya' },
  ]

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-0 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Gudang</h1>
        <button onClick={syncData} disabled={syncing}
          className="p-2 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-3 flex gap-0 border-b border-gray-100">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`pb-2.5 mr-5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-gray-50">
        {tab === 'stok'      && <StokTab userId={user!.id} />}
        {tab === 'pembelian' && <PembelianTab userId={user!.id} />}
        {tab === 'mutasi'    && <MutasiTab userId={user!.id} />}
        {tab === 'biaya'     && <BiayaTab userId={user!.id} />}
      </div>
    </div>
  )
}

// ── STOK ─────────────────────────────────────────────────────
function StokTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)
  const [editMat, setEditMat]   = useState<Material | null>(null)
  const [filter, setFilter]     = useState('semua')

  const items = useLiveQuery(async () => {
    const mats   = await db.materials.toArray()
    const stocks = await db.warehouse_stock.toArray()
    const map    = Object.fromEntries(stocks.map(s => [s.material_id, s]))
    return mats
      .filter(m => filter === 'semua' || m.category === filter)
      .map(m => ({ ...m, qty: map[m.id]?.qty_on_hand ?? 0 }))
  }, [filter])

  const lowStock = items?.filter(i => i.qty <= i.min_stock && i.is_active) || []

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

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ value: 'semua', label: 'Semua' }, ...KATEGORI.map(k => ({ value: k.value, label: k.label }))].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
              filter === f.value
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-500 border border-gray-200'
            }`}>{f.label}</button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {items?.map((item, idx) => (
          <button key={item.id} onClick={() => { setEditMat(item); setShowForm(true) }}
            className={`w-full flex items-center px-4 py-3 text-left transition-colors active:bg-gray-50 ${
              idx !== 0 ? 'border-t border-gray-50' : ''
            } ${!item.is_active ? 'opacity-40' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{KATEGORI.find(k => k.value === item.category)?.label} · {formatRupiah(item.unit_cost)}/{item.unit}</p>
            </div>
            <div className="text-right mr-3">
              <p className={`text-sm font-semibold ${item.qty <= item.min_stock ? 'text-red-500' : 'text-gray-900'}`}>
                {item.qty} <span className="font-normal text-gray-400">{item.unit}</span>
              </p>
            </div>
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
          </button>
        ))}
        {items?.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">Belum ada data bahan</div>
        )}
      </div>

      <button onClick={() => { setEditMat(null); setShowForm(true) }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 font-medium transition-colors active:bg-gray-50">
        <Plus size={15} /> Tambah Bahan
      </button>

      {showForm && <MaterialForm material={editMat} onClose={() => { setShowForm(false); setEditMat(null) }} />}
    </div>
  )
}

// ── PEMBELIAN ─────────────────────────────────────────────────
function PembelianTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const purchases = useLiveQuery(async () => {
    const p    = await db.purchases.orderBy('created_at').reverse().limit(50).toArray()
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

  return (
    <div className="p-4 space-y-3">
      <button onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium">
        <Plus size={15} /> Pembelian Baru
      </button>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {purchases?.map((p, idx) => (
          <div key={p.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <p className="text-sm font-medium text-gray-900">{p.supplier?.name || 'Tanpa Supplier'}</p>
                <p className="text-xs text-gray-400">{formatDate(p.created_at)}{p.invoice_no ? ` · ${p.invoice_no}` : ''}</p>
              </div>
              <p className="text-sm font-semibold text-gray-900">{formatRupiah(p.total_amount)}</p>
            </div>
            {p.items.length > 0 && (
              <div className="mt-2 space-y-0.5">
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
        {purchases?.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">Belum ada pembelian</div>
        )}
      </div>

      {showForm && <PembelianForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── MUTASI ────────────────────────────────────────────────────
function MutasiTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const mutations = useLiveQuery(async () => {
    const m    = await db.warehouse_mutations.orderBy('created_at').reverse().limit(50).toArray()
    const its  = await db.warehouse_mutation_items.toArray()
    const mats = await db.materials.toArray()
    const mm   = Object.fromEntries(mats.map(m => [m.id, m]))
    return m.map(x => ({
      ...x,
      items: its.filter(i => i.mutation_id === x.id).map(i => ({ ...i, material: mm[i.material_id] }))
    }))
  }, [])

  const typeConfig: Record<string, { label: string; color: string }> = {
    to_production: { label: 'ke Produksi',  color: 'text-blue-600 bg-blue-50' },
    to_store:      { label: 'ke Toko',      color: 'text-green-600 bg-green-50' },
    to_partner:    { label: 'ke Mitra',     color: 'text-purple-600 bg-purple-50' },
    adjustment:    { label: 'Koreksi',      color: 'text-gray-600 bg-gray-100' },
  }

  return (
    <div className="p-4 space-y-3">
      <button onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium">
        <Plus size={15} /> Mutasi Baru
      </button>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {mutations?.map((m, idx) => {
          const tc = typeConfig[m.mutation_type] || { label: m.mutation_type, color: 'text-gray-600 bg-gray-100' }
          return (
            <div key={m.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tc.color}`}>{tc.label}</span>
                  {m.destination_name && <span className="text-xs text-gray-500">{m.destination_name}</span>}
                </div>
                <p className="text-xs text-gray-400">{formatDate(m.created_at)}</p>
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
        {mutations?.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">Belum ada mutasi</div>
        )}
      </div>

      {showForm && <MutasiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── BIAYA ─────────────────────────────────────────────────────
function BiayaTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const expenses = useLiveQuery(() =>
    db.warehouse_expenses.orderBy('expense_date').reverse().limit(50).toArray(), [])

  const now2 = new Date()
  const totalBulanIni = expenses?.filter(e => {
    const d = new Date(e.expense_date)
    return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
  }).reduce((s, e) => s + e.amount, 0) || 0

  const catLabel: Record<string, string> = {
    listrik: 'Listrik', sewa: 'Sewa', gaji: 'Gaji',
    transport: 'Transport', lainnya: 'Lainnya',
  }

  return (
    <div className="p-4 space-y-3">
      {/* Summary card */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">Total Biaya Bulan Ini</p>
        <p className="text-2xl font-semibold text-gray-900">{formatRupiah(totalBulanIni)}</p>
      </div>

      <button onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium">
        <Plus size={15} /> Catat Biaya
      </button>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {expenses?.map((e, idx) => (
          <div key={e.id} className={`px-4 py-3 flex items-center justify-between ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div>
              <p className="text-sm font-medium text-gray-900">{e.name}</p>
              <p className="text-xs text-gray-400">{catLabel[e.category] || e.category} · {e.expense_date}</p>
            </div>
            <p className="text-sm font-semibold text-gray-900">{formatRupiah(e.amount)}</p>
          </div>
        ))}
        {expenses?.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">Belum ada catatan biaya</div>
        )}
      </div>

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
          <button onClick={onClose} className="p-1 text-gray-400 rounded-full hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4 space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{children}</label>
}

// ── FORM: Bahan ───────────────────────────────────────────────
function MaterialForm({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const [name, setName]       = useState(material?.name || '')
  const [category, setCat]    = useState(material?.category || 'bahan_baku')
  const [unit, setUnit]       = useState(material?.unit || '')
  const [unitCost, setCost]   = useState(String(material?.unit_cost || ''))
  const [minStock, setMin]    = useState(String(material?.min_stock || '0'))
  const [isActive, setActive] = useState(material?.is_active ?? true)
  const [customUnit, setCustom] = useState(!SATUAN.includes(material?.unit || ''))
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim() || !unit) return toast.error('Nama dan satuan wajib diisi')
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
      toast.success(material ? 'Bahan diperbarui' : 'Bahan ditambahkan')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={material ? 'Edit Bahan' : 'Tambah Bahan'} onClose={onClose}>
      <div>
        <Label>Nama Bahan</Label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Tepung Terigu" autoFocus />
      </div>

      <div>
        <Label>Kategori</Label>
        <div className="space-y-1.5">
          {KATEGORI.map(k => (
            <button key={k.value} onClick={() => setCat(k.value)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                category === k.value ? 'border-gray-900 bg-gray-50' : 'border-gray-100 bg-white'
              }`}>
              <div>
                <p className="text-sm font-medium text-gray-800">{k.label}</p>
                <p className="text-xs text-gray-400">{k.desc}</p>
              </div>
              {category === k.value && (
                <div className="w-4 h-4 rounded-full bg-gray-900 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Satuan</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SATUAN.map(s => (
            <button key={s} onClick={() => { setUnit(s); setCustom(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                unit === s && !customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 bg-white'
              }`}>{s}</button>
          ))}
          <button onClick={() => setCustom(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              customUnit ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 bg-white'
            }`}>Lainnya</button>
        </div>
        {customUnit && (
          <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ketik satuan..." autoFocus />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Harga Default / Satuan</Label>
          <input className="input" type="number" value={unitCost} onChange={e => setCost(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label>Min. Stok (alert)</Label>
          <input className="input" type="number" value={minStock} onChange={e => setMin(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="flex items-center justify-between py-3 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-800">Aktif</p>
          <p className="text-xs text-gray-400">Nonaktif tidak muncul di daftar</p>
        </div>
        <button onClick={() => setActive(!isActive)}
          className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-5.5' : 'left-0.5'}`} />
        </button>
      </div>

      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
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
        invoice_no: invoiceNo || undefined, total_amount: total,
        status: 'received', notes: notes || undefined,
        created_by: userId, created_at: now(),
      }
      await db.purchases.add(purch)
      await supabase.from('purchases').insert(purch)

      for (const item of valid) {
        const pi = {
          id: generateId(), purchase_id: purchId, material_id: item.material_id,
          qty: Number(item.qty), unit_cost: Number(item.unit_cost),
          subtotal: Number(item.qty) * Number(item.unit_cost), qty_returned: 0,
        }
        await db.purchase_items.add(pi)
        await supabase.from('purchase_items').insert(pi)

        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        const wsd: WarehouseStock = {
          id: ws?.id || generateId(), material_id: item.material_id,
          qty_on_hand: (ws?.qty_on_hand || 0) + Number(item.qty), last_updated: now(),
        }
        await db.warehouse_stock.put(wsd)
        await supabase.from('warehouse_stock').upsert(wsd)

        if (Number(item.unit_cost) > 0) {
          await db.materials.update(item.material_id, { unit_cost: Number(item.unit_cost), updated_at: now() })
          await supabase.from('materials').update({ unit_cost: Number(item.unit_cost) }).eq('id', item.material_id)
        }
      }
      toast.success('Pembelian dicatat')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Pembelian Baru" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Supplier</Label>
          <select className="input" value={supplierId} onChange={e => setSupp(e.target.value)}>
            <option value="">Tanpa Supplier</option>
            {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <Label>No. Invoice</Label>
          <input className="input" value={invoiceNo} onChange={e => setInv(e.target.value)} placeholder="INV-001" />
        </div>
      </div>

      <div>
        <Label>Item Pembelian</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id}
                  onChange={e => {
                    const m = materials?.find(m => m.id === e.target.value)
                    updateItem(i, 'material_id', e.target.value)
                    if (m?.unit_cost) updateItem(i, 'unit_cost', String(m.unit_cost))
                  }}>
                  <option value="">Pilih bahan</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || ''})`}
                    value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  <input className="input text-sm" type="number" placeholder="Harga/unit"
                    value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} />
                </div>
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-xs text-red-400">Hapus item</button>
                )}
              </div>
            )
          })}
        </div>
        <button onClick={addItem} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>

      <div>
        <Label>Catatan</Label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
      </div>

      <div className="flex items-center justify-between py-3 border-t border-gray-100">
        <span className="text-sm font-medium text-gray-700">Total</span>
        <span className="text-base font-semibold text-gray-900">{formatRupiah(total)}</span>
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
  function updateItem(i: number, f: string, v: string) {
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [f]: v } : item))
  }

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      const destName = type === 'to_production' ? 'Produksi' :
        type === 'to_store' ? stores?.find(s => s.id === destId)?.name || '' :
        type === 'to_partner' ? partners?.find(p => p.id === destId)?.name || '' : ''

      const mutId = generateId()
      const mut: WarehouseMutation = {
        id: mutId, mutation_type: type,
        destination_id: destId || undefined, destination_name: destName || undefined,
        notes: notes || undefined, status: 'confirmed',
        created_by: userId, created_at: now(),
        confirmed_at: now(), confirmed_by: userId,
      }
      await db.warehouse_mutations.add(mut)
      await supabase.from('warehouse_mutations').insert(mut)

      for (const item of valid) {
        const mat = materials?.find(m => m.id === item.material_id)
        const mi: WarehouseMutationItem = {
          id: generateId(), mutation_id: mutId, material_id: item.material_id,
          qty: Number(item.qty), unit_cost: mat?.unit_cost || 0,
        }
        await db.warehouse_mutation_items.add(mi)
        await supabase.from('warehouse_mutation_items').insert(mi)

        const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        if (ws) {
          const newQty = Math.max(0, ws.qty_on_hand - Number(item.qty))
          await db.warehouse_stock.update(ws.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('warehouse_stock').update({ qty_on_hand: newQty }).eq('id', ws.id)
        }

        if (type === 'to_production') {
          const ps = await db.production_stock.where('material_id').equals(item.material_id).first()
          const psd: any = {
            id: ps?.id || generateId(), material_id: item.material_id,
            qty_on_hand: (ps?.qty_on_hand || 0) + Number(item.qty), last_updated: now(),
          }
          await db.production_stock.put(psd)
          await supabase.from('production_stock').upsert(psd)
        }
      }
      toast.success('Mutasi dicatat')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Mutasi Gudang" onClose={onClose}>
      <div>
        <Label>Tujuan</Label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { v: 'to_production', l: 'ke Produksi' },
            { v: 'to_store',      l: 'ke Toko' },
            { v: 'to_partner',    l: 'ke Mitra' },
            { v: 'adjustment',    l: 'Koreksi' },
          ] as const).map(t => (
            <button key={t.v} onClick={() => setType(t.v)}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                type === t.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'
              }`}>{t.l}</button>
          ))}
        </div>
      </div>

      {type === 'to_store' && (
        <div>
          <Label>Toko Tujuan</Label>
          <select className="input" value={destId} onChange={e => setDest(e.target.value)}>
            <option value="">Pilih toko</option>
            {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {type === 'to_partner' && (
        <div>
          <Label>Mitra Tujuan</Label>
          <select className="input" value={destId} onChange={e => setDest(e.target.value)}>
            <option value="">Pilih mitra</option>
            {partners?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <Label>Item</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id}
                  onChange={e => updateItem(i, 'material_id', e.target.value)}>
                  <option value="">Pilih bahan</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit || ''})`}
                  value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                {items.length > 1 && (
                  <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                    className="text-xs text-red-400">Hapus item</button>
                )}
              </div>
            )
          })}
        </div>
        <button onClick={addItem} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>

      <div>
        <Label>Catatan</Label>
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
    { v: 'listrik', l: 'Listrik' }, { v: 'sewa', l: 'Sewa' },
    { v: 'gaji', l: 'Gaji' }, { v: 'transport', l: 'Transport' },
    { v: 'lainnya', l: 'Lainnya' },
  ]

  return (
    <Modal title="Catat Biaya" onClose={onClose}>
      <div>
        <Label>Keterangan</Label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Bayar listrik bulan Mei" autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Jumlah (Rp)</Label>
          <input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label>Tanggal</Label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Kategori</Label>
        <div className="flex flex-wrap gap-2">
          {cats.map(c => (
            <button key={c.v} onClick={() => setCat(c.v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                category === c.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'
              }`}>{c.l}</button>
          ))}
        </div>
      </div>

      <div>
        <Label>Catatan</Label>
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
