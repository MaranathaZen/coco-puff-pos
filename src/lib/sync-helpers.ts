// src/lib/sync-helpers.ts
// REPLACE strategy — clear dulu baru isi dari server
// Mencegah data lama/duplikat muncul lokal

import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

/** Sync master data dengan REPLACE total */
export async function syncMasterData() {
  try {
    const [storesRes, usersRes, matsRes, suppRes, partRes, prodsRes, catsRes] = await Promise.all([
      supabase.from('stores').select('*').eq('is_active', true),
      supabase.from('users').select('*').eq('is_active', true),
      supabase.from('materials').select('*'),
      supabase.from('suppliers').select('*'),
      supabase.from('partners').select('*'),
      supabase.from('products').select('*').eq('is_active', true),
      supabase.from('categories').select('*'),
    ])
    // REPLACE: clear dulu
    if (storesRes.data !== null) { await db.stores.clear(); if (storesRes.data.length) await db.stores.bulkPut(storesRes.data) }
    if (usersRes.data  !== null) { await db.users.clear();  if (usersRes.data.length)  await db.users.bulkPut(usersRes.data)   }
    if (matsRes.data   !== null) { await db.materials.clear(); if (matsRes.data.length) await db.materials.bulkPut(matsRes.data) }
    if (suppRes.data   !== null) { await db.suppliers.clear(); if (suppRes.data.length) await db.suppliers.bulkPut(suppRes.data) }
    if (partRes.data   !== null) { await db.partners.clear();  if (partRes.data.length) await db.partners.bulkPut(partRes.data)  }
    if (prodsRes.data  !== null) { await db.products.clear();  if (prodsRes.data.length) await db.products.bulkPut(prodsRes.data) }
    if (catsRes.data   !== null) { await db.categories.clear(); if (catsRes.data.length) await db.categories.bulkPut(catsRes.data) }
    return true
  } catch (e) { console.error('[SYNC MASTER]', e); return false }
}

/** Sync transactional data — REPLACE per tabel */
export async function syncStoreData(storeId: string) {
  try {
    const [txRes, wsRes, psRes, fgsRes, expRes, purRes, mutRes, mutItemRes, prodLogsRes, prodMutRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('store_id', storeId),
      supabase.from('warehouse_stock').select('*'),
      supabase.from('production_stock').select('*'),
      supabase.from('finished_goods_stock').select('*'),
      supabase.from('warehouse_expenses').select('*'),
      supabase.from('purchases').select('*'),
      supabase.from('warehouse_mutations').select('*'),
      supabase.from('warehouse_mutation_items').select('*'),
      supabase.from('production_logs').select('*').order('created_at',{ascending:false}).limit(200),
      supabase.from('production_mutations').select('*').order('created_at',{ascending:false}).limit(200),
    ])

    // Transactions: REPLACE per store
    if (txRes.data !== null) {
      const oldIds = await db.transactions.where('store_id').equals(storeId).primaryKeys()
      if (oldIds.length) await db.transactions.bulkDelete(oldIds)
      if (txRes.data.length) await db.transactions.bulkPut(txRes.data)
    }
    // Warehouse stock: REPLACE total
    if (wsRes.data !== null)  { await db.warehouse_stock.clear();     if (wsRes.data.length)  await db.warehouse_stock.bulkPut(wsRes.data)  }
    if (psRes.data !== null)  { await db.production_stock.clear();    if (psRes.data.length)  await db.production_stock.bulkPut(psRes.data) }
    if (fgsRes.data !== null) { await db.finished_goods_stock.clear();if (fgsRes.data.length) await db.finished_goods_stock.bulkPut(fgsRes.data) }

    // Expenses: REPLACE total
    if (expRes.data  !== null) { await db.warehouse_expenses.clear();        if (expRes.data.length)     await db.warehouse_expenses.bulkPut(expRes.data)        }
    if (purRes.data  !== null) { await db.purchases.clear();                 if (purRes.data.length)     await db.purchases.bulkPut(purRes.data)                 }
    if (mutRes.data  !== null) { await db.warehouse_mutations.clear();       if (mutRes.data.length)     await db.warehouse_mutations.bulkPut(mutRes.data)       }
    if (mutItemRes.data !== null) { await db.warehouse_mutation_items.clear(); if (mutItemRes.data.length) await db.warehouse_mutation_items.bulkPut(mutItemRes.data) }

    // Production: REPLACE total
    if (prodLogsRes.data !== null) { await db.production_logs.clear(); if (prodLogsRes.data.length) await db.production_logs.bulkPut(prodLogsRes.data) }
    if (prodMutRes.data  !== null) { await db.production_mutations.clear(); if (prodMutRes.data.length) await db.production_mutations.bulkPut(prodMutRes.data) }

    return true
  } catch (e) { console.error('[SYNC STORE]', e); return false }
}

/** Sync all */
export async function syncAll(storeId: string, showToast = true): Promise<boolean> {
  try {
    await Promise.all([syncMasterData(), syncStoreData(storeId)])
    if (showToast) toast.success('Data diperbarui')
    return true
  } catch (e) {
    console.error('[SYNC ALL]', e)
    if (showToast) toast.error('Gagal sync')
    return false
  }
}

/** Hard reset IndexedDB — hapus SEMUA data lokal */
export async function hardResetLocal() {
  const tables = [
    db.transactions, db.transaction_items,
    db.stores, db.users, db.materials, db.products, db.categories,
    db.suppliers, db.partners,
    db.stock, db.warehouse_stock, db.production_stock, db.finished_goods_stock,
    db.purchases, db.purchase_items,
    db.warehouse_expenses, db.warehouse_mutations, db.warehouse_mutation_items,
    db.production_logs, (db as any).production_log_materials,
    db.production_recipes, db.production_recipe_items,
    db.production_mutations, (db as any).production_mutation_items,
    db.shifts, db.promotions, (db as any).sync_queue,
  ]
  await Promise.all(tables.filter(Boolean).map((t: any) => t.clear().catch(() => {})))
  localStorage.clear()
  sessionStorage.clear()
}
