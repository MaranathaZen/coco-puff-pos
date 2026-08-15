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

const REGION_QUERY_TABLES = new Set([
  'products', 'materials', 'categories', 'suppliers', 'partners', 'packages',
  'production_recipes', 'production_recipe_items', 'store_recipes', 'store_recipe_items',
  'warehouse_stock', 'production_stock', 'finished_goods_stock', 'transactions', 'stock',
  'shifts', 'warehouse_mutations', 'production_mutations', 'purchases', 'warehouse_expenses',
  'store_product_prices', 'promotions', 'close_order_reports', 'cash_deposits', 'production_logs',
])
const _origFrom = supabase.from.bind(supabase)
;(supabase as any).from = (table: string) => {
  const qb: any = _origFrom(table)
  if (!REGION_QUERY_TABLES.has(table)) return qb
  const origSelect = qb.select.bind(qb)
  qb.select = (...args: any[]) => origSelect(...args).in('region', queryRegions)
  return qb
}

// STORE_ID dan STORE_NAME sekarang diambil dari user yang login
// bukan dari env variable — lihat auth store
export const APP_NAME = 'Coco Puff POS'
