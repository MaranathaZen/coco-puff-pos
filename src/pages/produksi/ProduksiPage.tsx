// src/pages/produksi/ProduksiPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah, formatDate } from '@/lib/utils'
import { Plus, RefreshCw, FlaskConical, Package, ArrowRightLeft, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import type {
  ProductionRecipe, ProductionRecipeItem, Material,
  ProductionLog, ProductionMutation, ProductionMutationItem
} from '@/lib/db'

type Tab = 'stok' | 'produksi' | 'mutasi' | 'resep'

export default function ProduksiPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('stok')
  const [isSyncing, setIsSyncing] = useState(false)

  async function syncData() {
    setIsSyncing(true)
    try {
      const { data: mats } = await supabase.from('materials').select('*').eq('is_active', true)
      if (mats?.length) await db.materials.bulkPut(mats)
      const { data: ps } = await supabase.from('production_stock').select('*')
      if (ps?.length) await db.production_stock.bulkPut(ps)
      const { data: fgs } = await supabase.from('finished_goods_stock').select('*')
      if (fgs?.length) await db.finished_goods_stock.bulkPut(fgs)
      const { data: recipes } = await supabase.from('production_recipes').select('*')
      if (recipes?.length) await db.production_recipes.bulkPut(recipes)
      const { data: ritems } = await supabase.from('production_recipe_items').select('*')
      if (ritems?.length) await db.production_recipe_items.bulkPut(ritems)
      const { data: logs } = await supabase.from('production_logs').select('*').order('created_at', { ascending: false }).limit(50)
      if (logs?.length) await db.production_logs.bulkPut(logs)
      const { data: pmuts } = await supabase.from('production_mutations').select('*').order('created_at', { ascending: false }).limit(50)
      if (pmuts?.length) await db.production_mutations.bulkPut(pmuts)
      const { data: parts } = await supabase.from('partners').select('*')
      if (parts?.length) await db.partners.bulkPut(parts)
      const { data: prods } = await supabase.from('products').select('*').eq('is_active', true)
      if (prods?.length) await db.products.bulkPut(prods)
      toast.success('Data produksi diperbarui')
    } catch (e) {
      toast.error('Gagal sync data')
    } finally {
      setIsSyncing(false)
    }
  }

  const tabs = [
    { id: 'stok',     label: 'Stok',     icon: Package },
    { id: 'produksi', label: 'Produksi', icon: FlaskConical },
    { id: 'mutasi',   label: 'Kirim',    icon: ArrowRightLeft },
    { id: 'resep',    label: 'Resep',    icon: RotateCcw },
  ] as const

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Produksi</h2>
        <button onClick={syncData} disabled={isSyncing} className="p-2 rounded-xl text-gray-500 active:bg-gray-100">
          <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
        </button>
      </div>

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

      <div className="flex-1 overflow-auto">
        {tab === 'stok'     && <StokProduksiTab userId={user!.id} />}
        {tab === 'produksi' && <CatatProduksiTab userId={user!.id} />}
        {tab === 'mutasi'   && <MutasiProduksiTab userId={user!.id} />}
        {tab === 'resep'    && <ResepTab userId={user!.id} />}
      </div>
    </div>
  )
}

