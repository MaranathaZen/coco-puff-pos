/**
 * Sync offline-first: ambil data dari Supabase ke IndexedDB lokal,
 * dan kirim sync_queue ke Supabase di background.
 */
import { supabase, STORE_ID } from '@/lib/supabase'
import { db, now } from '@/lib/db'

let syncInterval: ReturnType<typeof setInterval> | null = null
let isSyncing = false

// ── Pull: ambil data master dari Supabase ke lokal ────────────
export async function pullFromSupabase() {
  try {
    // Categories
    const { data: cats } = await supabase.from('categories').select('*')
    if (cats?.length) await db.categories.bulkPut(cats)

    // Products aktif
    const { data: prods } = await supabase.from('products')
      .select('*').eq('is_active', true)
    if (prods?.length) await db.products.bulkPut(prods)

    // Ingredients
    const { data: ings } = await supabase.from('ingredients')
      .select('*').eq('is_active', true)
    if (ings?.length) await db.ingredients.bulkPut(ings)

    // Recipes
    const { data: recipes } = await supabase.from('recipes').select('*')
    if (recipes?.length) await db.recipes.bulkPut(recipes)

    // Harga override toko ini
    const { data: prices } = await supabase.from('store_product_prices')
      .select('*').eq('store_id', STORE_ID).eq('is_active', true)
    if (prices?.length) await db.store_product_prices.bulkPut(prices)

    // Promo aktif toko ini
    const { data: promos } = await supabase.from('promotions')
      .select('*').eq('store_id', STORE_ID).eq('is_active', true)
    if (promos?.length) await db.promotions.bulkPut(promos)

    // Paket aktif (berlaku semua toko atau toko ini)
    const { data: pkgs } = await supabase.from('packages')
      .select('*')
      .eq('is_active', true)
      .or(`store_id.is.null,store_id.eq.${STORE_ID}`)
    if (pkgs?.length) await db.packages.bulkPut(pkgs)

    // Users toko ini
    const { data: users } = await supabase.from('users')
      .select('*').eq('store_id', STORE_ID)
    if (users?.length) await db.users.bulkPut(users)

    // Stok toko ini
    const { data: stock } = await supabase.from('stock')
      .select('*').eq('store_id', STORE_ID)
    if (stock?.length) await db.stock.bulkPut(stock)

    console.log('[SYNC] Pull selesai')
  } catch (e) {
    console.warn('[SYNC] Pull gagal (offline?):', e)
  }
}

// ── Push: kirim sync_queue ke Supabase ───────────────────────
export async function pushToSupabase() {
  if (isSyncing) return
  isSyncing = true

  try {
    const pending = await db.sync_queue
      .where('status').anyOf(['pending', 'failed'])
      .filter(q => q.retry_count < 5)
      .limit(50)
      .toArray()

    if (!pending.length) return

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload)

        if (item.operation === 'delete') {
          await supabase.from(item.table_name)
            .delete().eq('id', item.record_id)
        } else {
          await supabase.from(item.table_name).upsert(payload)
        }

        await db.sync_queue.update(item.id, {
          status: 'done',
          synced_at: now(),
          error_msg: undefined,
        })
      } catch (e: any) {
        await db.sync_queue.update(item.id, {
          status: 'failed',
          retry_count: item.retry_count + 1,
          error_msg: String(e?.message || e).slice(0, 300),
        })
      }
    }

    console.log(`[SYNC] Push selesai — ${pending.length} record`)
  } finally {
    isSyncing = false
  }
}

// ── Start sync worker ─────────────────────────────────────────
export function startSyncWorker() {
  if (syncInterval) return

  // Pull data master saat pertama kali buka
  pullFromSupabase()

  // Push sync_queue setiap 30 detik
  syncInterval = setInterval(() => {
    pushToSupabase()
  }, 30_000)

  console.log('[SYNC] Worker started')
}

export function stopSyncWorker() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

export function isOnline(): boolean {
  return navigator.onLine
}
