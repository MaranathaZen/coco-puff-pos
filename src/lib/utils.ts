import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}
export function formatDateOnly(dateStr: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(dateStr))
}

// Tag device stabil (acak 3 char, disimpan sekali) — cegah bentrok receipt_no
// antar-device di toko sama (counter per-device di localStorage).
function getDeviceTag(): string {
  let t = localStorage.getItem('cocopuff_device_tag')
  if (!t) {
    t = Math.random().toString(36).slice(2, 5).toUpperCase()
    localStorage.setItem('cocopuff_device_tag', t)
  }
  return t
}

// FIX: receipt_no dengan store prefix + device tag agar unik antar toko & device
// Format: MOG-20260606-001-A3F (store prefix + tanggal + urut + device tag)
export async function generateReceiptNo(storeId: string): Promise<string> {
  const date   = new Date()
  const ymd    = date.toISOString().slice(0, 10).replace(/-/g, '')
  // Ambil prefix dari storeId: store-mog-01 → MOG
  const prefix = storeId
    .replace('store-', '')
    .split('-')
    .filter(p => isNaN(Number(p)))
    .join('')
    .toUpperCase()
    .slice(0, 4) || 'POS'
  const key  = `receipt_counter_${prefix}_${ymd}`
  const cur  = parseInt(localStorage.getItem(key) || '0', 10)
  const next = cur + 1
  localStorage.setItem(key, String(next))
  return `${prefix}-${ymd}-${String(next).padStart(3, '0')}-${getDeviceTag()}`
}

/** Hitung packaging otomatis: qty eceran → dus + sisa eceran */
export function calcPackaging(qtyEceran: number, pkgQty: number) {
  if (pkgQty <= 1) return { dus: 0, eceran: qtyEceran }
  const dus    = Math.floor(qtyEceran / pkgQty)
  const eceran = qtyEceran % pkgQty
  return { dus, eceran }
}

// ── Password hashing: PBKDF2-SHA256 + salt (offline-safe via crypto.subtle) ──
// Format: pbkdf2$<iter>$<saltB64>$<hashB64>. Legacy = 64-hex SHA-256 (auto-upgrade saat login).
const PBKDF2_ITER = 100_000

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function b64ToBuf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
async function sha256Hex(password: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
async function pbkdf2Bits(password: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: iter, hash: 'SHA-256' }, key, 256)
  return bufToB64(bits)
}

/** Hash password (PBKDF2 + salt acak). Return string format baru. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hashB64 = await pbkdf2Bits(password, salt, PBKDF2_ITER)
  return `pbkdf2$${PBKDF2_ITER}$${bufToB64(salt.buffer)}$${hashB64}`
}

/** Verify password vs stored hash. needsUpgrade=true kalau stored masih format legacy SHA-256. */
export async function verifyPassword(password: string, stored?: string): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored) return { ok: false, needsUpgrade: false }
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$') // [pbkdf2, iter, saltB64, hashB64]
    if (parts.length !== 4) return { ok: false, needsUpgrade: false }
    const iter = parseInt(parts[1], 10) || PBKDF2_ITER
    const calc = await pbkdf2Bits(password, b64ToBuf(parts[2]), iter)
    return { ok: timingSafeEqual(calc, parts[3]), needsUpgrade: false }
  }
  // Legacy SHA-256 hex → verify + tandai upgrade
  const ok = timingSafeEqual(await sha256Hex(password), stored)
  return { ok, needsUpgrade: ok }
}
