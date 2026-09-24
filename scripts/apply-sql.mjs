// Jalankan file SQL dalam 1 transaksi (gagal -> rollback semua). DB_URL=... node scripts/apply-sql.mjs <file>
import pg from 'pg'
import { readFileSync } from 'node:fs'
const c = new pg.Client({ connectionString: process.env.DB_URL }); await c.connect()
try {
  await c.query('BEGIN'); await c.query(readFileSync(process.argv[2], 'utf8')); await c.query('COMMIT')
  const r = await c.query(`select
    (select count(*) from information_schema.columns where table_name='transactions' and column_name='stock_mode') col,
    (select count(*) from information_schema.tables where table_name in ('stock_ledger','stock_issues')) tbl,
    (select count(*) from information_schema.triggers where trigger_name in ('trg_deduct_stock_for_item','trg_restore_stock_on_void')) trg,
    (select count(*) from pg_proc where proname in ($$apply_stock_op$$,$$adjust_stock_once$$)) fns, (select count(*) from information_schema.tables where table_name=$$stock_ops$$) ops_tbl`)
  console.log('OK', JSON.stringify(r.rows[0]))
} catch (e) { await c.query('ROLLBACK'); console.log('GAGAL (rollback):', e.message); process.exitCode = 1 }
await c.end()
