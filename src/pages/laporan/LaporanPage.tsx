// src/pages/laporan/LaporanPage.tsx
// Laporan lengkap: Penjualan Toko + Produksi + Gudang dalam 1 halaman

import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { TrendingUp, Package, FlaskConical, Warehouse, Store, ArrowRightLeft, Receipt, ShoppingCart } from 'lucide-react'

type Period = 'hari' | 'minggu' | 'bulan'
type LapTab = 'toko' | 'produksi' | 'gudang'

export default function LaporanPage() {
  const { user }  = useAuthStore()
  const role      = user?.role || 'kasir'
  const [period,  setPeriod]  = useState<Period>('bulan')
  const [lapTab,  setLapTab]  = useState<LapTab>('toko')

  const canSeeGudang   = ['owner','manager','gudang'].includes(role)
  const canSeeProduksi = ['owner','manager','produksi'].includes(role)
  const canSeeToko     = ['owner','manager','kasir'].includes(role)

  const tabs = [
    canSeeToko     && { id:'toko'     as LapTab, label:'Penjualan Toko',   icon: Store       },
    canSeeProduksi && { id:'produksi' as LapTab, label:'Produksi',          icon: FlaskConical },
    canSeeGudang   && { id:'gudang'   as LapTab, label:'Gudang',            icon: Warehouse   },
  ].filter(Boolean) as { id: LapTab; label: string; icon: any }[]

  const dateRange = useMemo(() => {
    const now   = new Date()
    const end   = new Date(now); end.setHours(23,59,59,999)
    const start = new Date(now)
    if (period === 'hari')   start.setHours(0,0,0,0)
    if (period === 'minggu') { start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
    if (period === 'bulan')  { start.setDate(1); start.setHours(0,0,0,0) }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [period])

  const periodLabel: Record<Period, string> = { hari:'Hari Ini', minggu:'7 Hari', bulan:'Bulan Ini' }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-4 pt-4 pb-0 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900 mb-3">Laporan</h1>
        {/* Period filter */}
        <div className="flex gap-2 mb-3">
          {(['hari','minggu','bulan'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${period===p?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
              {periodLabel[p]}
            </button>
          ))}
        </div>
        {/* Tab selector */}
        <div className="flex border-b border-gray-100">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setLapTab(t.id)}
              className={`flex items-center gap-1.5 px-4 pb-2.5 text-sm font-medium border-b-2 transition-colors ${lapTab===t.id?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
              <t.icon size={13} />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {lapTab === 'toko'     && <LapTokoView     dateRange={dateRange} role={role} storeId={user?.store_id||''} />}
        {lapTab === 'produksi' && <LapProduksiView dateRange={dateRange} />}
        {lapTab === 'gudang'   && <LapGudangView   dateRange={dateRange} />}
      </div>
    </div>
  )
}

// ── LAPORAN TOKO ──────────────────────────────────────────────
function LapTokoView({ dateRange, role, storeId }: { dateRange: any; role: string; storeId: string }) {
  const isOwnerManager = ['owner','manager'].includes(role)

  const stores = useLiveQuery(() =>
    db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
  , [])

  const [filterStore, setFilterStore] = useState('semua')

  const txData = useLiveQuery(async () => {
    let txs = await db.transactions
      .filter(t => t.status === 'completed' && t.created_at >= dateRange.start && t.created_at <= dateRange.end)
      .toArray()
    if (!isOwnerManager) txs = txs.filter(t => t.store_id === storeId)
    if (isOwnerManager && filterStore !== 'semua') txs = txs.filter(t => t.store_id === filterStore)

    const totalOmzet = txs.reduce((s,t) => s + t.total, 0)
    const totalTrx   = txs.length

    // Per toko
    const storeMap: Record<string, { omzet: number; count: number }> = {}
    for (const t of txs) {
      if (!storeMap[t.store_id]) storeMap[t.store_id] = { omzet:0, count:0 }
      storeMap[t.store_id].omzet += t.total
      storeMap[t.store_id].count++
    }

    // Per order type
    const orderTypeMap: Record<string, number> = {}
    for (const t of txs) {
      const ot = (t as any).order_type || 'take_away'
      orderTypeMap[ot] = (orderTypeMap[ot] || 0) + t.total
    }

    // Per payment method
    const payMap: Record<string, number> = {}
    for (const t of txs) {
      payMap[t.payment_method] = (payMap[t.payment_method] || 0) + t.total
    }

    // Per produk
    const txItems = await db.transaction_items.toArray()
    const prods = await db.products.toArray()
    const pkgQtyMap: Record<string, number> = Object.fromEntries(prods.map(p => [p.id, (p as any).pkg_qty || 1]))
    const prodMap: Record<string, { name: string; qty: number; nilai: number }> = {}
    for (const t of txs) {
      const items = txItems.filter(i => i.transaction_id === t.id)
      for (const i of items) {
        if (!prodMap[i.product_id]) prodMap[i.product_id] = { name:i.product_name||'?', qty:0, nilai:0 }
        // FIX: dus x pkg_qty (1 dus = pkg_qty pcs), samakan dgn pengurangan stok di CashierPage
        prodMap[i.product_id].qty   += (i.qty_eceran||0) + (i.qty_dus||0) * (pkgQtyMap[i.product_id] || 1)
        prodMap[i.product_id].nilai += i.subtotal||0
      }
    }
    const topProduk = Object.values(prodMap).sort((a,b) => b.nilai - a.nilai).slice(0,10)

    return { totalOmzet, totalTrx, storeMap, orderTypeMap, payMap, topProduk }
  }, [dateRange, filterStore, isOwnerManager, storeId])

  const orderTypeLabel: Record<string, string> = { dine_in:'Dine In', take_away:'Take Away', online:'Online' }
  const payLabel: Record<string, string> = { cash:'Tunai', qris:'QRIS', transfer:'Transfer', gopay:'GoPay', grab:'GrabPay', shopeefood:'ShopeePay' }

  return (
    <div className="p-4 space-y-4">
      {/* Filter toko */}
      {isOwnerManager && stores && stores.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilterStore('semua')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore==='semua'?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
            Semua Toko
          </button>
          {stores.map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={13} className="text-green-500" /><p className="text-xs text-gray-400">Total Omzet</p></div>
          <p className="text-xl font-bold text-gray-900">{formatRupiah(txData?.totalOmzet||0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{txData?.totalTrx||0} transaksi</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-1"><Store size={13} className="text-blue-500" /><p className="text-xs text-gray-400">Rata-rata/Trx</p></div>
          <p className="text-xl font-bold text-gray-900">{formatRupiah(txData && txData.totalTrx > 0 ? Math.round(txData.totalOmzet/txData.totalTrx) : 0)}</p>
        </div>
      </div>

      {/* Per toko */}
      {isOwnerManager && stores && filterStore === 'semua' && txData && Object.keys(txData.storeMap).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Per Toko</p></div>
          {(stores||[]).map((s, idx) => {
            const d = txData.storeMap[s.id]
            if (!d) return null
            const pct = txData.totalOmzet > 0 ? (d.omzet/txData.totalOmzet)*100 : 0
            return (
              <div key={s.id} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                <div className="flex justify-between mb-1">
                  <p className="text-sm text-gray-800">{s.name}</p>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatRupiah(d.omzet)}</p>
                    <p className="text-xs text-gray-400">{d.count} trx</p>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1"><div className="bg-gray-900 h-1 rounded-full" style={{width:`${pct}%`}} /></div>
              </div>
            )
          })}
        </div>
      )}

      {/* Per order type */}
      {txData && Object.keys(txData.orderTypeMap).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dine In / Take Away / Online</p></div>
          {Object.entries(txData.orderTypeMap).sort(([,a],[,b])=>b-a).map(([type, nilai], idx) => (
            <div key={type} className={`flex justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <p className="text-sm text-gray-700">{orderTypeLabel[type]||type}</p>
              <p className="text-sm font-medium text-gray-900">{formatRupiah(nilai)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Per metode bayar */}
      {txData && Object.keys(txData.payMap).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Metode Pembayaran</p></div>
          {Object.entries(txData.payMap).sort(([,a],[,b])=>b-a).map(([method, nilai], idx) => (
            <div key={method} className={`flex justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <p className="text-sm text-gray-700">{payLabel[method]||method}</p>
              <p className="text-sm font-medium text-gray-900">{formatRupiah(nilai)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top produk */}
      {txData && txData.topProduk.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Produk Terlaris</p></div>
          {txData.topProduk.map((p, idx) => (
            <div key={p.name} className={`flex justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <div><p className="text-sm text-gray-800">{p.name}</p><p className="text-xs text-gray-400">{p.qty} pcs</p></div>
              <p className="text-sm font-medium text-gray-900">{formatRupiah(p.nilai)}</p>
            </div>
          ))}
        </div>
      )}

      {(!txData || txData.totalTrx === 0) && (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada transaksi periode ini</div>
      )}
    </div>
  )
}

// ── LAPORAN PRODUKSI ──────────────────────────────────────────
function LapProduksiView({ dateRange }: { dateRange: any }) {
  const data = useLiveQuery(async () => {
    const logs = await db.production_logs
      .filter(l => (l as any).status !== 'voided' && l.created_at >= dateRange.start && l.created_at <= dateRange.end)
      .toArray()
    const logMats = await db.production_log_materials.toArray()
    const recipes = await db.production_recipes.toArray()
    const mats    = await db.materials.toArray()
    const rMap    = Object.fromEntries(recipes.map(r => [r.id, r]))
    const mMap    = Object.fromEntries(mats.map(m => [m.id, m]))
    const fgs     = await db.finished_goods_stock.toArray()

    // Per produk
    const prodMap: Record<string, { name:string; totalYield:number; batch:number; hpp:number }> = {}
    for (const log of logs) {
      const r = rMap[log.recipe_id]
      if (!r) continue
      const name = (r as any).product_name || r.name
      if (!prodMap[name]) prodMap[name] = { name, totalYield:0, batch:0, hpp:0 }
      prodMap[name].totalYield += log.total_yield
      prodMap[name].batch      += log.batch_count
      // HPP dari bahan
      const lMats = logMats.filter(lm => lm.log_id === log.id)
      prodMap[name].hpp += lMats.reduce((s,lm) => s + lm.qty_used * (mMap[lm.material_id]?.unit_cost||0), 0)
    }

    const totalYield = Object.values(prodMap).reduce((s,p)=>s+p.totalYield, 0)
    const totalHpp   = Object.values(prodMap).reduce((s,p)=>s+p.hpp, 0)
    const fgsTotal   = fgs.reduce((s,f)=>s+f.qty_on_hand, 0)

    return { prodMap, totalYield, totalHpp, fgs, fgsTotal, logCount: logs.length }
  }, [dateRange])

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-1"><FlaskConical size={13} className="text-cyan-500" /><p className="text-xs text-gray-400">Total Produksi</p></div>
          <p className="text-xl font-bold text-gray-900">{data?.totalYield||0} pcs</p>
          <p className="text-xs text-gray-400 mt-0.5">{data?.logCount||0} batch</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-1"><Package size={13} className="text-blue-500" /><p className="text-xs text-gray-400">Stok Produk Jadi</p></div>
          <p className="text-xl font-bold text-gray-900">{data?.fgsTotal||0} pcs</p>
          <p className="text-xs text-gray-400 mt-0.5">HPP est. {formatRupiah(data?.totalHpp||0)}</p>
        </div>
      </div>

      {data && Object.keys(data.prodMap).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Per Produk</p></div>
          {Object.values(data.prodMap).sort((a,b)=>b.totalYield-a.totalYield).map((p, idx) => (
            <div key={p.name} className={`flex justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <div><p className="text-sm text-gray-800">{p.name}</p><p className="text-xs text-gray-400">{p.batch} batch</p></div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{p.totalYield} pcs</p>
                <p className="text-xs text-gray-400">HPP {formatRupiah(p.hpp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.fgs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stok Produk Jadi Saat Ini</p></div>
          {data.fgs.map((f, idx) => (
            <div key={f.id} className={`flex justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <p className="text-sm text-gray-800">{f.product_name}</p>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{f.qty_on_hand} pcs</p>
                {(f as any).hpp_per_unit > 0 && <p className="text-xs text-gray-400">HPP {formatRupiah((f as any).hpp_per_unit)}/pcs</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(!data || data.logCount === 0) && (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada produksi periode ini</div>
      )}
    </div>
  )
}

// ── LAPORAN GUDANG ────────────────────────────────────────────
function LapGudangView({ dateRange }: { dateRange: any }) {
  const data = useLiveQuery(async () => {
    const purchases = await db.purchases.filter(p => (p as any).status !== 'voided' && p.created_at >= dateRange.start && p.created_at <= dateRange.end).toArray()
    const mutations = await db.warehouse_mutations.filter(m => (m as any).status !== 'voided' && m.created_at >= dateRange.start && m.created_at <= dateRange.end).toArray()
    const expenses  = await db.warehouse_expenses.filter(e => (e as any).status !== 'voided' && e.created_at >= dateRange.start && e.created_at <= dateRange.end).toArray()
    const pItems    = await db.purchase_items.toArray()
    const mItems    = await db.warehouse_mutation_items.toArray()
    const mats      = await db.materials.filter(m=>m.is_active).toArray()
    const stocks    = await db.warehouse_stock.toArray()
    const sMap      = Object.fromEntries(stocks.map(s=>[s.material_id, s.qty_on_hand]))

    const totalPembelian = purchases.reduce((s,p)=>s+p.total_amount, 0)
    const totalBiaya     = expenses.reduce((s,e)=>s+e.amount, 0)
    const totalMutasi    = mutations.reduce((s,m) => {
      const mi = mItems.filter(i=>i.mutation_id===m.id)
      return s + mi.reduce((ss,i)=>ss+i.qty*i.unit_cost, 0)
    }, 0)
    const nilaiStok = mats.reduce((s,m)=>s+(sMap[m.id]||0)*(m.avg_cost||m.unit_cost||0), 0)

    // Per bahan pembelian
    const bahanMap: Record<string, {name:string;qty:number;nilai:number;unit:string}> = {}
    for (const p of purchases) {
      for (const i of pItems.filter(pi=>pi.purchase_id===p.id)) {
        const mat = mats.find(m=>m.id===i.material_id)
        if (!bahanMap[i.material_id]) bahanMap[i.material_id] = {name:mat?.name||'?',qty:0,nilai:0,unit:mat?.unit||''}
        bahanMap[i.material_id].qty   += i.qty
        bahanMap[i.material_id].nilai += i.subtotal
      }
    }

    // Biaya per kategori
    const biayaKat: Record<string,number> = {}
    for (const e of expenses) biayaKat[e.category] = (biayaKat[e.category]||0) + e.amount

    return { totalPembelian, totalBiaya, totalMutasi, nilaiStok, bahanMap, biayaKat, purchaseCount:purchases.length, mutasiCount:mutations.length }
  }, [dateRange])

  const katLabel: Record<string,string> = { beban_bahan_baku:'Bahan Baku', beban_tenaga_kerja:'Tenaga Kerja', beban_sewa:'Sewa', beban_utilitas:'Utilitas', beban_packaging:'Packaging', beban_transport:'Transport', beban_pemasaran:'Pemasaran', beban_lainnya:'Lainnya' }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-1"><Warehouse size={13} className="text-blue-500" /><p className="text-xs text-gray-400">Nilai Stok</p></div>
          <p className="text-xl font-bold text-gray-900">{formatRupiah(data?.nilaiStok||0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-1"><ShoppingCart size={13} className="text-green-500" /><p className="text-xs text-gray-400">Pembelian</p></div>
          <p className="text-xl font-bold text-gray-900">{formatRupiah(data?.totalPembelian||0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{data?.purchaseCount||0} transaksi</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-1"><ArrowRightLeft size={13} className="text-purple-500" /><p className="text-xs text-gray-400">Mutasi</p></div>
          <p className="text-xl font-bold text-gray-900">{formatRupiah(data?.totalMutasi||0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{data?.mutasiCount||0} mutasi</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-1.5 mb-1"><Receipt size={13} className="text-orange-500" /><p className="text-xs text-gray-400">Biaya</p></div>
          <p className="text-xl font-bold text-gray-900">{formatRupiah(data?.totalBiaya||0)}</p>
        </div>
      </div>

      {data && Object.keys(data.bahanMap).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pembelian per Bahan</p></div>
          {Object.values(data.bahanMap).sort((a,b)=>b.nilai-a.nilai).slice(0,10).map((b, idx) => (
            <div key={b.name} className={`flex justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <div><p className="text-sm text-gray-800">{b.name}</p><p className="text-xs text-gray-400">{b.qty} {b.unit}</p></div>
              <p className="text-sm font-medium text-gray-900">{formatRupiah(b.nilai)}</p>
            </div>
          ))}
        </div>
      )}

      {data && Object.keys(data.biayaKat).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Biaya per Kategori</p></div>
          {Object.entries(data.biayaKat).sort(([,a],[,b])=>b-a).map(([kat, nilai], idx) => (
            <div key={kat} className={`flex justify-between px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <p className="text-sm text-gray-700">{katLabel[kat]||kat}</p>
              <p className="text-sm font-medium text-gray-900">{formatRupiah(nilai)}</p>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Total Biaya</p>
            <p className="text-sm font-semibold text-gray-900">{formatRupiah(data.totalBiaya)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
