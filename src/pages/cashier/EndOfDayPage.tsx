// src/pages/cashier/EndOfDayPage.tsx
// CHANGELOG:
// - Auto-load saldo awal dari close order hari sebelumnya (carry over)
// - WhatsApp share setelah simpan berhasil
// - Auto-detect total per metode, biaya, pembelian dari DB
// - Riwayat: tampil hanya hari ini (filter per hari)
// - Hapus SQL banner
// - Fix input keyboard tidak hide

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { RefreshCw, CheckCircle, AlertCircle, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'

const PAY_METHODS = [
  { key: 'cash',       label: 'Tunai'        },
  { key: 'qris',       label: 'QRIS'         },
  { key: 'transfer',   label: 'Transfer'     },
  { key: 'gopay',      label: 'GoPay/GoFood' },
  { key: 'grab',       label: 'GrabFood'     },
  { key: 'shopeefood', label: 'ShopeeFood'   },
]

function NumInput({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input className="input" inputMode="decimal" pattern="[0-9]*" value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder={placeholder || '0'} autoComplete="off" />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function Row({ label, value, highlight, negative, sub }: {
  label: string; value: number; highlight?: boolean; negative?: boolean; sub?: string
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${highlight ? 'border-t border-gray-200 mt-1 pt-3' : 'border-t border-gray-50'}`}>
      <div>
        <span className={`text-sm ${highlight ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</span>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      <span className={`text-sm font-medium ${highlight ? 'text-gray-900 text-base' : negative ? 'text-red-600' : 'text-gray-900'}`}>
        {negative && value > 0 ? '- ' : ''}{formatRupiah(Math.abs(value))}
      </span>
    </div>
  )
}

export default function EndOfDayPage() {
  const { user, store } = useAuthStore()
  const storeId  = user?.store_id || ''
  const storeName = store?.name || 'Toko'
  const today    = new Date().toISOString().slice(0, 10)

  const [syncing, setSyncing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [savedReport, setSavedReport] = useState<any>(null)

  const [saldoAwal,     setSaldoAwal]     = useState('')
  const [saldoTambahan, setSaldoTambahan] = useState('')
  const [totalSetor,    setTotalSetor]    = useState('')
  const [uangFisik,     setUangFisik]     = useState('')
  const [notes,         setNotes]         = useState('')

  // ── Auto-load saldo awal dari close order kemarin ────────────
  useEffect(() => {
    async function loadCarryOver() {
      try {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        // Cek apakah hari ini sudah ada close order
        const { data: todayReport } = await supabase
          .from('close_order_reports')
          .select('saldo_awal')
          .eq('store_id', storeId)
          .eq('report_date', today)
          .maybeSingle()
        if (todayReport) {
          setSaldoAwal(String(todayReport.saldo_awal || 0))
          return
        }
        // Ambil saldo_akhir kemarin sebagai saldo awal hari ini
        const { data: prev } = await supabase
          .from('close_order_reports')
          .select('saldo_akhir, report_date')
          .eq('store_id', storeId)
          .order('report_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (prev?.saldo_akhir !== undefined && prev.saldo_akhir !== null) {
          setSaldoAwal(String(Math.max(0, prev.saldo_akhir)))
          toast.success(`Saldo awal diisi otomatis dari ${prev.report_date}`, { duration: 3000 })
        }
      } catch { /* offline atau tabel belum ada */ }
    }
    loadCarryOver()
  }, [storeId, today])

  async function syncData() {
    setSyncing(true)
    try {
      const [txRes, tiRes, prodRes, stockRes, matsRes, fgRes, expRes, purRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('store_id', storeId),
        supabase.from('transaction_items').select('*'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('stock').select('*').eq('store_id', storeId),
        supabase.from('materials').select('*'),
        supabase.from('finished_goods_stock').select('*'),
        supabase.from('warehouse_expenses').select('*').eq('store_id', storeId),
        supabase.from('purchases').select('*').eq('store_id', storeId),
      ])
      if (txRes.data?.length)    await db.transactions.bulkPut(txRes.data)
      if (tiRes.data?.length)    await db.transaction_items.bulkPut(tiRes.data)
      if (prodRes.data?.length)  await db.products.bulkPut(prodRes.data)
      if (stockRes.data?.length) await db.stock.bulkPut(stockRes.data)
      if (matsRes.data?.length)  await db.materials.bulkPut(matsRes.data)
      if (fgRes.data?.length)    await (db as any).finished_goods_stock?.bulkPut(fgRes.data)
      if (expRes.data?.length)   await db.warehouse_expenses.bulkPut(expRes.data)
      if (purRes.data?.length)   await db.purchases.bulkPut(purRes.data)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  // ── Transaksi hari ini ───────────────────────────────────────
  const todayData = useLiveQuery(async () => {
    const txs = await db.transactions
      .filter(t => t.store_id === storeId && t.status === 'completed' && t.created_at.slice(0,10) === today)
      .toArray()
    const allItems = await db.transaction_items.toArray()
    const prods    = await db.products.toArray()
    const pMap     = Object.fromEntries(prods.map(p => [p.id, p]))

    const byMethod: Record<string, number> = {}
    PAY_METHODS.forEach(m => { byMethod[m.key] = 0 })
    for (const tx of txs) { byMethod[tx.payment_method] = (byMethod[tx.payment_method] || 0) + tx.total }

    const soldMap: Record<string, { name: string; qty: number; total: number }> = {}
    for (const tx of txs) {
      const txItems = allItems.filter(i => i.transaction_id === tx.id)
      for (const item of txItems) {
        const prod = pMap[item.product_id]; if (!prod) continue
        if (!soldMap[item.product_id]) soldMap[item.product_id] = { name: prod.name, qty: 0, total: 0 }
        const qty = (item as any).qty ?? ((item as any).qty_eceran ?? 0) + ((item as any).qty_dus ?? 0)
        soldMap[item.product_id].qty   += qty
        soldMap[item.product_id].total += item.subtotal ?? (qty * ((item as any).unit_price ?? 0))
      }
    }

    // Total online order per platform
    const bySource: Record<string, number> = {}
    for (const tx of txs) {
      const src = (tx as any).order_source || 'pos'
      bySource[src] = (bySource[src] || 0) + tx.total
    }

    const totalPenjualan = txs.reduce((s, t) => s + t.total, 0)
    const totalNonTunai  = totalPenjualan - (byMethod['cash'] || 0)
    return { txs, byMethod, soldMap, totalPenjualan, totalNonTunai, txCount: txs.length, bySource }
  }, [storeId, today])

  // ── Biaya hari ini — auto detect dari store ──────────────────
  const biayaHariIni = useLiveQuery(async () => {
    // Coba filter per store_id dulu, fallback ke created_by
    const byStore = await db.warehouse_expenses
      .filter(e => (e as any).store_id === storeId && e.created_at.slice(0,10) === today)
      .toArray()
    if (byStore.length > 0) return byStore.reduce((s, e) => s + e.amount, 0)
    const byUser = await db.warehouse_expenses
      .filter(e => e.created_by === user?.id && e.created_at.slice(0,10) === today)
      .toArray()
    return byUser.reduce((s, e) => s + e.amount, 0)
  }, [storeId, user?.id, today])

  const pembelianHariIni = useLiveQuery(async () => {
    const byStore = await db.purchases
      .filter(p => (p as any).store_id === storeId && p.created_at.slice(0,10) === today)
      .toArray()
    if (byStore.length > 0) return byStore.reduce((s, p) => s + p.total_amount, 0)
    const byUser = await db.purchases
      .filter(p => p.created_by === user?.id && p.created_at.slice(0,10) === today)
      .toArray()
    return byUser.reduce((s, p) => s + p.total_amount, 0)
  }, [storeId, user?.id, today])

  // ── Sisa stok toko ───────────────────────────────────────────
  const stokSisa = useLiveQuery(async () => {
    const stocks = await db.stock.where('store_id').equals(storeId).toArray()
    const prods  = await db.products.toArray()
    const mats   = await db.materials.toArray()
    let fgList: any[] = []
    try { fgList = await (db as any).finished_goods_stock?.toArray() ?? [] } catch {}
    const pMap  = Object.fromEntries(prods.map(p => [p.id, p.name]))
    const mMap  = Object.fromEntries(mats.map(m => [m.id, m.name]))
    const fgMap = Object.fromEntries(fgList.map((f: any) => [f.product_id ?? f.id, f.product_name ?? f.name]))
    const uMap  = Object.fromEntries([...prods.map(p => [p.id, p.unit]), ...mats.map(m => [m.id, m.unit])])
    return stocks
      .filter(s => { const id = s.ingredient_id || (s as any).product_id || ''; return !!(pMap[id] || mMap[id] || fgMap[id]) })
      .map(s => {
        const id = s.ingredient_id || (s as any).product_id || ''
        return { id: s.id, name: pMap[id] || mMap[id] || fgMap[id] || id, qty: s.qty_on_hand, unit: uMap[id] || 'pcs' }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [storeId])

  // ── Kalkulasi ────────────────────────────────────────────────
  const totalPenjualan   = todayData?.totalPenjualan || 0
  const totalBiaya       = biayaHariIni || 0
  const totalPembelian   = pembelianHariIni || 0
  const saldoAwalNum     = Number(saldoAwal)     || 0
  const saldoTambahanNum = Number(saldoTambahan) || 0
  const totalSetorNum    = Number(totalSetor)    || 0
  const uangFisikNum     = Number(uangFisik)     || 0
  const cashPenjualan    = todayData?.byMethod['cash'] || 0
  const saldoAkhir       = saldoAwalNum + saldoTambahanNum + cashPenjualan - totalSetorNum - totalBiaya
  const selisih          = uangFisikNum - saldoAkhir

  // ── Generate teks WhatsApp ───────────────────────────────────
  function generateWAText(report: any): string {
    const tgl = new Date(today).toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    const lines: string[] = [
      `*CLOSE ORDER ${storeName.toUpperCase()}*`,
      `_${tgl}_`,
      '',
      `*Penjualan Hari Ini*`,
      `Tunai      : ${formatRupiah(report.total_cash)}`,
      `QRIS       : ${formatRupiah(report.total_qris)}`,
      `Transfer   : ${formatRupiah(report.total_transfer)}`,
      `GoPay/GF   : ${formatRupiah(report.total_gopay)}`,
      `GrabFood   : ${formatRupiah(report.total_grab)}`,
      `ShopeeFood : ${formatRupiah(report.total_shopeefood)}`,
      `*Total     : ${formatRupiah(report.total_penjualan)}*`,
      `(${todayData?.txCount || 0} transaksi)`,
      '',
      `*Laporan Kas*`,
      `Saldo Awal     : ${formatRupiah(report.saldo_awal)}`,
      `Saldo Tambahan : ${formatRupiah(report.saldo_tambahan)}`,
      `Penjualan Tunai: ${formatRupiah(report.total_cash)}`,
      `Total Setor    : -${formatRupiah(report.total_setor)}`,
      totalBiaya > 0 ? `Total Biaya    : -${formatRupiah(report.total_biaya)}` : '',
      `*Saldo Akhir   : ${formatRupiah(report.saldo_akhir)}*`,
      `Uang Fisik     : ${formatRupiah(report.uang_fisik)}`,
      `*Selisih       : ${report.selisih >= 0 ? '+' : ''}${formatRupiah(report.selisih)}*`,
    ].filter(l => l !== null)

    if (stokSisa && stokSisa.length > 0) {
      lines.push('', '*Sisa Stok*')
      stokSisa.forEach(s => lines.push(`${s.name}: ${s.qty} ${s.unit}`))
    }

    if (report.notes) lines.push('', `Catatan: ${report.notes}`)
    lines.push('', `_Dikirim via Coco Puff POS_`)
    return lines.join('\n')
  }

  function shareWhatsApp(report: any) {
    const text = generateWAText(report)
    const encoded = encodeURIComponent(text)
    window.open(`https://wa.me/?text=${encoded}`, '_blank')
  }

  // ── Simpan ───────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      const reportData = {
        id:               generateId(),
        store_id:         storeId,
        report_date:      today,
        saldo_awal:       saldoAwalNum,
        saldo_tambahan:   saldoTambahanNum,
        total_penjualan:  totalPenjualan,
        total_cash:       cashPenjualan,
        total_non_tunai:  todayData?.totalNonTunai || 0,
        total_qris:       todayData?.byMethod['qris']       || 0,
        total_gopay:      todayData?.byMethod['gopay']      || 0,
        total_grab:       todayData?.byMethod['grab']       || 0,
        total_shopeefood: todayData?.byMethod['shopeefood'] || 0,
        total_transfer:   todayData?.byMethod['transfer']   || 0,
        total_setor:      totalSetorNum,
        total_biaya:      totalBiaya,
        total_pembelian:  totalPembelian,
        saldo_akhir:      saldoAkhir,
        uang_fisik:       uangFisikNum,
        selisih,
        notes:            notes || undefined,
        submitted_by:     user?.id,
        submitted_at:     now(),
      }
      const { error } = await supabase.from('close_order_reports').upsert(reportData)
      if (error) throw error
      setSavedReport(reportData)
      setSaved(true)
      toast.success('Close Order disimpan!')
    } catch (e) {
      console.error(e)
      toast.error('Gagal simpan. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Close Order</h1>
          <p className="text-xs text-gray-400">
            {new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400">
          <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* Input Manual */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Input Manual</p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Saldo Awal" value={saldoAwal} onChange={setSaldoAwal}
              hint={saldoAwal ? undefined : 'Auto dari kemarin'} />
            <NumInput label="Saldo Tambahan" value={saldoTambahan} onChange={setSaldoTambahan} />
            <NumInput label="Total Setor ke Pusat" value={totalSetor} onChange={setTotalSetor} />
            <NumInput label="Uang Fisik di Laci" value={uangFisik} onChange={setUangFisik} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Catatan</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
          </div>
        </div>

        {/* Penjualan per Metode — auto detect */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Penjualan Hari Ini</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {PAY_METHODS.map(m => (
              <div key={m.key} className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-400">{m.label}</p>
                <p className="text-sm font-semibold text-gray-900">{formatRupiah(todayData?.byMethod[m.key] || 0)}</p>
              </div>
            ))}
          </div>
          <Row label="Total Penjualan" value={totalPenjualan} highlight />
          <p className="text-xs text-gray-400 mt-1">{todayData?.txCount || 0} transaksi · Auto dari sistem</p>
        </div>

        {/* Laporan Kas */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Laporan Kas</p>
          <Row label="Saldo Awal"         value={saldoAwalNum} />
          <Row label="Saldo Tambahan"     value={saldoTambahanNum} />
          <Row label="Penjualan Tunai"    value={cashPenjualan} sub="Auto dari sistem" />
          <Row label="Total Setor"        value={totalSetorNum}    negative />
          {totalBiaya > 0   && <Row label="Total Biaya"    value={totalBiaya}    negative sub="Auto dari sistem" />}
          {totalPembelian > 0 && <Row label="Total Pembelian" value={totalPembelian} negative sub="Auto dari sistem" />}
          <Row label="Saldo Akhir"        value={saldoAkhir}       highlight />
          <Row label="Uang Fisik di Laci" value={uangFisikNum} />
          <div className="flex items-center justify-between py-3 border-t border-gray-200 mt-1">
            <span className="text-sm font-semibold text-gray-900">Selisih</span>
            <div className="flex items-center gap-1.5">
              {selisih === 0 ? <CheckCircle size={14} className="text-green-500" /> : <AlertCircle size={14} className="text-red-500" />}
              <span className={`text-base font-bold ${selisih === 0 ? 'text-green-600' : selisih > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {selisih > 0 ? '+' : ''}{formatRupiah(selisih)}
              </span>
            </div>
          </div>
        </div>

        {/* Produk Terjual */}
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

        {/* Sisa Stok */}
        {stokSisa && stokSisa.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Sisa Stok</p>
            {stokSisa.map((s, idx) => (
              <div key={s.id} className={`flex items-center justify-between px-4 py-2.5 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                <p className="text-sm text-gray-800">{s.name}</p>
                <p className="text-sm font-medium text-gray-900">{s.qty} <span className="text-xs text-gray-400">{s.unit}</span></p>
              </div>
            ))}
          </div>
        )}

        {/* Tombol Simpan + Share WA */}
        {!saved ? (
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan Close Order'}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-700 font-medium">Close Order berhasil disimpan</p>
            </div>
            <button onClick={() => shareWhatsApp(savedReport)}
              className="w-full py-3.5 rounded-xl bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-2">
              <Share2 size={16} />
              Share ke WhatsApp
            </button>
            <button onClick={() => { setSaved(false); setSavedReport(null) }}
              className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">
              Edit & Simpan Ulang
            </button>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  )
}
