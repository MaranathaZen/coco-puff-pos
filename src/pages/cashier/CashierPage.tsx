import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { STORE_ID } from '@/lib/supabase'
import { formatRupiah, generateReceiptNo, calcPackaging } from '@/lib/utils'
import type { Product, PaymentMethod } from '@/types'
import { ShoppingCart, Plus, Minus, Trash2, X, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

export default function CashierPage() {
  const { user, activeShift } = useAuthStore()
  const { items, addItem, removeItem, updateQty, clearCart, total, subtotal, totalDiscount } = useCartStore()

  const [selectedCat, setSelectedCat]   = useState<string>('all')
  const [showCheckout, setShowCheckout] = useState(false)
  const [payMethod, setPayMethod]       = useState<PaymentMethod>('cash')
  const [cashPaid, setCashPaid]         = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Data dari IndexedDB lokal
  const categories = useLiveQuery(() => db.categories.orderBy('sort_order').toArray(), [])
  const products   = useLiveQuery(async () => {
    const prods = await db.products
      .filter(p => p.is_active &&
        (selectedCat === 'all' || p.category_id === selectedCat))
      .toArray()

    // Ambil harga override toko ini
    const overrides = await db.store_product_prices
      .where('store_id').equals(STORE_ID)
      .filter(p => p.is_active).toArray()
    const overrideMap = Object.fromEntries(overrides.map(o => [o.product_id, o.override_price]))

    // Ambil promo aktif
    const now = new Date().toISOString()
    const promos = await db.promotions
      .where('store_id').equals(STORE_ID)
      .filter(p => p.is_active && p.valid_from <= now && p.valid_until >= now)
      .toArray()
    const promoMap = Object.fromEntries(promos.map(p => [p.product_id, p]))

    return prods.map(p => {
      const basePrice = overrideMap[p.id] ?? p.base_price
      const promo     = promoMap[p.id]
      let effectivePrice = basePrice
      if (promo) {
        effectivePrice = promo.promo_type === 'percent'
          ? basePrice * (1 - promo.value / 100)
          : basePrice - promo.value
      }
      return { ...p, effective_price: Math.max(0, effectivePrice) }
    })
  }, [selectedCat])

  async function handleCheckout() {
    if (!items.length) return toast.error('Keranjang kosong')
    if (!activeShift) return toast.error('Belum buka shift')
    if (payMethod === 'cash' && Number(cashPaid) < total()) {
      return toast.error('Uang tidak cukup')
    }

    setIsProcessing(true)
    try {
      const txId      = generateId()
      const receiptNo = generateReceiptNo(STORE_ID)
      const paidAmount = payMethod === 'cash' ? Number(cashPaid) : total()
      const change     = paidAmount - total()

      const tx = {
        id: txId,
        store_id: STORE_ID,
        shift_id: activeShift.id,
        cashier_id: user!.id,
        receipt_no: receiptNo,
        subtotal: subtotal(),
        discount: totalDiscount(),
        total: total(),
        payment_method: payMethod,
        cash_paid: paidAmount,
        change_given: change,
        status: 'completed' as const,
        created_at: now(),
      }

      const txItems = items.map(item => {
        const pkg = item.product.auto_package
          ? calcPackaging(item.qty, item.product.pkg_qty)
          : { dus: 0, eceran: item.qty }
        return {
          id: generateId(),
          transaction_id: txId,
          product_id: item.product.id,
          product_name: item.product.name,
          qty_eceran: pkg.eceran,
          qty_dus: pkg.dus,
          unit_price: item.unit_price,
          discount: item.discount,
          subtotal: item.subtotal,
        }
      })

      // Simpan ke IndexedDB
      await db.transactions.add(tx)
      await db.transaction_items.bulkAdd(txItems)

      // Tambah ke sync queue
      await addToSyncQueue('transactions', txId, 'insert', tx, STORE_ID)
      for (const item of txItems) {
        await addToSyncQueue('transaction_items', item.id, 'insert', item, STORE_ID)
      }

      clearCart()
      setShowCheckout(false)
      setCashPaid('')

      toast.success(`Transaksi ${receiptNo} berhasil!`)
    } catch (e) {
      toast.error('Gagal menyimpan transaksi')
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }

  const change = payMethod === 'cash' ? Number(cashPaid) - total() : 0

  return (
    <div className="flex h-full">
      {/* Kiri: grid produk */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Kategori tabs */}
        <div className="bg-white border-b border-gray-100 px-3 py-2
                         flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setSelectedCat('all')}
            className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap',
              selectedCat === 'all'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600'
            )}
          >
            Semua
          </button>
          {categories?.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap',
                selectedCat === cat.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grid produk */}
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {products?.map(prod => (
              <ProductCard key={prod.id} product={prod} onAdd={() => addItem(prod)} />
            ))}
          </div>
        </div>
      </div>

      {/* Kanan: keranjang */}
      <div className="w-72 bg-white border-l border-gray-100 flex flex-col
                       hidden md:flex">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <ShoppingCart size={18} />
            Keranjang
            {items.length > 0 && (
              <span className="ml-auto bg-brand-600 text-white text-xs
                               rounded-full w-5 h-5 flex items-center justify-center">
                {items.length}
              </span>
            )}
          </h2>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
              Keranjang kosong
            </div>
          ) : (
            items.map(item => (
              <CartItemRow
                key={item.product.id}
                item={item}
                onQtyChange={(q) => updateQty(item.product.id, q)}
                onRemove={() => removeItem(item.product.id)}
              />
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-gray-100 space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatRupiah(subtotal())}</span>
            </div>
            {totalDiscount() > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Diskon</span>
                <span>-{formatRupiah(totalDiscount())}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-gray-900 text-base">
              <span>Total</span>
              <span>{formatRupiah(total())}</span>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="btn-primary w-full"
            >
              Bayar
            </button>
          </div>
        )}
      </div>

      {/* Mobile: tombol bayar */}
      {items.length > 0 && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 p-4 bg-white
                         border-t border-gray-100">
          <button
            onClick={() => setShowCheckout(true)}
            className="btn-primary w-full flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart size={18} />
              {items.length} item
            </span>
            <span>{formatRupiah(total())}</span>
          </button>
        </div>
      )}

      {/* Modal checkout */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center
                         justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Konfirmasi Bayar</h3>
              <button onClick={() => setShowCheckout(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Ringkasan */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
              {items.map(i => (
                <div key={i.product.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{i.product.name} x{i.qty}</span>
                  <span>{formatRupiah(i.subtotal)}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span className="text-brand-600">{formatRupiah(total())}</span>
              </div>
            </div>

            {/* Metode bayar */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Metode Pembayaran</p>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'qris', 'transfer'] as PaymentMethod[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={cn(
                      'py-2 rounded-xl text-sm font-medium border capitalize',
                      payMethod === m
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-gray-200 text-gray-700'
                    )}
                  >
                    {m === 'cash' ? 'Tunai' : m === 'qris' ? 'QRIS' : 'Transfer'}
                  </button>
                ))}
              </div>
            </div>

            {/* Input uang tunai */}
            {payMethod === 'cash' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Uang Diterima
                </label>
                <input
                  className="input text-lg font-semibold"
                  type="number"
                  placeholder="0"
                  value={cashPaid}
                  onChange={e => setCashPaid(e.target.value)}
                  autoFocus
                />
                {Number(cashPaid) >= total() && (
                  <p className="text-sm text-green-600 mt-1">
                    Kembalian: <strong>{formatRupiah(change)}</strong>
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={isProcessing}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <span className="animate-spin w-4 h-4 border-2 border-white
                                  border-t-transparent rounded-full" />
              ) : (
                <CheckCircle size={18} />
              )}
              {isProcessing ? 'Memproses...' : 'Konfirmasi Bayar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="bg-white rounded-2xl border border-gray-100 p-3 text-left
                  active:scale-95 transition-transform shadow-sm"
    >
      <div className="text-2xl mb-2">🧁</div>
      <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">
        {product.name}
      </p>
      <p className="text-brand-600 font-semibold text-sm mt-1">
        {formatRupiah(product.effective_price ?? product.base_price)}
      </p>
      {product.auto_package && (
        <p className="text-xs text-gray-400 mt-0.5">
          {product.pkg_qty} {product.unit} = 1 {product.pkg_unit}
        </p>
      )}
    </button>
  )
}

function CartItemRow({
  item, onQtyChange, onRemove
}: {
  item: ReturnType<typeof useCartStore>['items'][0]
  onQtyChange: (qty: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {item.product.name}
        </p>
        <p className="text-xs text-gray-500">{formatRupiah(item.subtotal)}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onQtyChange(item.qty - 1)}
          className="w-7 h-7 rounded-full bg-gray-200 flex items-center
                      justify-center active:bg-gray-300"
        >
          <Minus size={12} />
        </button>
        <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
        <button
          onClick={() => onQtyChange(item.qty + 1)}
          className="w-7 h-7 rounded-full bg-brand-100 text-brand-700
                      flex items-center justify-center active:bg-brand-200"
        >
          <Plus size={12} />
        </button>
        <button
          onClick={onRemove}
          className="w-7 h-7 rounded-full text-red-400 flex items-center
                      justify-center active:bg-red-50 ml-1"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
