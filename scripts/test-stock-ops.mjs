// Uji apply_stock_op / adjust_stock_once di dalam BEGIN ... ROLLBACK (TIDAK ada yang tersimpan).
// DB_URL=<pooler> STORE=<store_id toko> node scripts/test-stock-ops.mjs
import pg from 'pg'
import { readFileSync } from 'node:fs'
const c = new pg.Client({ connectionString: process.env.DB_URL }); await c.connect()
const q = (s, p) => c.query(s, p).then(r => r.rows)
const STORE = process.env.STORE
let ok = 0, fail = 0
const check = (name, cond, info = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'OK  ' : 'GAGAL'} ${name}${info ? '  ' + info : ''}`) }
const op = (id, table, store, key, delta, cost = null, mode = 'none', name = null, newId = null) =>
  q(`select apply_stock_op($1,$2,$3,$4,$5,$6,$7,$8,$9,'test','TEST-REF') r`, [id, table, store, key, delta, cost, mode, name, newId]).then(r => r[0].r)
const qty = async (table, id) => Number((await q(`select qty_on_hand from ${table} where id=$1`, [id]))[0]?.qty_on_hand)

await c.query('BEGIN')
try {
  await c.query(readFileSync('db/2026-09-25_stock_ops_server.sql', 'utf8'))

  // Bahan yang ada di stok toko & gudang
  const [s] = await q(`select s.id, s.material_id, s.qty_on_hand, s.avg_cost from stock s
    join warehouse_stock w on w.material_id = s.material_id
    where s.store_id=$1 and s.qty_on_hand > 20 and w.qty_on_hand > 20 order by s.material_id limit 1`, [STORE])
  const [w] = await q(`select id, qty_on_hand from warehouse_stock where material_id=$1 order by last_updated desc limit 1`, [s.material_id])
  const s0 = Number(s.qty_on_hand), w0 = Number(w.qty_on_hand)
  console.log(`Bahan uji ${s.material_id}: stok toko ${s0}, gudang ${w0}\n`)

  // 1) Kasus "tertimpa": HP admin masih lihat s0, lalu ada penjualan -7 di server, lalu mutasi +10
  await q(`update stock set qty_on_hand = qty_on_hand - 7 where id=$1`, [s.id])
  await op('OP-1', 'stock', STORE, s.material_id, 10, 1000, 'weighted')
  check('mutasi masuk setelah penjualan -> penjualan TIDAK tertimpa', await qty('stock', s.id) === s0 - 7 + 10, `${s0} -7 +10 = ${await qty('stock', s.id)}`)

  // 2) Kirim ulang operasi yang sama
  await op('OP-1', 'stock', STORE, s.material_id, 10, 1000, 'weighted')
  check('kirim ulang operasi sama -> tidak dobel', await qty('stock', s.id) === s0 + 3)

  // 3) Kurangi bahan yang barisnya tidak ada di toko -> dicatat, tidak senyap
  const r3 = await op('OP-3', 'stock', STORE, 'MAT-TIDAK-ADA', -5)
  const iss3 = await q(`select count(*) n from stock_issues where ref_id='TEST-REF' and material_id='MAT-TIDAK-ADA' and issue='no_stock_row'`)
  check('kurangi baris yang tak ada -> tercatat no_stock_row', r3?.skipped === true && iss3[0].n == 1)

  // 4) Kurangi melebihi stok -> berhenti di 0 + tercatat stock_short
  const big = await qty('stock', s.id) + 50
  await op('OP-4', 'stock', STORE, s.material_id, -big)
  const iss4 = await q(`select qty_short from stock_issues where ref_id='TEST-REF' and issue='stock_short' and material_id=$1`, [s.material_id])
  check('kurangi melebihi stok -> 0 & tercatat kurang 50', await qty('stock', s.id) === 0 && Number(iss4[0]?.qty_short) === 50)

  // 5) Barang baru di toko: baris dibuat dgn id dari HP; operasi berikutnya ke baris yg sama
  const r5 = await op('OP-5', 'stock', STORE, 'MAT-BARU-TEST', 12, 500, 'none', null, 'LOCAL-ID-1')
  await op('OP-5b', 'stock', STORE, 'MAT-BARU-TEST', 3, 999, 'none', null, 'LOCAL-ID-2')
  const rows5 = await q(`select id, qty_on_hand, avg_cost from stock where store_id=$1 and material_id='MAT-BARU-TEST'`, [STORE])
  check('barang baru -> 1 baris (id dari HP), masuk kedua menambah, bukan baris dobel',
    r5.id === 'LOCAL-ID-1' && rows5.length === 1 && Number(rows5[0].qty_on_hand) === 15 && Number(rows5[0].avg_cost) === 500)

  // 6) Hasil produksi ke finished_goods (cocok via nama), cost 'set'
  const [fg] = await q(`select id, product_id, product_name, qty_on_hand from finished_goods_stock limit 1`)
  if (fg) {
    await op('OP-6', 'finished_goods_stock', null, 'ID-LAIN', 20, 4321, 'set', fg.product_name)
    const [fa] = await q(`select qty_on_hand, hpp_per_unit from finished_goods_stock where id=$1`, [fg.id])
    check('hasil produksi (cocok nama) -> +20 & HPP diset', Number(fa.qty_on_hand) === Number(fg.qty_on_hand) + 20 && Number(fa.hpp_per_unit) === 4321)
  }

  // 7) adjust_stock_once (antrian rpc_delta lama): 2x kirim -> sekali; baris belum ada -> null & bisa diulang
  const before7 = await qty('warehouse_stock', w.id)
  await q(`select adjust_stock_once('OP-7','warehouse_stock',$1,-4)`, [w.id])
  await q(`select adjust_stock_once('OP-7','warehouse_stock',$1,-4)`, [w.id])
  check('delta lama dikirim 2x -> diterapkan sekali', await qty('warehouse_stock', w.id) === before7 - 4)
  const r7 = await q(`select adjust_stock_once('OP-7b','warehouse_stock','ID-BELUM-ADA',5) r`)
  const led7 = await q(`select count(*) n from stock_ops where op_id='OP-7b'`)
  check('delta ke baris yang belum ada -> NULL (antrian ulang), tak tercatat', r7[0].r === null && led7[0].n == 0)

  // 8) Mutasi gudang -> toko lewat operasi baru, lalu VOID -> trigger lama mengembalikan persis
  const wBefore = await qty('warehouse_stock', w.id), sBefore = await qty('stock', s.id)
  await c.query(`insert into warehouse_mutations select (jsonb_populate_record(null::warehouse_mutations,
      to_jsonb(m) || jsonb_build_object('id','TEST-MUT','status','confirmed','mutation_type','to_store',
      'destination_id',$1::text,'acting_store_id','store-gudang-malang'))).* from warehouse_mutations m limit 1`, [STORE])
  await c.query(`insert into warehouse_mutation_items (id, mutation_id, material_id, qty, unit_cost) values ('TEST-MI','TEST-MUT',$1,6,0)`, [s.material_id])
  await op('OP-8a', 'warehouse_stock', null, s.material_id, -6)
  await op('OP-8b', 'stock', STORE, s.material_id, 6, 0, 'weighted')
  const wMid = await qty('warehouse_stock', w.id), sMid = await qty('stock', s.id)
  await c.query(`update warehouse_mutations set status='voided' where id='TEST-MUT'`)
  check('mutasi gudang->toko: gudang -6, toko +6', wMid === wBefore - 6 && sMid === sBefore + 6, `gudang ${wBefore}→${wMid}, toko ${sBefore}→${sMid}`)
  check('void mutasi -> kembali persis', await qty('warehouse_stock', w.id) === wBefore && await qty('stock', s.id) === sBefore)

  // 9) Produksi toko lewat operasi baru, lalu VOID -> kembali ke stok TOKO, stok produksi tak tersentuh
  const [rec] = await q(`select sr.id, sr.product_name, m.id out_mat from store_recipes sr
    join materials m on lower(m.name) = lower(sr.product_name)
    where sr.store_id=$1 and sr.recipe_type='production' and sr.is_active
      and exists (select 1 from stock st where st.store_id=$1 and st.material_id = m.id)
      and exists (select 1 from store_recipe_items ri join stock st on st.store_id=$1 and st.material_id=ri.material_id where ri.recipe_id=sr.id)
    limit 1`, [STORE])
  if (rec) {
    const [ri] = await q(`select ri.material_id, ri.qty_used from store_recipe_items ri join stock st on st.store_id=$1 and st.material_id=ri.material_id
      where ri.recipe_id=$2 and st.qty_on_hand >= ri.qty_used limit 1`, [STORE, rec.id])
    if (ri) {
      const stq = async m => Number((await q(`select qty_on_hand from stock where store_id=$1 and material_id=$2`, [STORE, m]))[0].qty_on_hand)
      const psSum = async () => Number((await q(`select coalesce(sum(qty_on_hand),0) s from production_stock`))[0].s)
      const in0 = await stq(ri.material_id), out0 = await stq(rec.out_mat), ps0 = await psSum()
      await c.query(`insert into production_logs select (jsonb_populate_record(null::production_logs,
          to_jsonb(l) || jsonb_build_object('id','TEST-PLOG','status','done','store_id',$1::text,'recipe_id',$2::text,'total_yield',100,'batch_count',1))).*
        from production_logs l limit 1`, [STORE, rec.id])
      await c.query(`insert into production_log_materials (id, log_id, material_id, qty_used) values ('TEST-PLM','TEST-PLOG',$1,$2)`, [ri.material_id, ri.qty_used])
      await op('OP-9a', 'stock', STORE, ri.material_id, -Number(ri.qty_used))
      await op('OP-9b', 'stock', STORE, rec.out_mat, 100)
      const in1 = await stq(ri.material_id), out1 = await stq(rec.out_mat)
      await c.query(`update production_logs set status='voided' where id='TEST-PLOG'`)
      check(`produksi toko ${rec.product_name}: bahan -${ri.qty_used}, hasil +100`, in1 === in0 - Number(ri.qty_used) && out1 === out0 + 100)
      check('void produksi toko -> stok TOKO kembali persis', await stq(ri.material_id) === in0 && await stq(rec.out_mat) === out0,
        `bahan ${in0}→${in1}→${await stq(ri.material_id)}, hasil ${out0}→${out1}→${await stq(rec.out_mat)}`)
      check('void produksi toko -> stok produksi pusat TIDAK berubah (dulu salah ditambah)', await psSum() === ps0)
    }
  } else console.log('(lewati uji 9: tak ada resep produksi toko dgn baris stok lengkap)')
} catch (e) {
  fail++; console.log('ERROR:', e.message)
} finally {
  await c.query('ROLLBACK')
  const left = await q(`select to_regclass('stock_ops') t`)
  console.log(`\nROLLBACK selesai (tabel stock_ops ${left[0].t ? 'MASIH ADA' : 'tidak ada'} -> bersih). Hasil: ${ok} OK, ${fail} GAGAL`)
  await c.end()
}
