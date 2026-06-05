/**
 * Sync offline-first — v5
 * FIX: tambah pull transactions, transaction_items, shifts semua toko
 */

import { supabase } from '@/lib/supabase'
import { db, now } from '@/lib/db'
import type { RealtimeChannel } from '@supabase/supabase-js'

let pushInterval:    ReturnType<typeof setInterval> | null = null
let pullInterval:    ReturnType<typeof setInterval> | null = null
let realtimeChannel: RealtimeChannel | null = null
let isSyncing      = false
let isPulling      = false
let currentStoreId = ''

export function setCurrentStoreId(storeId: string) {
  currentStoreId = storeId
}

const TABLE_MAP: Record<string, keyof typeof db> = {
  materials:                 'materials',
  suppliers:                 'suppliers',
  partners:                  'partners',
  stores:                    'stores',
  users:                     'users',
  categories:                'categories',
  products:                  'products',
  packages:                  'packages',
  menu_role_config:          'menu_role_config',
  warehouse_stock:           'warehouse_stock',
  production_stock:          'production_stock',
  finished_goods_stock:      'finished_goods_stock',
  stock:                     'stock',
  store_product_prices:      'store_product_prices',
  promotions:                'promotions',
  warehouse_mutations:       'warehouse_mutations',
  warehouse_mutation_items:  'warehouse_mutation_items',
  production_mutations:      'production_mutations',
  production_mutation_items: 'production_mutation_items',
  production_recipes:        'production_recipes',
  production_recipe_items:   'production_recipe_items',
  warehouse_expenses:        'warehouse_expenses',
  purchases:                 'purchases',
  purchase_items:            'purchase_items',
  store_recipes:             'store_recipes',
  store_recipe_items:        'store_recipe_items',
  production_logs:           'production_logs',
  production_log_materials:  'production_log_materials',
  transactions:              'transactions',
  transaction_items:         'transaction_items',
  shifts:                    'shifts',
}

function startRealtime(storeId: string) {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }

  realtimeChannel = supabase
    .channel('coco-puff-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' },                payload => handleRealtimeChange('materials', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' },                payload => handleRealtimeChange('suppliers', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'partners' },                 payload => handleRealtimeChange('partners', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' },                   payload => handleRealtimeChange('stores', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' },                    payload => handleRealtimeChange('users', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' },               payload => handleRealtimeChange('categories', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' },                 payload => handleRealtimeChange('products', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' },                 payload => handleRealtimeChange('packages', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' },          payload => handleRealtimeChange('warehouse_stock', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_stock' },         payload => handleRealtimeChange('production_stock', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finished_goods_stock' },     payload => handleRealtimeChange('finished_goods_stock', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' },                    payload => handleRealtimeChange('stock', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_product_prices' },     payload => handleRealtimeChange('store_product_prices', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions' },               payload => handleRealtimeChange('promotions', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_mutations' },      payload => handleRealtimeChange('warehouse_mutations', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_mutation_items' }, payload => handleRealtimeChange('warehouse_mutation_items', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_mutations' },     payload => handleRealtimeChange('production_mutations', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_recipes' },       payload => handleRealtimeChange('production_recipes', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_recipe_items' },  payload => handleRealtimeChange('production_recipe_items', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_expenses' },       payload => handleRealtimeChange('warehouse_expenses', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' },                payload => handleRealtimeChange('purchases', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_items' },           payload => handleRealtimeChange('purchase_items', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_recipes' },            payload => handleRealtimeChange('store_recipes', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_recipe_items' },       payload => handleRealtimeChange('store_recipe_items', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_logs' },          payload => handleRealtimeChange('production_logs', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'production_log_materials' }, payload => handleRealtimeChange('production_log_materials', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' },             payload => handleRealtimeChange('transactions', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_items' },        payload => handleRealtimeChange('transaction_items', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' },                   payload => handleRealtimeChange('shifts', payload))
    .subscribe((status) => {
      console.log(`[REALTIME] Status: ${status}`)
      if (status === 'SUBSCRIBED') {
        console.log('[REALTIME] Connected — pull ulang')
        pullFromSupabase(storeId)
      }
    })
}

async function handleRealtimeChange(tableName: string, payload: any) {
  const dexieTableName = TABLE_MAP[tableName]
  if (!dexieTableName) return
  const table = (db as any)[dexieTableName]
  if (!table) return
  try {
    const { eventType, new: newRecord, old: oldRecord } = payload
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (newRecord?.id) await table.put(newRecord)
    } else if (eventType === 'DELETE') {
      if (oldRecord?.id) await table.delete(oldRecord.id)
    }
  } catch (e) {
    console.warn(`[REALTIME] Gagal handle ${tableName}:`, e)
  }
}

