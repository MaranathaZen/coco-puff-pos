// Pendukung opname/edit stok berbasis SELISIH + Kartu Stok (riwayat gerakan).
// Lihat db/2026-10-13_stock_movements.sql (stock_movements diisi trigger server).
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchServerQty, type StockTable } from '@/lib/stockOps'

// Angka stok TERBARU dari server saat form dibuka -> jadi baseline opname.
export function useServerBaseline(table: StockTable, key: string | undefined, storeId: string | undefined,
  localQty: number, name?: string) {
  const [state, setState] = useState<{ baseline: number; rowExists: boolean; fromServer: boolean; at: Date | null; loading: boolean }>(
    { baseline: localQty, rowExists: false, fromServer: false, at: null, loading: !!key })
  useEffect(() => {
    if (!key) { setState(s => ({ ...s, loading: false })); return }
    let alive = true
    setState(s => ({ ...s, loading: true }))
    fetchServerQty(table, key, storeId, name).then(r => {
      if (!alive) return
      if (r) setState({ baseline: r.qty, rowExists: !!r.rowId, fromServer: true, at: r.at, loading: false })
      else setState({ baseline: localQty, rowExists: localQty !== 0, fromServer: false, at: null, loading: false })
    })
    return () => { alive = false }
  }, [table, key, storeId])
  return state
}

// Info baseline di form: dari server (jam) atau peringatan offline
export function BaselineInfo({ b, unit }: { b: ReturnType<typeof useServerBaseline>; unit?: string }) {
  if (b.loading) return <p className="text-xs text-gray-400 mt-1">Mengambil stok terbaru dari server...</p>
  if (!b.fromServer) return (
    <p className="text-xs text-amber-600 mt-1">⚠ Offline — stok sistem dari perangkat ini ({b.baseline} {unit}), mungkin belum terbaru.</p>
  )
  return (
    <p className="text-xs text-gray-500 mt-1">
      Stok sistem: <b>{b.baseline} {unit}</b> (server, {b.at?.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}).
      Isi hasil hitung fisik — yang disimpan hanya selisihnya, penjualan selama menghitung tetap terhitung.
    </p>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  penjualan: 'Penjualan', void_penjualan: 'Void penjualan', mutasi: 'Mutasi', void_mutasi: 'Void mutasi',
  pembelian: 'Pembelian', void_pembelian: 'Void pembelian', produksi: 'Produksi', produksi_toko: 'Produksi toko',
  void_produksi: 'Void produksi', kirim_produk: 'Kirim produk jadi', opname: 'Opname / edit stok', stok_awal: 'Stok awal',
  antrian_lama: 'Antrian app lama', rpc_lama: 'App lama', tulis_langsung: '⚠ Ditulis langsung (app lama)',
  baris_baru_langsung: '⚠ Baris baru (app lama)', hapus_langsung: '⚠ Dihapus',
}

// Kartu stok: semua gerakan qty untuk 1 baris stok, terbaru di atas, dengan saldo.
export function KartuStok({ table, rowId, unit }: { table: StockTable; rowId: string | null | undefined; unit?: string }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<any[] | null>(null)
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open || !rowId) return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('stock_movements')
        .select('id, created_at, source, ref_id, delta, qty_before, qty_after')
        .eq('table_name', table).eq('row_id', rowId).order('id', { ascending: false }).limit(150)
      if (!alive) return
      if (error) { setErr('Gagal memuat (cek internet)'); return }
      setRows(data || [])
      // Nomor struk / mutasi / log produksi supaya bisa ditelusuri
      const ids = (s: string[]) => [...new Set((data || []).filter(r => s.includes(r.source) && r.ref_id).map(r => r.ref_id))]
      const map: Record<string, string> = {}
      const tx = ids(['penjualan', 'void_penjualan']), mu = ids(['mutasi', 'void_mutasi']), pl = ids(['produksi', 'produksi_toko', 'void_produksi'])
      const [a, b, c] = await Promise.all([
        tx.length ? supabase.from('transactions').select('id, receipt_no').in('id', tx) : Promise.resolve({ data: [] as any[] }),
        mu.length ? supabase.from('warehouse_mutations').select('id, mutation_number').in('id', mu) : Promise.resolve({ data: [] as any[] }),
        pl.length ? supabase.from('production_logs').select('id, log_number').in('id', pl) : Promise.resolve({ data: [] as any[] }),
      ])
      for (const r of (a as any).data || []) map[r.id] = r.receipt_no
      for (const r of (b as any).data || []) map[r.id] = r.mutation_number
      for (const r of (c as any).data || []) map[r.id] = r.log_number
      if (alive) setRefs(map)
    })()
    return () => { alive = false }
  }, [open, rowId, table])

  if (!rowId) return null
  const fmt = (n: any) => (Math.round(Number(n) * 100) / 100).toLocaleString('id-ID')
  return (
    <div className="border border-gray-100 rounded-xl">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700">
        <span>📋 Kartu stok (riwayat gerakan)</span>
        <span className="text-gray-400 text-xs">{open ? 'Tutup' : 'Lihat'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 max-h-72 overflow-auto">
          {err && <p className="text-xs text-red-500 px-3 py-2">{err}</p>}
          {!err && rows === null && <p className="text-xs text-gray-400 px-3 py-2">Memuat...</p>}
          {rows?.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">Belum ada gerakan tercatat (riwayat dicatat mulai 13 Okt 2026).</p>}
          {rows?.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-gray-50 text-xs">
              <div className="min-w-0">
                <p className="text-gray-700 truncate">{SOURCE_LABEL[r.source] || r.source}{r.ref_id && refs[r.ref_id] ? ` · ${refs[r.ref_id]}` : ''}</p>
                <p className="text-gray-400">{new Date(r.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-semibold ${Number(r.delta) < 0 ? 'text-red-600' : 'text-green-600'}`}>{Number(r.delta) > 0 ? '+' : ''}{fmt(r.delta)}</p>
                <p className="text-gray-400">saldo {fmt(r.qty_after ?? 0)} {unit}</p>
              </div>
            </div>
          ))}
          {rows && rows.length > 0 && <p className="text-[10px] text-gray-400 px-3 py-1.5">Riwayat dicatat mulai 13 Okt 2026 · 150 gerakan terakhir</p>}
        </div>
      )}
    </div>
  )
}
