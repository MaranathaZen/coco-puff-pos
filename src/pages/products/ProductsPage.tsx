// src/pages/produk/ProductsPage.tsx (atau ProdukPage.tsx)
// CHANGELOG v2:
// - FIX #5: tambah supabase direct upsert agar produk langsung sync ke cloud
// - FIX #5: hapus referensi packaging yang menyebabkan blank screen

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, Search, Edit2, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Product } from '@/types'

export default function ProductsPage() {
  const { user } = useAuthStore()
  const STORE_ID = user?.store_id || ''

  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEdit]  = useState<Product | null>(null)

  const products = useLiveQuery(async () => {
    const all  = await db.products.toArray()
    const cats = await db.categories.toArray()
    const catMap = Object.fromEntries(cats.map(c => [c.id, c]))
    return all
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      .map(p => ({ ...p, category: p.category_id ? catMap[p.category_id] : undefined }))
  }, [search])

  async function toggleActive(product: Product) {
    const updated = { ...product, is_active: !product.is_active, updated_at: now() }
    await db.products.put(updated)
    // FIX: strip join fields before upsert
    const { category: _cat, ...toUpsert } = updated as any
    await supabase.from('products').upsert(toUpsert)
    toast.success(updated.is_active ? 'Produk diaktifkan' : 'Produk dinonaktifkan')
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Cari produk..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => { setEdit(null); setShowForm(true) }}
          className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus size={16} /> Tambah
        </button>
      </div>

      <div className="space-y-2">
        {products?.map(prod => (
          <div key={prod.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
              🧁
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{prod.name}</p>
              <p className="text-sm text-gray-500">
                {(prod as any).category?.name} · {formatRupiah(prod.base_price)}/{prod.unit}
              </p>
              {prod.auto_package && (
                <p className="text-xs text-brand-600">
                  {prod.pkg_qty} {prod.unit} = 1 {prod.pkg_unit}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => { setEdit(prod); setShowForm(true) }}
                className="p-2 text-gray-500 active:bg-gray-100 rounded-xl">
                <Edit2 size={16} />
              </button>
              <button onClick={() => toggleActive(prod)} className="p-2 rounded-xl">
                {prod.is_active
                  ? <ToggleRight size={22} className="text-brand-600" />
                  : <ToggleLeft size={22} className="text-gray-400" />
                }
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <ProductForm storeId={STORE_ID} product={editProduct} onClose={() => { setShowForm(false); setEdit(null) }} />
      )}
    </div>
  )
}

function ProductForm({ product, onClose, storeId }: {
  product: Product | null
  onClose: () => void
  storeId: string
}) {
  const categories = useLiveQuery(() => db.categories.orderBy('sort_order').toArray(), [])

  const [name,       setName]    = useState(product?.name || '')
  const [categoryId, setCatId]   = useState(product?.category_id || '')
  const [basePrice,  setPrice]   = useState(String(product?.base_price || ''))
  const [unit,       setUnit]    = useState(product?.unit || 'pcs')
  const [pkgQty,     setPkgQty]  = useState(String(product?.pkg_qty || '1'))
  const [pkgUnit,    setPkgUnit] = useState(product?.pkg_unit || 'dus')
  const [autoPkg,    setAutoPkg] = useState(product?.auto_package || false)
  const [saving,     setSaving]  = useState(false)

  async function handleSave() {
    if (!name.trim() || !basePrice) return toast.error('Nama dan harga wajib diisi')
    setSaving(true)
    try {
      const isNew = !product
      // FIX: jangan sertakan field yang tidak ada di schema Supabase
      const data: Product = {
        id:           product?.id || generateId(),
        category_id:  categoryId || undefined,
        name:         name.trim(),
        base_price:   Number(basePrice),
        unit,
        pkg_qty:      Number(pkgQty),
        pkg_unit:     pkgUnit,
        auto_package: autoPkg,
        is_active:    product?.is_active ?? true,
        created_at:   product?.created_at || now(),
        updated_at:   now(),
      }
      await db.products.put(data)
      // FIX: langsung upsert ke Supabase, jangan hanya sync_queue
      const { error } = await supabase.from('products').upsert(data)
      if (error) {
        console.error('[PRODUK SAVE]', error)
        // Fallback ke sync queue
        await addToSyncQueue('products', data.id, isNew ? 'insert' : 'update', data, storeId)
        toast.success(isNew ? 'Produk ditambahkan (pending sync)' : 'Produk diupdate (pending sync)')
      } else {
        toast.success(isNew ? 'Produk ditambahkan' : 'Produk diupdate')
      }
      onClose()
    } catch (e) {
      console.error('[PRODUK]', e)
      toast.error('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="font-semibold text-lg">{product ? 'Edit Produk' : 'Tambah Produk'}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Nama Produk</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Puff Original" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Kategori</label>
            <select className="input" value={categoryId} onChange={e => setCatId(e.target.value)}>
              <option value="">-- Pilih Kategori --</option>
              {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Harga (Rp)</label>
              <input className="input" type="number" value={basePrice}
                onChange={e => setPrice(e.target.value)} placeholder="14000" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Satuan</label>
              <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="pcs" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="autoPkg" checked={autoPkg}
              onChange={e => setAutoPkg(e.target.checked)} className="w-4 h-4 accent-brand-600" />
            <label htmlFor="autoPkg" className="text-sm text-gray-700">Packaging otomatis</label>
          </div>
          {autoPkg && (
            <div className="grid grid-cols-2 gap-3 bg-brand-50 p-3 rounded-xl">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Qty per dus</label>
                <input className="input" type="number" value={pkgQty} onChange={e => setPkgQty(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Nama dus</label>
                <input className="input" value={pkgUnit} onChange={e => setPkgUnit(e.target.value)} placeholder="dus" />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}
