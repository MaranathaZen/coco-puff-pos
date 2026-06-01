import Dexie, { type Table } from 'dexie'
import type {
  Store, User, Shift, Category, Product, StoreProductPrice,
  Promotion, Ingredient, Recipe, Transaction, TransactionItem,
  Stock, StockMutation, SyncQueueItem
} from '@/types'

export interface Package {
  id: string; name: string; description?: string
  qty_total: number; price: number; is_mix: boolean
  is_active: boolean; store_id?: string
  created_at: string; updated_at: string
}

export interface Material {
  id: string; name: string
  category: 'bahan_baku' | 'bahan_setengah_jadi' | 'packaging' | 'non_produksi'
  unit: string; unit_cost: number; min_stock: number
  is_active: boolean; created_at: string; updated_at: string
  // Moving average cost tracking (gudang)
  avg_cost?: number
  total_qty_purchased?: number
  total_cost_purchased?: number
}

export interface Supplier {
  id: string; name: string; phone?: string
  address?: string; is_active: boolean; created_at: string
}

export interface Partner {
  id: string; name: string; contact?: string
  address?: string; city?: string; is_active: boolean; created_at: string
}

export interface WarehouseStock {
  id: string; material_id: string; qty_on_hand: number; last_updated: string
}

// FIX: tambah avg_cost — isolated dari gudang, hanya berubah saat terima mutasi baru
export interface ProductionStock {
  id: string
  material_id: string
  qty_on_hand: number
  avg_cost?: number   // snapshot harga saat diterima dari gudang, tidak ikut berubah saat gudang beli lagi
  last_updated: string
}

export interface FinishedGoodsStock {
  id: string; product_id: string; product_name: string
  qty_on_hand: number; hpp_per_unit?: number; last_updated: string
}

export interface Purchase {
  id: string; supplier_id?: string; invoice_no?: string
  po_number?: string; payment_method?: string
  total_amount: number; status: string; notes?: string
  created_by: string; created_at: string
}

export interface PurchaseItem {
  id: string; purchase_id: string; material_id: string
  qty: number; unit_cost: number; subtotal: number; qty_returned: number
}

export interface PurchaseReturn {
  id: string; purchase_id?: string; material_id: string
  qty: number; reason?: string; created_by: string; created_at: string
}

export interface WarehouseMutation {
  id: string; mutation_type: string
  mutation_number?: string
  destination_id?: string; destination_name?: string
  notes?: string; status: string; created_by: string
  created_at: string; confirmed_at?: string; confirmed_by?: string
}

export interface WarehouseMutationItem {
  id: string; mutation_id: string; material_id: string; qty: number; unit_cost: number
}

export interface ProductionRecipe {
  id: string; name: string; batch_yield: number
  yield_unit: string; is_active: boolean; created_at: string
  product_name?: string
}

export interface ProductionRecipeItem {
  id: string; recipe_id: string; material_id: string
  qty_per_batch: number; notes?: string
}

export interface ProductionLog {
  id: string; recipe_id: string; batch_count: number
  total_yield: number; notes?: string; created_by: string; created_at: string
}

export interface ProductionLogMaterial {
  id: string; log_id: string; material_id: string; qty_used: number
}

export interface ProductionMutation {
  id: string; mutation_type: string
  destination_id?: string; destination_name?: string
  notes?: string; status: string; created_by: string
  created_at: string; confirmed_at?: string; confirmed_by?: string
}

export interface ProductionMutationItem {
  id: string; mutation_id: string; product_id: string; product_name: string; qty: number
}

export interface WarehouseExpense {
  id: string; name: string; amount: number
  expense_number?: string
  expense_date: string; category: string
  payment_method?: string
  transfer_to?: string
  due_date?: string
  notes?: string; created_by: string; created_at: string
}

export interface MenuRoleConfig {
  id: string; role: string; menu_path: string
  menu_label: string; is_visible: boolean; sort_order: number
}

