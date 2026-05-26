/**
 * Seed data awal — jalankan sekali saat pertama install.
 * Membuat: store, user admin, kategori contoh, produk contoh.
 */
import { db, generateId, now } from '@/lib/db'
import { hashPassword } from '@/lib/utils'
import { STORE_ID, STORE_NAME } from '@/lib/supabase'

let _seeding = false

export async function seedIfEmpty() {
  if (_seeding) return
  _seeding = true

  const userCount = await db.users.count()
  if (userCount > 0) { _seeding = false; return }

  console.log('[SEED] Inisialisasi data awal...')

  // Store
  await db.stores.put({
    id: STORE_ID,
    name: STORE_NAME,
    city: 'Kota A',
    is_active: true,
    created_at: now(),
  })

  // Users
  const adminHash = await hashPassword('admin123')
  const kasirHash = await hashPassword('kasir123')

  const ownerId   = generateId()
  const kasirId   = generateId()
  const gudangId  = generateId()

  await db.users.bulkPut([
    {
      id: ownerId,
      store_id: STORE_ID,
      name: 'Owner',
      username: 'owner',
      password_hash: adminHash,
      role: 'owner',
      is_active: true,
      created_at: now(),
    },
    {
      id: generateId(),
      store_id: STORE_ID,
      name: 'Manager Toko',
      username: 'manager',
      password_hash: adminHash,
      role: 'manager',
      is_active: true,
      created_at: now(),
    },
    {
      id: kasirId,
      store_id: STORE_ID,
      name: 'Kasir 1',
      username: 'kasir',
      password_hash: kasirHash,
      role: 'kasir',
      is_active: true,
      created_at: now(),
    },
    {
      id: gudangId,
      store_id: STORE_ID,
      name: 'Petugas Gudang',
      username: 'gudang',
      password_hash: kasirHash,
      role: 'gudang',
      is_active: true,
      created_at: now(),
    },
  ])

  // Kategori
  const catId1 = generateId()
  const catId2 = generateId()
  await db.categories.bulkPut([
    { id: catId1, name: 'Puff',    description: 'Aneka puff',   sort_order: 1 },
    { id: catId2, name: 'Minuman', description: 'Aneka minuman', sort_order: 2 },
  ])

  // Produk
  const prod1 = generateId()
  const prod2 = generateId()
  const prod3 = generateId()
  await db.products.bulkPut([
    {
      id: prod1, category_id: catId1,
      name: 'Puff Original', sku: 'PO-001',
      base_price: 2000, unit: 'puff',
      pkg_qty: 10, pkg_unit: 'dus',
      auto_package: true, is_active: true,
      created_at: now(), updated_at: now(),
    },
    {
      id: prod2, category_id: catId1,
      name: 'Puff Coklat', sku: 'PC-001',
      base_price: 2500, unit: 'puff',
      pkg_qty: 10, pkg_unit: 'dus',
      auto_package: true, is_active: true,
      created_at: now(), updated_at: now(),
    },
    {
      id: prod3, category_id: catId2,
      name: 'Es Teh', sku: 'ET-001',
      base_price: 5000, unit: 'cup',
      pkg_qty: 1, pkg_unit: 'cup',
      auto_package: false, is_active: true,
      created_at: now(), updated_at: now(),
    },
  ])

  console.log('[SEED] Selesai!')
  console.log('[SEED] Login: owner/admin123, kasir/kasir123, gudang/kasir123')
}
