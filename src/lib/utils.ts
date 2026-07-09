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

/** Hash password sederhana (SHA-256) */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data    = encoder.encode(password)
  const hash    = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
