// Backup SEMUA tabel stok ke JSON (bisa dipakai mengembalikan angka per barang). HANYA BACA.
import pg from 'pg'
import { writeFileSync, mkdirSync } from 'node:fs'
const c = new pg.Client({ connectionString: process.env.DB_URL }); await c.connect()
const out = { taken_at: new Date().toISOString(), db: process.env.LABEL }
for (const t of ['stock', 'warehouse_stock', 'production_stock', 'finished_goods_stock']) out[t] = (await c.query(`select * from ${t} order by id`)).rows
mkdirSync('backups', { recursive: true })
const f = `backups/stok-${process.env.LABEL}-${out.taken_at.replace(/[:.]/g, '-')}.json`
writeFileSync(f, JSON.stringify(out, null, 1))
console.log(`${process.env.LABEL}: ${f}  (stock ${out.stock.length}, gudang ${out.warehouse_stock.length}, produksi ${out.production_stock.length}, barang jadi ${out.finished_goods_stock.length})`)
await c.end()
