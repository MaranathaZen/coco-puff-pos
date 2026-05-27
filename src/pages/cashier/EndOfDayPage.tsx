// src/pages/cashier/EndOfDayPage.tsx
import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { CheckCircle, Printer } from 'lucide-react'
import toast from 'react-hot-toast'

export default function EndOfDayPage() {
  const { user, store, activeShift } = useAuthStore()
  const STORE_ID = user?.store_id || ''
  const today    = new Date().toISOString().slice(0, 10)
  const [setoran, setSetoran]   = useState('')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState(false)
  const [existingEod, setExisting] = useState<any>(null)

  // Cek apakah sudah ada EOD hari ini
  useEffect(() => {
    async function checkEod() {
      const { data } = await supabase.from('end_of_day')
        .select('*').eq('store_id', STORE_ID).eq('date', today).single()
      if (data) { setExisting(data); setDone(true) }
    }
    checkEod()
  }, [])

  // Data transaksi hari ini
  const transactions = useLiveQuery(async () => {
    const from = today + 'T00:00:00.000Z'
    const to   = today + 'T23:59:59.999Z'
    return db.transactions
      .where('store_id').equals(STORE_ID)
      .filter(t => t.created_at >= from && t.created_at <= to && t.status === 'completed')
      .toArray()
  }, [])

  // Data per produk hari ini
  const perProduk = useLiveQuery(async () => {
    if (!transactions?.length) return []
    const txIds = new Set(transactions.map(t => t.id))
    const items = await db.transaction_items.toArray()
    const filtered = items.filter(i => txIds.has(i.transaction_id))
    const map: Record<string, { name: string; qty: number; total: number }> = {}
    for (const i of filtered) {
      if (!map[i.product_id]) map[i.product_id] = { name: i.product_name, qty: 0, total: 0 }
      map[i.product_id].qty   += i.qty_eceran || 1
      map[i.product_id].total += i.subtotal
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [transactions])

  const totalSales    = transactions?.reduce((s, t) => s + t.total, 0) || 0
  const totalTrx      = transactions?.length || 0
  const cashAmount    = transactions?.filter(t => t.payment_method === 'cash').reduce((s, t) => s + t.total, 0) || 0
  const qrisAmount    = transactions?.filter(t => t.payment_method === 'qris').reduce((s, t) => s + t.total, 0) || 0
  const transferAmount= transactions?.filter(t => t.payment_method === 'transfer').reduce((s, t) => s + t.total, 0) || 0

  async function handleClose() {
    if (!['owner', 'manager', 'kasir'].includes(user?.role || '')) return toast.error('Tidak ada akses')
    setSaving(true)
    try {
      const eodId = generateId()
      const eod = {
        id: eodId, store_id: STORE_ID,
        shift_id: activeShift?.id || null,
        date: today,
        total_sales: totalSales, total_trx: totalTrx,
        cash_amount: cashAmount, qris_amount: qrisAmount,
        transfer_amount: transferAmount,
        setoran: Number(setoran) || 0,
        notes: notes || null,
        closed_by: user!.id, created_at: now(),
      }

      await supabase.from('end_of_day').upsert(eod)

      // Simpan per produk
      if (perProduk?.length) {
        const items = perProduk.map(p => ({
          id: generateId(), eod_id: eodId,
          product_id: Object.keys(p)[0] || generateId(),
          product_name: p.name, qty_sold: p.qty, revenue: p.total,
        }))
        await supabase.from('end_of_day_items').insert(items)
      }

      setExisting(eod)
      setDone(true)
      toast.success('Toko berhasil ditutup!')
    } catch (e) {
      toast.error('Gagal menutup toko')
      console.error(e)
    } finally { setSaving(false) }
  }

  function handlePrint() {
    const win = window.open('', '_blank', 'width=400,height=700')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head>
      <meta charset="UTF-8"><title>Laporan Tutup Toko</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Courier New', monospace; font-size: 11px; width: 58mm; margin: 0 auto; padding: 3mm; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        @media print { @page { size: 58mm auto; margin: 0; } }
      </style></head><body>
      <div class="center bold" style="font-size:13px">${store?.name || 'Coco Puff POS'}</div>
      <div class="center">Laporan Tutup Toko</div>
      <div class="center">${today}</div>
      <div class="divider"></div>
      <div class="row"><span>Total Transaksi</span><span>${totalTrx}</span></div>
      <div class="row bold"><span>Total Omzet</span><span>${formatRupiah(totalSales)}</span></div>
      <div class="divider"></div>
      <div class="row"><span>Tunai</span><span>${formatRupiah(cashAmount)}</span></div>
      <div class="row"><span>QRIS</span><span>${formatRupiah(qrisAmount)}</span></div>
      <div class="row"><span>Transfer</span><span>${formatRupiah(transferAmount)}</span></div>
      <div class="divider"></div>
      <div class="row bold"><span>Setoran</span><span>${formatRupiah(Number(setoran) || existingEod?.setoran || 0)}</span></div>
      <div class="divider"></div>
      <div class="center bold">Produk Terjual</div>
      ${(perProduk || []).map(p => `<div class="row"><span>${p.name}</span><span>${p.qty} pcs</span></div>`).join('')}
      <div class="divider"></div>
      <div class="center">Terima kasih</div>
      <script>window.onload = function(){ window.print(); window.close(); }</script>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tutup Toko</h1>
          <p className="text-xs text-gray-400 mt-0.5">{today}</p>
        </div>
        <button onClick={handlePrint} className="p-2 rounded-full text-gray-400">
          <Printer size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 mt-3">
        <div className="p-4 space-y-3">

          {done && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-sm font-medium text-green-700">Toko sudah ditutup hari ini</p>
            </div>
          )}

          {/* Ringkasan penjualan */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Ringkasan Penjualan</p>
            </div>
            <div className="px-4 py-3 flex justify-between">
              <p className="text-sm text-gray-700">Total Transaksi</p>
              <p className="text-sm font-medium text-gray-900">{totalTrx}</p>
            </div>
            <div className="px-4 py-3 flex justify-between border-t border-gray-50">
              <p className="text-sm font-semibold text-gray-700">Total Omzet</p>
              <p className="text-sm font-bold text-gray-900">{formatRupiah(totalSales)}</p>
            </div>
          </div>

          {/* Per metode bayar */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Metode Pembayaran</p>
            </div>
            {[
              { label: 'Tunai',    value: cashAmount },
              { label: 'QRIS',     value: qrisAmount },
              { label: 'Transfer', value: transferAmount },
            ].map((m, i) => (
              <div key={i} className={`px-4 py-3 flex justify-between ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                <p className="text-sm text-gray-700">{m.label}</p>
                <p className="text-sm font-medium text-gray-900">{formatRupiah(m.value)}</p>
              </div>
            ))}
          </div>

          {/* Produk terjual */}
          {(perProduk?.length || 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Produk Terjual</p>
              </div>
              {perProduk?.map((p, i) => (
                <div key={i} className={`px-4 py-3 flex justify-between ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <p className="text-sm text-gray-700">{p.name}</p>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{formatRupiah(p.total)}</p>
                    <p className="text-xs text-gray-400">{p.qty} pcs</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Setoran */}
          {!done && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Setoran ke Owner</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-gray-400 mb-1.5">Jumlah uang yang disetor</p>
                <input className="input text-lg font-semibold" type="number"
                  value={setoran} onChange={e => setSetoran(e.target.value)}
                  placeholder="0" />
              </div>
              <div className="px-4 py-3 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-1.5">Catatan</p>
                <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Opsional" />
              </div>
            </div>
          )}

          {done && existingEod && (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex justify-between">
              <p className="text-sm text-gray-700">Setoran</p>
              <p className="text-sm font-semibold text-gray-900">{formatRupiah(existingEod.setoran)}</p>
            </div>
          )}

          {/* Tombol tutup toko */}
          {!done && (
            <button onClick={handleClose} disabled={saving}
              className="w-full py-3.5 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? 'Memproses...' : <>
                <CheckCircle size={16} /> Tutup Toko & Cetak Laporan
              </>}
            </button>
          )}

          {done && (
            <button onClick={handlePrint}
              className="w-full py-3.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
              <Printer size={16} /> Cetak Ulang Laporan
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
