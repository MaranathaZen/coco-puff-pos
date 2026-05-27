// src/pages/laporan/LaporanGudangPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import { RefreshCw, TrendingDown, TrendingUp, Package, FlaskConical } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LaporanGudangPage() {
  const today = new Date().toISOString().slice(0, 10)
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const [dateFrom, setFrom] = useState(firstDay)
  const [dateTo, setTo]     = useState(today)
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const [p, pi, pl, plm, wm, wmi, mats, sups, wexp] = await Promise.all([
        supabase.from('purchases').select('*'),
        supabase.from('purchase_items').select('*'),
        supabase.from('production_logs').select('*'),
        supabase.from('production_log_materials').select('*'),
        supabase.from('warehouse_mutations').select('*'),
        supabase.from('warehouse_mutation_items').select('*'),
        supabase.from('materials').select('*'),
        supabase.from('suppliers').select('*'),
        supabase.from('warehouse_expenses').select('*'),
      ])
      if (p.data?.length)   await db.purchases.bulkPut(p.data)
      if (pi.data?.length)  await db.purchase_items.bulkPut(pi.data)
      if (pl.data?.length)  await db.production_logs.bulkPut(pl.data)
      if (plm.data?.length) await db.production_log_materials.bulkPut(plm.data)
      if (wm.data?.length)  await db.warehouse_mutations.bulkPut(wm.data)
      if (wmi.data?.length) await db.warehouse_mutation_items.bulkPut(wmi.data)
      if (mats.data?.length) await db.materials.bulkPut(mats.data)
      if (sups.data?.length) await db.suppliers.bulkPut(sups.data)
      if (wexp.data?.length) await db.warehouse_expenses.bulkPut(wexp.data)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  const from = dateFrom + 'T00:00:00.000Z'
  const to   = dateTo   + 'T23:59:59.999Z'

  // ── Data Pembelian ──────────────────────────────────────────
  const pembelian = useLiveQuery(async () => {
    const purchases = await db.purchases
      .filter(p => p.created_at >= from && p.created_at <= to)
      .toArray()
    const items    = await db.purchase_items.toArray()
    const mats     = await db.materials.toArray()
    const sups     = await db.suppliers.toArray()
    const matMap   = Object.fromEntries(mats.map(m => [m.id, m]))
    const supMap   = Object.fromEntries(sups.map(s => [s.id, s]))

    const totalBeli = purchases.reduce((s, p) => s + p.total_amount, 0)

    // Per supplier
    const perSupplier: Record<string, { name: string; total: number; count: number }> = {}
    for (const p of purchases) {
      const key  = p.supplier_id || 'tanpa-supplier'
      const name = p.supplier_id ? (supMap[p.supplier_id]?.name || '-') : 'Tanpa Supplier'
      if (!perSupplier[key]) perSupplier[key] = { name, total: 0, count: 0 }
      perSupplier[key].total += p.total_amount
      perSupplier[key].count += 1
    }

    // Per bahan
    const purchaseIds = new Set(purchases.map(p => p.id))
    const filteredItems = items.filter(i => purchaseIds.has(i.purchase_id))
    const perBahan: Record<string, { name: string; unit: string; qty: number; total: number }> = {}
    for (const i of filteredItems) {
      const mat = matMap[i.material_id]
      if (!mat) continue
      if (!perBahan[i.material_id]) perBahan[i.material_id] = { name: mat.name, unit: mat.unit, qty: 0, total: 0 }
      perBahan[i.material_id].qty   += i.qty
      perBahan[i.material_id].total += i.subtotal
    }

    return { totalBeli, count: purchases.length, perSupplier: Object.values(perSupplier), perBahan: Object.values(perBahan).sort((a,b) => b.total - a.total) }
  }, [dateFrom, dateTo])

  // ── Data Produksi ───────────────────────────────────────────
  const produksi = useLiveQuery(async () => {
    const logs  = await db.production_logs
      .filter(l => l.created_at >= from && l.created_at <= to)
      .toArray()
    const logMats  = await db.production_log_materials.toArray()
    const mats     = await db.materials.toArray()
    const recipes  = await db.production_recipes.toArray()
    const matMap   = Object.fromEntries(mats.map(m => [m.id, m]))
    const recipeMap = Object.fromEntries(recipes.map(r => [r.id, r]))

    const totalProduksi = logs.reduce((s, l) => s + l.total_yield, 0)
    const totalBatch    = logs.reduce((s, l) => s + l.batch_count, 0)

    // Pemakaian bahan
    const logIds = new Set(logs.map(l => l.id))
    const filteredMats = logMats.filter(m => logIds.has(m.log_id))
    const pemakaian: Record<string, { name: string; unit: string; qty: number; cost: number }> = {}
    for (const m of filteredMats) {
      const mat = matMap[m.material_id]
      if (!mat) continue
      if (!pemakaian[m.material_id]) pemakaian[m.material_id] = { name: mat.name, unit: mat.unit, qty: 0, cost: 0 }
      pemakaian[m.material_id].qty  += m.qty_used
      pemakaian[m.material_id].cost += m.qty_used * mat.unit_cost
    }

    // HPP per pcs
    const totalBiayaBahan = Object.values(pemakaian).reduce((s, p) => s + p.cost, 0)
    const hppPerPcs = totalProduksi > 0 ? totalBiayaBahan / totalProduksi : 0

    return {
      totalProduksi, totalBatch,
      totalBiayaBahan, hppPerPcs,
      pemakaian: Object.values(pemakaian).sort((a, b) => b.cost - a.cost),
      logs: logs.map(l => ({ ...l, recipe: recipeMap[l.recipe_id] })).slice(0, 10),
    }
  }, [dateFrom, dateTo])

  // ── Data Mutasi ─────────────────────────────────────────────
  const mutasi = useLiveQuery(async () => {
    const muts  = await db.warehouse_mutations
      .filter(m => m.created_at >= from && m.created_at <= to)
      .toArray()
    const items = await db.warehouse_mutation_items.toArray()
    const mats  = await db.materials.toArray()
    const matMap = Object.fromEntries(mats.map(m => [m.id, m]))

    const toProd    = muts.filter(m => m.mutation_type === 'to_production')
    const toStore   = muts.filter(m => m.mutation_type === 'to_store')
    const toPartner = muts.filter(m => m.mutation_type === 'to_partner')

    const mutIds = new Set(muts.map(m => m.id))
    const filteredItems = items.filter(i => mutIds.has(i.mutation_id))
    const nilaiMutasi = filteredItems.reduce((s, i) => s + i.qty * i.unit_cost, 0)

    return { toProd: toProd.length, toStore: toStore.length, toPartner: toPartner.length, nilaiMutasi, count: muts.length }
  }, [dateFrom, dateTo])

  // ── Data Biaya ──────────────────────────────────────────────
  const biaya = useLiveQuery(async () => {
    const expenses = await db.warehouse_expenses
      .filter(e => e.expense_date >= dateFrom && e.expense_date <= dateTo)
      .toArray()
    const total = expenses.reduce((s, e) => s + e.amount, 0)
    const perKat: Record<string, number> = {}
    for (const e of expenses) {
      perKat[e.category] = (perKat[e.category] || 0) + e.amount
    }
    return { total, count: expenses.length, perKat }
  }, [dateFrom, dateTo])

  const catLabel: Record<string, string> = {
    listrik: 'Listrik', sewa: 'Sewa', gaji: 'Gaji',
    transport: 'Transport', lainnya: 'Lainnya',
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Laporan Gudang & Produksi</h1>
        <button onClick={syncData} disabled={syncing} className="p-2 rounded-full text-gray-400">
          <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>

      {/* Filter tanggal */}
      <div className="px-4 mt-3 flex gap-2 flex-shrink-0">
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">Dari</p>
          <input className="input text-sm" type="date" value={dateFrom} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">Sampai</p>
          <input className="input text-sm" type="date" value={dateTo} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 mt-3">
        <div className="p-4 space-y-4">

          {/* ── Ringkasan ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Pembelian</p>
              <p className="text-lg font-semibold text-gray-900">{formatRupiah(pembelian?.totalBeli || 0)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{pembelian?.count || 0} transaksi</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Produksi</p>
              <p className="text-lg font-semibold text-gray-900">{produksi?.totalProduksi || 0} pcs</p>
              <p className="text-xs text-gray-400 mt-0.5">{produksi?.totalBatch || 0} batch</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">HPP per Pcs</p>
              <p className="text-lg font-semibold text-gray-900">{formatRupiah(produksi?.hppPerPcs || 0)}</p>
              <p className="text-xs text-gray-400 mt-0.5">dari bahan baku</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Biaya Operasional</p>
              <p className="text-lg font-semibold text-gray-900">{formatRupiah(biaya?.total || 0)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{biaya?.count || 0} pos biaya</p>
            </div>
          </div>

          {/* ── Pembelian per Supplier ── */}
          {(pembelian?.perSupplier?.length || 0) > 0 && (
            <Section title="Pembelian per Supplier" icon={<TrendingDown size={14} />}>
              {pembelian!.perSupplier.map((s, i) => (
                <Row key={i} label={s.name} sub={`${s.count} faktur`} value={formatRupiah(s.total)} />
              ))}
            </Section>
          )}

          {/* ── Pembelian per Bahan ── */}
          {(pembelian?.perBahan?.length || 0) > 0 && (
            <Section title="Pembelian per Bahan" icon={<Package size={14} />}>
              {pembelian!.perBahan.map((b, i) => (
                <Row key={i} label={b.name} sub={`${b.qty} ${b.unit}`} value={formatRupiah(b.total)} />
              ))}
            </Section>
          )}

          {/* ── Pemakaian Bahan Produksi ── */}
          {(produksi?.pemakaian?.length || 0) > 0 && (
            <Section title="Pemakaian Bahan Produksi" icon={<FlaskConical size={14} />}>
              <div className="px-4 py-2 flex justify-between border-b border-gray-50">
                <span className="text-xs text-gray-400">Total Biaya Bahan</span>
                <span className="text-xs font-semibold text-gray-900">{formatRupiah(produksi!.totalBiayaBahan)}</span>
              </div>
              {produksi!.pemakaian.map((p, i) => (
                <Row key={i} label={p.name} sub={`${p.qty.toFixed(2)} ${p.unit}`} value={formatRupiah(p.cost)} />
              ))}
            </Section>
          )}

          {/* ── Mutasi Gudang ── */}
          <Section title="Ringkasan Mutasi" icon={<TrendingUp size={14} />}>
            <Row label="ke Produksi"  sub={`${mutasi?.toProd || 0} mutasi`}    value="" />
            <Row label="ke Toko"      sub={`${mutasi?.toStore || 0} mutasi`}   value="" />
            <Row label="ke Mitra"     sub={`${mutasi?.toPartner || 0} mutasi`} value="" />
            <div className="px-4 py-2 flex justify-between border-t border-gray-50">
              <span className="text-xs text-gray-500 font-medium">Nilai Mutasi</span>
              <span className="text-xs font-semibold text-gray-900">{formatRupiah(mutasi?.nilaiMutasi || 0)}</span>
            </div>
          </Section>

          {/* ── Biaya Operasional ── */}
          {(biaya?.count || 0) > 0 && (
            <Section title="Biaya Operasional">
              {Object.entries(biaya!.perKat).map(([kat, total], i) => (
                <Row key={i} label={catLabel[kat] || kat} sub="" value={formatRupiah(total)} />
              ))}
              <div className="px-4 py-2 flex justify-between border-t border-gray-50">
                <span className="text-xs text-gray-500 font-medium">Total</span>
                <span className="text-xs font-semibold text-gray-900">{formatRupiah(biaya!.total)}</span>
              </div>
            </Section>
          )}

          {/* ── Log Produksi Terbaru ── */}
          {(produksi?.logs?.length || 0) > 0 && (
            <Section title="Log Produksi (10 terakhir)">
              {produksi!.logs.map((l, i) => (
                <Row key={i}
                  label={l.recipe?.name || '-'}
                  sub={new Date(l.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                  value={`${l.total_yield} pcs`} />
              ))}
            </Section>
          )}

          {/* Empty state */}
          {!pembelian?.count && !produksi?.totalProduksi && !biaya?.count && (
            <div className="text-center py-16 text-gray-400 text-sm">
              Tidak ada data di periode ini
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Helper Components ─────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</p>
      </div>
      {children}
    </div>
  )
}

function Row({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-800">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      {value && <p className="text-sm font-medium text-gray-900">{value}</p>}
    </div>
  )
}
