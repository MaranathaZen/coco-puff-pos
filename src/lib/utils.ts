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

export function generateReceiptNo(storeId: string): string {
  const date  = new Date()
  const ymd   = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand  = Math.floor(Math.random() * 9000 + 1000)
  const store = storeId.replace('toko-', '').toUpperCase()
  return `CP-${store}-${ymd}-${rand}`
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
