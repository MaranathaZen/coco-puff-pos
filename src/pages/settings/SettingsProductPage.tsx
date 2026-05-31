// src/pages/settings/SettingsProductPage.tsx
// CHANGELOG:
// - Tab Produk: tambah/edit/hapus/toggle aktif produk
// - Tab Kategori: tambah/edit/hapus kategori manual
// - Tab Paket: tambah/edit/hapus paket mix rasa

import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, X, Trash2, ChevronRight, RefreshCw, Package } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'produk' | 'kategori' | 'paket'

interface PaketData {
  id: string
  name: string
  price: number
  qty_total: number
  is_mix: boolean
  store_id: string | null
  is_active: boolean
  created_at?: string
}

export default function SettingsProductPage() {
  const { user } = useAuthStore()
  const [tab, setTab]       = useState<Tab>('produk')
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const [prodRes, catRes, pakRes] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('packages').select('*').order('created_at'),
      ])
      if (prodRes.data !== null) { await db.products.clear();   if (prodRes.data.length) await db.products.bulkPut(prodRes.data)   }
      if (catRes.data  !== null) { await db.categories.clear(); if (catRes.data.length) await db.categories.bulkPut(catRes.data)   }
      if (pakRes.data  !== null) {
        try { await (db as any).packages?.clear(); if (pakRes.data.length) await (db as any).packages?.bulkPut(pakRes.data) } catch {}
      }
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
        {(['produk','kategori','paket'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2.5 mr-6 text-sm font-medium border-b-2 capitalize whitespace-nowrap transition-colors ${tab===t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
            {t === 'paket' ? 'Paket / Bundle' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto bg-gray-50">
        {tab === 'produk'   && <ProdukTab storeId={user?.store_id || ''} />}
        {tab === 'kategori' && <KategoriTab />}
        {tab === 'paket'    && <PaketTab storeId={user?.store_id || ''} />}
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
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterCat==='semua' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
          Semua
        </button>
        {categories?.map(c => (
          <button key={c.id} onClick={() => setFilterCat(c.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterCat===c.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filtered.map((p, idx) => (
          <div key={p.id} className={`flex items-center px-4 py-3 ${idx!==0?'border-t border-gray-50':''} ${!p.is_active?'opacity-50':''}`}>
            <button onClick={() => { setEditItem(p); setShowForm(true) }} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
              <p className="text-xs text-gray-400">
                {catMap[p.category_id] || 'Tanpa Kategori'} · {formatRupiah(p.base_price || 0)}
                {p.unit && p.unit !== 'pcs' ? ` / ${p.unit}` : ''}
              </p>
            </button>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              <button onClick={() => toggleActive(p)}
                className={`w-9 h-5 rounded-full transition-colors relative ${p.is_active ? 'bg-gray-900' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${p.is_active ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
              <button onClick={() => { setEditItem(p); setShowForm(true) }}
                className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
              <button onClick={() => handleDelete(p)}
                className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            {search ? `Tidak ada hasil "${search}"` : 'Belum ada produk — klik Tambah Produk'}
          </div>
        )}
      </div>

      {showForm && (
        <ProdukForm product={editItem} categories={categories||[]}
          onClose={() => { setShowForm(false); setEditItem(null) }} />
      )}
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
    if (count > 0) return toast.error(`Kategori dipakai ${count} produk, tidak bisa dihapus`)
    if (!confirm(`Hapus kategori "${c.name}"?`)) return
    try {
      await supabase.from('categories').delete().eq('id', c.id)
      await db.categories.delete(c.id)
      toast.success('Kategori dihapus')
    } catch { toast.error('Gagal hapus') }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{categories?.length || 0} kategori</p>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tambah Kategori
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {categories?.map((c, idx) => (
          <div key={c.id} className={`flex items-center px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 text-sm font-bold text-gray-500">
              {c.sort_order || idx+1}
            </div>
            <button onClick={() => { setEditItem(c); setShowForm(true) }} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900">{c.name}</p>
              {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
            </button>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => { setEditItem(c); setShowForm(true) }}
                className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
              <button onClick={() => handleDelete(c)}
                className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {categories?.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">Belum ada kategori</div>
        )}
      </div>
      {showForm && (
        <KategoriForm kategori={editItem} currentCount={categories?.length || 0}
          onClose={() => { setShowForm(false); setEditItem(null) }} />
      )}
    </div>
  )
}

// ── PAKET TAB ─────────────────────────────────────────────────
function PaketTab({ storeId }: { storeId: string }) {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<PaketData|null>(null)
  const [pakets,   setPakets]   = useState<PaketData[]>([])
  const [loading,  setLoading]  = useState(true)

  async function loadPakets() {
    setLoading(true)
    try {
      const { data } = await supabase.from('packages').select('*').order('created_at')
      if (data) setPakets(data)
    } catch {
      try {
        const local = await (db as any).packages?.toArray() ?? []
        setPakets(local)
      } catch {}
    }
    setLoading(false)
  }

  useMemo(() => { loadPakets() }, [])

  async function toggleActive(p: PaketData) {
    const updated = { ...p, is_active: !p.is_active }
    setPakets(prev => prev.map(x => x.id === p.id ? updated : x))
    await supabase.from('packages').update({ is_active: updated.is_active }).eq('id', p.id)
    try { await (db as any).packages?.put(updated) } catch {}
  }

  async function handleDelete(p: PaketData) {
    if (!confirm(`Hapus paket "${p.name}"?`)) return
    setPakets(prev => prev.filter(x => x.id !== p.id))
    await supabase.from('packages').delete().eq('id', p.id)
    try { await (db as any).packages?.delete(p.id) } catch {}
    toast.success('Paket dihapus')
  }

  const all    = pakets
  const active = pakets.filter(p => p.is_active)

  return (
    <div className="p-4 space-y-3">
      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-blue-700 mb-0.5">Apa itu Paket / Bundle?</p>
        <p className="text-xs text-blue-600">
          Paket adalah bundel produk dengan harga spesial. Kasir bisa pilih rasa mix saat checkout.
          Contoh: "Paket 5 Puff" = 5 pcs mix rasa dengan harga Rp 45.000
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{active.length} aktif · {all.length} total</p>
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tambah Paket
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400">Memuat...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {all.map((p, idx) => (
            <div key={p.id} className={`flex items-center px-4 py-3 ${idx!==0?'border-t border-gray-50':''} ${!p.is_active?'opacity-50':''}`}>
              <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 mr-3">
                <Package size={16} className="text-gray-500" />
              </div>
              <button onClick={() => { setEditItem(p); setShowForm(true) }} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.qty_total} pcs · {formatRupiah(p.price)}
                  {p.is_mix && ' · Mix rasa'}
                  {p.store_id ? '' : ' · Semua toko'}
                </p>
              </button>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => toggleActive(p)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${p.is_active ? 'bg-gray-900' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${p.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <button onClick={() => { setEditItem(p); setShowForm(true) }}
                  className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
                <button onClick={() => handleDelete(p)}
                  className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {all.length === 0 && (
            <div className="py-12 text-center">
              <Package size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Belum ada paket — klik Tambah Paket</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <PaketForm paket={editItem}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={() => { setShowForm(false); setEditItem(null); loadPakets() }} />
      )}
    </div>
  )
}

// ── FORM PRODUK ───────────────────────────────────────────────
function ProdukForm({ product, categories, onClose }: { product: any; categories: any[]; onClose: () => void }) {
  const [name,       setName]     = useState(product?.name || '')
  const [categoryId, setCatId]    = useState(product?.category_id || '')
  const [price,      setPrice]    = useState(String(product?.base_price || ''))
  const [sku,        setSku]      = useState(product?.sku || '')
  const [unit,       setUnit]     = useState(product?.unit || 'pcs')
  const [isActive,   setIsActive] = useState(product?.is_active ?? true)
  const [saving,     setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim())                        return toast.error('Nama produk wajib diisi')
    if (!categoryId)                         return toast.error('Pilih kategori')
    if (!price || Number(price) <= 0)        return toast.error('Harga wajib diisi')
    setSaving(true)
    try {
      const data: any = {
        id:          product?.id || generateId(),
        category_id: categoryId,
        name:        name.trim(),
        sku:         sku || undefined,
        base_price:  Number(price),
        unit:        unit || 'pcs',
        is_active:   isActive,
        created_at:  product?.created_at || now(),
        updated_at:  now(),
      }
      await db.products.put(data)
      const { error } = await supabase.from('products').upsert(data)
      if (error) throw error
      toast.success(product ? 'Produk diupdate' : 'Produk ditambahkan')
      onClose()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={product ? 'Edit Produk' : 'Tambah Produk'} onClose={onClose}>
      <div>
        <Label required>Nama Produk</Label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Puff Vanilla, Es Teh, dll" />
      </div>
      <div>
        <Label required>Kategori</Label>
        <select className="input" value={categoryId} onChange={e => setCatId(e.target.value)}>
          <option value="">-- Pilih Kategori --</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Harga Jual (Rp)</Label>
          <input className="input" inputMode="decimal" value={price}
            onChange={e => setPrice(e.target.value.replace(/[^0-9]/g,''))} placeholder="0" />
        </div>
        <div>
          <Label>Satuan</Label>
          <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="pcs" />
        </div>
      </div>
      <div>
        <Label>SKU / Kode</Label>
        <input className="input" value={sku} onChange={e => setSku(e.target.value)} placeholder="Opsional" />
      </div>
      {product && (
        <div className="flex items-center justify-between py-2 border-t border-gray-100">
          <p className="text-sm text-gray-700">Aktif (tampil di kasir)</p>
          <button onClick={() => setIsActive(!isActive)}
            className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      )}
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

// ── FORM KATEGORI ─────────────────────────────────────────────
function KategoriForm({ kategori, currentCount, onClose }: { kategori: any; currentCount: number; onClose: () => void }) {
  const [name,      setName]   = useState(kategori?.name || '')
  const [desc,      setDesc]   = useState(kategori?.description || '')
  const [sortOrder, setSort]   = useState(String(kategori?.sort_order ?? currentCount + 1))
  const [saving,    setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama kategori wajib diisi')
    setSaving(true)
    try {
      const data: any = {
        id:          kategori?.id || `cat-${name.toLowerCase().replace(/\s+/g,'-')}-${Date.now().toString(36)}`,
        name:        name.trim(),
        description: desc || undefined,
        sort_order:  Number(sortOrder) || currentCount + 1,
      }
      await db.categories.put(data)
      const { error } = await supabase.from('categories').upsert(data)
      if (error) throw error
      toast.success(kategori ? 'Kategori diupdate' : 'Kategori ditambahkan')
      onClose()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={kategori ? 'Edit Kategori' : 'Tambah Kategori'} onClose={onClose}>
      <div>
        <Label required>Nama Kategori</Label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus
          placeholder="Puff, Minuman, Snack, dll" />
      </div>
      <div>
        <Label>Deskripsi</Label>
        <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Opsional" />
      </div>
      <div>
        <Label>Urutan Tampil</Label>
        <input className="input" type="number" min="1" value={sortOrder} onChange={e => setSort(e.target.value)} />
        <p className="text-xs text-gray-400 mt-1">Angka kecil = tampil duluan di filter kasir</p>
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

// ── FORM PAKET ────────────────────────────────────────────────
function PaketForm({ paket, onClose, onSaved }: { paket: PaketData|null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuthStore()
  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])

  const [name,      setName]     = useState(paket?.name || '')
  const [price,     setPrice]    = useState(String(paket?.price || ''))
  const [qtyTotal,  setQty]      = useState(String(paket?.qty_total || '5'))
  const [isMix,     setIsMix]    = useState(paket?.is_mix ?? true)
  const [storeId,   setStoreId]  = useState<string>(paket?.store_id || '')   // '' = semua toko
  const [isActive,  setIsActive] = useState(paket?.is_active ?? true)
  const [saving,    setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim())                  return toast.error('Nama paket wajib diisi')
    if (!price || Number(price) <= 0)  return toast.error('Harga wajib diisi')
    if (Number(qtyTotal) <= 0)         return toast.error('Jumlah pcs wajib diisi')
    setSaving(true)
    try {
      const data: PaketData = {
        id:        paket?.id || generateId(),
        name:      name.trim(),
        price:     Number(price),
        qty_total: Number(qtyTotal),
        is_mix:    isMix,
        store_id:  storeId || null,
        is_active: isActive,
        created_at: paket?.created_at || now(),
      }
      try { await (db as any).packages?.put(data) } catch {}
      const { error } = await supabase.from('packages').upsert(data)
      if (error) throw error
      toast.success(paket ? 'Paket diupdate' : 'Paket ditambahkan')
      onSaved()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={paket ? 'Edit Paket' : 'Tambah Paket'} onClose={onClose}>
      <div>
        <Label required>Nama Paket</Label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus
          placeholder="Paket 5 Puff, Bundle Hemat, dll" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Harga Paket (Rp)</Label>
          <input className="input" inputMode="decimal" value={price}
            onChange={e => setPrice(e.target.value.replace(/[^0-9]/g,''))} placeholder="45000" />
        </div>
        <div>
          <Label required>Jumlah (pcs)</Label>
          <input className="input" type="number" min="1" value={qtyTotal}
            onChange={e => setQty(e.target.value)} placeholder="5" />
          <p className="text-[10px] text-gray-400 mt-1">Total pcs dalam 1 paket</p>
        </div>
      </div>

      {/* Harga per pcs preview */}
      {Number(price) > 0 && Number(qtyTotal) > 0 && (
        <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2.5">
          <p className="text-xs text-green-700">
            Harga per pcs: <strong>{formatRupiah(Math.round(Number(price) / Number(qtyTotal)))}</strong>
          </p>
        </div>
      )}

      {/* Mix rasa */}
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-800">Mix Rasa</p>
          <p className="text-xs text-gray-400">Kasir bisa pilih beberapa produk dalam 1 paket</p>
        </div>
        <button onClick={() => setIsMix(!isMix)}
          className={`w-11 h-6 rounded-full transition-colors relative ${isMix ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isMix ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Toko */}
      <div>
        <Label>Berlaku untuk Toko</Label>
        <select className="input" value={storeId} onChange={e => setStoreId(e.target.value)}>
          <option value="">Semua Toko</option>
          {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <p className="text-xs text-gray-400 mt-1">Kosongkan = berlaku semua toko</p>
      </div>

      {/* Aktif */}
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif (tampil di kasir)</p>
        <button onClick={() => setIsActive(!isActive)}
          className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
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

// ── Shared components ─────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[90vh] flex flex-col">
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