export interface StoreRecipe {
  id: string
  store_id: string
  product_id: string
  product_name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StoreRecipeItem {
  id: string
  recipe_id: string
  material_id: string
  qty_used: number
  source: 'warehouse' | 'production' | 'store'
  notes?: string
}

export class CocoPuffDB extends Dexie {
  stores!:                    Table<Store>
  users!:                     Table<User>
  shifts!:                    Table<Shift>
  categories!:                Table<Category>
  products!:                  Table<Product>
  store_product_prices!:      Table<StoreProductPrice>
  promotions!:                Table<Promotion>
  ingredients!:               Table<Ingredient>
  recipes!:                   Table<Recipe>
  transactions!:              Table<Transaction>
  transaction_items!:         Table<TransactionItem>
  stock!:                     Table<Stock>
  stock_mutations!:           Table<StockMutation>
  packages!:                  Table<Package>
  sync_queue!:                Table<SyncQueueItem>
  materials!:                 Table<Material>
  suppliers!:                 Table<Supplier>
  partners!:                  Table<Partner>
  warehouse_stock!:           Table<WarehouseStock>
  production_stock!:          Table<ProductionStock>
  finished_goods_stock!:      Table<FinishedGoodsStock>
  purchases!:                 Table<Purchase>
  purchase_items!:            Table<PurchaseItem>
  purchase_returns!:          Table<PurchaseReturn>
  warehouse_mutations!:       Table<WarehouseMutation>
  warehouse_mutation_items!:  Table<WarehouseMutationItem>
  production_recipes!:        Table<ProductionRecipe>
  production_recipe_items!:   Table<ProductionRecipeItem>
  production_logs!:           Table<ProductionLog>
  production_log_materials!:  Table<ProductionLogMaterial>
  production_mutations!:      Table<ProductionMutation>
  production_mutation_items!: Table<ProductionMutationItem>
  warehouse_expenses!:        Table<WarehouseExpense>
  menu_role_config!:          Table<MenuRoleConfig>
  store_recipes!:             Table<StoreRecipe>
  store_recipe_items!:        Table<StoreRecipeItem>

  constructor() {
    super('CocoPuffPOS')

    const base = {
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
    }

    const v3v4shared = {
      packages:                  'id, is_active, store_id',
      materials:                 'id, name, category, is_active',
      suppliers:                 'id, name, is_active',
      partners:                  'id, name, is_active',
      warehouse_stock:           'id, material_id',
      production_stock:          'id, material_id',
      finished_goods_stock:      'id, product_id',
      purchases:                 'id, supplier_id, status, created_at',
      purchase_items:            'id, purchase_id, material_id',
      purchase_returns:          'id, purchase_id, material_id, created_at',
      warehouse_mutations:       'id, mutation_type, status, created_at',
      warehouse_mutation_items:  'id, mutation_id, material_id',
      production_recipes:        'id, name, is_active',
      production_recipe_items:   'id, recipe_id, material_id',
      production_logs:           'id, recipe_id, created_at',
      production_log_materials:  'id, log_id, material_id',
      production_mutations:      'id, mutation_type, status, created_at',
      production_mutation_items: 'id, mutation_id, product_id',
    }

    this.version(1).stores(base)
    this.version(2).stores({ ...base, packages: 'id, is_active, store_id' })
    this.version(3).stores({ ...base, ...v3v4shared })
    this.version(4).stores({
      ...base,
      ...v3v4shared,
      warehouse_expenses: 'id, category, expense_date, created_at',
      menu_role_config:   'id, role, menu_path, [role+menu_path]',
    })
    this.version(5).stores({
      ...base,
      ...v3v4shared,
      warehouse_expenses: 'id, category, expense_date, created_at',
      menu_role_config:   'id, role, menu_path, [role+menu_path]',
      purchases:          'id, supplier_id, status, created_at, po_number',
    })
    this.version(6).stores({
      ...base,
      ...v3v4shared,
      warehouse_expenses:  'id, category, expense_date, created_at',
      menu_role_config:    'id, role, menu_path, [role+menu_path]',
      purchases:           'id, supplier_id, status, created_at, po_number',
      store_recipes:       'id, store_id, product_id, [store_id+product_id], is_active',
      store_recipe_items:  'id, recipe_id, material_id',
    })
    // v7: tambah index material_id di stock agar mutasi gudang→toko bisa query by material
    this.version(7).stores({
      ...base,
      ...v3v4shared,
      warehouse_expenses:  'id, category, expense_date, created_at',
      menu_role_config:    'id, role, menu_path, [role+menu_path]',
      purchases:           'id, supplier_id, status, created_at, po_number',
      store_recipes:       'id, store_id, product_id, [store_id+product_id], is_active',
      store_recipe_items:  'id, recipe_id, material_id',
      // FIX: tambah index material_id di stock sebagai jembatan gudang→toko
      stock:               'id, store_id, ingredient_id, [store_id+ingredient_id], material_id',
    })
  }
}

export const db = new CocoPuffDB()
export function generateId(): string { return crypto.randomUUID() }
export function now(): string { return new Date().toISOString() }

export async function addToSyncQueue(
  table_name: string,
  record_id: string,
  operation: 'insert' | 'update' | 'delete',
  payload: object,
  store_id: string
) {
  await db.sync_queue.add({
    id: generateId(), store_id, table_name, record_id, operation,
    payload: JSON.stringify(payload), status: 'pending',
    retry_count: 0, created_at: now(),
  })
}
