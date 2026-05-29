// src/pages/cashier/EndOfDayPage.tsx
// Close Order Kasir — Laporan Harian Lengkap
import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const PAY_METHODS = [
  { key: 'cash',       label: 'Tunai' },
  { key: 'qris',       label: 'QRIS' },
  { key: 'transfer',   label: 'Transfer' },
  { key: 'gopay',      label: 'GoPay/GoFood' },
  { key: 'grab',       label: 'GrabFood' },
  { key: 'shopeefood', label: 'ShopeeFood' },
]

export default function EndOfDayPage() {
  const { user } = useAuthStore()
  const storeId = user?.store_id || ''
  const today = new Date().toISOString().slice(0, 10)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving]   = useState(false)

  // Manual inputs
  const [saldoAwal,     setSaldoAwal]     = useState('')
  const [saldoTambahan, setSaldoTambahan] = useState('')
  const [totalSetor,    setTotalSetor]    = useState('')
  const [uangFisik,     setUangFisik]     = useState('')
  const [notes,         setNotes]         = useState('')

  // Sync data
  async function syncData() {
    setSyncing(true)
    try {
      const [txRes, tiRes, prodRes, stockRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('store_id', storeId).eq('status', 'completed'),
        supabase.from('transaction_items').select('*'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('stock').select('*').eq('store_id', storeId),
      ])
      if (txRes.data?.length)    await db.transactions.bulkPut(txRes.data)
      if (tiRes.data?.length)    await db.transaction_items.bulkPut(tiRes.data)
      if (prodRes.data?.length)  await db.products.bulkPut(prodRes.data)
      if (stockRes.data?.length) await db.stock.bulkPut(stockRes.data)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  // Load transactions hari ini
  const todayData = useLiveQuery(async () => {
    const txs = await db.transactions
      .filter(t => t.store_id === storeId && t.status === 'completed' && t.created_at.slice(0,10) === today)
      .toArray()

    const allItems = await db.transaction_items.toArray()
    const prods    = await db.products.toArray()
    const pMap     = Object.fromEntries(prods.map(p => [p.id, p]))

    // Total per metode bayar
    const byMethod: Record<string, number> = {}
    PAY_METHODS.forEach(m => { byMethod[m.key] = 0 })
    for (const tx of txs) {
      byMethod[tx.payment_method] = (byMethod[tx.payment_method] || 0) + tx.total
    }

    // Produk terjual hari ini
    const soldMap: Record<string, { name: string; qty: number; total: number }> = {}
    for (const tx of txs) {
      const txItems = allItems.filter(i => i.transaction_id === tx.id)
      for (const item of txItems) {
        const prod = pMap[item.product_id]
        if (!prod) continue
        if (!soldMap[item.product_id]) soldMap[item.product_id] = { name: prod.name, qty: 0, total: 0 }
        soldMap[item.product_id].qty   += item.qty
        soldMap[item.product_id].total += item.qty * item.price
      }
    }

    const totalPenjualan = txs.reduce((s, t) => s + t.total, 0)
    const totalNonTunai  = totalPenjualan - (byMethod['cash'] || 0)

    return { txs, byMethod, soldMap, totalPenjualan, totalNonTunai, txCount: txs.length }
  }, [storeId, today])

  // Biaya hari ini dari toko ini
  const biayaHariIni = useLiveQuery(async () => {
    const expenses = await db.warehouse_expenses
      .filter(e => e.created_by === user?.id && e.created_at.slice(0,10) === today)
      .toArray()
    return expenses.reduce((s, e) => s + e.amount, 0)
  }, [user?.id, today])

  // Pembelian hari ini (darurat toko)
  const pembelianHariIni = useLiveQuery(async () => {
    const purchases = await db.purchases
      .filter(p => p.created_by === user?.id && p.created_at.slice(0,10) === today)
      .toArray()
    return purchases.reduce((s, p) => s + p.total_amount, 0)
  }, [user?.id, today])

  // Stok sisa toko
  const stokSisa = useLiveQuery(async () => {
    const stocks = await db.stock.where('store_id').equals(storeId).toArray()
    const prods  = await db.products.toArray()
    const mats   = await db.materials.toArray()
    const pMap   = Object.fromEntries(prods.map(p => [p.id, p]))
    const mMap   = Object.fromEntries(mats.map(m => [m.id, m]))
    return stocks.map(s => ({
      ...s,
      name: pMap[s.ingredient_id || '']?.name || mMap[s.ingredient_id || '']?.name || s.ingredient_id || '-',
    }))
  }, [storeId])

  // Kalkulasi
  const totalPenjualan  = todayData?.totalPenjualan  || 0
  const totalBiaya      = biayaHariIni               || 0
  const totalPembelian  = pembelianHariIni            || 0
  const saldoAwalNum    = Number(saldoAwal)           || 0
  const saldoTambahanNum = Number(saldoTambahan)      || 0
  const totalSetorNum   = Number(totalSetor)          || 0
  const uangFisikNum    = Number(uangFisik)           || 0
  const cashPenjualan   = todayData?.byMethod['cash'] || 0

  const saldoAkhir = saldoAwalNum + saldoTambahanNum + cashPenjualan - totalSetorNum - totalBiaya
  const selisih    = uangFisikNum - saldoAkhir

  async function handleSave() {
    setSaving(true)
    try {
      const reportData = {
        id: generateId(),
        store_id: storeId,
        report_date: today,
        saldo_awal: saldoAwalNum,
        saldo_tambahan: saldoTambahanNum,
        total_penjualan: totalPenjualan,
        total_cash: cashPenjualan,
        total_non_tunai: todayData?.totalNonTunai || 0,
        total_qris: todayData?.byMethod['qris'] || 0,
        total_gopay: todayData?.byMethod['gopay'] || 0,
        total_grab: todayData?.byMethod['grab'] || 0,
        total_shopeefood: todayData?.byMethod['shopeefood'] || 0,
        total_transfer: todayData?.byMethod['transfer'] || 0,
        total_setor: totalSetorNum,
        total_biaya: totalBiaya,
        total_pembelian: totalPembelian,
        saldo_akhir: saldoAkhir,
        uang_fisik: uangFisikNum,
        selisih,
        notes: notes || undefined,
        submitted_by: user?.id,
        submitted_at: now(),
      }
      await supabase.from('close_order_reports').upsert(reportData)
      toast.success('Close Order disimpan')
    } catch (e) {
      console.error(e)
      toast.error('Gagal simpan — pastikan tabel sudah dibuat di Supabase')
    } finally { setSaving(false) }
  }

  function Row({ label, value, highlight, negative }: { label: string; value: number; highlight?: boolean; negative?: boolean }) {
    return (
      <div className={`flex items-center justify-between py-2 ${highlight ? 'border-t border-gray-200 mt-1 pt-3' : 'border-t border-gray-50'}`}>
        <span className={`text-sm ${highlight ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</span>
        <span className={`text-sm font-medium ${highlight ? 'text-gray-900 text-base' : negative ? 'text-red-600' : 'text-gray-900'}`}>
          {negative && value > 0 ? '- ' : ''}{formatRupiah(Math.abs(value))}
        </span>
      </div>
    )
  }

  function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
        <input className="input" type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || '0'} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Close Order</h1>
          <p className="text-xs text-gray-400">{new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
        </div>
        <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400">
          <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* Input manual */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Input Manual</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Saldo Awal" value={saldoAwal} onChange={setSaldoAwal} />
            <Input label="Saldo Tambahan" value={saldoTambahan} onChange={setSaldoTambahan} />
            <Input label="Total Setor ke Pusat" value={totalSetor} onChange={setTotalSetor} />
            <Input label="Uang Fisik di Laci" value={uangFisik} onChange={setUangFisik} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Catatan</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
          </div>
        </div>

        {/* Ringkasan penjualan per metode */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Penjualan Hari Ini</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {PAY_METHODS.map(m => (
              <div key={m.key} className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-400">{m.label}</p>
                <p className="text-sm font-semibold text-gray-900">{formatRupiah(todayData?.byMethod[m.key] || 0)}</p>
              </div>
            ))}
          </div>
          <Row label="Total Penjualan" value={totalPenjualan} highlight />
          <p className="text-xs text-gray-400 mt-1">{todayData?.txCount || 0} transaksi</p>
        </div>

        {/* Laporan kas */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Laporan Kas</p>
          <Row label="Saldo Awal"         value={saldoAwalNum} />
          <Row label="Saldo Tambahan"     value={saldoTambahanNum} />
          <Row label="Penjualan Tunai"    value={cashPenjualan} />
          <Row label="Total Setor"        value={totalSetorNum}   negative />
          <Row label="Total Biaya"        value={totalBiaya}      negative />
          <Row label="Saldo Akhir"        value={saldoAkhir}      highlight />
          <Row label="Uang Fisik di Laci" value={uangFisikNum} />
          <div className={`flex items-center justify-between py-3 border-t border-gray-200 mt-1`}>
            <span className="text-sm font-semibold text-gray-900">Selisih</span>
            <div className="flex items-center gap-1.5">
              {selisih === 0 ? (
                <CheckCircle size={14} className="text-green-500" />
              ) : (
                <AlertCircle size={14} className="text-red-500" />
              )}
              <span className={`text-base font-bold ${selisih === 0 ? 'text-green-600' : selisih > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {selisih > 0 ? '+' : ''}{formatRupiah(selisih)}
              </span>
            </div>
          </div>
          {totalBiaya > 0 && <p className="text-xs text-gray-400">Biaya hari ini: {formatRupiah(totalBiaya)}</p>}
          {totalPembelian > 0 && <p className="text-xs text-gray-400">Pembelian hari ini: {formatRupiah(totalPembelian)}</p>}
        </div>

        {/* Produk terjual */}
        {todayData?.soldMap && Object.keys(todayData.soldMap).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Produk Terjual</p>
            {Object.values(todayData.soldMap).sort((a,b) => b.qty - a.qty).map((item, idx) => (
              <div key={idx} className={`flex items-center justify-between px-4 py-2.5 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                <p className="text-sm text-gray-800">{item.name}</p>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{item.qty} pcs</p>
                  <p className="text-xs text-gray-400">{formatRupiah(item.total)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sisa stok */}
        {stokSisa && stokSisa.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Sisa Stok</p>
            {stokSisa.map((s, idx) => (
              <div key={s.id} className={`flex items-center justify-between px-4 py-2.5 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                <p className="text-sm text-gray-800">{s.name}</p>
                <p className="text-sm font-medium text-gray-900">{s.qty_on_hand}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tombol simpan */}
        <button onClick={handleSave} disabled={saving}
          className="w-full py-3.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan Close Order'}
        </button>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p className="text-xs text-blue-700 font-medium mb-1">Setup Supabase</p>
          <p className="text-xs text-blue-500">Jalankan SQL ini untuk menyimpan close order:</p>
          <pre className="text-[10px] text-blue-500 mt-1 overflow-x-auto bg-blue-100 rounded p-1.5">
{`CREATE TABLE IF NOT EXISTS close_order_reports (
  id text PRIMARY KEY,
  store_id text,
  report_date date,
  saldo_awal numeric DEFAULT 0,
  saldo_tambahan numeric DEFAULT 0,
  total_penjualan numeric DEFAULT 0,
  total_cash numeric DEFAULT 0,
  total_non_tunai numeric DEFAULT 0,
  total_qris numeric DEFAULT 0,
  total_gopay numeric DEFAULT 0,
  total_grab numeric DEFAULT 0,
  total_shopeefood numeric DEFAULT 0,
  total_transfer numeric DEFAULT 0,
  total_setor numeric DEFAULT 0,
  total_biaya numeric DEFAULT 0,
  total_pembelian numeric DEFAULT 0,
  saldo_akhir numeric DEFAULT 0,
  uang_fisik numeric DEFAULT 0,
  selisih numeric DEFAULT 0,
  notes text,
  submitted_by text,
  submitted_at timestamptz DEFAULT now()
);
ALTER TABLE close_order_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON close_order_reports FOR ALL USING (true);`}
          </pre>
        </div>

        <div className="h-4" />
      </div>
    </div>
  )
}