// ── TAB STOK PRODUKSI ────────────────────────────────────────
function StokProduksiTab({ userId }: { userId: string }) {
  const stocks = useLiveQuery(async () => {
    const ps   = await db.production_stock.toArray()
    const mats = await db.materials.toArray()
    const matMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return ps.map(s => ({ ...s, material: matMap[s.material_id] }))
  }, [])

  const fgStocks = useLiveQuery(async () => {
    return db.finished_goods_stock.toArray()
  }, [])

  return (
    <div className="p-4 space-y-4">
      {/* Stok bahan di produksi */}
      <div>
        <h3 className="font-medium text-gray-700 mb-2">Stok Bahan Baku</h3>
        <div className="space-y-2">
          {stocks?.map(s => (
            <div key={s.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{s.material?.name || '-'}</p>
                <p className="text-xs text-gray-500">{s.material?.category}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg text-gray-800">{s.qty_on_hand}</p>
                <p className="text-xs text-gray-400">{s.material?.unit}</p>
              </div>
            </div>
          ))}
          {stocks?.length === 0 && (
            <div className="text-center text-gray-400 py-6 text-sm">Belum ada stok bahan di produksi</div>
          )}
        </div>
      </div>

      {/* Stok produk jadi */}
      <div>
        <h3 className="font-medium text-gray-700 mb-2">Stok Produk Jadi</h3>
        <div className="space-y-2">
          {fgStocks?.map(s => (
            <div key={s.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{s.product_name}</p>
                <p className="text-xs text-gray-500">Siap kirim</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg text-brand-600">{s.qty_on_hand}</p>
                <p className="text-xs text-gray-400">pcs</p>
              </div>
            </div>
          ))}
          {fgStocks?.length === 0 && (
            <div className="text-center text-gray-400 py-6 text-sm">Belum ada produk jadi</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── TAB CATAT PRODUKSI ───────────────────────────────────────
function CatatProduksiTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const logs = useLiveQuery(async () => {
    const l = await db.production_logs.orderBy('created_at').reverse().limit(30).toArray()
    const recipes = await db.production_recipes.toArray()
    const recipeMap = Object.fromEntries(recipes.map(r => [r.id, r]))
    return l.map(log => ({ ...log, recipe: recipeMap[log.recipe_id] }))
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Catat Produksi
        </button>
      </div>

      <div className="space-y-2">
        {logs?.map(log => (
          <div key={log.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{log.recipe?.name || '-'}</p>
                <p className="text-xs text-gray-500">{formatDate(log.created_at)}</p>
                {log.notes && <p className="text-xs text-gray-400">{log.notes}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-lg text-brand-600">{log.total_yield}</p>
                <p className="text-xs text-gray-400">{log.batch_count} batch</p>
              </div>
            </div>
          </div>
        ))}
        {logs?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">Belum ada catatan produksi</div>
        )}
      </div>

      {showForm && <ProduksiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── TAB MUTASI PRODUKSI (kirim ke toko/mitra) ────────────────
function MutasiProduksiTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)

  const mutations = useLiveQuery(async () => {
    return db.production_mutations.orderBy('created_at').reverse().limit(30).toArray()
  }, [])

  const typeLabel: Record<string, string> = {
    to_store:           '→ Toko',
    to_partner:         '→ Mitra',
    return_from_store:  '← Retur Toko',
    adjustment:         'Koreksi',
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Kirim Produk
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
                m.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>{m.status}</span>
            </div>
            {m.notes && <p className="text-xs text-gray-500 mt-1">{m.notes}</p>}
          </div>
        ))}
        {mutations?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">Belum ada pengiriman</div>
        )}
      </div>

      {showForm && <MutasiProduksiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── TAB RESEP ────────────────────────────────────────────────
function ResepTab({ userId }: { userId: string }) {
  const [showForm, setShowForm] = useState(false)
  const [editRecipe, setEditRecipe] = useState<ProductionRecipe | null>(null)

  const recipes = useLiveQuery(async () => {
    const r = await db.production_recipes.filter(r => r.is_active).toArray()
    const items = await db.production_recipe_items.toArray()
    const mats = await db.materials.toArray()
    const matMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return r.map(recipe => ({
      ...recipe,
      items: items
        .filter(i => i.recipe_id === recipe.id)
        .map(i => ({ ...i, material: matMap[i.material_id] }))
    }))
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditRecipe(null); setShowForm(true) }}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Resep Baru
        </button>
      </div>

      <div className="space-y-3">
        {recipes?.map(recipe => (
          <div key={recipe.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-800">{recipe.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-brand-600 font-medium">
                  {recipe.batch_yield} {recipe.yield_unit}/batch
                </span>
                <button onClick={() => { setEditRecipe(recipe); setShowForm(true) }}
                  className="text-xs text-gray-400">Edit</button>
              </div>
            </div>
            <div className="space-y-1">
              {recipe.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.material?.name || '-'}</span>
                  <span className="text-gray-500">{item.qty_per_batch} {item.material?.unit}/batch</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {recipes?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">Belum ada resep</div>
        )}
      </div>

      {showForm && <ResepForm recipe={editRecipe} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── FORM: Catat Produksi ─────────────────────────────────────
function ProduksiForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const recipes = useLiveQuery(() => db.production_recipes.filter(r => r.is_active).toArray(), [])
  const products = useLiveQuery(() => db.products.filter(p => p.is_active).toArray(), [])

  const [recipeId, setRecipeId]   = useState('')
  const [batchCount, setBatch]    = useState('1')
  const [productId, setProductId] = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)

  const selectedRecipe = recipes?.find(r => r.id === recipeId)
  const totalYield = selectedRecipe ? selectedRecipe.batch_yield * Number(batchCount) : 0

  async function handleSave() {
    if (!recipeId) return toast.error('Pilih resep')
    if (!productId) return toast.error('Pilih produk yang dihasilkan')
    setSaving(true)
    try {
      // Ambil recipe items untuk hitung bahan terpakai
      const recipeItems = await db.production_recipe_items
        .where('recipe_id').equals(recipeId).toArray()

      const logId = generateId()
      const log: ProductionLog = {
        id: logId, recipe_id: recipeId,
        batch_count: Number(batchCount),
        total_yield: totalYield,
        notes: notes || undefined,
        created_by: userId, created_at: now(),
      }
      await db.production_logs.add(log)
      await supabase.from('production_logs').insert(log)

      // Catat pemakaian bahan + kurangi stok produksi
      for (const ri of recipeItems) {
        const qtyUsed = ri.qty_per_batch * Number(batchCount)

        const logMat: any = {
          id: generateId(), log_id: logId,
          material_id: ri.material_id, qty_used: qtyUsed,
        }
        await db.production_log_materials.add(logMat)
        await supabase.from('production_log_materials').insert(logMat)

        // Kurangi stok bahan di produksi
        const ps = await db.production_stock.where('material_id').equals(ri.material_id).first()
        if (ps) {
          const newQty = Math.max(0, ps.qty_on_hand - qtyUsed)
          await db.production_stock.update(ps.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('production_stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', ps.id)
        }
      }

      // Tambah stok produk jadi
      const product = products?.find(p => p.id === productId)
      const fgs = await db.finished_goods_stock.where('product_id').equals(productId).first()
      const fgsData: any = {
        id:           fgs?.id || generateId(),
        product_id:   productId,
        product_name: product?.name || '',
        qty_on_hand:  (fgs?.qty_on_hand || 0) + totalYield,
        last_updated: now(),
      }
      await db.finished_goods_stock.put(fgsData)
      await supabase.from('finished_goods_stock').upsert(fgsData)

      toast.success(`Produksi dicatat: ${totalYield} pcs`)
      onClose()
    } catch (e) {
      toast.error('Gagal menyimpan produksi')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-lg">Catat Produksi</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Resep</label>
            <select className="input" value={recipeId} onChange={e => setRecipeId(e.target.value)}>
              <option value="">-- Pilih Resep --</option>
              {recipes?.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.batch_yield} {r.yield_unit}/batch)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Jumlah Batch</label>
            <input className="input" type="number" min="1" value={batchCount}
              onChange={e => setBatch(e.target.value)} />
          </div>

          {selectedRecipe && (
            <div className="bg-brand-50 rounded-xl p-3">
              <p className="text-sm font-medium text-brand-800">
                Total hasil: <span className="text-lg font-bold">{totalYield}</span> {selectedRecipe.yield_unit}
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Produk yang Dihasilkan</label>
            <select className="input" value={productId} onChange={e => setProductId(e.target.value)}>
              <option value="">-- Pilih Produk --</option>
              {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
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

// ── FORM: Kirim Produk ke Toko/Mitra ────────────────────────
function MutasiProduksiForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const stores   = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])
  const partners = useLiveQuery(() => db.partners.filter(p => p.is_active).toArray(), [])
  const fgStocks = useLiveQuery(() => db.finished_goods_stock.toArray(), [])

  const [type, setType]     = useState<'to_store'|'to_partner'|'return_from_store'|'adjustment'>('to_store')
  const [destId, setDestId] = useState('')
  const [notes, setNotes]   = useState('')
  const [items, setItems]   = useState<{ product_id: string; qty: string }[]>([{ product_id: '', qty: '' }])
  const [saving, setSaving] = useState(false)

  function addItem() { setItems(prev => [...prev, { product_id: '', qty: '' }]) }
  function updateItem(i: number, field: string, value: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  async function handleSave() {
    const validItems = items.filter(i => i.product_id && i.qty && Number(i.qty) > 0)
    if (validItems.length === 0) return toast.error('Tambahkan minimal 1 produk')
    setSaving(true)
    try {
      let destName = ''
      if (type === 'to_store') destName = stores?.find(s => s.id === destId)?.name || ''
      else if (type === 'to_partner') destName = partners?.find(p => p.id === destId)?.name || ''
      else if (type === 'return_from_store') destName = stores?.find(s => s.id === destId)?.name || ''

      const mutId = generateId()
      const mut: ProductionMutation = {
        id: mutId, mutation_type: type,
        destination_id: destId || undefined,
        destination_name: destName || undefined,
        notes: notes || undefined, status: 'confirmed',
        created_by: userId, created_at: now(),
        confirmed_at: now(), confirmed_by: userId,
      }
      await db.production_mutations.add(mut)
      await supabase.from('production_mutations').insert(mut)

      for (const item of validItems) {
        const fg = fgStocks?.find(s => s.product_id === item.product_id)
        const mi: ProductionMutationItem = {
          id: generateId(), mutation_id: mutId,
          product_id: item.product_id,
          product_name: fg?.product_name || item.product_id,
          qty: Number(item.qty),
        }
        await db.production_mutation_items.add(mi)
        await supabase.from('production_mutation_items').insert(mi)

        // Update stok produk jadi
        if (fg) {
          const isReturn = type === 'return_from_store'
          const newQty = isReturn
            ? fg.qty_on_hand + Number(item.qty)
            : Math.max(0, fg.qty_on_hand - Number(item.qty))
          await db.finished_goods_stock.update(fg.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('finished_goods_stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', fg.id)
        }
      }

      toast.success('Pengiriman berhasil dicatat')
      onClose()
    } catch (e) {
      toast.error('Gagal menyimpan')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="font-semibold text-lg">Kirim Produk</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Tujuan</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'to_store',          l: '→ Toko' },
                { v: 'to_partner',        l: '→ Mitra' },
                { v: 'return_from_store', l: '← Retur' },
                { v: 'adjustment',        l: 'Koreksi' },
              ] as const).map(t => (
                <button key={t.v} onClick={() => setType(t.v)}
                  className={`py-2 rounded-xl text-sm font-medium border ${
                    type === t.v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-700'
                  }`}>{t.l}</button>
              ))}
            </div>
          </div>

          {(type === 'to_store' || type === 'return_from_store') && (
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
            <label className="text-sm font-medium text-gray-700 block">Produk</label>
            {items.map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <select className="input text-sm" value={item.product_id}
                  onChange={e => updateItem(i, 'product_id', e.target.value)}>
                  <option value="">-- Pilih Produk --</option>
                  {fgStocks?.map(s => (
                    <option key={s.product_id} value={s.product_id}>
                      {s.product_name} (stok: {s.qty_on_hand})
                    </option>
                  ))}
                </select>
                <input className="input text-sm" type="number" placeholder="Qty"
                  value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                {items.length > 1 && (
                  <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                    className="text-xs text-red-500">Hapus</button>
                )}
              </div>
            ))}
            <button onClick={addItem} className="text-sm text-brand-600 font-medium">+ Tambah Produk</button>
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

// ── FORM: Resep Baru/Edit ────────────────────────────────────
function ResepForm({ recipe, onClose }: { recipe: ProductionRecipe | null; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active && m.category === 'bahan').toArray(), [])

  const [name, setName]           = useState(recipe?.name || '')
  const [batchYield, setBatch]    = useState(String(recipe?.batch_yield || '120'))
  const [yieldUnit, setYieldUnit] = useState(recipe?.yield_unit || 'pcs')
  const [items, setItems]         = useState<{ material_id: string; qty: string }[]>([{ material_id: '', qty: '' }])
  const [saving, setSaving]       = useState(false)

  function addItem() { setItems(prev => [...prev, { material_id: '', qty: '' }]) }
  function updateItem(i: number, field: string, value: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  async function handleSave() {
    if (!name) return toast.error('Nama resep wajib diisi')
    const validItems = items.filter(i => i.material_id && i.qty && Number(i.qty) > 0)
    if (validItems.length === 0) return toast.error('Tambahkan minimal 1 bahan')
    setSaving(true)
    try {
      const isNew = !recipe
      const recipeId = recipe?.id || generateId()
      const data: ProductionRecipe = {
        id: recipeId, name,
        batch_yield: Number(batchYield),
        yield_unit: yieldUnit,
        is_active: true,
        created_at: recipe?.created_at || now(),
      }
      await db.production_recipes.put(data)
      await supabase.from('production_recipes').upsert(data)

      // Hapus items lama kalau edit
      if (!isNew) {
        await db.production_recipe_items.where('recipe_id').equals(recipeId).delete()
        await supabase.from('production_recipe_items').delete().eq('recipe_id', recipeId)
      }

      for (const item of validItems) {
        const ri: ProductionRecipeItem = {
          id: generateId(), recipe_id: recipeId,
          material_id: item.material_id,
          qty_per_batch: Number(item.qty),
        }
        await db.production_recipe_items.add(ri)
        await supabase.from('production_recipe_items').insert(ri)
      }

      toast.success(isNew ? 'Resep ditambahkan' : 'Resep diupdate')
      onClose()
    } catch (e) {
      toast.error('Gagal menyimpan resep')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="font-semibold text-lg">{recipe ? 'Edit Resep' : 'Resep Baru'}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Nama Resep</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Resep Puff Standard" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Hasil/Batch</label>
              <input className="input" type="number" value={batchYield} onChange={e => setBatch(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Satuan</label>
              <input className="input" value={yieldUnit} onChange={e => setYieldUnit(e.target.value)} placeholder="pcs" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Bahan per Batch</label>
            {items.map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <select className="input text-sm" value={item.material_id}
                  onChange={e => updateItem(i, 'material_id', e.target.value)}>
                  <option value="">-- Pilih Bahan --</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <input className="input text-sm" type="number" placeholder="Qty per batch"
                  value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                {items.length > 1 && (
                  <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                    className="text-xs text-red-500">Hapus</button>
                )}
              </div>
            ))}
            <button onClick={addItem} className="text-sm text-brand-600 font-medium">+ Tambah Bahan</button>
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
