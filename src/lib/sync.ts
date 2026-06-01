/**
 * Sync offline-first — v2
 *
 * Perubahan dari v1:
 * - Supabase Realtime: setiap INSERT/UPDATE/DELETE di Supabase langsung
 *   diaplikasikan ke Dexie lokal di semua device tanpa perlu sync manual
 * - Pull berkala tiap 60 detik sebagai fallback kalau realtime putus
 * - Fix delete: tabel master pakai replace strategy (clear + bulkPut)
 *   sehingga hapus di satu device propagate ke semua device
 * - Push sync_queue tetap berjalan tiap 30 detik
 */

import { supabase } from '@/lib/supabase'
import { db, now } from '@/lib/db'
import type { RealtimeChannel } from '@supabase/supabase-js'

let pushInterval:  ReturnType<typeof setInterval> | null = null
let pullInterval:  ReturnType<typeof setInterval> | null = null
let realtimeChannel: RealtimeChannel | null = null
let isSyncing    = false
let isPulling    = false
let currentStoreId = ''

export function setCurrentStoreId(storeId: string) {
  currentStoreId = storeId
}

// ── Mapping tabel Supabase → tabel Dexie ─────────────────────
// Dipakai oleh realtime handler untuk tahu harus update tabel mana
const TABLE_MAP: Record<string, keyof typeof db> = {
  materials:              'materials',
  suppliers:              'suppliers',
  partners:               'partners',
  stores:                 'stores',
  users:                  'users',
  categories:             'categories',
  products:               'products',
  packages:               'packages',
  menu_role_config:       'menu_role_config',
  warehouse_stock:        'warehouse_stock',
  production_stock:       'production_stock',
  finished_goods_stock:   'finished_goods_stock',
  stock:                  'stock',
  store_product_prices:   'store_product_prices',
  promotions:             'promotions',
  warehouse_mutations:    'warehouse_mutations',
  warehouse_mutation_items: 'warehouse_mutation_items',
  production_mutations:   'production_mutations',
  production_mutation_items: 'production_mutation_items',
  production_recipes:     'production_recipes',
  production_recipe_items: 'production_recipe_items',
  warehouse_expenses:     'warehouse_expenses',
  purchases:              'purchases',
  purchase_items:         'purchase_items',
  store_recipes:          'store_recipes',
  store_recipe_items:     'store_recipe_items',
}

// ── Realtime: subscribe ke semua tabel penting ────────────────
function startRealtime(storeId: string) {
  // Bersihkan channel lama kalau ada
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }

  realtimeChannel = supabase
    .channel('coco-puff-realtime')
    // Daftarkan semua tabel yang perlu disync realtime
    .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' },           payload => handleRealtimeChange('materials', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' },           payload => handleRealtimeChange('suppliers', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'partners' },            payload => handleRealtimeChange('partners', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' },              payload => handleRealtimeChange('stores', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' },               payload => handleRealtimeChange('users', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' },          payload => handleRealtimeChange('categories', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' },            payload => handleRealtimeChange('products', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' },            payload => handleRealtimeChange('packages', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' },     payload => handleRealtimeChange('warehouse_stock', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_stock' },    payload => handleRealtimeChange('production_stock', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finished_goods_stock' },payload => handleRealtimeChange('finished_goods_stock', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' },               payload => handleRealtimeChange('stock', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_product_prices' },payload => handleRealtimeChange('store_product_prices', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions' },          payload => handleRealtimeChange('promotions', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_mutations' }, payload => handleRealtimeChange('warehouse_mutations', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_mutation_items' }, payload => handleRealtimeChange('warehouse_mutation_items', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_mutations' },payload => handleRealtimeChange('production_mutations', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_recipes' },  payload => handleRealtimeChange('production_recipes', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_recipe_items' }, payload => handleRealtimeChange('production_recipe_items', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_expenses' },  payload => handleRealtimeChange('warehouse_expenses', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' },           payload => handleRealtimeChange('purchases', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_items' },      payload => handleRealtimeChange('purchase_items', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_recipes' },       payload => handleRealtimeChange('store_recipes', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_recipe_items' },  payload => handleRealtimeChange('store_recipe_items', payload))
    .subscribe((status) => {
      console.log(`[REALTIME] Status: ${status}`)
      // Kalau realtime reconnect setelah putus, langsung pull ulang untuk
      // pastikan tidak ada data yang terlewat selama offline
      if (status === 'SUBSCRIBED') {
        console.log('[REALTIME] Connected — pull ulang untuk catch up')
        pullFromSupabase(storeId)
      }
    })
}

