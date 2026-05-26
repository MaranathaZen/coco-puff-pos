/**
 * Database lokal offline menggunakan Dexie (IndexedDB wrapper)
 * Sama konsepnya dengan SQLite di Python — data disimpan lokal dulu,
 * lalu disync ke Supabase di background.
 */
import Dexie, { type Table } from 'dexie'
import type {
  Store, User, Shift, Category, Product, StoreProductPrice,
  Promotion, Ingredient, Recipe, Transaction, TransactionItem,
  Stock, StockMutation, SyncQueueItem
} from '@/types'

export class CocoPuffDB extends Dexie {
  stores!:              Table<Store>
  users!:               Table<User>
  shifts!:              Table<Shift>
  categories!:          Table<Category>
  products!:            Table<Product>
  store_product_prices!:Table<StoreProductPrice>
  promotions!:          Table<Promotion>
  ingredients!:         Table<Ingredient>
  recipes!:             Table<Recipe>
  transactions!:        Table<Transaction>
  transaction_items!:   Table<TransactionItem>
  stock!:               Table<Stock>
  stock_mutations!:     Table<StockMutation>
  sync_queue!:          Table<SyncQueueItem>

  constructor() {
    super('CocoPuffPOS')
    this.version(1).stores({
      stores:               'id, name, city, is_active',
      users:                'id, store_id, username, role, is_active',
      shifts:               'id, store_id, user_id, status, opened_at',
      categories:           'id, name, sort_order',
      products:             'id, category_id, name, sku, is_active',
      store_product_prices: 'id, store_id, product_id, [store_id+product_id]',
      promotions:           'id, store_id, product_id, is_active',
      ingredients:          'id, name, is_active',
      recipes:              'id, product_id, ingredient_id, [product_id+ingredient_id]',
      transactions:         'id, store_id, shift_id, cashier_id, receipt_no, status, created_at',
      transaction_items:    'id, transaction_id, product_id',
      stock:                'id, store_id, ingredient_id, [store_id+ingredient_id]',
      stock_mutations:      'id, store_id, ingredient_id, mutation_type, created_at',
      sync_queue:           'id, store_id, table_name, status, created_at',
    })
  }
}

export const db = new CocoPuffDB()

// ── Helper: generate UUID ────────────────────────────────────
export function generateId(): string {
  return crypto.randomUUID()
}

// ── Helper: timestamp sekarang ───────────────────────────────
export function now(): string {
  return new Date().toISOString()
}

// ── Helper: tambah ke sync queue ─────────────────────────────
export async function addToSyncQueue(
  table_name: string,
  record_id: string,
  operation: 'insert' | 'update' | 'delete',
  payload: object,
  store_id: string
) {
  await db.sync_queue.add({
    id: generateId(),
    store_id,
    table_name,
    record_id,
    operation,
    payload: JSON.stringify(payload),
    status: 'pending',
    retry_count: 0,
    created_at: now(),
  })
}
