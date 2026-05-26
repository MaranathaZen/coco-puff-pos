import { create } from 'zustand'
import type { CartItem, Product } from '@/types'

interface CartState {
  items:       CartItem[]
  addItem:     (product: Product, qty?: number) => void
  removeItem:  (productId: string) => void
  updateQty:   (productId: string, qty: number) => void
  clearCart:   () => void
  subtotal:    () => number
  totalDiscount: () => number
  total:       () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product, qty = 1) => {
    const items    = get().items
    const existing = items.find(i => i.product.id === product.id)
    const price    = product.effective_price ?? product.base_price

    if (existing) {
      set({
        items: items.map(i =>
          i.product.id === product.id
            ? { ...i, qty: i.qty + qty, subtotal: (i.qty + qty) * i.unit_price - i.discount }
            : i
        )
      })
    } else {
      set({
        items: [...items, {
          product,
          qty,
          unit_price: price,
          discount: 0,
          subtotal: price * qty,
        }]
      })
    }
  },

  removeItem: (productId) =>
    set({ items: get().items.filter(i => i.product.id !== productId) }),

  updateQty: (productId, qty) => {
    if (qty <= 0) {
      get().removeItem(productId)
      return
    }
    set({
      items: get().items.map(i =>
        i.product.id === productId
          ? { ...i, qty, subtotal: qty * i.unit_price - i.discount }
          : i
      )
    })
  },

  clearCart: () => set({ items: [] }),

  subtotal: () => get().items.reduce((sum, i) => sum + i.unit_price * i.qty, 0),

  totalDiscount: () => get().items.reduce((sum, i) => sum + i.discount, 0),

  total: () => get().subtotal() - get().totalDiscount(),
}))