// ── Handler perubahan realtime ────────────────────────────────
async function handleRealtimeChange(tableName: string, payload: any) {
  const dexieTableName = TABLE_MAP[tableName]
  if (!dexieTableName) return

  const table = (db as any)[dexieTableName]
  if (!table) return

  try {
    const { eventType, new: newRecord, old: oldRecord } = payload

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (newRecord?.id) {
        await table.put(newRecord)
        console.log(`[REALTIME] ${eventType} ${tableName} id=${newRecord.id}`)
      }
    } else if (eventType === 'DELETE') {
      if (oldRecord?.id) {
        await table.delete(oldRecord.id)
        console.log(`[REALTIME] DELETE ${tableName} id=${oldRecord.id}`)
      }
    }
  } catch (e) {
    console.warn(`[REALTIME] Gagal handle ${tableName}:`, e)
  }
}

// ── Pull dari Supabase → Dexie (full refresh) ─────────────────
export async function pullFromSupabase(storeId?: string) {
  const sid = storeId || currentStoreId
  if (!sid || isPulling) return
  isPulling = true

  try {
    // ── Tabel MASTER — pakai replace strategy ────────────────
    // Replace = clear dulu lalu bulkPut, sehingga record yang
    // dihapus di Supabase ikut hilang dari Dexie lokal
    const [cats, prods, mats, sups, parts, stores, recipes, pkgs, menuCfg, users] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase.from('products').select('*'),
      supabase.from('materials').select('*'),
      supabase.from('suppliers').select('*'),
      supabase.from('partners').select('*'),
      supabase.from('stores').select('*'),
      supabase.from('production_recipes').select('*'),
      supabase.from('packages').select('*'),
      supabase.from('menu_role_config').select('*'),
      supabase.from('users').select('*').eq('is_active', true),
    ])

    // Replace strategy untuk tabel master (hapus propagate)
    await replaceTable(db.categories,        cats.data)
    await replaceTable(db.products,          prods.data)
    await replaceTable(db.materials,         mats.data)
    await replaceTable(db.suppliers,         sups.data)
    await replaceTable(db.partners,          parts.data)
    await replaceTable(db.stores,            stores.data)
    await replaceTable(db.production_recipes,recipes.data)
    await replaceTable(db.packages,          pkgs.data)
    await replaceTable(db.menu_role_config,  menuCfg.data)
    await replaceTable(db.users,             users.data)

    // ── Data per store + data operasional ────────────────────
    // Pakai bulkPut (bukan replace) karena data ini besar dan
    // penghapusan sudah dihandle oleh realtime
    const [
      prices, promos, stock, wstock, pstock, fgstock,
      wmuts, wmutItems, pmuts, recipeItems,
      wexpenses, purchases, purchItems,
      storeRecipes, storeRecipeItems,
    ] = await Promise.all([
      supabase.from('store_product_prices').select('*').eq('store_id', sid),
      supabase.from('promotions').select('*').eq('store_id', sid),
      supabase.from('stock').select('*').eq('store_id', sid),
      supabase.from('warehouse_stock').select('*'),
      supabase.from('production_stock').select('*'),
      supabase.from('finished_goods_stock').select('*'),
      supabase.from('warehouse_mutations').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('warehouse_mutation_items').select('*'),
      supabase.from('production_mutations').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('production_recipe_items').select('*'),
      supabase.from('warehouse_expenses').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('purchase_items').select('*'),
      supabase.from('store_recipes').select('*').eq('store_id', sid),
      supabase.from('store_recipe_items').select('*'),
    ])

    // Untuk stok — replace agar delete propagate
    await replaceTable(db.store_product_prices, prices.data)
    await replaceTable(db.promotions,           promos.data)
    await replaceTable(db.stock,                stock.data)
    await replaceTable(db.warehouse_stock,      wstock.data)
    await replaceTable(db.production_stock,     pstock.data)
    await replaceTable(db.finished_goods_stock, fgstock.data)
    await replaceTable(db.store_recipes,        storeRecipes.data)
    await replaceTable(db.store_recipe_items,   storeRecipeItems.data)
    await replaceTable(db.production_recipe_items, recipeItems.data)

    // Untuk data transaksi — bulkPut (terlalu banyak untuk replace)
    if (wmuts.data?.length)      await db.warehouse_mutations.bulkPut(wmuts.data)
    if (wmutItems.data?.length)  await db.warehouse_mutation_items.bulkPut(wmutItems.data)
    if (pmuts.data?.length)      await db.production_mutations.bulkPut(pmuts.data)
    if (wexpenses.data?.length)  await db.warehouse_expenses.bulkPut(wexpenses.data)
    if (purchases.data?.length)  await db.purchases.bulkPut(purchases.data)
    if (purchItems.data?.length) await db.purchase_items.bulkPut(purchItems.data)

    console.log(`[SYNC] Pull selesai — toko: ${sid}`)
  } catch (e) {
    console.warn('[SYNC] Pull gagal (offline?):', e)
  } finally {
    isPulling = false
  }
}

