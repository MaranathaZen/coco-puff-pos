// src/pages/gudang/GudangPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah, formatDate } from '@/lib/utils'
import { Plus, Package, ShoppingCart, ArrowRightLeft, RotateCcw, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Material, Supplier, WarehouseStock, Purchase, PurchaseItem, WarehouseMutation, WarehouseMutationItem } from '@/lib/db'

type Tab = 'stok' | 'pembelian' | 'mutasi' | 'retur'

export default function GudangPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('stok')
  const [isSyncing, setIsSyncing] = useState(false)

  async function syncData() {
    setIsSyncing(true)
    try {
      const { data: mats } = await supabase.from('materials').select('*').eq('is_active', true)
      if (mats?.length) await db.materials.bulkPut(mats)
      const { data: sups } = await supabase.from('suppliers').select('*')
      if (sups?.length) await db.suppliers.bulkPut(sups)
      const { data: wstock } = await supabase.from('warehouse_stock').select('*')
      if (wstock?.length) await db.warehouse_stock.bulkPut(wstock)
      const { data: purch } = await supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(50)
      if (purch?.length) await db.purchases.bulkPut(purch)
      const { data: pitems } = await supabase.from('purchase_items').select('*')
      if (pitems?.length) await db.purchase_items.bulkPut(pitems)
      const { data: wmuts } = await supabase.from('warehouse_mutations').select('*').order('created_at', { ascending: false }).limit(50)
      if (wmuts?.length) await db.warehouse_mutations.bulkPut(wmuts)
      const { data: wmitems } = await supabase.from('warehouse_mutation_items').select('*')
      if (wmitems?.length) await db.warehouse_mutation_items.bulkPut(wmitems)
      const { data: parts } = await supabase.from('partners').select('*')
      if (parts?.length) await db.partners.bulkPut(parts)
      toast.success('Data gudang diperbarui')
    } catch (e) {
      toast.error('Gagal sync data')
    } finally {
      setIsSyncing(false)
    }
  }

  const tabs = [
    { id: 'stok',      label: 'Stok',      icon: Package },
    { id: 'pembelian', label: 'Beli',       icon: ShoppingCart },
    { id: 'mutasi',    label: 'Mutasi',     icon: ArrowRightLeft },
    { id: 'retur',     label: 'Retur',      icon: RotateCcw },
  ] as const

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Gudang</h2>
        <button onClick={syncData} disabled={isSyncing}
          className="p-2 rounded-xl text-gray-500 active:bg-gray-100">
          <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tab */}
      <div className="bg-white border-b border-gray-100 flex">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium transition-colors border-b-2 ${
              tab === t.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400'
            }`}>
            <t.icon size={18} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'stok'      && <StokTab userId={user!.id} />}
        {tab === 'pembelian' && <PembelianTab userId={user!.id} />}
        {tab === 'mutasi'    && <MutasiTab userId={user!.id} />}
        {tab === 'retur'     && <ReturTab userId={user!.id} />}
      </div>
    </div>
  )
}

// ── TAB STOK ────────────────────────────────────────────────
function StokTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)
  const [editMat, setEditMat]   = useState<Material | null>(null)
  const [filter, setFilter]     = useState<'semua' | 'bahan' | 'packaging'>('semua')

  const stocks = useLiveQuery(async () => {
    const mats = await db.materials.filter(m => m.is_active).toArray()
    const wstocks = await db.warehouse_stock.toArray()
    const stockMap = Object.fromEntries(wstocks.map(s => [s.material_id, s]))
    return mats
      .filter(m => filter === 'semua' || m.category === filter)
      .map(m => ({ ...m, stock: stockMap[m.id] || null }))
  }, [filter])

  const lowStock = stocks?.filter(s => (s.stock?.qty_on_hand || 0) <= s.min_stock) || []

  return (
    <div className="p-4 space-y-4">
      {/* Alert stok rendah */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
          <p className="text-sm font-medium text-red-700">⚠️ Stok Rendah ({lowStock.length} item)</p>
          <p className="text-xs text-red-500 mt-0.5">{lowStock.map(s => s.name).join(', ')}</p>
        </div>
      )}

      {/* Filter + tambah */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1 bg-gray-100 p-1 rounded-xl">
          {(['semua','bahan','packaging'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === f ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'
              }`}>{f}</button>
          ))}
        </div>
        <button onClick={() => { setEditMat(null); setShowForm(true) }}
          className="btn-primary px-3 py-2 flex items-center gap-1 text-sm">
          <Plus size={14} /> Bahan
        </button>
      </div>

      {/* List stok */}
      <div className="space-y-2">
        {stocks?.map(item => {
          const qty = item.stock?.qty_on_hand || 0
          const isLow = qty <= item.min_stock
          return (
            <div key={item.id} className="card flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                item.category === 'bahan' ? 'bg-orange-50' : 'bg-blue-50'
              }`}>
                {item.category === 'bahan' ? '🌾' : '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{item.name}</p>
                <p className="text-xs text-gray-500">{formatRupiah(item.unit_cost)}/{item.unit}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-bold text-lg ${isLow ? 'text-red-500' : 'text-gray-800'}`}>
                  {qty}
                </p>
                <p className="text-xs text-gray-400">{item.unit}</p>
              </div>
              <button onClick={() => { setEditMat(item); setShowForm(true) }}
                className="text-xs text-brand-600 font-medium px-2">Edit</button>
            </div>
          )
        })}
      </div>

      {showForm && <MaterialForm material={editMat} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── TAB PEMBELIAN ────────────────────────────────────────────
function PembelianTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const purchases = useLiveQuery(async () => {
    const purch = await db.purchases.orderBy('created_at').reverse().limit(30).toArray()
    const sups  = await db.suppliers.toArray()
    const supMap = Object.fromEntries(sups.map(s => [s.id, s]))
    return purch.map(p => ({ ...p, supplier: p.supplier_id ? supMap[p.supplier_id] : null }))
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Pembelian Baru
        </button>
      </div>

      <div className="space-y-2">
        {purchases?.map(p => (
          <div key={p.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">
                  {p.supplier?.name || 'Tanpa Supplier'}
                </p>
                <p className="text-xs text-gray-500">{formatDate(p.created_at)}</p>
                {p.invoice_no && <p className="text-xs text-gray-400">No: {p.invoice_no}</p>}
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-800">{formatRupiah(p.total_amount)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>{p.status}</span>
              </div>
            </div>
          </div>
        ))}
        {purchases?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">Belum ada pembelian</div>
        )}
      </div>

      {showForm && <PembelianForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── TAB MUTASI ───────────────────────────────────────────────
function MutasiTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const mutations = useLiveQuery(async () => {
    return db.warehouse_mutations.orderBy('created_at').reverse().limit(30).toArray()
  }, [])

  const typeLabel: Record<string, string> = {
    to_production: '→ Produksi',
    to_store:      '→ Toko',
    to_partner:    '→ Mitra',
    adjustment:    'Koreksi',
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Mutasi Baru
        </button>
      </div>

      <div className="space-y-2">
        {mutations?.map(m => (
          <div key={m.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{typeLabel[m.mutation_type] || m.mutation_type}</p>
                {m.destination_name && <p className="text-xs text-gray-500">ke: {m.destination_name}</p>}
                <p className="text-xs text-gray-400">{formatDate(m.created_at)}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                m.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                m.status === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>{m.status}</span>
            </div>
            {m.notes && <p className="text-xs text-gray-500 mt-1">{m.notes}</p>}
          </div>
        ))}
        {mutations?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">Belum ada mutasi</div>
        )}
      </div>

      {showForm && <MutasiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── TAB RETUR ────────────────────────────────────────────────
function ReturTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const returns = useLiveQuery(async () => {
    const rets  = await db.purchase_returns.orderBy('created_at').reverse().limit(30).toArray()
    const mats  = await db.materials.toArray()
    const matMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return rets.map(r => ({ ...r, material: matMap[r.material_id] }))
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Retur Baru
        </button>
      </div>

      <div className="space-y-2">
        {returns?.map(r => (
          <div key={r.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{r.material?.name || '-'}</p>
                <p className="text-xs text-gray-500">{formatDate(r.created_at)}</p>
                {r.reason && <p className="text-xs text-gray-400">{r.reason}</p>}
              </div>
              <p className="font-semibold text-red-600">-{r.qty} {r.material?.unit}</p>
            </div>
          </div>
        ))}
        {returns?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">Belum ada retur</div>
        )}
      </div>

      {showForm && <ReturForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── FORM: Tambah/Edit Bahan ──────────────────────────────────
function MaterialForm({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const [name, setName]         = useState(material?.name || '')
  const [category, setCategory] = useState<'bahan'|'packaging'|'lainnya'>(material?.category || 'bahan')
  const [unit, setUnit]         = useState(material?.unit || '')
  const [unitCost, setUnitCost] = useState(String(material?.unit_cost || ''))
  const [minStock, setMinStock] = useState(String(material?.min_stock || '0'))
  const [saving, setSaving]     = useState(false)

  async function handleSave() {
    if (!name || !unit) return toast.error('Nama dan satuan wajib diisi')
    setSaving(true)
    try {
      const isNew = !material
      const data: any = {
        id:         material?.id || generateId(),
        name, category, unit,
        unit_cost:  Number(unitCost),
        min_stock:  Number(minStock),
        is_active:  true,
        created_at: material?.created_at || now(),
        updated_at: now(),
      }
      await db.materials.put(data)
      const { error } = await supabase.from('materials').upsert(data)
      if (error) throw error
      toast.success(isNew ? 'Bahan ditambahkan' : 'Bahan diupdate')
      onClose()
    } catch (e) {
      toast.error('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-lg">{material ? 'Edit Bahan' : 'Tambah Bahan'}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Nama Bahan</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Tepung Terigu" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Kategori</label>
            <div className="grid grid-cols-3 gap-2">
              {(['bahan','packaging','lainnya'] as const).map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`py-2 rounded-xl text-sm font-medium border capitalize ${
                    category === c ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-700'
                  }`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Satuan</label>
              <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="kg / pcs / liter" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Harga/Satuan</label>
              <input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Stok Minimum (alert)</label>
            <input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} placeholder="0" />
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

// ── FORM: Pembelian Baru ─────────────────────────────────────
function PembelianForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const suppliers = useLiveQuery(() => db.suppliers.filter(s => s.is_active).toArray(), [])

  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo]   = useState('')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState<{ material_id: string; qty: string; unit_cost: string }[]>([
    { material_id: '', qty: '', unit_cost: '' }
  ])
  const [saving, setSaving] = useState(false)

  function addItem() {
    setItems(prev => [...prev, { material_id: '', qty: '', unit_cost: '' }])
  }

  function updateItem(i: number, field: string, value: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const totalAmount = items.reduce((s, i) => s + (Number(i.qty) * Number(i.unit_cost)), 0)

  async function handleSave() {
    const validItems = items.filter(i => i.material_id && i.qty && Number(i.qty) > 0)
    if (validItems.length === 0) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      const purchId = generateId()
      const purch: Purchase = {
        id: purchId, supplier_id: supplierId || undefined,
        invoice_no: invoiceNo || undefined,
        total_amount: totalAmount, status: 'received',
        notes: notes || undefined, created_by: userId, created_at: now(),
      }

      // Simpan purchase
      await db.purchases.add(purch)
      await supabase.from('purchases').insert(purch)

      // Simpan items + update stok
      for (const item of validItems) {
        const mat = materials?.find(m => m.id === item.material_id)
        const pi: PurchaseItem = {
          id: generateId(), purchase_id: purchId,
          material_id: item.material_id,
          qty: Number(item.qty), unit_cost: Number(item.unit_cost),
          subtotal: Number(item.qty) * Number(item.unit_cost),
          qty_returned: 0,
        }
        await db.purchase_items.add(pi)
        await supabase.from('purchase_items').insert(pi)

        // Update warehouse stock
        const existing = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        const stockData: WarehouseStock = {
          id:           existing?.id || generateId(),
          material_id:  item.material_id,
          qty_on_hand:  (existing?.qty_on_hand || 0) + Number(item.qty),
          last_updated: now(),
        }
        await db.warehouse_stock.put(stockData)
        await supabase.from('warehouse_stock').upsert(stockData)

        // Update unit cost di material
        if (mat && Number(item.unit_cost) > 0) {
          await db.materials.update(item.material_id, { unit_cost: Number(item.unit_cost), updated_at: now() })
          await supabase.from('materials').update({ unit_cost: Number(item.unit_cost) }).eq('id', item.material_id)
        }
      }

      toast.success('Pembelian berhasil dicatat')
      onClose()
    } catch (e) {
      toast.error('Gagal menyimpan pembelian')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="font-semibold text-lg">Pembelian Baru</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Supplier</label>
            <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">-- Pilih Supplier --</option>
              {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">No. Invoice</label>
            <input className="input" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="INV-001" />
          </div>

          {/* Item list */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Item Pembelian</label>
            {items.map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <select className="input text-sm" value={item.material_id}
                  onChange={e => {
                    const mat = materials?.find(m => m.id === e.target.value)
                    updateItem(i, 'material_id', e.target.value)
                    if (mat) updateItem(i, 'unit_cost', String(mat.unit_cost))
                  }}>
                  <option value="">-- Pilih Bahan --</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" type="number" placeholder="Qty"
                    value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  <input className="input text-sm" type="number" placeholder="Harga/unit"
                    value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} />
                </div>
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-xs text-red-500">Hapus item</button>
                )}
              </div>
            ))}
            <button onClick={addItem} className="text-sm text-brand-600 font-medium">+ Tambah Item</button>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Catatan</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
          </div>

          <div className="bg-brand-50 rounded-xl p-3 flex justify-between">
            <span className="font-medium text-gray-700">Total</span>
            <span className="font-bold text-brand-700">{formatRupiah(totalAmount)}</span>
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

// ── FORM: Mutasi Gudang ──────────────────────────────────────
function MutasiForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const partners  = useLiveQuery(() => db.partners.filter(p => p.is_active).toArray(), [])
  const stores    = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])

  const [type, setType]     = useState<'to_production'|'to_store'|'to_partner'|'adjustment'>('to_production')
  const [destId, setDestId] = useState('')
  const [notes, setNotes]   = useState('')
  const [items, setItems]   = useState<{ material_id: string; qty: string }[]>([{ material_id: '', qty: '' }])
  const [saving, setSaving] = useState(false)

  function addItem() { setItems(prev => [...prev, { material_id: '', qty: '' }]) }
  function updateItem(i: number, field: string, value: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  async function handleSave() {
    const validItems = items.filter(i => i.material_id && i.qty && Number(i.qty) > 0)
    if (validItems.length === 0) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      // Cari nama destinasi
      let destName = ''
      if (type === 'to_production') destName = 'Produksi'
      else if (type === 'to_store') destName = stores?.find(s => s.id === destId)?.name || ''
      else if (type === 'to_partner') destName = partners?.find(p => p.id === destId)?.name || ''

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

      for (const item of validItems) {
        const mat = materials?.find(m => m.id === item.material_id)
        const mi: WarehouseMutationItem = {
          id: generateId(), mutation_id: mutId,
          material_id: item.material_id,
          qty: Number(item.qty), unit_cost: mat?.unit_cost || 0,
        }
        await db.warehouse_mutation_items.add(mi)
        await supabase.from('warehouse_mutation_items').insert(mi)

        // Kurangi stok gudang
        const existing = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        if (existing) {
          const newQty = Math.max(0, existing.qty_on_hand - Number(item.qty))
          await db.warehouse_stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('warehouse_stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', existing.id)
        }

        // Kalau ke produksi, tambah stok produksi
        if (type === 'to_production') {
          const ps = await db.production_stock.where('material_id').equals(item.material_id).first()
          const psData: any = {
            id:           ps?.id || generateId(),
            material_id:  item.material_id,
            qty_on_hand:  (ps?.qty_on_hand || 0) + Number(item.qty),
            last_updated: now(),
          }
          await db.production_stock.put(psData)
          await supabase.from('production_stock').upsert(psData)
        }
      }

      toast.success('Mutasi berhasil dicatat')
      onClose()
    } catch (e) {
      toast.error('Gagal menyimpan mutasi')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="font-semibold text-lg">Mutasi Gudang</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Tujuan</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'to_production', l: '→ Produksi' },
                { v: 'to_store',      l: '→ Toko' },
                { v: 'to_partner',    l: '→ Mitra' },
                { v: 'adjustment',    l: 'Koreksi' },
              ] as const).map(t => (
                <button key={t.v} onClick={() => setType(t.v)}
                  className={`py-2 rounded-xl text-sm font-medium border ${
                    type === t.v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-700'
                  }`}>{t.l}</button>
              ))}
            </div>
          </div>

          {type === 'to_store' && (
            <select className="input" value={destId} onChange={e => setDestId(e.target.value)}>
              <option value="">-- Pilih Toko --</option>
              {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {type === 'to_partner' && (
            <select className="input" value={destId} onChange={e => setDestId(e.target.value)}>
              <option value="">-- Pilih Mitra --</option>
              {partners?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Item</label>
            {items.map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <select className="input text-sm" value={item.material_id}
                  onChange={e => updateItem(i, 'material_id', e.target.value)}>
                  <option value="">-- Pilih Bahan --</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <input className="input text-sm" type="number" placeholder="Qty"
                  value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
              </div>
            ))}
            <button onClick={addItem} className="text-sm text-brand-600 font-medium">+ Tambah Item</button>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Catatan</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
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

// ── FORM: Retur ──────────────────────────────────────────────
function ReturForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const [materialId, setMaterialId] = useState('')
  const [qty, setQty]               = useState('')
  const [reason, setReason]         = useState('')
  const [saving, setSaving]         = useState(false)

  async function handleSave() {
    if (!materialId || !qty) return toast.error('Pilih bahan dan masukkan qty')
    setSaving(true)
    try {
      const ret: any = {
        id: generateId(), material_id: materialId,
        qty: Number(qty), reason: reason || undefined,
        created_by: userId, created_at: now(),
      }
      await db.purchase_returns.add(ret)
      await supabase.from('purchase_returns').insert(ret)

      // Kurangi stok gudang
      const existing = await db.warehouse_stock.where('material_id').equals(materialId).first()
      if (existing) {
        const newQty = Math.max(0, existing.qty_on_hand - Number(qty))
        await db.warehouse_stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
        await supabase.from('warehouse_stock').update({ qty_on_hand: newQty }).eq('id', existing.id)
      }

      toast.success('Retur berhasil dicatat')
      onClose()
    } catch (e) {
      toast.error('Gagal menyimpan retur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-lg">Retur ke Supplier</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Bahan</label>
            <select className="input" value={materialId} onChange={e => setMaterialId(e.target.value)}>
              <option value="">-- Pilih Bahan --</option>
              {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Qty Retur</label>
            <input className="input" type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Alasan</label>
            <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Rusak / kadaluarsa / dll" />
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
