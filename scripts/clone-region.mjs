// scripts/clone-region.mjs
// Clone katalog Malang -> Bali (ID baru, region='bali', FK di-remap).
// Aman: hanya INSERT baris baru region 'bali'. TIDAK menyentuh/menghapus data Malang.
//
// Jalankan:
//   SUPABASE_URL=... SUPABASE_KEY=... node scripts/clone-region.mjs
// (SUPABASE_KEY = anon key dari .env, VITE_SUPABASE_ANON_KEY)
//
// Idempoten-guard: berhenti kalau region 'bali' sudah punya produk (hindari duplikat).
// Untuk paksa ulang, hapus dulu katalog bali atau pakai --force (JANGAN dipakai sembarangan).

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_KEY
if (!URL || !KEY) { console.error('ERROR: set SUPABASE_URL dan SUPABASE_KEY'); process.exit(1) }

const SOURCE_REGION = 'malang'
const TARGET_REGION = 'bali'
const SOURCE_STORE  = 'store-mog-01'    // toko template utk store_recipes & harga
const TARGET_STORE  = 'store-bali-01'   // toko Bali tujuan
const FORCE = process.argv.includes('--force')

const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const fresh = (row, extra) => { const { ...r } = row; return { ...r, ...extra } }
async function fetchAll(table, col, val) {
  let q = sb.from(table).select('*')
  if (col) q = q.eq(col, val)
  const { data, error } = await q
  if (error) throw new Error(`${table}: ${error.message}`)
  return data || []
}
async function insertAll(table, rows) {
  if (!rows.length) return
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200)
    const { error } = await sb.from(table).insert(batch)
    if (error) throw new Error(`insert ${table}: ${error.message}`)
  }
  console.log(`  + ${table}: ${rows.length} baris`)
}

async function main() {
  console.log(`Clone ${SOURCE_REGION} -> ${TARGET_REGION}`)

  // Guard
  const existing = await fetchAll('products', 'region', TARGET_REGION)
  if (existing.length && !FORCE) {
    console.error(`STOP: region '${TARGET_REGION}' sudah punya ${existing.length} produk. Pakai --force kalau memang mau tambah lagi.`)
    process.exit(1)
  }

  // 1) Parents tanpa FK -> map old->new
  const mk = (rows) => { const map = {}; const out = rows.map(r => { const id = randomUUID(); map[r.id] = id; return fresh(r, { id, region: TARGET_REGION }) }); return { map, out } }

  const cats = mk(await fetchAll('categories', 'region', SOURCE_REGION))
  const mats = mk(await fetchAll('materials',  'region', SOURCE_REGION))
  const sups = mk(await fetchAll('suppliers',  'region', SOURCE_REGION))
  const parts= mk(await fetchAll('partners',   'region', SOURCE_REGION))
  await insertAll('categories', cats.out)
  await insertAll('materials',  mats.out)
  await insertAll('suppliers',  sups.out)
  await insertAll('partners',   parts.out)

  // 2) products (remap category_id, supplier_id kalau ada)
  const prodMap = {}
  const prodRows = (await fetchAll('products', 'region', SOURCE_REGION)).map(r => {
    const id = randomUUID(); prodMap[r.id] = id
    const e = { id, region: TARGET_REGION }
    if (r.category_id != null) e.category_id = cats.map[r.category_id] ?? r.category_id
    if (r.supplier_id != null) e.supplier_id = sups.map[r.supplier_id] ?? r.supplier_id
    return fresh(r, e)
  })
  await insertAll('products', prodRows)

  // 3) production_recipes (+items)
  const recMap = {}
  const recRows = (await fetchAll('production_recipes', 'region', SOURCE_REGION)).map(r => {
    const id = randomUUID(); recMap[r.id] = id
    const e = { id, region: TARGET_REGION }
    if (r.product_id != null) e.product_id = prodMap[r.product_id] ?? r.product_id
    return fresh(r, e)
  })
  await insertAll('production_recipes', recRows)

  const recItems = (await fetchAll('production_recipe_items', 'region', SOURCE_REGION))
    .filter(r => recMap[r.recipe_id])
    .map(r => fresh(r, {
      id: randomUUID(), region: TARGET_REGION,
      recipe_id: recMap[r.recipe_id],
      material_id: mats.map[r.material_id] ?? r.material_id,
    }))
  await insertAll('production_recipe_items', recItems)

  // 4) store_recipes (+items) dari SOURCE_STORE -> TARGET_STORE
  const srMap = {}
  const srRows = (await fetchAll('store_recipes', 'store_id', SOURCE_STORE)).map(r => {
    const id = randomUUID(); srMap[r.id] = id
    return fresh(r, {
      id, region: TARGET_REGION, store_id: TARGET_STORE,
      product_id: prodMap[r.product_id] ?? r.product_id,
    })
  })
  await insertAll('store_recipes', srRows)

  const srItems = (await fetchAll('store_recipe_items', 'region', SOURCE_REGION))
    .filter(r => srMap[r.recipe_id])
    .map(r => fresh(r, {
      id: randomUUID(), region: TARGET_REGION,
      recipe_id: srMap[r.recipe_id],
      material_id: mats.map[r.material_id] ?? r.material_id,
    }))
  await insertAll('store_recipe_items', srItems)

  // 5) store_product_prices dari SOURCE_STORE -> TARGET_STORE
  const priceRows = (await fetchAll('store_product_prices', 'store_id', SOURCE_STORE))
    .filter(r => prodMap[r.product_id])
    .map(r => fresh(r, {
      id: randomUUID(), region: TARGET_REGION, store_id: TARGET_STORE,
      product_id: prodMap[r.product_id],
    }))
  await insertAll('store_product_prices', priceRows)

  console.log('SELESAI. Katalog Bali siap. Stok gudang/produksi mulai 0 (isi lewat pembelian/produksi).')
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
