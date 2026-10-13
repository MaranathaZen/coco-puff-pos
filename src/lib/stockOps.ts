// Operasi stok "tambah/kurangi X" yang dijalankan SERVER (apply_stock_op, lihat
// db/2026-09-25_stock_ops_server.sql). HP hanya update tampilan lokal & antri
// operasinya — TIDAK lagi mengirim angka qty absolut yang bisa menimpa server
// (dulu mutasi masuk/hasil produksi menimpa penjualan yang terjadi sejak HP
// terakhir sync, dan pengurangan dilewati kalau baris tak ada di salinan HP).
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export type StockTable = 'stock' | 'production_stock' | 'warehouse_stock' | 'finished_goods_stock'

export interface StockOp {
  table: StockTable
  key: string                 // material_id (product_id untuk finished_goods_stock)
  delta: number               // + masuk, - keluar
  storeId?: string            // wajib untuk tabel 'stock'
  cost?: number               // harga per unit
  costMode?: 'none' | 'weighted' | 'set'  // none: cost hanya utk baris baru
  name?: string               // finished_goods_stock: product_name
  source: 'mutasi' | 'pembelian' | 'produksi' | 'produksi_toko' | 'kirim_produk' | 'opname' | 'stok_awal'
  refId?: string              // id mutasi / pembelian / log produksi
  queueStore: string          // konteks store_id antrian sync
}

const costCol = (t: StockTable) => (t === 'finished_goods_stock' ? 'hpp_per_unit' : 'avg_cost')

async function findLocal(o: StockOp): Promise<any> {
  if (o.table === 'stock')
    return db.stock.filter(s => s.store_id === o.storeId && ((s as any).material_id === o.key || s.ingredient_id === o.key)).first()
  if (o.table === 'finished_goods_stock')
    return db.finished_goods_stock.filter((f: any) => f.product_id === o.key || (!!o.name && f.product_name === o.name)).first()
  return (db as any)[o.table].where('material_id').equals(o.key).first()
}

export async function queueStockOp(o: StockOp) {
  const table = (db as any)[o.table]
  const col = costCol(o.table)
  const local = await findLocal(o)
  let rowId: string

  if (local) {
    // Tampilan lokal (angka resmi tetap dari server setelah operasi diterapkan)
    const cur = Math.max(0, Number(local.qty_on_hand) || 0)
    const qty = o.delta >= 0 ? cur + o.delta : Math.max(0, cur + o.delta)
    const upd: any = { qty_on_hand: qty, last_updated: now() }
    if (o.cost != null && o.costMode === 'weighted' && o.delta > 0)
      upd[col] = qty > 0 ? (cur * (Number(local[col]) || 0) + o.delta * o.cost) / qty : o.cost
    if (o.cost != null && o.costMode === 'set') upd[col] = o.cost
    await table.update(local.id, upd)
    rowId = local.id
  } else if (o.delta > 0) {
    // Belum ada di HP: buat baris sementara; server pakai id ini kalau memang baris baru,
    // atau mengembalikan baris yang sudah ada (baris sementara lalu diganti).
    rowId = generateId()
    const row: any = { id: rowId, qty_on_hand: o.delta, last_updated: now(), [col]: o.cost ?? 0 }
    if (o.table === 'stock') Object.assign(row, { store_id: o.storeId, material_id: o.key, ingredient_id: o.key })
    else if (o.table === 'finished_goods_stock') Object.assign(row, { product_id: o.key, product_name: o.name || o.key })
    else row.material_id = o.key
    await table.put(row)
  } else {
    rowId = o.key  // pengurangan tanpa baris lokal: server yang cari, dan mencatat kalau memang tak ada
  }

  await addToSyncQueue(o.table, rowId, 'stock_op', {
    table: o.table, store_id: o.storeId ?? null, key: o.key, delta: o.delta,
    cost: o.cost ?? null, cost_mode: o.costMode ?? 'none', name: o.name ?? null,
    local_id: rowId, source: o.source, ref_id: o.refId ?? null,
  }, o.queueStore)
}

// ── Opname / edit stok: kirim SELISIH, bukan menimpa angka ───────────────────
// Ambil angka stok TERBARU dari server saat form dibuka (baseline). Saat simpan,
// yang dikirim hanya (hasil hitung - baseline), jadi penjualan yang terjadi selama
// admin menghitung tetap terhitung. Dulu form menulis qty absolut dari salinan
// perangkat -> penjualan sejak perangkat terakhir sync tertimpa (selisih acak).
export interface ServerQty { qty: number; rowId: string | null; at: Date; fromServer: boolean }

export async function fetchServerQty(table: StockTable, key: string, storeId?: string, name?: string): Promise<ServerQty | null> {
  try {
    let qb: any = supabase.from(table).select('id, qty_on_hand')
    if (table === 'stock') qb = qb.eq('store_id', storeId).or(`material_id.eq.${key},ingredient_id.eq.${key}`)
    else if (table === 'finished_goods_stock') qb = qb.eq('product_id', key)
    else qb = qb.eq('material_id', key)
    const { data, error } = await qb.order('last_updated', { ascending: false }).limit(1)
    if (error) throw error
    let row = data?.[0]
    if (!row && table === 'finished_goods_stock' && name) {
      const r2 = await supabase.from(table).select('id, qty_on_hand').eq('product_name', name).limit(1)
      row = r2.data?.[0]
    }
    return { qty: Number(row?.qty_on_hand) || 0, rowId: row?.id ?? null, at: new Date(), fromServer: true }
  } catch {
    return null   // offline / gagal: pemanggil pakai angka lokal + peringatan
  }
}

// Terapkan hasil opname: target qty dibanding baseline -> kirim selisih (+ cost bila berubah)
export async function queueStockAdjust(o: Omit<StockOp, 'delta'> & { target: number; baseline: number; costChanged?: boolean; rowExists: boolean }) {
  const delta = Math.round((o.target - o.baseline) * 1e6) / 1e6
  const withCost = o.costChanged && o.cost != null
  if (delta === 0 && !withCost) return false
  if (delta === 0 && !o.rowExists) return false          // ubah harga baris yg belum ada: abaikan
  // costMode 'set' kalau harga diubah; selain itu cost hanya dipakai bila baris baru dibuat
  await queueStockOp({ ...o, delta, costMode: withCost ? 'set' : 'none' })
  return true
}
