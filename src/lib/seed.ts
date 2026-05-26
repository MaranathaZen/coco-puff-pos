/**
 * Seed data awal — semua toko dalam 1 database lokal.
 * User login → sistem deteksi toko dari store_id user.
 */
import { db, generateId, now } from '@/lib/db'
import { hashPassword } from '@/lib/utils'

let _seeding = false

export async function seedIfEmpty() {
  if (_seeding) return
  _seeding = true

  const userCount = await db.users.count()
  if (userCount > 0) { _seeding = false; return }

  console.log('[SEED] Inisialisasi data awal...')

  // ── 5 Toko ────────────────────────────────────────────────
  await db.stores.bulkPut([
    { id: 'toko-a1', name: 'Coco Puff Kota A Toko 1', city: 'Kota A', is_active: true, created_at: now() },
    { id: 'toko-a2', name: 'Coco Puff Kota A Toko 2', city: 'Kota A', is_active: true, created_at: now() },
    { id: 'toko-a3', name: 'Coco Puff Kota A Toko 3', city: 'Kota A', is_active: true, created_at: now() },
    { id: 'toko-b1', name: 'Coco Puff Kota B Toko 1', city: 'Kota B', is_active: true, created_at: now() },
    { id: 'toko-b2', name: 'Coco Puff Kota B Toko 2', city: 'Kota B', is_active: true, created_at: now() },
  ])

  // ── Users ─────────────────────────────────────────────────
  const adminHash = await hashPassword('admin123')
  const kasirHash = await hashPassword('1234')

  await db.users.bulkPut([
    // Owner — bisa login dari toko manapun, store_id toko-a1 sebagai home
    { id: generateId(), store_id: 'toko-a1', name: 'Owner', username: 'owner',
      password_hash: adminHash, role: 'owner', is_active: true, created_at: now() },

    // Manager per toko
    { id: generateId(), store_id: 'toko-a1', name: 'Manager A1', username: 'manager-a1',
      password_hash: adminHash, role: 'manager', is_active: true, created_at: now() },
    { id: generateId(), store_id: 'toko-a2', name: 'Manager A2', username: 'manager-a2',
      password_hash: adminHash, role: 'manager', is_active: true, created_at: now() },

    // Kasir per toko
    { id: generateId(), store_id: 'toko-a1', name: 'Kasir A1', username: 'kasir-a1',
      password_hash: kasirHash, role: 'kasir', is_active: true, created_at: now() },
    { id: generateId(), store_id: 'toko-a2', name: 'Kasir A2', username: 'kasir-a2',
      password_hash: kasirHash, role: 'kasir', is_active: true, created_at: now() },
    { id: generateId(), store_id: 'toko-b1', name: 'Kasir B1', username: 'kasir-b1',
      password_hash: kasirHash, role: 'kasir', is_active: true, created_at: now() },
  ])

  // ── Kategori ──────────────────────────────────────────────
  const catPuff = generateId()
  const catMinum = generateId()
  await db.categories.bulkPut([
    { id: catPuff,  name: 'Puff',    description: 'Aneka puff', sort_order: 1 },
    { id: catMinum, name: 'Minuman', description: 'Aneka minuman', sort_order: 2 },
  ])

  // ── Produk contoh ─────────────────────────────────────────
  const p1 = generateId()
  await db.products.bulkPut([
    { id: p1, category_id: catPuff, name: 'Puff', sku: 'PF-001',
      base_price: 14000, unit: 'pcs', pkg_qty: 5, pkg_unit: 'dus',
      auto_package: false, is_active: true, created_at: now(), updated_at: now() },
  ])

  console.log('[SEED] Selesai!')
  console.log('[SEED] Login: owner/admin123, kasir-a1/kasir123, kasir-a2/kasir123')
}