// ── Replace strategy: clear + bulkPut ────────────────────────
// Ini memastikan record yang dihapus di Supabase ikut hilang dari Dexie
async function replaceTable(table: any, data: any[] | null) {
  if (data === null) return   // query gagal — jangan hapus data lokal
  await table.clear()
  if (data.length > 0) await table.bulkPut(data)
}

// ── Push sync_queue ke Supabase ───────────────────────────────
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

// ── Start / Stop ──────────────────────────────────────────────
export function startSyncWorker(storeId: string) {
  setCurrentStoreId(storeId)

  // Jangan start ulang kalau sudah jalan dengan store yang sama
  if (pushInterval && currentStoreId === storeId) return

  // Bersihkan worker lama kalau ada
  stopSyncWorker()

  // Pull pertama saat start
  pullFromSupabase(storeId)

  // Realtime — update instan saat ada perubahan di device lain
  startRealtime(storeId)

  // Push sync_queue tiap 30 detik
  pushInterval = setInterval(() => { pushToSupabase() }, 30_000)

  // Pull penuh tiap 60 detik sebagai fallback kalau realtime putus/miss
  pullInterval = setInterval(() => { pullFromSupabase(storeId) }, 60_000)

  // Pull ulang saat tab kembali aktif (user switch tab / buka hp)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Pull ulang saat kembali online setelah offline
  window.addEventListener('online', handleOnline)

  console.log(`[SYNC] Worker v2 started — toko: ${storeId}`)
}

export function stopSyncWorker() {
  if (pushInterval) { clearInterval(pushInterval); pushInterval = null }
  if (pullInterval) { clearInterval(pullInterval); pullInterval = null }
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null }
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('online', handleOnline)
  currentStoreId = ''
  console.log('[SYNC] Worker stopped')
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    console.log('[SYNC] Tab aktif — pull ulang')
    pullFromSupabase()
  }
}

function handleOnline() {
  console.log('[SYNC] Kembali online — pull + push ulang')
  pullFromSupabase()
  pushToSupabase()
}

export function isOnline(): boolean { return navigator.onLine }
