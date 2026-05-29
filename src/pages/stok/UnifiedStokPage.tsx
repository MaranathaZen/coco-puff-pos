// src/pages/stok/UnifiedStokPage.tsx
// Stok terpadu — tab sesuai role
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Warehouse, FlaskConical, Store, RefreshCw, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type StokTab = 'gudang' | 'produksi' | 'toko'

const TAB_ACCESS: Record<string, StokTab[]> = {
  owner:    ['gudang', 'produksi', 'toko'],
  manager:  ['gudang', 'produksi', 'toko'],
  gudang:   ['gudang', 'produksi', 'toko'],
  produksi: ['produksi', 'toko'],
  kasir:    ['toko'],
}

export default function UnifiedStokPage() {
  const { user } = useAuthStore()
  const role = user?.role || 'kasir'
  const tabs = TAB_ACCESS[role] || ['toko']
  const [tab, setTab] = useState<StokTab>(tabs[0])
  const [syncing, setSyncing] = useState(false)

  async function syncAll() {
    setSyncing(true)
    try {
      const [mats, ws, ps, fgs, prods, stocks] = await Promise.all([
        supabase.from('materials').select('*'),
        supabase.from('warehouse_stock').select('*'),
        supabase.from('production_stock').select('*'),
        supabase.from('finished_goods_stock').select('*'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('stock').select('*'),
      ])
      if (mats.data?.length)   await db.materials.bulkPut(mats.data)
      if (ws.data?.length)     await db.warehouse_stock.bulkPut(ws.data)
      if (ps.data?.length)     await db.production_stock.bulkPut(ps.data)
      if (fgs.data?.length)    await db.finished_goods_stock.bulkPut(fgs.data)
      if (prods.data?.length)  await db.products.bulkPut(prods.data)
      if (stocks.data?.length) await db.stock.bulkPut(stocks.data)
      toast.success('Stok diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  const tabConfig = [
    { id: 'gudang'   as StokTab, label: 'Gudang',   icon: Warehouse },
    { id: 'produksi' as StokTab, label: 'Produksi', icon: FlaskConical },
    { id: 'toko'     as StokTab, label: 'Toko',     icon: Store },
  ].filter(t => tabs.includes(t.id))

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Stok</h1>
        <button onClick={syncAll} disabled={syncing} className="p-2 text-gray-400 rounded-full">
          <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>

      {tabConfig.length > 1 && (
        <div className="bg-white border-b border-gray-100 flex flex-shrink-0">
          {tabConfig.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'
              }`}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-gray-50">
        {tab === 'gudang'   && <StokGudangView />}
        {tab === 'produksi' && <StokProduksiView />}
        {tab === 'toko'     && <StokTokoView storeId={user?.store_id || ''} role={user?.role || 'kasir'} />}
      </div>
    </div>
  )
}

// ── STOK GUDANG ───────────────────────────────────────────────
function StokGudangView() {
  const data = useLiveQuery(async () => {
    const mats   = await db.materials.filter(m => m.is_active).toArray()
    const stocks = await db.warehouse_stock.toArray()
    const sMap   = Object.fromEntries(stocks.map(s => [s.material_id, s.qty_on_hand]))
    const items  = mats.map(m => ({
      ...m, qty: sMap[m.id] ?? 0,
      nilai: (sMap[m.id] ?? 0) * (m.unit_cost || 0)
    }))
    const totalNilai = items.reduce((s, i) => s + i.nilai, 0)
    const lowStock   = items.filter(i => i.qty <= i.min_stock && i.min_stock > 0)
    // Group by category
    const grouped: Record<string, typeof items> = {}
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = []
      grouped[item.category].push(item)
    }
    return { items, totalNilai, lowStock, grouped }
  }, [])

  const katLabel: Record<string, string> = {
    bahan_baku: 'Bahan Baku', bahan_setengah_jadi: 'Setengah Jadi',
    packaging: 'Packaging', non_produksi: 'Non-Produksi',
  }

  const [search, setSearch] = useState('')
  const [filterKat, setFilterKat] = useState('semua')

  const allItems = data?.items || []
  const filteredItems = allItems.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    const matchKat = filterKat === 'semua'
      ? true
      : filterKat === 'stok_rendah'
        ? item.qty <= item.min_stock && item.min_stock > 0
        : item.category === filterKat
    return matchSearch && matchKat
  })

  return (
    <div className="p-4 space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Nilai Stok</p>
          <p className="text-base font-semibold text-gray-900">{formatRupiah(data?.totalNilai || 0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{data?.items.filter(i => i.qty > 0).length || 0} item</p>
        </div>
        {data?.lowStock && data.lowStock.length > 0 ? (
          <div className="bg-red-50 rounded-xl border border-red-100 p-3">
            <div className="flex items-center gap-1 mb-1">
              <AlertCircle size={12} className="text-red-500" />
              <p className="text-xs text-red-600 font-medium">Stok Rendah</p>
            </div>
            <p className="text-base font-semibold text-red-700">{data.lowStock.length} item</p>
          </div>
        ) : (
          <div className="bg-green-50 rounded-xl border border-green-100 p-3">
            <p className="text-xs text-green-600">Stok Normal</p>
            <p className="text-xs text-gray-400 mt-1">{data?.items.length || 0} jenis bahan</p>
          </div>
        )}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari nama bahan..." />

      {/* Filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {['semua', 'stok_rendah', 'bahan_baku', 'bahan_setengah_jadi', 'packaging', 'non_produksi'].map(k => (
          <button key={k} onClick={() => setFilterKat(k)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterKat === k
                ? k === 'stok_rendah' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
                : k === 'stok_rendah' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            {k === 'semua' ? 'Semua' : k === 'stok_rendah' ? `⚠ Stok Rendah (${data?.lowStock?.length || 0})` : katLabel[k] || k}
          </button>
        ))}
      </div>

      {/* Semua bahan dalam satu list (flat, difilter) */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filteredItems.sort((a,b) => b.nilai - a.nilai).map((item, idx) => (
          <div key={item.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${item.qty <= item.min_stock && item.min_stock > 0 ? 'bg-red-50/30' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
              <p className="text-xs text-gray-400">{katLabel[item.category] || item.category} · Avg {formatRupiah(item.unit_cost || 0)}/{item.unit}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-semibold ${item.qty <= item.min_stock && item.min_stock > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {item.qty} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
              </p>
              <p className="text-xs text-gray-400">{formatRupiah(item.nilai)}</p>
            </div>
          </div>
        ))}
        {filteredItems.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">
            {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada stok'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── STOK PRODUKSI ─────────────────────────────────────────────
function StokProduksiView() {
  const [search, setSearch] = useState('')
  const [filterKat, setFilterKat] = useState('semua')

  const katLabel: Record<string, string> = {
    bahan_baku: 'Bahan Baku', bahan_setengah_jadi: 'Setengah Jadi',
    packaging: 'Packaging', non_produksi: 'Non-Produksi',
  }

  const data = useLiveQuery(async () => {
    const ps     = await db.production_stock.toArray()
    const fgs    = await db.finished_goods_stock.toArray()
    const mats   = await db.materials.toArray()
    const mMap   = Object.fromEntries(mats.map(m => [m.id, m]))
    const bahan  = ps.map(s => ({ ...s, material: mMap[s.material_id] }))
    const totalBahan = bahan.reduce((s, i) => s + i.qty_on_hand * (i.material?.unit_cost || 0), 0)
    return { bahan, fgs, totalBahan }
  }, [])

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
          <p className="text-base font-semibold text-blue-600">{data?.fgs.reduce((s,f) => s+f.qty_on_hand, 0) || 0} pcs</p>
          <p className="text-xs text-gray-400 mt-0.5">{data?.fgs.length || 0} jenis</p>
        </div>
      </div>

      {/* Produk jadi di atas */}
      {data?.fgs && data.fgs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Produk Siap Kirim</p>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {data.fgs.map((f, idx) => (
              <div key={f.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                <p className="flex-1 text-sm font-medium text-gray-900">{f.product_name}</p>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">{f.qty_on_hand} pcs</p>
                  {(f as any).hpp_per_unit > 0 && (
                    <p className="text-xs text-gray-400">HPP {formatRupiah((f as any).hpp_per_unit)}/pcs</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filter bahan */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari nama bahan..." />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {['semua','bahan_baku','bahan_setengah_jadi','packaging','non_produksi'].map(k => (
          <button key={k} onClick={() => setFilterKat(k)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterKat === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            {k === 'semua' ? 'Semua' : katLabel[k] || k}
          </button>
        ))}
      </div>

      {/* Bahan baku produksi */}
      {data?.bahan && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Stok Bahan</p>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {data.bahan
              .filter(s => {
                const matchSearch = !search || s.material?.name?.toLowerCase().includes(search.toLowerCase())
                const matchKat = filterKat === 'semua' || s.material?.category === filterKat
                return matchSearch && matchKat
              })
              .map((s, idx) => (
                <div key={s.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.material?.name}</p>
                    <p className="text-xs text-gray-400">{katLabel[s.material?.category || ''] || ''} · Avg {formatRupiah(s.material?.unit_cost || 0)}/{s.material?.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{s.qty_on_hand} <span className="text-xs font-normal text-gray-400">{s.material?.unit}</span></p>
                    <p className="text-xs text-gray-400">{formatRupiah(s.qty_on_hand * (s.material?.unit_cost || 0))}</p>
                  </div>
                </div>
              ))}
            {data.bahan.filter(s => {
              const matchSearch = !search || s.material?.name?.toLowerCase().includes(search.toLowerCase())
              const matchKat = filterKat === 'semua' || s.material?.category === filterKat
              return matchSearch && matchKat
            }).length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">
                {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada stok bahan'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── STOK TOKO ─────────────────────────────────────────────────
function StokTokoView({ storeId, role }: { storeId: string; role: string }) {
  const [search, setSearch] = useState('')
  const [filterTokoKat, setFilterTokoKat] = useState('semua')
  const canSeeAllStores = ['owner','manager','gudang','produksi'].includes(role)

  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])
  const [selectedStore, setSelectedStore] = useState(storeId)

  const activeStoreId = canSeeAllStores ? selectedStore : storeId

  const data = useLiveQuery(async () => {
    if (!activeStoreId) return []
    const stocks   = await db.stock.where('store_id').equals(activeStoreId).toArray()
    const prods    = await db.products.toArray()
    const pMap     = Object.fromEntries(prods.map(p => [p.id, p]))
    const cats     = await db.categories.toArray()
    const cMap     = Object.fromEntries(cats.map(c => [c.id, c]))
    const mats     = await db.materials.toArray()
    const mMap     = Object.fromEntries(mats.map(m => [m.id, m]))

    // Gabungkan stok bahan toko + produk jadi yang dikirim dari produksi
    const items = stocks.map(s => {
      const prod = pMap[s.ingredient_id || '']
      const mat  = mMap[s.ingredient_id || '']
      const isProduk = !!prod
      return {
        id: s.id,
        ingredient_id: s.ingredient_id,
        qty_on_hand: s.qty_on_hand,
        displayName: prod?.name || mat?.name || s.ingredient_id?.slice(0,8) || '-',
        displayUnit: mat?.unit || 'pcs',
        categoryName: isProduk
          ? (cMap[prod!.category_id || '']?.name || 'Produk')
          : (mat?.category || ''),
        isProduk,
        isValidItem: !!(prod?.name || mat?.name),
      }
    }).filter(s => s.isValidItem)  // filter yang tidak dikenal

    return items
  }, [activeStoreId])

  const filtered = (data || []).filter(s => {
    const matchSearch = !search || s.displayName.toLowerCase().includes(search.toLowerCase())
    const matchKat = filterTokoKat === 'semua'
      ? true
      : filterTokoKat === 'stok_habis'
        ? s.qty_on_hand <= 0
        : filterTokoKat === 'produk_jadi'
          ? s.isProduk
          : s.categoryName?.toLowerCase().includes(filterTokoKat.replace('_',' ')) || false
    return matchSearch && matchKat
  })

  return (
    <div className="p-4 space-y-3">
      {/* Pilih toko — hanya untuk owner/manager/gudang */}
      {canSeeAllStores && stores && stores.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {stores.map(s => (
            <button key={s.id} onClick={() => setSelectedStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedStore === s.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}>{s.name}</button>
          ))}
        </div>
      )}

      {/* Filter pills toko */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[
          { k: 'semua',             l: 'Semua' },
          { k: 'stok_habis',        l: '⚠ Habis' },
          { k: 'produk_jadi',       l: 'Produk Jadi' },
          { k: 'bahan_baku',        l: 'Bahan Baku' },
          { k: 'bahan_setengah_jadi', l: 'Setengah Jadi' },
          { k: 'packaging',         l: 'Packaging' },
          { k: 'non_produksi',      l: 'Non-Produksi' },
        ].map(({ k, l }) => (
          <button key={k} onClick={() => setFilterTokoKat(k)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterTokoKat === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>{l}</button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari nama produk / bahan..." />

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filtered.map((s, idx) => (
          <div key={s.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{s.displayName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {s.isProduk && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">Produk Jadi</span>}
                {s.categoryName && !s.isProduk && <p className="text-xs text-gray-400">{s.categoryName}</p>}
              </div>
            </div>
            <p className={`text-sm font-semibold ${s.qty_on_hand <= 0 ? 'text-red-500' : 'text-gray-900'}`}>
              {s.qty_on_hand} <span className="text-xs font-normal text-gray-400">{s.displayUnit}</span>
            </p>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada data stok toko'}
          </div>
        )}
      </div>
    </div>
  )
}