export async function pullFromSupabase(storeId?: string) {
  const sid = storeId || currentStoreId
  if (!sid || isPulling) return
  isPulling = true

  try {
    // ── Data master — global ──────────────────────────────────
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

    await replaceTable(db.categories,         cats.data)
    await replaceTable(db.products,           prods.data)
    await replaceTable(db.materials,          mats.data)
    await replaceTable(db.suppliers,          sups.data)
    await replaceTable(db.partners,           parts.data)
    await replaceTable(db.stores,             stores.data)
    await replaceTable(db.production_recipes, recipes.data)
    await replaceTable(db.packages,           pkgs.data)
    await replaceTable(db.menu_role_config,   menuCfg.data)
    await replaceTable(db.users,              users.data)

    // ── Data operasional per toko ─────────────────────────────
    const [
      prices, promos, stock, wstock, pstock, fgstock,
      wmuts, wmutItems, pmuts, pmutItems, recipeItems,
      wexpenses, purchases, purchItems,
      storeRecipes, storeRecipeItems,
      prodLogs, prodLogMats,
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
      supabase.from('production_mutation_items').select('*'),
      supabase.from('production_recipe_items').select('*'),
      supabase.from('warehouse_expenses').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('purchase_items').select('*'),
      supabase.from('store_recipes').select('*').eq('store_id', sid),
      supabase.from('store_recipe_items').select('*'),
      supabase.from('production_logs').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('production_log_materials').select('*'),
    ])

    await replaceTable(db.store_product_prices,    prices.data)
    await replaceTable(db.promotions,              promos.data)
    await replaceTable(db.stock,                   stock.data)
    await replaceTable(db.warehouse_stock,         wstock.data)
    await replaceTable(db.production_stock,        pstock.data)
    await replaceTable(db.finished_goods_stock,    fgstock.data)
    if (storeRecipes.data?.length)     await db.store_recipes.bulkPut(storeRecipes.data)
    if (storeRecipeItems.data?.length) await db.store_recipe_items.bulkPut(storeRecipeItems.data)
    await replaceTable(db.production_recipe_items, recipeItems.data)

    const wMutIds  = new Set((wmuts.data     || []).map((m: any) => m.id))
    const pMutIds  = new Set((pmuts.data     || []).map((m: any) => m.id))
    const logIds   = new Set((prodLogs.data  || []).map((l: any) => l.id))
    const purchIds = new Set((purchases.data || []).map((p: any) => p.id))

    if (wmuts.data?.length)      await db.warehouse_mutations.bulkPut(wmuts.data)
    if (wmutItems.data?.length)  await db.warehouse_mutation_items.bulkPut((wmutItems.data  || []).filter((i: any) => wMutIds.has(i.mutation_id)))
    if (pmuts.data?.length)      await db.production_mutations.bulkPut(pmuts.data)
    if (pmutItems.data?.length)  await db.production_mutation_items.bulkPut((pmutItems.data || []).filter((i: any) => pMutIds.has(i.mutation_id)))
    if (wexpenses.data?.length)  await db.warehouse_expenses.bulkPut(wexpenses.data)
    if (purchases.data?.length)  await db.purchases.bulkPut(purchases.data)
    if (purchItems.data?.length) await db.purchase_items.bulkPut((purchItems.data || []).filter((i: any) => purchIds.has(i.purchase_id)))
    if (prodLogs.data?.length)   await db.production_logs.bulkPut(prodLogs.data)
    if (prodLogMats.data?.length) await db.production_log_materials.bulkPut((prodLogMats.data || []).filter((i: any) => logIds.has(i.log_id)))

    // ── FIX: Pull transaksi semua toko ─────────────────────────
    // Tanpa filter store_id supaya login gudang/owner bisa lihat semua toko
    const today = new Date().toLocaleDateString('sv-SE')
    const [txs, shifts] = await Promise.all([
      supabase.from('transactions').select('*')
        .gte('created_at', today + 'T00:00:00+07:00')
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('shifts').select('*')
        .order('opened_at', { ascending: false }).limit(300),
    ])
    const txIds = new Set((txs.data || []).map((t: any) => t.id))

    // Pull transaction_items hanya untuk transaksi hari ini
    let txItemsData: any[] = []
    if (txIds.size > 0) {
      const txIdArr = Array.from(txIds) as string[]
      // Supabase in() max 100 items per query — batch jika perlu
      for (let i = 0; i < txIdArr.length; i += 100) {
        const batch = txIdArr.slice(i, i + 100)
        const { data } = await supabase.from('transaction_items')
          .select('*').in('transaction_id', batch)
        if (data?.length) txItemsData = [...txItemsData, ...data]
      }
    }

    if (txs.data?.length)      await db.transactions.bulkPut(txs.data)
    if (txItemsData.length)    await db.transaction_items.bulkPut(txItemsData)
    if (shifts.data?.length)   await db.shifts.bulkPut(shifts.data)

    console.log(`[SYNC] Pull selesai — toko: ${sid}`)
  } catch (e) {
    console.warn('[SYNC] Pull gagal (offline?):', e)
  } finally {
    isPulling = false
  }
}

async function replaceTable(table: any, data: any[] | null) {
  if (data === null) return
  await table.clear()
  if (data.length > 0) await table.bulkPut(data)
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
  } finally {
    isSyncing = false
  }
}

export function startSyncWorker(storeId: string) {
  setCurrentStoreId(storeId)
  if (pushInterval && currentStoreId === storeId) return
  stopSyncWorker()

  pullFromSupabase(storeId)
  startRealtime(storeId)
  pushInterval = setInterval(() => { pushToSupabase() }, 30_000)
  pullInterval = setInterval(() => { pullFromSupabase(storeId) }, 60_000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', handleOnline)

  console.log(`[SYNC] Worker started — toko: ${storeId}`)
}

export function stopSyncWorker() {
  if (pushInterval)    { clearInterval(pushInterval);  pushInterval    = null }
  if (pullInterval)    { clearInterval(pullInterval);  pullInterval    = null }
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null }
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('online', handleOnline)
  currentStoreId = ''
  console.log('[SYNC] Worker stopped')
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') pullFromSupabase()
}
function handleOnline() {
  pullFromSupabase()
  pushToSupabase()
}

export function isOnline(): boolean { return navigator.onLine }
