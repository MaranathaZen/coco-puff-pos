// src/pages/products/StoreRecipePage.tsx
// Resep penjualan toko — BOM kasir
// Setiap produk menu punya resep: bahan apa yang terpakai saat 1 pcs terjual
import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { Plus, X, ChevronRight, FlaskConical } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StoreRecipe, StoreRecipeItem } from '@/lib/db'

export default function StoreRecipePage() {
  const { user } = useAuthStore()
  const STORE_ID = user?.store_id || ''
  const [showForm, setShowForm] = useState(false)
  const [editRecipe, setEditRecipe] = useState<any | null>(null)

  const recipes = useLiveQuery(async () => {
    const r     = await db.store_recipes.where('store_id').equals(STORE_ID).toArray()
    const items = await db.store_recipe_items.toArray()
    const mats  = await db.materials.toArray()
    const prods = await db.products.toArray()
    const mMap  = Object.fromEntries(mats.map(m => [m.id, m]))
    const pMap  = Object.fromEntries(prods.map(p => [p.id, p]))
    return r.map(recipe => ({
      ...recipe,
      product: pMap[recipe.product_id],
      items: items
        .filter(i => i.recipe_id === recipe.id)
        .map(i => ({ ...i, material: mMap[i.material_id] }))
    }))
  }, [STORE_ID])

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Resep Toko</h1>
          <p className="text-xs text-gray-400 mt-0.5">Bahan yang terpakai saat produk terjual</p>
        </div>
        <button onClick={() => { setEditRecipe(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={13} /> Tambah
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 p-4 space-y-3 mt-3">
        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p className="text-xs text-blue-700 font-medium mb-0.5">Cara kerja</p>
          <p className="text-xs text-blue-600">
            Saat kasir menjual produk, sistem otomatis kurangi stok bahan sesuai resep ini.
            Contoh: Puff Vanilla = 1 Puff kosong + 30g Fla Vanilla
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {recipes?.map((r, idx) => (
            <button key={r.id} onClick={() => { setEditRecipe(r); setShowForm(true) }}
              className={`w-full flex items-center px-4 py-3 text-left active:bg-gray-50 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${!r.is_active ? 'opacity-50' : ''}`}>
              <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0 mr-3">
                <FlaskConical size={14} className="text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.product?.name || r.product_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{r.items.length} bahan · {r.is_active ? 'Aktif' : 'Nonaktif'}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
          {recipes?.length === 0 && (
            <div className="py-12 text-center">
              <FlaskConical size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Belum ada resep toko</p>
              <p className="text-xs text-gray-300 mt-1">Tambah resep untuk tracking stok otomatis</p>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <StoreRecipeForm
          recipe={editRecipe}
          storeId={STORE_ID}
          onClose={() => { setShowForm(false); setEditRecipe(null) }}
        />
      )}
    </div>
  )
}

function StoreRecipeForm({ recipe, storeId, onClose }: {
  recipe: any | null; storeId: string; onClose: () => void
}) {
  const products  = useLiveQuery(() => db.products.filter(p => p.is_active).toArray(), [])
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])

  const [productId, setProductId] = useState(recipe?.product_id || '')
  const [isActive, setIsActive]   = useState(recipe?.is_active ?? true)
  const [items, setItems]         = useState<{ id?: string; material_id: string; qty: string; source: 'store'|'production' }[]>([])
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(!!recipe)

  useEffect(() => {
    if (!recipe) { setItems([{ material_id: '', qty: '', source: 'store' }]); return }
    async function load() {
      const existing = await db.store_recipe_items.where('recipe_id').equals(recipe.id).toArray()
      setItems(existing.length > 0
        ? existing.map(i => ({ id: i.id, material_id: i.material_id, qty: String(i.qty_used), source: i.source || 'store' }))
        : [{ material_id: '', qty: '', source: 'store' }]
      )
      setLoading(false)
    }
    load()
  }, [recipe?.id])

  function addItem() { setItems(p => [...p, { material_id: '', qty: '', source: 'store' }]) }
  function updateItem(i: number, f: string, v: string) {
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [f]: v } : item))
  }

  async function handleSave() {
    if (!productId) return toast.error('Pilih produk')
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 bahan')

    // Cek duplikat produk (kecuali diri sendiri)
    if (!recipe) {
      const existing = await db.store_recipes
        .where('[store_id+product_id]').equals([storeId, productId]).first()
      if (existing) return toast.error('Resep untuk produk ini sudah ada')
    }

    setSaving(true)
    try {
      const prod = products?.find(p => p.id === productId)
      const recipeId = recipe?.id || generateId()
      const data: StoreRecipe = {
        id: recipeId, store_id: storeId,
        product_id: productId,
        product_name: prod?.name || '',
        is_active: isActive,
        created_at: recipe?.created_at || now(),
        updated_at: now(),
      }
      await db.store_recipes.put(data)
      await addToSyncQueue('store_recipes', recipeId, 'upsert' as any, data, storeId)

      // Hapus items lama (queue delete per id supaya bersih offline), insert baru
      const oldItems = await db.store_recipe_items.where('recipe_id').equals(recipeId).toArray()
      await db.store_recipe_items.where('recipe_id').equals(recipeId).delete()
      for (const oi of oldItems) await addToSyncQueue('store_recipe_items', oi.id, 'delete' as any, { id: oi.id }, storeId)

      for (const item of valid) {
        const ri: StoreRecipeItem = {
          id: item.id || generateId(),
          recipe_id: recipeId,
          material_id: item.material_id,
          qty_used: Number(item.qty),
          source: item.source,
        }
        await db.store_recipe_items.add(ri)
        await addToSyncQueue('store_recipe_items', ri.id, 'upsert' as any, ri, storeId)
      }

      toast.success(recipe ? 'Resep diperbarui' : 'Resep ditambahkan')
      onClose()
    } catch (e) { toast.error('Gagal menyimpan'); console.error(e) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!recipe || !confirm('Hapus resep ini?')) return
    setSaving(true)
    try {
      await db.store_recipe_items.where('recipe_id').equals(recipe.id).delete()
      await db.store_recipes.delete(recipe.id)
      await supabase.from('store_recipe_items').delete().eq('recipe_id', recipe.id)
      await supabase.from('store_recipes').delete().eq('id', recipe.id)
      toast.success('Resep dihapus')
      onClose()
    } catch { toast.error('Gagal menghapus') }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 text-sm text-gray-400">Memuat...</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{recipe ? 'Edit Resep Toko' : 'Resep Toko Baru'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4 space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Produk Menu <span className="text-red-400">*</span>
            </label>
            <select className="input" value={productId} onChange={e => setProductId(e.target.value)} disabled={!!recipe}>
              <option value="">Pilih produk</option>
              {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {recipe && <p className="text-xs text-gray-400 mt-1">Produk tidak bisa diubah setelah disimpan</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Bahan per 1 pcs Terjual <span className="text-red-400">*</span>
            </label>
            <div className="space-y-2">
              {items.map((item, i) => {
                const mat = materials?.find(m => m.id === item.material_id)
                return (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <select className="input text-sm" value={item.material_id}
                      onChange={e => updateItem(i, 'material_id', e.target.value)}>
                      <option value="" disabled>-- Pilih bahan *</option>
                      {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input text-sm" type="number" step="0.1"
                        placeholder={`Qty (${mat?.unit || 'unit'})/pcs`}
                        value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                      <select className="input text-sm" value={item.source}
                        onChange={e => updateItem(i, 'source', e.target.value)}>
                        <option value="store">Stok Toko</option>
                        <option value="production">Stok Produksi</option>
                      </select>
                    </div>
                    {items.length > 1 && (
                      <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                        className="text-xs text-red-400">Hapus</button>
                    )}
                  </div>
                )
              })}
            </div>
            <button onClick={addItem} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Bahan</button>
          </div>

          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-800">Resep Aktif</p>
              <p className="text-xs text-gray-400">Nonaktif = stok tidak berkurang saat terjual</p>
            </div>
            <button onClick={() => setIsActive(!isActive)}
              className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex gap-3 pt-1 border-t border-gray-100">
            {recipe && (
              <button onClick={handleDelete} disabled={saving}
                className="px-4 py-3 rounded-xl border border-red-200 text-sm font-medium text-red-500 disabled:opacity-50">
                Hapus
              </button>
            )}
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
