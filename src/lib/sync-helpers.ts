// src/lib/sync-helpers.ts
// Helper untuk sync yang benar: clear dulu lalu bulkPut
// Mencegah data lama yang sudah dihapus di server masih muncul lokal

import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Sync master data (stores, users, materials, dll)
 * Strategy: REPLACE — clear lokal dulu, lalu isi dari server
 * Dipakai untuk tabel yang datanya harus 100% sama dengan server
 */
export async function syncMasterData(storeId?: string) {
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

    // REPLACE strategy — clear dulu baru isi
    if (storesRes.data !== null) {
      await db.stores.clear()
      if (storesRes.data.length) await db.stores.bulkPut(storesRes.data)
    }
    if (usersRes.data !== null) {
      await db.users.clear()
      if (usersRes.data.length) await db.users.bulkPut(usersRes.data)
    }
    if (matsRes.data !== null) {
      await db.materials.clear()
      if (matsRes.data.length) await db.materials.bulkPut(matsRes.data)
    }
    if (suppRes.data !== null) {
      await db.suppliers.clear()
      if (suppRes.data.length) await db.suppliers.bulkPut(suppRes.data)
    }
    if (partRes.data !== null) {
      await db.partners.clear()
      if (partRes.data.length) await db.partners.bulkPut(partRes.data)
    }
    if (prodsRes.data !== null) {
      await db.products.clear()
      if (prodsRes.data.length) await db.products.bulkPut(prodsRes.data)
    }
    if (catsRes.data !== null) {
      await db.categories.clear()
      if (catsRes.data.length) await db.categories.bulkPut(catsRes.data)
    }

    return true
  } catch (e) {
    console.error('[SYNC MASTER]', e)
    return false
  }
}

/**
 * Sync transactional data per toko
 * Strategy: REPLACE per store — hapus data toko ini, isi ulang dari server
 */
export async function syncStoreData(storeId: string) {
  try {
    const [txRes, tiRes, stockRes, wsRes, psRes, fgsRes, expRes, purRes, piRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('store_id', storeId),
      supabase.from('transaction_items').select('*'),
      supabase.from('stock').select('*').eq('store_id', storeId),
      supabase.from('warehouse_stock').select('*'),
      supabase.from('production_stock').select('*'),
      supabase.from('finished_goods_stock').select('*'),
      supabase.from('warehouse_expenses').select('*').eq('store_id', storeId),
      supabase.from('purchases').select('*').eq('store_id', storeId),
      supabase.from('purchase_items').select('*'),
    ])

    // Transactions: hapus toko ini dulu
    if (txRes.data !== null) {
      const oldIds = await db.transactions.where('store_id').equals(storeId).primaryKeys()
      if (oldIds.length) await db.transactions.bulkDelete(oldIds)
      if (txRes.data.length) await db.transactions.bulkPut(txRes.data)
    }

    // Transaction items: hapus yang transaction_id-nya milik toko ini
    if (tiRes.data !== null && txRes.data) {
      const txIds = new Set(txRes.data.map((t: any) => t.id))
      const oldItemIds = await db.transaction_items
        .filter(i => txIds.has(i.transaction_id))
        .primaryKeys()
      if (oldItemIds.length) await db.transaction_items.bulkDelete(oldItemIds)
      if (tiRes.data.length) await db.transaction_items.bulkPut(tiRes.data)
    }

    // Stock toko
    if (stockRes.data !== null) {
      const oldIds = await db.stock.where('store_id').equals(storeId).primaryKeys()
      if (oldIds.length) await db.stock.bulkDelete(oldIds)
      if (stockRes.data.length) await db.stock.bulkPut(stockRes.data)
    }

    // Warehouse stock: REPLACE total (satu gudang)
    if (wsRes.data !== null) {
      await db.warehouse_stock.clear()
      if (wsRes.data.length) await db.warehouse_stock.bulkPut(wsRes.data)
    }

    // Production stock: REPLACE total
    if (psRes.data !== null) {
      await db.production_stock.clear()
      if (psRes.data.length) await db.production_stock.bulkPut(psRes.data)
    }

    if (fgsRes.data !== null) {
      await db.finished_goods_stock.clear()
      if (fgsRes.data.length) await db.finished_goods_stock.bulkPut(fgsRes.data)
    }

    // Expenses toko
    if (expRes.data !== null) {
      const oldIds = await db.warehouse_expenses
        .filter(e => (e as any).store_id === storeId)
        .primaryKeys()
      if (oldIds.length) await db.warehouse_expenses.bulkDelete(oldIds)
      if (expRes.data.length) await db.warehouse_expenses.bulkPut(expRes.data)
    }

    // Purchases toko
    if (purRes.data !== null) {
      const oldIds = await db.purchases
        .filter(p => (p as any).store_id === storeId)
        .primaryKeys()
      if (oldIds.length) await db.purchases.bulkDelete(oldIds)
      if (purRes.data.length) {
        await db.purchases.bulkPut(purRes.data)
        // Purchase items terkait
        if (piRes.data !== null) {
          const purIds = new Set(purRes.data.map((p: any) => p.id))
          const oldPiIds = await db.purchase_items
            .filter(i => purIds.has(i.purchase_id))
            .primaryKeys()
          if (oldPiIds.length) await db.purchase_items.bulkDelete(oldPiIds)
          if (piRes.data.length) await db.purchase_items.bulkPut(piRes.data)
        }
      }
    }

    return true
  } catch (e) {
    console.error('[SYNC STORE]', e)
    return false
  }
}

/**
 * Sync all — master + store data
 * Dipanggil saat pertama login atau pull-to-refresh
 */
export async function syncAll(storeId: string, showToast = true): Promise<boolean> {
  try {
    const [masterOk] = await Promise.all([
      syncMasterData(),
      syncStoreData(storeId),
    ])
    if (showToast) toast.success('Data diperbarui')
    return true
  } catch (e) {
    console.error('[SYNC ALL]', e)
    if (showToast) toast.error('Gagal sync')
    return false
  }
}

/**
 * Hard reset IndexedDB — dipakai saat ganti akun atau clear data
 * Menghapus SEMUA data lokal, lalu reload
 */
export async function hardResetLocal() {
  const tables = [
    db.transactions, db.transaction_items,
    db.stores, db.users, db.materials, db.products, db.categories,
    db.suppliers, db.partners,
    db.stock, db.warehouse_stock, db.production_stock, db.finished_goods_stock,
    db.purchases, db.purchase_items,
    db.warehouse_expenses, db.warehouse_mutations, db.warehouse_mutation_items,
    db.production_logs, db.production_log_materials,
    db.production_recipes, db.production_recipe_items,
    db.finished_goods_stock, db.shifts,
    db.promotions, db.sync_queue,
  ]
  await Promise.all(tables.map(t => t.clear().catch(() => {})))
  localStorage.clear()
  sessionStorage.clear()
}
