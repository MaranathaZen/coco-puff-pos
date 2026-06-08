// src/pages/settings/SettingsProductPage.tsx
// CHANGELOG v2:
// - ProdukForm: tambah input harga Dine In / Take Away / Online per toko
// - PaketTab: filter hapus Gudang Malang dan Produksi Malang
// - store_product_prices: simpan 3 harga per toko

import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, X, Trash2, ChevronRight, RefreshCw, Package } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'produk' | 'kategori' | 'paket' | 'toko'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[90vh] flex flex-col">
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

export default function SettingsProductPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('produk')
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const [prodRes, catRes, pakRes, priceRes] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('packages').select('*').order('created_at'),
        supabase.from('store_product_prices').select('*'),
      ])
      if (prodRes.data !== null)  { await db.products.clear();             if (prodRes.data.length)  await db.products.bulkPut(prodRes.data)             }
      if (catRes.data !== null)   { await db.categories.clear();           if (catRes.data.length)   await db.categories.bulkPut(catRes.data)            }
      if (priceRes.data !== null) { await db.store_product_prices.clear(); if (priceRes.data.length) await db.store_product_prices.bulkPut(priceRes.data) }
      if (pakRes.data !== null)   { try { await (db as any).packages?.clear(); if (pakRes.data.length) await (db as any).packages?.bulkPut(pakRes.data) } catch {} }
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-0 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Produk & Kategori</h1>
        <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400 rounded-full">
          <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>
      <div className="px-4 mt-3 flex gap-0 border-b border-gray-100 overflow-x-auto scrollbar-hide">
        {(['produk','kategori','paket','toko'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2.5 mr-6 text-sm font-medium border-b-2 capitalize whitespace-nowrap transition-colors ${tab===t?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
            {t === 'paket' ? 'Paket / Bundle' : t === 'toko' ? 'Produk per Toko' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto bg-gray-50">
        {tab === 'produk'   && <ProdukTab storeId={user?.store_id || ''} />}
        {tab === 'kategori' && <KategoriTab />}
        {tab === 'paket'    && <PaketTab storeId={user?.store_id || ''} />}
        {tab === 'toko'     && <ProdukTokoTab />}
      </div>
    </div>
  )
}

// ── PRODUK TAB ────────────────────────────────────────────────
function ProdukTab({ storeId }: { storeId: string }) {
  const [showForm,  setShowForm]  = useState(false)
  const [editItem,  setEditItem]  = useState<any>(null)
  const [search,    setSearch]    = useState('')
  const [filterCat, setFilterCat] = useState('semua')

  const products   = useLiveQuery(() => db.products.toArray(), [])
  const categories = useLiveQuery(() => db.categories.orderBy('sort_order').toArray(), [])
  const catMap     = Object.fromEntries((categories||[]).map(c => [c.id, c.name]))

  const filtered = useMemo(() => {
    if (!products) return []
    return products
      .filter(p => filterCat === 'semua' || p.category_id === filterCat)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, filterCat, search])

  async function handleDelete(p: any) {
    if (!confirm(`Hapus produk "${p.name}"?`)) return
    try {
      await supabase.from('products').delete().eq('id', p.id)
      await db.products.delete(p.id)
      toast.success('Produk dihapus')
    } catch { toast.error('Gagal hapus') }
  }

  async function toggleActive(p: any) {
    const newActive = !p.is_active
    await db.products.update(p.id, { is_active: newActive, updated_at: now() })
    await supabase.from('products').update({ is_active: newActive }).eq('id', p.id)
    toast.success(newActive ? 'Produk diaktifkan' : 'Produk dinonaktifkan')
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{filtered.length} produk</p>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tambah Produk
        </button>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari nama produk..." />
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        <button onClick={() => setFilterCat('semua')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterCat==='semua'?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
          Semua
        </button>
        {categories?.map(c => (
          <button key={c.id} onClick={() => setFilterCat(c.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterCat===c.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filtered.map((p, idx) => (
          <div key={p.id} className={`flex items-center px-4 py-3 ${idx!==0?'border-t border-gray-50':''} ${!p.is_active?'opacity-50':''}`}>
            <button onClick={() => { setEditItem(p); setShowForm(true) }} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
              <p className="text-xs text-gray-400">{catMap[p.category_id]||'Tanpa Kategori'} · {formatRupiah(p.base_price||0)}</p>
            </button>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              <button onClick={() => toggleActive(p)}
                className={`w-9 h-5 rounded-full transition-colors relative ${p.is_active?'bg-gray-900':'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${p.is_active?'left-[18px]':'left-0.5'}`} />
              </button>
              <button onClick={() => { setEditItem(p); setShowForm(true) }} className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
              <button onClick={() => handleDelete(p)} className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="py-12 text-center text-sm text-gray-400">{search?`Tidak ada "${search}"`:'Belum ada produk'}</div>}
      </div>
      {showForm && <ProdukForm product={editItem} categories={categories||[]} onClose={() => { setShowForm(false); setEditItem(null) }} />}
    </div>
  )
}

// ── KATEGORI TAB ──────────────────────────────────────────────
function KategoriTab() {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const categories = useLiveQuery(() => db.categories.orderBy('sort_order').toArray(), [])

  async function handleDelete(c: any) {
    const count = await db.products.where('category_id').equals(c.id).count()
    if (count > 0) return toast.error(`Dipakai ${count} produk, tidak bisa dihapus`)
    if (!confirm(`Hapus kategori "${c.name}"?`)) return
    try { await supabase.from('categories').delete().eq('id', c.id); await db.categories.delete(c.id); toast.success('Dihapus') }
    catch { toast.error('Gagal hapus') }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{categories?.length||0} kategori</p>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tambah Kategori
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {categories?.map((c, idx) => (
          <div key={c.id} className={`flex items-center px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 text-sm font-bold text-gray-500">{c.sort_order||idx+1}</div>
            <button onClick={() => { setEditItem(c); setShowForm(true) }} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900">{c.name}</p>
              {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
            </button>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => { setEditItem(c); setShowForm(true) }} className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
              <button onClick={() => handleDelete(c)} className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {categories?.length===0 && <div className="py-12 text-center text-sm text-gray-400">Belum ada kategori</div>}
      </div>
      {showForm && <KategoriForm kategori={editItem} currentCount={categories?.length||0} onClose={() => { setShowForm(false); setEditItem(null) }} />}
    </div>
  )
}

// ── PAKET TAB ─────────────────────────────────────────────────
function PaketTab({ storeId }: { storeId: string }) {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [pakets,   setPakets]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  async function loadPakets() {
    setLoading(true)
    try {
      const { data } = await supabase.from('packages').select('*').order('created_at')
      if (data) setPakets(data)
    } catch { try { setPakets(await (db as any).packages?.toArray()??[]) } catch {} }
    setLoading(false)
  }
  useMemo(() => { loadPakets() }, [])

  async function toggleActive(p: any) {
    const updated = { ...p, is_active: !p.is_active }
    setPakets(prev => prev.map(x => x.id===p.id?updated:x))
    await supabase.from('packages').update({ is_active: updated.is_active }).eq('id', p.id)
    try { await (db as any).packages?.put(updated) } catch {}
  }
  async function handleDelete(p: any) {
    if (!confirm(`Hapus paket "${p.name}"?`)) return
    setPakets(prev => prev.filter(x => x.id!==p.id))
    await supabase.from('packages').delete().eq('id', p.id)
    try { await (db as any).packages?.delete(p.id) } catch {}
    toast.success('Paket dihapus')
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{pakets.filter(p=>p.is_active).length} aktif · {pakets.length} total</p>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tambah Paket
        </button>
      </div>
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400">Memuat...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {pakets.map((p, idx) => (
            <div key={p.id} className={`flex items-center px-4 py-3 ${idx!==0?'border-t border-gray-50':''} ${!p.is_active?'opacity-50':''}`}>
              <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 mr-3"><Package size={16} className="text-gray-500" /></div>
              <button onClick={() => { setEditItem(p); setShowForm(true) }} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400">{p.qty_total} pcs · {formatRupiah(p.price)}{p.is_mix?' · Mix rasa':''}{p.store_id?'':' · Semua toko'}</p>
              </button>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => toggleActive(p)} className={`w-9 h-5 rounded-full transition-colors relative ${p.is_active?'bg-gray-900':'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${p.is_active?'left-[18px]':'left-0.5'}`} />
                </button>
                <button onClick={() => { setEditItem(p); setShowForm(true) }} className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
                <button onClick={() => handleDelete(p)} className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {pakets.length===0 && <div className="py-12 text-center text-sm text-gray-400">Belum ada paket</div>}
        </div>
      )}
      {showForm && <PaketForm paket={editItem} onClose={()=>{setShowForm(false);setEditItem(null)}} onSaved={()=>{setShowForm(false);setEditItem(null);loadPakets()}} />}
    </div>
  )
}

// ── PRODUK PER TOKO TAB v2 ──────────────────────────────────
function ProdukTokoTab() {
  const products = useLiveQuery(async () => {
    const all = await db.products.filter(p => p.is_active).toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name))
  }, [])
  const stores   = useLiveQuery(() => db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray(), [])
  const prices   = useLiveQuery(() => db.store_product_prices.toArray(), [])
  const [saving, setSaving] = useState(false)
  const [filterStore, setFilterStore] = useState('')

  // Auto-select toko pertama
  useEffect(() => {
    if (stores && stores.length > 0 && !filterStore) setFilterStore(stores[0].id)
  }, [stores])

  // Map: product_id → is_active per store
  const activeMap = useMemo(() => {
    const map: Record<string, Record<string, boolean>> = {}
    for (const p of prices || []) {
      if (!map[p.store_id]) map[p.store_id] = {}
      map[p.store_id][p.product_id] = (p as any).is_active !== false
    }
    return map
  }, [prices])

  async function toggleProduct(storeId: string, productId: string, currentActive: boolean) {
    const newActive = !currentActive
    const existing = (prices || []).find(p => p.store_id === storeId && p.product_id === productId)
    const priceData: any = {
      id:              existing?.id || generateId(),
      store_id:        storeId,
      product_id:      productId,
      override_price:  existing?.override_price || 0,
      price_dine_in:   (existing as any)?.price_dine_in  || 0,
      price_take_away: (existing as any)?.price_take_away || 0,
      price_online:    (existing as any)?.price_online    || 0,
      is_active:       newActive,
      updated_at:      now(),
    }
    await db.store_product_prices.put(priceData)
    const { error } = await supabase.from('store_product_prices').upsert(priceData, { onConflict: 'store_id,product_id' })
    if (error) await supabase.from('store_product_prices').insert(priceData)
  }

  return (
    <div className="p-4 space-y-3">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs font-semibold text-blue-700">Produk per Toko</p>
        <p className="text-xs text-blue-600 mt-0.5">Nonaktif = produk tidak tampil di kasir toko tersebut.</p>
      </div>

      {/* Filter toko */}
      {stores && stores.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {stores.map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Product list dengan toggle */}
      {filterStore && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {(products || []).map((p, idx) => {
            const isActive = activeMap[filterStore]?.[p.id] !== false  // default aktif
            return (
              <div key={p.id} className={`flex items-center px-4 py-3 ${idx!==0?'border-t border-gray-50':''} ${!isActive?'opacity-50':''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{formatRupiah(p.base_price || 0)}</p>
                </div>
                <button onClick={() => toggleProduct(filterStore, p.id, isActive)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${isActive?'bg-gray-900':'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive?'left-[22px]':'left-0.5'}`} />
                </button>
              </div>
            )
          })}
          {(products || []).length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">Belum ada produk</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── FORM PRODUK ───────────────────────────────────────────────
function ProdukForm({ product, categories, onClose }: { product: any; categories: any[]; onClose: () => void }) {
  const [name,       setName]      = useState(product?.name || '')
  const [categoryId, setCatId]     = useState(product?.category_id || '')
  const [price,      setPrice]     = useState(String(product?.base_price || ''))
  const [sku,        setSku]       = useState(product?.sku || '')
  const [unit,       setUnit]      = useState(product?.unit || 'pcs')
  const [isActive,   setIsActive]  = useState(product?.is_active ?? true)
  const [autoPkg,    setAutoPkg]   = useState(product?.auto_package ?? false)
  const [pkgQty,     setPkgQty]    = useState(String(product?.pkg_qty || ''))
  const [pkgUnit,    setPkgUnit]   = useState(product?.pkg_unit || 'dus')
  const [saving,     setSaving]    = useState(false)
  const packaging = useLiveQuery(() => db.materials.filter(m => m.category === 'packaging' && m.is_active).toArray(), [])

  // Harga per toko per tipe order
  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray(), [])
  const [storePrices, setStorePrices] = useState<Record<string, {dine_in: string; take_away: string; online: string}>>({})

  // Load existing prices
  useEffect(() => {
    if (!product) return
    db.store_product_prices.where('product_id').equals(product.id).toArray().then(prices => {
      const map: Record<string, any> = {}
      for (const p of prices) {
        map[p.store_id] = {
          dine_in:   String((p as any).price_dine_in  || ''),
          take_away: String((p as any).price_take_away || ''),
          online:    String((p as any).price_online    || ''),
          is_active: (p as any).is_active !== false,
        }
      }
      setStorePrices(map)
    })
  }, [product])

  function updateStorePrice(storeId: string, field: string, value: string | boolean) {
    setStorePrices(prev => {
      const current = prev[storeId] || { dine_in: '', take_away: '', online: '', is_active: true }
      return {
        ...prev,
        [storeId]: {
          ...current,
          [field]: value,
        }
      }
    })
  }

  async function handleSave() {
    if (!name.trim())                 return toast.error('Nama produk wajib diisi')
    if (!categoryId)                  return toast.error('Pilih kategori')
    if (!price || Number(price) <= 0) return toast.error('Harga wajib diisi')
    setSaving(true)
    try {
      const prodId = product?.id || generateId()
      const data: any = {
        id: prodId, category_id: categoryId, name: name.trim(),
        sku: sku||undefined, base_price: Number(price), unit: unit||'pcs',
        auto_package: autoPkg, pkg_qty: autoPkg?Number(pkgQty):0,
        pkg_unit: autoPkg?(pkgUnit||'dus'):'',
        is_active: isActive, created_at: product?.created_at||now(), updated_at: now(),
      }
      await db.products.put(data)
      const { error } = await supabase.from('products').upsert(data)
      if (error) throw error

      // Simpan harga per toko — simpan semua toko yang sudah di-load (aktif/nonaktif)
      for (const [storeId, prices] of Object.entries(storePrices)) {
        const hasPrice = Number(prices.dine_in)||Number(prices.take_away)||Number(prices.online)
        const hasToggle = prices.is_active === false  // simpan jika di-nonaktifkan
        if (!hasPrice && !hasToggle) continue
        const existing = await db.store_product_prices.filter(p => p.store_id===storeId && p.product_id===prodId).first()
        const priceData: any = {
          id:             existing?.id || generateId(),
          store_id:       storeId,
          product_id:     prodId,
          override_price: Number(prices.take_away) || Number(price),
          price_dine_in:  Number(prices.dine_in)   || 0,
          price_take_away:Number(prices.take_away)  || 0,
          price_online:   Number(prices.online)     || 0,
          is_active:      prices.is_active !== false,  // toggle aktif per toko
          updated_at:     now(),
        }
        await db.store_product_prices.put(priceData)
        // Coba update dulu, jika tidak ada baru insert
        const { error: upsertErr } = await supabase.from('store_product_prices').upsert(priceData, { onConflict: 'store_id,product_id' })
        if (upsertErr) {
          console.error('[PRICE UPSERT ERROR]', upsertErr)
          // Fallback: coba insert saja
          await supabase.from('store_product_prices').insert(priceData).then(r => {
            if (r.error) console.error('[PRICE INSERT ERROR]', r.error)
          })
        }
      }
      toast.success(product?'Produk diupdate':'Produk ditambahkan')
      onClose()
    } catch (e) {
      console.error('[PRODUK SAVE ERROR]', e)
      const msg = (e as any)?.message || String(e)
      toast.error('Gagal menyimpan: ' + msg.slice(0,60))
    }
    finally { setSaving(false) }
  }

  return (
    <Modal title={product?'Edit Produk':'Tambah Produk'} onClose={onClose}>
      <div><Label required>Nama Produk</Label>
        <input className="input" value={name} onChange={e=>setName(e.target.value)} autoFocus placeholder="Puff Vanilla, Es Teh, dll" />
      </div>
      <div><Label required>Kategori</Label>
        <select className="input" value={categoryId} onChange={e=>setCatId(e.target.value)}>
          <option value="">-- Pilih Kategori --</option>
          {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>Harga Default (Rp)</Label>
          <input className="input" inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value.replace(/[^0-9]/g,''))} placeholder="0" />
          <p className="text-[10px] text-gray-400 mt-1">Harga dasar jika tidak ada override</p>
        </div>
        <div><Label required>Satuan</Label>
          <input className="input" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="pcs" />
        </div>
      </div>

      {/* Harga per toko per tipe + toggle aktif */}
      {stores && stores.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700">Harga & Ketersediaan per Toko</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Nonaktif = produk tidak tampil di kasir toko tersebut</p>
          </div>
          {stores.map(s => {
            const sp = storePrices[s.id] || { dine_in: '', take_away: '', online: '', is_active: true }
            const isActive = sp.is_active !== false
            return (
              <div key={s.id} className={`px-4 py-3 border-t border-gray-50 ${!isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-700">{s.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{isActive ? 'Aktif' : 'Nonaktif'}</span>
                    <button onClick={() => updateStorePrice(s.id, 'is_active', !isActive)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                </div>
                {isActive && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">Dine In</p>
                      <input className="input text-sm" type="number" placeholder={price||'0'} value={sp.dine_in}
                        onChange={e=>updateStorePrice(s.id,'dine_in',e.target.value)} />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">Take Away</p>
                      <input className="input text-sm" type="number" placeholder={price||'0'} value={sp.take_away}
                        onChange={e=>updateStorePrice(s.id,'take_away',e.target.value)} />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">Online</p>
                      <input className="input text-sm" type="number" placeholder={price||'0'} value={sp.online}
                        onChange={e=>updateStorePrice(s.id,'online',e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div><Label>SKU / Kode</Label>
        <input className="input" value={sku} onChange={e=>setSku(e.target.value)} placeholder="Opsional" />
      </div>

      {/* Packaging otomatis */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div><p className="text-sm font-medium text-gray-800">Packaging Otomatis</p><p className="text-xs text-gray-400">Hitung dus otomatis saat kasir jual</p></div>
          <button onClick={()=>setAutoPkg(!autoPkg)} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${autoPkg?'bg-gray-900':'bg-gray-200'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${autoPkg?'left-[22px]':'left-0.5'}`} />
          </button>
        </div>
        {autoPkg && (
          <div className="px-4 pb-3 border-t border-gray-50 space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label required>Isi per Kemasan (pcs)</Label><input className="input" type="number" value={pkgQty} onChange={e=>setPkgQty(e.target.value)} placeholder="5" /></div>
              <div>
                  <Label required>Nama Kemasan</Label>
                  <select className="input" value={pkgUnit} onChange={e=>setPkgUnit(e.target.value)}>
                    <option value="">-- Pilih kemasan *</option>
                    {packaging?.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  <p className="text-[10px] text-amber-600 mt-1">⚠ Harus sesuai nama di Stok Toko agar otomatis berkurang</p>
                </div>
            </div>
          </div>
        )}
      </div>

      {product && (
        <div className="flex items-center justify-between py-2 border-t border-gray-100">
          <p className="text-sm text-gray-700">Aktif (tampil di kasir)</p>
          <button onClick={()=>setIsActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive?'bg-gray-900':'bg-gray-200'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive?'left-[22px]':'left-0.5'}`} />
          </button>
        </div>
      )}
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM KATEGORI ─────────────────────────────────────────────
function KategoriForm({ kategori, currentCount, onClose }: { kategori: any; currentCount: number; onClose: () => void }) {
  const [name,      setName]  = useState(kategori?.name||'')
  const [desc,      setDesc]  = useState(kategori?.description||'')
  const [sortOrder, setSort]  = useState(String(kategori?.sort_order??currentCount+1))
  const [saving,    setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama kategori wajib diisi')
    if (!sortOrder.toString().trim()) return toast.error('Urutan tampil wajib diisi')
    // Cek duplikat urutan tampil
    const allCats = await db.categories.toArray()
    const dup = allCats.find(c => Number(c.sort_order) === Number(sortOrder) && c.id !== kategori?.id)
    if (dup) return toast.error(`Urutan ${sortOrder} sudah dipakai oleh "${dup.name}"`)
    setSaving(true)
    try {
      const data: any = { id: kategori?.id||`cat-${name.toLowerCase().replace(/\s+/g,'-')}-${Date.now().toString(36)}`, name: name.trim(), description: desc||undefined, sort_order: Number(sortOrder)||currentCount+1 }
      await db.categories.put(data)
      const { error } = await supabase.from('categories').upsert(data)
      if (error) throw error
      toast.success(kategori?'Kategori diupdate':'Ditambahkan')
      onClose()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={kategori?'Edit Kategori':'Tambah Kategori'} onClose={onClose}>
      <div><Label required>Nama Kategori</Label><input className="input" value={name} onChange={e=>setName(e.target.value)} autoFocus /></div>
      <div><Label>Deskripsi</Label><input className="input" value={desc} onChange={e=>setDesc(e.target.value)} /></div>
      <div><Label required>Urutan Tampil</Label><input className="input" type="number" min="1" value={sortOrder} onChange={e=>setSort(e.target.value)} /></div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── FORM PAKET ────────────────────────────────────────────────
function PaketForm({ paket, onClose, onSaved }: { paket: any; onClose: () => void; onSaved: () => void }) {
  const [name,     setName]    = useState(paket?.name||'')
  const [price,    setPrice]   = useState(String(paket?.price||''))
  const [qtyTotal, setQty]     = useState(String(paket?.qty_total||'5'))
  const [isMix,    setIsMix]   = useState(paket?.is_mix??true)
  const [storeId,  setStoreId] = useState<string>(paket?.store_id||'')
  const [isActive, setIsActive]= useState(paket?.is_active??true)
  const [saving,   setSaving]  = useState(false)

  // Filter: hanya toko real (bukan gudang/produksi)
  const stores = useLiveQuery(() =>
    db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
  , [])

  async function handleSave() {
    if (!name.trim())                 return toast.error('Nama paket wajib diisi')
    if (!price||Number(price)<=0)     return toast.error('Harga wajib diisi')
    if (Number(qtyTotal)<=0)          return toast.error('Jumlah pcs wajib diisi')
    setSaving(true)
    try {
      const data: any = { id: paket?.id||generateId(), name: name.trim(), price: Number(price), qty_total: Number(qtyTotal), is_mix: isMix, store_id: storeId||null, is_active: isActive, created_at: paket?.created_at||now() }
      try { await (db as any).packages?.put(data) } catch {}
      const { error } = await supabase.from('packages').upsert(data)
      if (error) throw error
      toast.success(paket?'Paket diupdate':'Ditambahkan')
      onSaved()
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={paket?'Edit Paket':'Tambah Paket'} onClose={onClose}>
      <div><Label required>Nama Paket</Label><input className="input" value={name} onChange={e=>setName(e.target.value)} autoFocus /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>Harga Paket (Rp)</Label><input className="input" inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value.replace(/[^0-9]/g,''))} /></div>
        <div><Label required>Jumlah (pcs)</Label><input className="input" type="number" min="1" value={qtyTotal} onChange={e=>setQty(e.target.value)} /></div>
      </div>
      {Number(price)>0&&Number(qtyTotal)>0&&(
        <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2.5">
          <p className="text-xs text-green-700">Per pcs: <strong>{formatRupiah(Math.round(Number(price)/Number(qtyTotal)))}</strong></p>
        </div>
      )}
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <div><p className="text-sm font-medium text-gray-800">Mix Rasa</p><p className="text-xs text-gray-400">Kasir bisa pilih beberapa produk</p></div>
        <button onClick={()=>setIsMix(!isMix)} className={`w-11 h-6 rounded-full transition-colors relative ${isMix?'bg-gray-900':'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isMix?'left-[22px]':'left-0.5'}`} />
        </button>
      </div>
      <div><Label>Berlaku untuk Toko</Label>
        <select className="input" value={storeId} onChange={e=>setStoreId(e.target.value)}>
          <option value="">Semua Toko</option>
          {stores?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <p className="text-xs text-gray-400 mt-1">Kosongkan = berlaku semua toko</p>
      </div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif (tampil di kasir)</p>
        <button onClick={()=>setIsActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive?'bg-gray-900':'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive?'left-[22px]':'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button>
      </div>
    </Modal>
  )
}
