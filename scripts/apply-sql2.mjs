// Jalankan file SQL dalam 1 transaksi (gagal -> rollback semua) + ringkasan pemeriksaan.
import pg from 'pg'
import { readFileSync } from 'node:fs'
const c = new pg.Client({ connectionString: process.env.DB_URL }); await c.connect()
try {
  const before = (await c.query(`select sum(qty_on_hand) s from stock`)).rows[0].s
  await c.query('BEGIN'); await c.query(readFileSync(process.argv[2], 'utf8')); await c.query('COMMIT')
  const r = (await c.query(`select
    (select count(*) from information_schema.triggers where trigger_name='trg_log_stock_movement') trg,
    (select count(*) from pg_proc where prosrc like '%cocopuff.stmt%') fns_berlabel,
    (select sum(qty_on_hand) from stock) total_stok`)).rows[0]
  console.log('OK', JSON.stringify({ ...r, total_stok_sebelum: before }))
} catch (e) { await c.query('ROLLBACK'); console.log('GAGAL (rollback):', e.message); process.exitCode = 1 }
await c.end()
