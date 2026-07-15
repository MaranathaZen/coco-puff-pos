// src/pages/cashier/EndOfDayPage.tsx
// CHANGELOG v6:
// - DESKTOP: layout 3 kolom (Input Manual | Penjualan | Laporan Kas) + (Void | Produk | Stok)
// - DESKTOP: tombol Simpan & Share WhatsApp di pojok kanan atas header
// - MOBILE: tidak ada perubahan sama sekali
// - FIX: floating point qty stok (103.400000... → 103.4)

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { RefreshCw, CheckCircle, AlertCircle, Share2, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

const PAY_METHODS = [
  { key: 'cash', label: 'Tunai' },
  { key: 'qris', label: 'QRIS' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'gopay', label: 'GoPay/GoFood' },
  { key: 'grab', label: 'GrabFood' },
  { key: 'shopeefood', label: 'ShopeeFood' },
]

function NumInput({ label, value, onChange, placeholder, hint, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; hint?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input
        className={`input ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        inputMode="decimal" pattern="[0-9]*" value={value}
        onChange={e => !disabled && onChange(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder={placeholder || '0'} autoComplete="off" readOnly={disabled} />
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
  const storeId = user?.store_id || ''
  const storeName = store?.name || 'Toko'
  const today = new Date().toLocaleDateString('sv-SE')

  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedReport, setSavedReport] = useState<any>(null)
  const [existingReport, setExistingReport] = useState<any>(null)
  const [checkingExisting, setCheckingExisting] = useState(true)

  const [saldoAwal, setSaldoAwal] = useState('')
  const [saldoTambahan, setSaldoTambahan] = useState('')
  const [totalSetor, setTotalSetor] = useState('')
  const [uangFisik, setUangFisik] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    async function checkExisting() {
      setCheckingExisting(true)
      try {
        const { data } = await supabase
          .from('close_order_reports').select('*')
          .eq('store_id', storeId).eq('report_date', today).maybeSingle()
        if (data) {
          setExistingReport(data); setSaved(true); setSavedReport(data)
          setSaldoAwal(String(data.saldo_awal || 0))
          setSaldoTambahan(String(data.saldo_tambahan || 0))
          setTotalSetor(String(data.total_setor || 0))
          setUangFisik(String(data.uang_fisik || 0))
          setNotes(data.notes || '')
        } else {
          const { data: prev } = await supabase
            .from('close_order_reports').select('saldo_akhir, uang_fisik, report_date')
            .eq('store_id', storeId).order('report_date', { ascending: false })
            .limit(1).maybeSingle()
          if (prev?.uang_fisik != null && prev.uang_fisik > 0) {
            setSaldoAwal(String(Math.max(0, prev.uang_fisik)))
            toast.success(`Saldo awal Rp ${prev.uang_fisik.toLocaleString('id-ID')} dari ${prev.report_date} (uang fisik laci)`, { duration: 3000 })
          }
        }
      } catch { }
      setCheckingExisting(false)
    }
    checkExisting()
  }, [storeId, today])

  async function syncData() {
    setSyncing(true)
    try {
      const [txRes, tiRes, prodRes, stockRes, matsRes, expRes, purRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('store_id', storeId).gte('created_at', today + 'T00:00:00+07:00'),
        supabase.from('transaction_items').select('*'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('stock').select('*').eq('store_id', storeId),
        supabase.from('materials').select('*'),
        supabase.from('warehouse_expenses').select('*').eq('store_id', storeId),
        supabase.from('purchases').select('*').eq('store_id', storeId),
      ])
      if (txRes.data?.length) await db.transactions.bulkPut(txRes.data)
      if (tiRes.data?.length) await db.transaction_items.bulkPut(tiRes.data)
      if (prodRes.data?.length) await db.products.bulkPut(prodRes.data)
      if (stockRes.data?.length) await db.stock.bulkPut(stockRes.data)
      if (matsRes.data?.length) await db.materials.bulkPut(matsRes.data)
      if (expRes.data?.length) await db.warehouse_expenses.bulkPut(expRes.data)
      if (purRes.data?.length) await db.purchases.bulkPut(purRes.data)
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  const todayData = useLiveQuery(async () => {
    const allTxs = await db.transactions
      .filter(t => t.store_id === storeId && new Date(t.created_at).toLocaleDateString('sv-SE') === today)
      .toArray()
    const completedTxs = allTxs.filter(t => t.status === 'completed')
    const voidedTxs = allTxs.filter(t => t.status === 'voided')
    const reqVoidTxs = allTxs.filter(t => (t as any).status === 'void_requested')
    const allItems = await db.transaction_items.toArray()
    const prods = await db.products.toArray()
    const pMap = Object.fromEntries(prods.map(p => [p.id, p]))

    const byMethod: Record<string, number> = {}
    PAY_METHODS.forEach(m => { byMethod[m.key] = 0 })
    for (const tx of completedTxs) {
      byMethod[tx.payment_method] = (byMethod[tx.payment_method] || 0) + tx.total
    }

    const soldMap: Record<string, { name: string; qty: number; total: number }> = {}
    for (const tx of completedTxs) {
      for (const item of allItems.filter(i => i.transaction_id === tx.id)) {
        const prod = pMap[item.product_id]; if (!prod) continue
        if (!soldMap[item.product_id]) soldMap[item.product_id] = { name: prod.name, qty: 0, total: 0 }
        const qty = (item as any).qty ?? ((item as any).qty_eceran ?? 0) + ((item as any).qty_dus ?? 0)
        soldMap[item.product_id].qty += qty
        soldMap[item.product_id].total += item.subtotal ?? (qty * ((item as any).unit_price ?? 0))
      }
    }

    const totalPenjualan = completedTxs.reduce((s, t) => s + t.total, 0)
    const totalNonTunai = totalPenjualan - (byMethod['cash'] || 0)
    const totalVoid = voidedTxs.reduce((s, t) => s + t.total, 0)

    return {
      txs: completedTxs, byMethod, soldMap,
      totalPenjualan, totalNonTunai, txCount: completedTxs.length,
      voidCount: voidedTxs.length, totalVoid,
      reqVoidCount: reqVoidTxs.length,
    }
  }, [storeId, today])

  const biayaHariIni = useLiveQuery(async () => {
    const byStore = await db.warehouse_expenses
      .filter(e => (e as any).store_id === storeId && new Date(e.created_at).toLocaleDateString('sv-SE') === today)
      .toArray()
    if (byStore.length) return byStore.reduce((s, e) => s + e.amount, 0)
    return (await db.warehouse_expenses
      .filter(e => e.created_by === user?.id && new Date(e.created_at).toLocaleDateString('sv-SE') === today)
      .toArray()).reduce((s, e) => s + e.amount, 0)
  }, [storeId, user?.id, today])

  const pembelianHariIni = useLiveQuery(async () => {
    const byStore = await db.purchases
      .filter(p => (p as any).store_id === storeId && (p as any).status !== 'voided' && new Date(p.created_at).toLocaleDateString('sv-SE') === today)
      .toArray()
    if (byStore.length) return byStore.reduce((s, p) => s + p.total_amount, 0)
    return (await db.purchases
      .filter(p => p.created_by === user?.id && (p as any).status !== 'voided' && new Date(p.created_at).toLocaleDateString('sv-SE') === today)
      .toArray()).reduce((s, p) => s + p.total_amount, 0)
  }, [storeId, user?.id, today])

  const stokSisa = useLiveQuery(async () => {
    const stocks = await db.stock.where('store_id').equals(storeId).toArray()
    const prods = await db.products.toArray()
    const mats = await db.materials.toArray()
    let fgList: any[] = []
    try { fgList = await (db as any).finished_goods_stock?.toArray() ?? [] } catch { }
    const pMap = Object.fromEntries(prods.map(p => [p.id, p.name]))
    const mMap = Object.fromEntries(mats.map(m => [m.id, m.name]))
    const fgMap = Object.fromEntries(fgList.map((f: any) => [f.product_id ?? f.id, f.product_name ?? f.name]))
    const uMap = Object.fromEntries([...prods.map(p => [p.id, p.unit]), ...mats.map(m => [m.id, m.unit])])
    return stocks
      .filter(s => { const id = s.ingredient_id || (s as any).product_id || ''; return !!(pMap[id] || mMap[id] || fgMap[id]) })
      .map(s => { const id = s.ingredient_id || (s as any).product_id || ''; return { id: s.id, name: pMap[id] || mMap[id] || fgMap[id] || id, qty: Math.round(s.qty_on_hand * 100) / 100, unit: uMap[id] || 'pcs' } })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [storeId])

  const totalPenjualan = todayData?.totalPenjualan || 0
  const totalBiaya = biayaHariIni || 0
  const totalPembelian = pembelianHariIni || 0
  const saldoAwalNum = Number(saldoAwal) || 0
  const saldoTambahanNum = Number(saldoTambahan) || 0
  const totalSetorNum = Number(totalSetor) || 0
  const uangFisikNum = Number(uangFisik) || 0
  const cashPenjualan = todayData?.byMethod['cash'] || 0
  const saldoAkhir = saldoAwalNum + saldoTambahanNum + cashPenjualan - totalSetorNum - totalBiaya - totalPembelian
  const selisih = uangFisikNum - saldoAkhir

  function generateWAText(report: any): string {
    const tgl = new Date(today).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const lines = [
      `*CLOSE ORDER ${storeName.toUpperCase()}*`,
      `_${tgl}_`,
      '',
      '*Penjualan Hari Ini*',
      `Tunai      : ${formatRupiah(report.total_cash)}`,
      `QRIS       : ${formatRupiah(report.total_qris)}`,
      `Transfer   : ${formatRupiah(report.total_transfer)}`,
      `GoPay/GF   : ${formatRupiah(report.total_gopay)}`,
      `GrabFood   : ${formatRupiah(report.total_grab)}`,
      `ShopeeFood : ${formatRupiah(report.total_shopeefood)}`,
      `Non Tunai  : ${formatRupiah((report.total_penjualan || 0) - (report.total_cash || 0))}`,
      `*Total     : ${formatRupiah(report.total_penjualan)}*`,
      `(${todayData?.txCount || 0} transaksi)`,
      todayData?.voidCount ? `*Void: ${todayData.voidCount} transaksi (${formatRupiah(todayData.totalVoid)})*` : '',
      '',
      `*Laporan Kas*`,
      `Saldo Awal      : ${formatRupiah(report.saldo_awal)}`,
      `Saldo Tambahan  : ${formatRupiah(report.saldo_tambahan)}`,
      `Penjualan Tunai : ${formatRupiah(report.total_cash)}`,
      `Total Setor     : -${formatRupiah(report.total_setor)}`,
      report.total_biaya > 0 ? `Total Biaya     : -${formatRupiah(report.total_biaya)}` : '',
      report.total_pembelian > 0 ? `Total Pembelian : -${formatRupiah(report.total_pembelian)}` : '',
      `*Saldo Akhir    : ${formatRupiah(report.saldo_akhir)}*`,
      `Uang Fisik      : ${formatRupiah(report.uang_fisik)}`,
      `*Selisih        : ${report.selisih >= 0 ? '+' : ''}${formatRupiah(report.selisih)}*`,
    ].filter(Boolean)
    if (stokSisa?.length) {
      lines.push('', '*Sisa Stok*')
      stokSisa.forEach(s => lines.push(`${s.name}: ${s.qty} ${s.unit}`))
    }
    if (report.notes) lines.push('', `Catatan: ${report.notes}`)
    lines.push('', '_Dikirim via Coco Puff POS_')
    return lines.join('\n')
  }

  function shareWhatsApp(report: any) {
    window.open(`https://wa.me/?text=${encodeURIComponent(generateWAText(report))}`, '_blank')
  }

  async function handleSave() {
    if (!saldoAwal || Number(saldoAwal) <= 0) return toast.error('Saldo awal wajib diisi dan lebih dari 0')
    if (!uangFisik || Number(uangFisik) <= 0) return toast.error('Uang fisik di laci wajib diisi dan lebih dari 0')
    if (!notes.trim()) return toast.error('Nama kasir wajib diisi')
    try {
      const { data: existing } = await supabase
        .from('close_order_reports').select('id')
        .eq('store_id', storeId).eq('report_date', today).maybeSingle()
      if (existing) {
        toast.error('Close Order hari ini sudah pernah disimpan!')
        setExistingReport(existing); setSaved(true); return
      }
    } catch { /* offline */ }

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
        voided_count: todayData?.voidCount || 0,
        voided_amount: todayData?.totalVoid || 0,
        saldo_akhir: saldoAkhir,
        uang_fisik: uangFisikNum,
        selisih,
        notes: notes || undefined,
        submitted_by: user?.id,
        submitted_at: now(),
      }
      // Durable: masuk sync_queue, push worker kirim saat online (offline-safe)
      await addToSyncQueue('close_order_reports', reportData.id, 'upsert' as any, reportData, storeId)

      if (totalSetorNum > 0) {
        const dep: any = {
          id: generateId(),
          store_id: storeId,
          amount: totalSetorNum,
          deposit_date: today,
          notes: `Auto dari Close Order ${today} — ${storeName}`,
          status: 'pending',
          created_by: user?.id,
          created_at: now(),
        }
        await addToSyncQueue('cash_deposits', dep.id, 'upsert' as any, dep, storeId)
      }

      setSavedReport(reportData); setSaved(true)
      toast.success('Close Order disimpan!' + (totalSetorNum > 0 ? ' Setoran otomatis dibuat.' : ''))
    } catch (e) {
      console.error(e)
      toast.error('Gagal simpan. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  if (checkingExisting) {
    return (
      <div className="flex flex-col h-full bg-gray-50 items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full mb-3" />
        <p className="text-sm text-gray-400">Memeriksa data...</p>
      </div>
    )
  }

  // ── SHARED SECTIONS ───────────────────────────────────────

  const sectionInputManual = (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 h-full">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Input Manual</p>
      <div className="grid grid-cols-2 gap-3">
        <NumInput label="Saldo Awal" value={saldoAwal} onChange={setSaldoAwal} disabled={!!existingReport} hint={saldoAwal ? undefined : 'Auto dari kemarin'} />
        <NumInput label="Saldo Tambahan" value={saldoTambahan} onChange={setSaldoTambahan} disabled={!!existingReport} />
        <NumInput label="Total Setor ke Pusat" value={totalSetor} onChange={setTotalSetor} disabled={!!existingReport}
          hint={!existingReport ? 'Otomatis masuk ke Setoran Kas' : undefined} />
        <NumInput label="Uang Fisik di Laci" value={uangFisik} onChange={setUangFisik} disabled={!!existingReport} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Kasir <span className="text-red-500">*</span></label>
        <input className={`input ${existingReport ? 'opacity-50 cursor-not-allowed' : ''}`}
          value={notes} onChange={e => !existingReport && setNotes(e.target.value)}
          placeholder="Nama kasir" readOnly={!!existingReport} required />
      </div>
    </div>
  )

  const sectionPenjualan = (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Penjualan Hari Ini</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {PAY_METHODS.map(m => (
          <div key={m.key} className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-400">{m.label}</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatRupiah(existingReport
                ? (existingReport[`total_${m.key}`] || 0)
                : (todayData?.byMethod[m.key] || 0))}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 rounded-lg p-2.5 mb-2">
        <p className="text-xs text-blue-600">Total Non Tunai (QRIS + Transfer + dll)</p>
        <p className="text-sm font-semibold text-blue-700">
          {formatRupiah(existingReport
            ? ((existingReport.total_penjualan || 0) - (existingReport.total_cash || 0))
            : (todayData?.totalNonTunai || 0))}
        </p>
      </div>
      <Row label="Total Penjualan" value={existingReport?.total_penjualan ?? totalPenjualan} highlight />
      <p className="text-xs text-gray-400 mt-1">{todayData?.txCount || 0} transaksi · Auto dari sistem</p>
    </div>
  )

  const sectionProdukTerjual = todayData?.soldMap && Object.keys(todayData.soldMap).length > 0 ? (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden h-full">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Produk Terjual</p>
      {Object.values(todayData.soldMap).sort((a, b) => b.qty - a.qty).map((item, idx) => (
        <div key={idx} className={`flex items-center justify-between px-4 py-2.5 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
          <p className="text-sm text-gray-800">{item.name}</p>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{item.qty} pcs</p>
            <p className="text-xs text-gray-400">{formatRupiah(item.total)}</p>
          </div>
        </div>
      ))}
    </div>
  ) : null

  const sectionSisaStok = stokSisa && stokSisa.length > 0 ? (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden h-full">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50">Sisa Stok</p>
      {stokSisa.map((s, idx) => (
        <div key={s.id} className={`flex items-center justify-between px-4 py-2.5 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
          <p className="text-sm text-gray-800">{s.name}</p>
          <p className="text-sm font-medium text-gray-900">
            {s.qty} <span className="text-xs text-gray-400">{s.unit}</span>
          </p>
        </div>
      ))}
    </div>
  ) : null

  const sectionLaporanKas = (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Laporan Kas</p>
      <Row label="Saldo Awal" value={saldoAwalNum} />
      <Row label="Saldo Tambahan" value={saldoTambahanNum} />
      <Row label="Penjualan Tunai" value={cashPenjualan} sub="Auto dari sistem" />
      <Row label="Total Setor" value={totalSetorNum} negative />
      {totalBiaya > 0 && <Row label="Total Biaya" value={totalBiaya} negative sub="Auto dari sistem" />}
      {totalPembelian > 0 && <Row label="Total Pembelian" value={totalPembelian} negative sub="Auto dari sistem" />}
      <Row label="Saldo Akhir" value={existingReport?.saldo_akhir ?? saldoAkhir} highlight />
      <Row label="Uang Fisik di Laci" value={uangFisikNum} />
      <div className="flex items-center justify-between py-3 border-t border-gray-200 mt-1">
        <span className="text-sm font-semibold text-gray-900">Selisih</span>
        <div className="flex items-center gap-1.5">
          {(existingReport?.selisih ?? selisih) === 0
            ? <CheckCircle size={14} className="text-green-500" />
            : <AlertCircle size={14} className="text-red-500" />}
          <span className={`text-base font-bold ${(existingReport?.selisih ?? selisih) === 0 ? 'text-green-600' :
            (existingReport?.selisih ?? selisih) > 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {(existingReport?.selisih ?? selisih) > 0 ? '+' : ''}{formatRupiah(existingReport?.selisih ?? selisih)}
          </span>
        </div>
      </div>
    </div>
  )

  const sectionVoid = ((todayData?.voidCount || 0) > 0 || (todayData?.reqVoidCount || 0) > 0) ? (
    <div className="bg-red-50 border border-red-100 rounded-xl p-4">
      <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Void Hari Ini</p>
      {(todayData?.voidCount || 0) > 0 && (
        <div className="flex justify-between text-sm mb-1">
          <span className="text-red-600">Disetujui</span>
          <span className="font-semibold text-red-700">{todayData?.voidCount} transaksi · {formatRupiah(todayData?.totalVoid || 0)}</span>
        </div>
      )}
      {(todayData?.reqVoidCount || 0) > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-amber-600">Pending Approval</span>
          <span className="font-semibold text-amber-700">{todayData?.reqVoidCount} transaksi</span>
        </div>
      )}
    </div>
  ) : null

  const sectionActions = !saved ? (
    <button onClick={handleSave} disabled={saving}
      className="w-full py-3.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
      {saving ? 'Menyimpan...' : 'Simpan Close Order'}
    </button>
  ) : (
    <div className="space-y-3">
      <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center gap-2">
        <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
        <div>
          <p className="text-sm text-green-700 font-medium">Close Order sudah tersimpan</p>
          {existingReport?.submitted_at && (
            <p className="text-xs text-green-600">
              {new Date(existingReport.submitted_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </p>
          )}
        </div>
      </div>
      <button onClick={() => shareWhatsApp(savedReport || existingReport)}
        className="w-full py-3.5 rounded-xl bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-2">
        <Share2 size={16} />Share ke WhatsApp
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Close Order</h1>
          <p className="text-xs text-gray-400">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Desktop: tombol aksi di header */}
          {saved && (
            <button onClick={() => shareWhatsApp(savedReport || existingReport)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-medium">
              <Share2 size={14} /> Share WhatsApp
            </button>
          )}
          {!saved && !existingReport && (
            <button onClick={handleSave} disabled={saving}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan Close Order'}
            </button>
          )}
          <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">

        {/* ── MOBILE LAYOUT (default) ── */}
        <div className="md:hidden p-4 space-y-4">
          {existingReport && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <Lock size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Close Order sudah disimpan hari ini</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Disimpan pukul {existingReport.submitted_at
                    ? new Date(existingReport.submitted_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
                    : '-'}
                </p>
              </div>
            </div>
          )}
          {sectionInputManual}
          {sectionPenjualan}
          {sectionVoid}
          {sectionLaporanKas}
          {sectionProdukTerjual}
          {sectionSisaStok}
          {sectionActions}
          <div className="h-4" />
        </div>

        {/* ── DESKTOP LAYOUT (md+) ── */}
        <div className="hidden md:block px-6 py-4">
          <div className="space-y-3">

            {/* Banner sudah disimpan */}
            {existingReport && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <Lock size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Close Order sudah disimpan hari ini</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Disimpan pukul {existingReport.submitted_at
                      ? new Date(existingReport.submitted_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
                      : '-'}
                  </p>
                </div>
              </div>
            )}

            {/* Row 1: Input Manual | Penjualan Hari Ini | Laporan Kas — 3 kolom */}
            <div className="grid grid-cols-3 gap-3 items-stretch">
              {sectionInputManual}
              {sectionPenjualan}
              {sectionLaporanKas}
            </div>

            {/* Row 2: Void (kiri) + Produk Terjual | Sisa Stok (kanan full) */}
            {sectionVoid && (
              <div>{sectionVoid}</div>
            )}
            <div className="grid grid-cols-2 gap-3 items-start">
              {sectionProdukTerjual ?? <div />}
              {sectionSisaStok ?? <div />}
            </div>

            {/* Actions — hanya mobile, desktop sudah di header */}
            <div className="md:hidden">{sectionActions}</div>
            <div className="h-4" />
          </div>
        </div>

      </div>
    </div>
  )
}
