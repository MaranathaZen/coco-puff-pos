// ── Auth & Users ──────────────────────────────────────────────
export type Role = 'owner' | 'manager' | 'kasir' | 'gudang'

export interface User {
  id: string
  store_id: string
  name: string
  username: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface Store {
  id: string
  name: string
  city: string
  address?: string
  phone?: string
  is_active: boolean
  created_at: string
}

export interface Shift {
  id: string
  store_id: string
  user_id: string
  opened_at: string
  closed_at?: string
  opening_cash: number
  closing_cash?: number
  note?: string
  status: 'open' | 'closed'
}

// ── Products ─────────────────────────────────────────────────
export interface Category {
  id: string
  name: string
  description?: string
  sort_order: number
}

export interface Product {
  id: string
  category_id?: string
  name: string
  sku?: string
  base_price: number
  unit: string
  pkg_qty: number
  pkg_unit: string
  auto_package: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  // joined
  category?: Category
  effective_price?: number
}

export interface StoreProductPrice {
  id: string
  store_id: string
  product_id: string
  override_price: number
  is_active: boolean
  updated_at: string
}

export interface Promotion {
  id: string
  store_id: string
  product_id: string
  name: string
  promo_type: 'percent' | 'fixed'
  value: number
  valid_from: string
  valid_until: string
  is_active: boolean
  created_at: string
}

// ── Ingredients & Recipes ────────────────────────────────────
export interface Ingredient {
  id: string
  name: string
  unit: string
  cost_per_unit: number
  is_active: boolean
}

export interface Recipe {
  id: string
  product_id: string
  ingredient_id: string
  qty_used: number
  ingredient?: Ingredient
}

// ── Transactions ─────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'qris' | 'transfer'

export interface Transaction {
  id: string
  store_id: string
  shift_id: string
  cashier_id: string
  receipt_no: string
  subtotal: number
  discount: number
  total: number
  payment_method: PaymentMethod
  cash_paid: number
  change_given: number
  status: 'completed' | 'voided'
  void_reason?: string
  voided_by?: string
  voided_at?: string
  created_at: string
  // joined
  items?: TransactionItem[]
  cashier?: User
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_id: string
  product_name: string
  qty_eceran: number
  qty_dus: number
  unit_price: number
  discount: number
  subtotal: number
}

// ── Cart (state POS, tidak disimpan ke DB) ───────────────────
export interface CartItem {
  product: Product
  qty: number
  unit_price: number
  discount: number
  subtotal: number
}

// ── Stock ─────────────────────────────────────────────────────
export interface Stock {
  id: string
  store_id: string
  ingredient_id: string
  qty_on_hand: number
  last_updated: string
  ingredient?: Ingredient
}

export interface StockMutation {
  id: string
  store_id: string
  ingredient_id: string
  mutation_type: 'sale' | 'purchase' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'void_reversal'
  qty: number
  qty_before: number
  qty_after: number
  ref_id?: string
  note?: string
  created_by: string
  created_at: string
  ingredient?: Ingredient
  creator?: User
}

// ── Sync ──────────────────────────────────────────────────────
export interface SyncQueueItem {
  id: string
  store_id: string
  table_name: string
  record_id: string
  operation: 'insert' | 'update' | 'delete'
  payload: string
  status: 'pending' | 'syncing' | 'done' | 'failed'
  retry_count: number
  error_msg?: string
  created_at: string
  synced_at?: string
}
