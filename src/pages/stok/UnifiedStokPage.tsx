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
        {tab === 'toko'     && <StokTokoView storeId={user?.store_id || ''} />}
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

      {/* Per kategori */}
      {data && Object.entries(data.grouped).map(([kat, items]) => (
        <div key={kat}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{katLabel[kat] || kat}</p>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {items.sort((a,b) => b.nilai - a.nilai).map((item, idx) => (
              <div key={item.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${item.qty <= item.min_stock && item.min_stock > 0 ? 'bg-red-50/30' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">Avg {formatRupiah(item.unit_cost || 0)}/{item.unit}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold ${item.qty <= item.min_stock && item.min_stock > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {item.qty} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
                  </p>
                  <p className="text-xs text-gray-400">{formatRupiah(item.nilai)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── STOK PRODUKSI ─────────────────────────────────────────────
function StokProduksiView() {
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

      {/* Bahan baku produksi */}
      {data?.bahan && data.bahan.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Bahan Baku</p>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {data.bahan.map((s, idx) => (
              <div key={s.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.material?.name}</p>
                  <p className="text-xs text-gray-400">Avg {formatRupiah(s.material?.unit_cost || 0)}/{s.material?.unit}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{s.qty_on_hand} <span className="text-xs font-normal text-gray-400">{s.material?.unit}</span></p>
                  <p className="text-xs text-gray-400">{formatRupiah(s.qty_on_hand * (s.material?.unit_cost || 0))}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── STOK TOKO ─────────────────────────────────────────────────
function StokTokoView({ storeId }: { storeId: string }) {
  const data = useLiveQuery(async () => {
    const stocks   = await db.stock.where('store_id').equals(storeId).toArray()
    const prods    = await db.products.toArray()
    const pMap     = Object.fromEntries(prods.map(p => [p.id, p]))
    const cats     = await db.categories.toArray()
    const cMap     = Object.fromEntries(cats.map(c => [c.id, c]))
    return stocks.map(s => ({
      ...s,
      product: pMap[s.ingredient_id || ''],
      category: cMap[pMap[s.ingredient_id || '']?.category_id || ''],
    }))
  }, [storeId])

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {data?.map((s, idx) => (
          <div key={s.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{s.product?.name || s.ingredient_id}</p>
              <p className="text-xs text-gray-400">{s.category?.name}</p>
            </div>
            <p className="text-sm font-semibold text-gray-900">{s.qty_on_hand}</p>
          </div>
        ))}
        {!data?.length && (
          <div className="py-12 text-center text-sm text-gray-400">Belum ada data stok toko</div>
        )}
      </div>
    </div>
  )
}
