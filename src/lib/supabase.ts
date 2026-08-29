// build: 2026-08-24 rebuild trigger (env refresh per-deployment)
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY wajib diisi di .env')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true }
})

// ── Multi-region: filter otomatis .in('region', ...) pada SETIAP .select() tabel ber-region ──
// Menutup ratusan pemanggilan supabase.from(...).select(...) di halaman tanpa edit satu-satu.
// HANYA memengaruhi SELECT (baca). insert/update/delete TIDAK disentuh → tak mungkin hapus data.
// stores & users DIKECUALIKAN (dibutuhkan lengkap saat login sebelum ada user aktif).
let queryRegions: string[] = ['malang']
export function setActiveQueryRegions(regs: string[]) {
  if (Array.isArray(regs) && regs.length) queryRegions = regs
}
export function getActiveQueryRegions() { return queryRegions }

// DINONAKTIFKAN 2026-08-29: Bali sudah DB Supabase TERPISAH (single-tenant), jadi
// filter/stamp region ini tak berguna & sempat mengganggu runtime Malang (stok tak
// terpotong, close order gagal). Set dikosongkan -> wrapper jadi no-op, perilaku
// kembali seperti sebelum kerja region (single-tenant murni).
const REGION_QUERY_TABLES = new Set<string>([])
// Region tunggal utk STAMP saat menulis (insert/upsert). Set saat login/rehydrate.
let writeRegionSingle = 'malang'
export function setWriteQueryRegion(r: string) { if (r) writeRegionSingle = r }
export function getWriteQueryRegion() { return writeRegionSingle }

// DINONAKTIFKAN 2026-08-29 (lihat catatan di atas) — kosong = tak ada stamp region saat tulis.
const REGION_WRITE_TABLES = new Set<string>([])
function stampRegion(values: any): any {
  const one = (row: any) =>
    (row && typeof row === 'object' && !Array.isArray(row) && row.region == null)
      ? { ...row, region: writeRegionSingle } : row
  return Array.isArray(values) ? values.map(one) : one(values)
}

const _origFrom = supabase.from.bind(supabase)
;(supabase as any).from = (table: string) => {
  const qb: any = _origFrom(table)
  if (REGION_QUERY_TABLES.has(table)) {
    const origSelect = qb.select.bind(qb)
    qb.select = (...args: any[]) => origSelect(...args).in('region', queryRegions)
  }
  if (REGION_WRITE_TABLES.has(table)) {
    const oi = qb.insert.bind(qb); qb.insert = (v: any, o?: any) => oi(stampRegion(v), o)
    const ou = qb.upsert.bind(qb); qb.upsert = (v: any, o?: any) => ou(stampRegion(v), o)
  }
  return qb
}

// Akses MENTAH tanpa filter/stamp region — HANYA untuk kebutuhan login sebelum ada
// user aktif (mis. tarik semua stores/users di syncMasterData). Jangan dipakai di halaman.
export function rawFrom(table: string) { return _origFrom(table) }

// STORE_ID dan STORE_NAME sekarang diambil dari user yang login
// bukan dari env variable — lihat auth store
export const APP_NAME = 'Coco Puff POS'
