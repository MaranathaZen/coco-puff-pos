// src/pages/resep/ResepPage.tsx
// Halaman Resep terpusat — Resep Produksi + Resep Toko
import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, X, ChevronRight, FlaskConical, Store } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'produksi' | 'toko'

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

export default function ResepPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('produksi')

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-4 pt-4 pb-0 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900 mb-3">Resep</h1>
        <div className="flex gap-4 border-b border-gray-100">
          {([
            { id: 'produksi', label: 'Resep Produksi', icon: FlaskConical },
            { id: 'toko',     label: 'Resep Toko',     icon: Store },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'
              }`}>
              <t.icon size={15} />{t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'produksi' && <ResepProduksiTab />}
        {tab === 'toko'     && <ResepTokoTab storeId={user?.store_id || ''} />}
      </div>
    </div>
  )
}

// ── RESEP PRODUKSI ─────────────────────────────────────────────
function ResepProduksiTab() {
  const { user } = useAuthStore()
  const isOwnerManager = ['owner','manager'].includes(user?.role || '')
  const [showForm, setShowForm] = useState(false)
  const [editRecipe, setEditRecipe] = useState<any>(null)

  const recipes = useLiveQuery(async () => {
    const r     = await db.production_recipes.filter(r => r.is_active).toArray()
    const items = await db.production_recipe_items.toArray()
    const mats  = await db.materials.toArray()
    const mMap  = Object.fromEntries(mats.map(m => [m.id, m]))
    return r.map(recipe => {
      const rItems = items.filter(i => i.recipe_id === recipe.id).map(i => ({ ...i, material: mMap[i.material_id] }))
      const hppEst = rItems.reduce((s, i) => s + i.qty_per_batch * (i.material?.unit_cost || 0), 0)
      const hppPerUnit = recipe.batch_yield > 0 ? hppEst / recipe.batch_yield : 0
      return { ...recipe, items: rItems, hppEst, hppPerUnit }
    })
  }, [])

  return (
    <div className="p-4 space-y-3">
      {isOwnerManager && (
        <div className="flex justify-end">
          <button onClick={() => { setEditRecipe(null); setShowForm(true) }}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-3 py-2 rounded-lg">
            <Plus size={13} /> Resep Baru
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {recipes?.map((recipe, idx) => (
          <button key={recipe.id} onClick={() => isOwnerManager && (setEditRecipe(recipe), setShowForm(true))}
            className={`w-full text-left px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} active:bg-gray-50`}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{recipe.name}</p>
                {(recipe as any).product_name && (recipe as any).product_name !== recipe.name && (
                  <p className="text-xs text-blue-600 mt-0.5">→ {(recipe as any).product_name}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {recipe.batch_yield} {recipe.yield_unit}/batch · {recipe.items.length} bahan
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                {recipe.hppPerUnit > 0 && (
                  <p className="text-xs font-medium text-gray-700">HPP {formatRupiah(recipe.hppPerUnit)}/pcs</p>
                )}
                <p className="text-xs text-gray-400">est. {formatRupiah(recipe.hppEst)}/batch</p>
              </div>
            </div>
            {recipe.items.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {recipe.items.map(i => (
                  <div key={i.id} className="flex justify-between text-xs text-gray-400">
                    <span>{i.material?.name || '-'}</span>
                    <span>{i.qty_per_batch} {i.material?.unit}/batch</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        ))}
        {recipes?.length === 0 && (
          <div className="py-12 text-center">
            <FlaskConical size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Belum ada resep produksi</p>
          </div>
        )}
      </div>

      {showForm && isOwnerManager && (
        <ResepProduksiForm
          recipe={editRecipe}
          onClose={() => { setShowForm(false); setEditRecipe(null) }}
        />
      )}
    </div>
  )
}

function ResepProduksiForm({ recipe, onClose }: { recipe: any; onClose: () => void }) {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])

  const [name, setName]             = useState(recipe?.name || '')
  const [productName, setProductName] = useState(recipe?.product_name || '')
  const [batchYield, setBatch]      = useState(String(recipe?.batch_yield || 120))
  const [yieldUnit, setYieldUnit]   = useState(recipe?.yield_unit || 'pcs')
  const [items, setItems]           = useState<{ id?:string; material_id:string; qty:string }[]>([{ material_id:'', qty:'' }])
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (!recipe) return
    async function load() {
      const existing = await db.production_recipe_items.where('recipe_id').equals(recipe.id).toArray()
      if (existing.length) setItems(existing.map(i => ({ id: i.id, material_id: i.material_id, qty: String(i.qty_per_batch) })))
    }
    load()
  }, [recipe?.id])

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama resep wajib')
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 bahan')
    setSaving(true)
    try {
      const recipeId = recipe?.id || generateId()
      const data: any = {
        id: recipeId, name: name.trim(),
        product_name: productName.trim() || name.trim(),
        batch_yield: Number(batchYield), yield_unit: yieldUnit,
        is_active: true, created_at: recipe?.created_at || now(),
      }
      await db.production_recipes.put(data)
      await supabase.from('production_recipes').upsert(data)
      await db.production_recipe_items.where('recipe_id').equals(recipeId).delete()
      await supabase.from('production_recipe_items').delete().eq('recipe_id', recipeId)
      for (const item of valid) {
        const ri: any = { id: item.id || generateId(), recipe_id: recipeId, material_id: item.material_id, qty_per_batch: Number(item.qty) }
        await db.production_recipe_items.add(ri)
        await supabase.from('production_recipe_items').insert(ri)
      }
      toast.success(recipe ? 'Resep diupdate' : 'Resep ditambahkan')
      onClose()
    } catch (e) { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!recipe || !isOwner || !confirm(`Hapus resep "${recipe.name}"?`)) return
    setSaving(true)
    try {
      await db.production_recipe_items.where('recipe_id').equals(recipe.id).delete()
      await db.production_recipes.update(recipe.id, { is_active: false })
      await supabase.from('production_recipe_items').delete().eq('recipe_id', recipe.id)
      await supabase.from('production_recipes').update({ is_active: false }).eq('id', recipe.id)
      toast.success('Resep dihapus')
      onClose()
    } catch { toast.error('Gagal menghapus') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={recipe ? 'Edit Resep Produksi' : 'Resep Produksi Baru'} onClose={onClose}>
      <div><Label required>Nama Resep</Label>
        <input className="input" value={name}
          onChange={e => { setName(e.target.value); if (!productName) setProductName(e.target.value) }}
          placeholder="Resep Puff Standard" autoFocus />
      </div>
      <div><Label required>Nama Produk yang Dihasilkan</Label>
        <input className="input" value={productName} onChange={e => setProductName(e.target.value)}
          placeholder="Puff, Fla Vanilla, dll" />
        <p className="text-xs text-gray-400 mt-1">Otomatis terisi saat catat produksi</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>Hasil/Batch</Label>
          <input className="input" type="number" value={batchYield} onChange={e => setBatch(e.target.value)} />
        </div>
        <div><Label required>Satuan</Label>
          <input className="input" value={yieldUnit} onChange={e => setYieldUnit(e.target.value)} placeholder="pcs" />
        </div>
      </div>
      <div>
        <Label required>Bahan per Batch</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <select className="input text-sm" value={item.material_id}
                  onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x, material_id: e.target.value} : x))}>
                  <option value="" disabled>-- Pilih bahan *</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <input className="input text-sm" type="number" step="0.01"
                  placeholder={`Qty per batch (${mat?.unit || ''})`}
                  value={item.qty}
                  onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x, qty: e.target.value} : x))} />
                {mat && item.qty && Number(item.qty) > 0 && (
                  <p className="text-xs text-gray-400">
                    {formatRupiah(Number(item.qty) * (mat.unit_cost || 0))}/batch
                  </p>
                )}
                {items.length > 1 && (
                  <button onClick={() => setItems(p => p.filter((_,idx) => idx !== i))} className="text-xs text-red-400">Hapus</button>
                )}
              </div>
            )
          })}
        </div>
        <button onClick={() => setItems(p => [...p, { material_id:'', qty:'' }])} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Bahan</button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        {recipe && isOwner && (
          <button onClick={handleDelete} disabled={saving} className="px-4 py-3 rounded-xl border border-red-200 text-sm font-medium text-red-500">Hapus</button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}

// ── RESEP TOKO (BOM Kasir) ─────────────────────────────────────
function ResepTokoTab({ storeId }: { storeId: string }) {
  const { user } = useAuthStore()
  const isOwnerManager = ['owner','manager'].includes(user?.role || '')
  const [showForm, setShowForm] = useState(false)
  const [editRecipe, setEditRecipe] = useState<any>(null)

  const recipes = useLiveQuery(async () => {
    const r     = await db.store_recipes.where('store_id').equals(storeId).toArray()
    const items = await db.store_recipe_items.toArray()
    const mats  = await db.materials.toArray()
    const prods = await db.products.toArray()
    const mMap  = Object.fromEntries(mats.map(m => [m.id, m]))
    const pMap  = Object.fromEntries(prods.map(p => [p.id, p]))
    return r.map(recipe => ({
      ...recipe,
      product: pMap[recipe.product_id],
      items: items.filter(i => i.recipe_id === recipe.id).map(i => ({ ...i, material: mMap[i.material_id] }))
    }))
  }, [storeId])

  return (
    <div className="p-4 space-y-3">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-medium mb-0.5">Resep Toko (BOM Kasir)</p>
        <p className="text-xs text-blue-600">Bahan yang otomatis berkurang saat produk terjual di kasir.</p>
      </div>

      {isOwnerManager && (
        <div className="flex justify-end">
          <button onClick={() => { setEditRecipe(null); setShowForm(true) }}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-3 py-2 rounded-lg">
            <Plus size={13} /> Resep Baru
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {recipes?.map((r, idx) => (
          <button key={r.id} onClick={() => isOwnerManager && (setEditRecipe(r), setShowForm(true))}
            className={`w-full text-left px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} active:bg-gray-50`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{r.product?.name || r.product_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{r.items.length} bahan · {r.is_active ? 'Aktif' : 'Nonaktif'}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
            {r.items.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {r.items.map(i => (
                  <div key={i.id} className="flex justify-between text-xs text-gray-400">
                    <span>{i.material?.name}</span>
                    <span>{i.qty_used} {i.material?.unit} · {i.source === 'production' ? 'stok produksi' : 'stok gudang'}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        ))}
        {recipes?.length === 0 && (
          <div className="py-12 text-center">
            <Store size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Belum ada resep toko</p>
          </div>
        )}
      </div>

      {showForm && isOwnerManager && (
        <ResepTokoForm
          recipe={editRecipe}
          storeId={storeId}
          onClose={() => { setShowForm(false); setEditRecipe(null) }}
        />
      )}
    </div>
  )
}

function ResepTokoForm({ recipe, storeId, onClose }: { recipe: any; storeId: string; onClose: () => void }) {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const products  = useLiveQuery(() => db.products.filter(p => p.is_active).toArray(), [])
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])

  const [productId, setProductId] = useState(recipe?.product_id || '')
  const [isActive, setIsActive]   = useState(recipe?.is_active ?? true)
  const [items, setItems]         = useState<{ id?:string; material_id:string; qty:string; source:'warehouse'|'production' }[]>([{ material_id:'', qty:'', source:'warehouse' }])
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(!!recipe)

  useEffect(() => {
    if (!recipe) return
    async function load() {
      const existing = await db.store_recipe_items.where('recipe_id').equals(recipe.id).toArray()
      if (existing.length) setItems(existing.map(i => ({ id: i.id, material_id: i.material_id, qty: String(i.qty_used), source: (i.source as any) || 'warehouse' })))
      setLoading(false)
    }
    load()
  }, [recipe?.id])

  async function handleSave() {
    if (!productId) return toast.error('Pilih produk')
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 bahan')
    setSaving(true)
    try {
      const prod = products?.find(p => p.id === productId)
      const recipeId = recipe?.id || generateId()
      const data: any = { id: recipeId, store_id: storeId, product_id: productId, product_name: prod?.name || '', is_active: isActive, created_at: recipe?.created_at || now(), updated_at: now() }
      await db.store_recipes.put(data)
      await supabase.from('store_recipes').upsert(data)
      await db.store_recipe_items.where('recipe_id').equals(recipeId).delete()
      await supabase.from('store_recipe_items').delete().eq('recipe_id', recipeId)
      for (const item of valid) {
        const ri: any = { id: item.id || generateId(), recipe_id: recipeId, material_id: item.material_id, qty_used: Number(item.qty), source: item.source }
        await db.store_recipe_items.add(ri)
        await supabase.from('store_recipe_items').insert(ri)
      }
      toast.success(recipe ? 'Resep diupdate' : 'Resep ditambahkan')
      onClose()
    } catch (e) { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 text-sm text-gray-400">Memuat...</div>
    </div>
  )

  return (
    <Modal title={recipe ? 'Edit Resep Toko' : 'Resep Toko Baru'} onClose={onClose}>
      <div><Label required>Produk Menu</Label>
        <select className="input" value={productId} onChange={e => setProductId(e.target.value)} disabled={!!recipe}>
          <option value="">Pilih produk</option>
          {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <Label required>Bahan per 1 pcs Terjual</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <select className="input text-sm" value={item.material_id}
                  onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x, material_id: e.target.value} : x))}>
                  <option value="" disabled>-- Pilih bahan *</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" type="number" step="0.01"
                    placeholder={`Qty (${mat?.unit || ''})/pcs`}
                    value={item.qty}
                    onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x, qty: e.target.value} : x))} />
                  <select className="input text-sm" value={item.source}
                    onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x, source: e.target.value as any} : x))}>
                    <option value="warehouse">Stok Gudang</option>
                    <option value="production">Stok Produksi</option>
                  </select>
                </div>
                {items.length > 1 && <button onClick={() => setItems(p => p.filter((_,idx) => idx !== i))} className="text-xs text-red-400">Hapus</button>}
              </div>
            )
          })}
        </div>
        <button onClick={() => setItems(p => [...p, { material_id:'', qty:'', source:'warehouse' }])} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Bahan</button>
      </div>
      <div className="flex items-center justify-between py-2">
        <p className="text-sm text-gray-700">Resep Aktif</p>
        <button onClick={() => setIsActive(!isActive)}
          className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}
