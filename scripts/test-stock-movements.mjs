// Uji riwayat gerakan stok di dalam BEGIN ... ROLLBACK (TIDAK ada yang tersimpan).
// DB_URL=<pooler> STORE=<store_id> node scripts/test-stock-movements.mjs
import pg from 'pg'
import { readFileSync } from 'node:fs'
const c = new pg.Client({ connectionString: process.env.DB_URL }); await c.connect()
const q = (s, p) => c.query(s, p).then(r => r.rows)
const STORE = process.env.STORE
let ok = 0, fail = 0
const check = (name, cond, info = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'OK  ' : 'GAGAL'} ${name}${info ? '  ' + info : ''}`) }
const qty = async id => Number((await q(`select qty_on_hand from stock where id=$1`, [id]))[0].qty_on_hand)
const moves = async (id, since) => q(`select source, ref_id, delta::float d, qty_before::float b, qty_after::float a from stock_movements where row_id=$1 and id > $2 order by id`, [id, since])
const lastId = async () => Number((await q(`select coalesce(max(id),0) m from stock_movements`))[0].m)

await c.query('BEGIN')
try {
  await c.query(readFileSync('db/2026-10-13_stock_movements.sql', 'utf8'))
  const [prod] = await q(`
    select p.id, p.name, sr.id rec from store_recipes sr join products p on p.id = sr.product_id
    where sr.store_id=$1 and sr.is_active and coalesce(sr.recipe_type,'')<>'production'
      and exists (select 1 from store_recipe_items ri join stock s on s.store_id=$1 and s.material_id=ri.material_id
                  where ri.recipe_id=sr.id and coalesce(ri.source,'')<>'production' and s.qty_on_hand > 50)
    order by p.name limit 1`, [STORE])
  const [ri] = await q(`select ri.material_id, ri.qty_used::float u, s.id sid from store_recipe_items ri join stock s on s.store_id=$1 and s.material_id=ri.material_id
    where ri.recipe_id=$2 and coalesce(ri.source,'')<>'production' and s.qty_on_hand > 50 limit 1`, [STORE, prod.rec])
  const start = await qty(ri.sid), m0 = await lastId()
  console.log(`Uji: ${prod.name}, bahan ${ri.material_id} (stok ${start})\n`)

  // 1) Penjualan
  await c.query(`insert into transactions select (jsonb_populate_record(null::transactions, to_jsonb(t) ||
     jsonb_build_object('id','TEST-TX','status','completed','stock_mode','server','receipt_no','TEST-TX','total',0))).*
     from transactions t where t.store_id=$1 order by created_at desc limit 1`, [STORE])
  await c.query(`insert into transaction_items (id, transaction_id, product_id, product_name, qty_eceran, qty_dus, unit_price, subtotal) values ('TEST-IT','TEST-TX',$1,$2,2,0,0,0)`, [prod.id, prod.name])
  let mv = await moves(ri.sid, m0)
  check('penjualan tercatat (sumber penjualan, ref = transaksi)', mv.length === 1 && mv[0].source === 'penjualan' && mv[0].ref_id === 'TEST-TX' && mv[0].d === -ri.u * 2, JSON.stringify(mv[0]))

  // 2) Void penjualan
  let m1 = await lastId()
  await c.query(`update transactions set status='voided' where id='TEST-TX'`)
  mv = await moves(ri.sid, m1)
  check('void penjualan tercatat', mv.length === 1 && mv[0].source === 'void_penjualan' && mv[0].d === ri.u * 2)

  // 3) Opname lewat operasi server (penyesuaian)
  m1 = await lastId()
  await q(`select apply_stock_op('TEST-OP1','stock',$1,$2,-7,null,'none',null,null,'opname','TEST-OPNAME')`, [STORE, ri.material_id])
  mv = await moves(ri.sid, m1)
  check('opname (penyesuaian -7) tercatat sbg opname', mv.length === 1 && mv[0].source === 'opname' && mv[0].ref_id === 'TEST-OPNAME' && mv[0].d === -7)

  // 4) Operasi cost-only (delta 0) -> tidak membuat baris riwayat
  m1 = await lastId()
  await q(`select apply_stock_op('TEST-OP2','stock',$1,$2,0,1234,'set',null,null,'edit_stok','X')`, [STORE, ri.material_id])
  check('ubah harga saja (qty tetap) -> tidak ada riwayat qty', (await moves(ri.sid, m1)).length === 0)

  // 5) Mutasi gudang->toko + void mutasi
  m1 = await lastId()
  await c.query(`insert into warehouse_mutations select (jsonb_populate_record(null::warehouse_mutations, to_jsonb(m) ||
      jsonb_build_object('id','TEST-MUT','status','confirmed','mutation_type','to_store','destination_id',$1::text,'acting_store_id','store-gudang-malang'))).*
      from warehouse_mutations m limit 1`, [STORE])
  await c.query(`insert into warehouse_mutation_items (id, mutation_id, material_id, qty, unit_cost) values ('TEST-MI','TEST-MUT',$1,9,0)`, [ri.material_id])
  await q(`select apply_stock_op('TEST-OP3','stock',$1,$2,9,0,'weighted',null,null,'mutasi','TEST-MUT')`, [STORE, ri.material_id])
  await c.query(`update warehouse_mutations set status='voided' where id='TEST-MUT'`)
  mv = await moves(ri.sid, m1)
  check('mutasi masuk +9 lalu void mutasi -9, sumber benar', mv.length === 2 && mv[0].source === 'mutasi' && mv[0].d === 9 && mv[1].source === 'void_mutasi' && mv[1].d === -9 && mv[1].ref_id === 'TEST-MUT')

  // 6) Tulis langsung (app lama / upsert qty absolut) -> ketahuan
  m1 = await lastId()
  await c.query(`update stock set qty_on_hand = qty_on_hand + 100 where id=$1`, [ri.sid])
  mv = await moves(ri.sid, m1)
  check('tulis langsung (app lama) -> tercatat tulis_langsung', mv.length === 1 && mv[0].source === 'tulis_langsung' && mv[0].d === 100)

  // 7) Antrian lama (rpc_delta) -> antrian_lama
  m1 = await lastId()
  await q(`select adjust_stock_once('TEST-OP4','stock',$1,-3)`, [ri.sid])
  mv = await moves(ri.sid, m1)
  check('antrian lama (rpc_delta) tercatat', mv.length === 1 && mv[0].source === 'antrian_lama' && mv[0].d === -3)

  // 8) Konsistensi: jumlah semua gerakan = perubahan stok; saldo berantai
  const all = await moves(ri.sid, m0)
  const sum = all.reduce((s, x) => s + x.d, 0), end = await qty(ri.sid)
  const chained = all.every((x, i) => i === 0 ? x.b === start : x.b === all[i - 1].a)
  check('jumlah semua gerakan = perubahan stok, saldo nyambung', Math.abs(sum - (end - start)) < 1e-9 && chained, `${start} → ${end}, Σ ${sum}`)
} catch (e) { fail++; console.log('ERROR:', e.message) }
finally {
  await c.query('ROLLBACK')
  console.log(`\nROLLBACK selesai. Hasil: ${ok} OK, ${fail} GAGAL`)
  await c.end()
}
