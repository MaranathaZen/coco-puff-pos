// Uji trigger potong stok server di dalam BEGIN ... ROLLBACK (TIDAK ada yang tersimpan).
// DB_URL=<pooler> STORE=<store_id> node scripts/test-stock-trigger.mjs
import pg from 'pg'
import { readFileSync } from 'node:fs'
const c = new pg.Client({ connectionString: process.env.DB_URL }); await c.connect()
const q = (s, p) => c.query(s, p).then(r => r.rows)
const STORE = process.env.STORE
let ok = 0, fail = 0
const check = (name, cond, info = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'OK  ' : 'GAGAL'} ${name}${info ? '  ' + info : ''}`) }

await c.query('BEGIN')
try {
  await c.query(readFileSync('db/2026-09-24_stock_server_side.sql', 'utf8'))
  const insTx = (id, status, mode) => c.query(
    `insert into transactions select (jsonb_populate_record(null::transactions,
       to_jsonb(t) || jsonb_build_object('id',$1::text,'status',$2::text,'stock_mode',$3::text,'receipt_no',$1::text,'total',0))).*
     from transactions t where t.store_id=$4 order by created_at desc limit 1`, [id, status, mode, STORE])

  // Produk ber-resep BOM di toko ini, dgn pkg_qty > 1 kalau ada
  const [prod] = await q(`
    select p.id, p.name, coalesce(nullif(p.pkg_qty,0),1) pkg, sr.id rec
    from store_recipes sr join products p on p.id = sr.product_id
    where sr.store_id=$1 and sr.is_active and coalesce(sr.recipe_type,'')<>'production'
      and exists (select 1 from store_recipe_items ri join stock s on s.store_id=$1 and s.material_id=ri.material_id
                  where ri.recipe_id=sr.id and coalesce(ri.source,'')<>'production')
    order by (p.pkg_qty>1) desc, p.name limit 1`, [STORE])
  const ris = await q(`select ri.material_id, ri.qty_used, s.id stock_id, s.qty_on_hand
    from store_recipe_items ri join stock s on s.store_id=$1 and s.material_id=ri.material_id
    where ri.recipe_id=$2 and coalesce(ri.source,'')<>'production'`, [STORE, prod.rec])
  console.log(`Produk uji: ${prod.name} (isi dus ${prod.pkg}), ${ris.length} bahan\n`)
  const stockNow = async () => Object.fromEntries((await q(`select id, qty_on_hand from stock where id = any($1)`, [ris.map(r => r.stock_id)])).map(r => [r.id, Number(r.qty_on_hand)]))
  const before = await stockNow()

  // 1) Transaksi app baru: 2 eceran + 1 dus
  await insTx('TEST-TX-1','completed','server')
  await c.query(`insert into transaction_items (id, transaction_id, product_id, product_name, qty_eceran, qty_dus, unit_price, subtotal) values ('TEST-IT-1','TEST-TX-1',$1,$2,2,1,0,0)`, [prod.id, prod.name])
  const pcs = 2 + 1 * Number(prod.pkg)
  let after = await stockNow()
  const expect = ri => Math.max(0, Number(ri.qty_on_hand) - Number(ri.qty_used) * pcs)
  check('jual 2 eceran + 1 dus -> stok bahan terpotong sesuai resep', ris.every(ri => Math.abs(after[ri.stock_id] - expect(ri)) < 1e-9),
    ris.map(ri => `${before[ri.stock_id]}→${after[ri.stock_id]}`).join(', '))
  check('buku besar tercatat 1 baris per bahan', (await q(`select count(*) n from stock_ledger where transaction_id='TEST-TX-1'`))[0].n == ris.length)

  const short = ris.filter(ri => Number(ri.qty_used) * pcs > Number(ri.qty_on_hand))
  if (short.length) check(`stok kurang (${short.length} bahan) -> tercatat 'stock_short'`,
    (await q(`select count(*) n from stock_issues where transaction_id='TEST-TX-1' and issue='stock_short'`))[0].n == short.length)

  // 2) Kirim ulang item yg sama (upsert dari antrian sync) -> tidak dipotong lagi
  const mid = await stockNow()
  await c.query(`insert into transaction_items (id, transaction_id, product_id, product_name, qty_eceran, qty_dus, unit_price, subtotal) values ('TEST-IT-1','TEST-TX-1',$1,$2,2,1,0,0)
                 on conflict (id) do update set qty_eceran = excluded.qty_eceran`, [prod.id, prod.name])
  after = await stockNow()
  check('kirim ulang item sama -> TIDAK dipotong dobel', ris.every(ri => after[ri.stock_id] === mid[ri.stock_id]))

  // 3) Produk tanpa resep -> tercatat di stock_issues
  const [noRec] = await q(`select id, name from products p where is_active and not exists
    (select 1 from store_recipes sr where sr.store_id=$1 and sr.product_id=p.id and sr.is_active and coalesce(sr.recipe_type,'')<>'production') limit 1`, [STORE])
  if (noRec) {
    await c.query(`insert into transaction_items (id, transaction_id, product_id, product_name, qty_eceran, unit_price, subtotal) values ('TEST-IT-2','TEST-TX-1',$1,$2,1,0,0)`, [noRec.id, noRec.name])
    check(`produk tanpa resep (${noRec.name}) -> tercatat 'no_recipe'`, (await q(`select count(*) n from stock_issues where transaction_item_id='TEST-IT-2' and issue='no_recipe'`))[0].n == 1)
  }

  // 4) Transaksi app LAMA (stock_mode kosong) -> server tidak memotong (HP yg potong)
  const b4 = await stockNow()
  await insTx('TEST-TX-2','completed',null)
  await c.query(`insert into transaction_items (id, transaction_id, product_id, product_name, qty_eceran, unit_price, subtotal) values ('TEST-IT-3','TEST-TX-2',$1,$2,3,0,0)`, [prod.id, prod.name])
  after = await stockNow()
  check('transaksi app versi lama -> server TIDAK memotong (anti dobel)', ris.every(ri => after[ri.stock_id] === b4[ri.stock_id]))

  // 5) Void -> stok kembali persis; void ulang tidak menambah lagi
  await c.query(`update transactions set status='voided' where id='TEST-TX-1'`)
  after = await stockNow()
  check('void -> stok kembali PERSIS ke angka awal', ris.every(ri => Math.abs(after[ri.stock_id] - before[ri.stock_id]) < 1e-9),
    ris.map(ri => `${before[ri.stock_id]}→${after[ri.stock_id]}`).join(', '))
  const v1 = await stockNow()
  await c.query(`update transactions set status='voided' where id='TEST-TX-1'`)
  after = await stockNow()
  check('void 2x -> tidak dikembalikan dobel', ris.every(ri => after[ri.stock_id] === v1[ri.stock_id]))

  // 6) Item masuk SETELAH transaksi sudah void (offline) -> tidak dipotong
  await insTx('TEST-TX-3','voided','server')
  const b6 = await stockNow()
  await c.query(`insert into transaction_items (id, transaction_id, product_id, product_name, qty_eceran, unit_price, subtotal) values ('TEST-IT-4','TEST-TX-3',$1,$2,1,0,0)`, [prod.id, prod.name])
  after = await stockNow()
  check('item dari transaksi yg sudah void -> tidak dipotong', ris.every(ri => after[ri.stock_id] === b6[ri.stock_id]))
} catch (e) {
  fail++; console.log('ERROR:', e.message)
} finally {
  await c.query('ROLLBACK')
  const left = await q(`select count(*) n from transactions where id like 'TEST-TX-%'`)
  console.log(`\nROLLBACK selesai — sisa data tes: ${left[0].n}. Hasil: ${ok} OK, ${fail} GAGAL`)
  await c.end()
}
