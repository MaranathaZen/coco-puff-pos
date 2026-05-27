/**
 * Sync offline-first
 * - Pull data master dari Supabase ke IndexedDB
 * - Push sync_queue ke Supabase di background
 */
import { supabase } from '@/lib/supabase'
import { db, now } from '@/lib/db'

let syncInterval: ReturnType<typeof setInterval> | null = null
let isSyncing = false
let currentStoreId = ''

export function setCurrentStoreId(storeId: string) {
  currentStoreId = storeId
}

export async function pullFromSupabase(storeId?: string) {
  const sid = storeId || currentStoreId
  if (!sid) return

  try {
    // Data global (tidak filter store)
    const [cats, prods, mats, sups, parts, stores, recipes, pkgs, menuCfg] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase.from('products').select('*').eq('is_active', true),
      supabase.from('materials').select('*'),
      supabase.from('suppliers').select('*'),
      supabase.from('partners').select('*'),
      supabase.from('stores').select('*'),
      supabase.from('production_recipes').select('*'),
      supabase.from('packages').select('*').eq('is_active', true),
      supabase.from('menu_role_config').select('*'),
    ])

    if (cats.data?.length)    await db.categories.bulkPut(cats.data)
    if (prods.data?.length)   await db.products.bulkPut(prods.data)
    if (mats.data?.length)    await db.materials.bulkPut(mats.data)
    if (sups.data?.length)    await db.suppliers.bulkPut(sups.data)
    if (parts.data?.length)   await db.partners.bulkPut(parts.data)
    if (stores.data?.length)  await db.stores.bulkPut(stores.data)
    if (recipes.data?.length) await db.production_recipes.bulkPut(recipes.data)
    if (pkgs.data?.length)    await db.packages.bulkPut(pkgs.data)
    if (menuCfg.data?.length) await db.menu_role_config.bulkPut(menuCfg.data)

    // Data semua user (untuk login dari device manapun)
    const { data: users } = await supabase.from('users').select('*').eq('is_active', true)
    if (users?.length) await db.users.bulkPut(users)

    // Data per store
    const [prices, promos, stock, wstock, pstock, fgstock, wmuts, pmuts, recipeItems, wexpenses] = await Promise.all([
      supabase.from('store_product_prices').select('*').eq('store_id', sid),
      supabase.from('promotions').select('*').eq('store_id', sid).eq('is_active', true),
      supabase.from('stock').select('*').eq('store_id', sid),
      supabase.from('warehouse_stock').select('*'),
      supabase.from('production_stock').select('*'),
      supabase.from('finished_goods_stock').select('*'),
      supabase.from('warehouse_mutations').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('production_mutations').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('production_recipe_items').select('*'),
      supabase.from('warehouse_expenses').select('*').order('expense_date', { ascending: false }).limit(100),
    ])

    if (prices.data?.length)      await db.store_product_prices.bulkPut(prices.data)
    if (promos.data?.length)      await db.promotions.bulkPut(promos.data)
    if (stock.data?.length)       await db.stock.bulkPut(stock.data)
    if (wstock.data?.length)      await db.warehouse_stock.bulkPut(wstock.data)
    if (pstock.data?.length)      await db.production_stock.bulkPut(pstock.data)
    if (fgstock.data?.length)     await db.finished_goods_stock.bulkPut(fgstock.data)
    if (wmuts.data?.length)       await db.warehouse_mutations.bulkPut(wmuts.data)
    if (pmuts.data?.length)       await db.production_mutations.bulkPut(pmuts.data)
    if (recipeItems.data?.length) await db.production_recipe_items.bulkPut(recipeItems.data)
    if (wexpenses.data?.length)   await db.warehouse_expenses.bulkPut(wexpenses.data)

    console.log(`[SYNC] Pull selesai — toko: ${sid}`)
  } catch (e) {
    console.warn('[SYNC] Pull gagal (offline?):', e)
  }
}

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
          await supabase.from(item.table_name).delete().eq('id', item.record_id)
        } else {
          await supabase.from(item.table_name).upsert(payload)
        }
        await db.sync_queue.update(item.id, { status: 'done', synced_at: now(), error_msg: undefined })
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

export function startSyncWorker(storeId: string) {
  setCurrentStoreId(storeId)
  if (syncInterval) return
  pullFromSupabase(storeId)
  syncInterval = setInterval(() => { pushToSupabase() }, 30_000)
  console.log(`[SYNC] Worker started — toko: ${storeId}`)
}

export function stopSyncWorker() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; currentStoreId = '' }
}

export function isOnline(): boolean { return navigator.onLine }
