import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { formatRupiah, generateReceiptNo, calcPackaging } from '@/lib/utils'
import type { Product, PaymentMethod } from '@/types'
import { ShoppingCart, Plus, Minus, Trash2, X, CheckCircle, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

// ── Tipe paket dari Supabase ──────────────────────────────────
interface PaketItem {
  id: string
  name: string
  qty_total: number
  price: number
  is_mix: boolean
}

interface CartPaketItem {
  paket: PaketItem
  pilihan: { product: Product; qty: number }[]
  subtotal: number
}

export default function CashierPage() {
  const { user, activeShift } = useAuthStore()
  const STORE_ID = user?.store_id || ''
  const { items, addItem, removeItem, updateQty, clearCart, total, subtotal, totalDiscount } = useCartStore()

  const [selectedCat, setSelectedCat]       = useState<string>('all')
  const [showCheckout, setShowCheckout]     = useState(false)
  const [payMethod, setPayMethod]           = useState<PaymentMethod>('cash')
  const [cashPaid, setCashPaid]             = useState('')
  const [isProcessing, setIsProcessing]     = useState(false)

  // State untuk paket
  const [showPaketModal, setShowPaketModal] = useState(false)
  const [selectedPaket, setSelectedPaket]   = useState<PaketItem | null>(null)
  const [paketPilihan, setPaketPilihan]     = useState<{ product: Product; qty: number }[]>([])
  const [cartPakets, setCartPakets]         = useState<CartPaketItem[]>([])

  // Data lokal
  const categories = useLiveQuery(() => db.categories.orderBy('sort_order').toArray(), [])
  const products   = useLiveQuery(async () => {
    const prods = await db.products
      .filter(p => p.is_active &&
        (selectedCat === 'all' || p.category_id === selectedCat))
      .toArray()
    const overrides = await db.store_product_prices
      .where('store_id').equals(STORE_ID).filter(p => p.is_active).toArray()
    const overrideMap = Object.fromEntries(overrides.map(o => [o.product_id, o.override_price]))
    const nowStr = new Date().toISOString()
    const promos = await db.promotions
      .where('store_id').equals(STORE_ID)
      .filter(p => p.is_active && p.valid_from <= nowStr && p.valid_until >= nowStr)
      .toArray()
    const promoMap = Object.fromEntries(promos.map(p => [p.product_id, p]))
    return prods.map(p => {
      const basePrice = overrideMap[p.id] ?? p.base_price
      const promo = promoMap[p.id]
      let effectivePrice = basePrice
      if (promo) {
        effectivePrice = promo.promo_type === 'percent'
          ? basePrice * (1 - promo.value / 100)
          : basePrice - promo.value
      }
      return { ...p, effective_price: Math.max(0, effectivePrice) }
    })
  }, [selectedCat])

  // Ambil daftar paket dari Supabase
  const [pakets, setPakets] = useState<PaketItem[]>([])
  useLiveQuery(async () => {
    const { data } = await supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .or(`store_id.is.null,store_id.eq.${STORE_ID}`)
    if (data) setPakets(data)
  }, [])

  // ── Paket: pilih rasa ───────────────────────────────────────
  function openPaketModal(paket: PaketItem) {
    setSelectedPaket(paket)
    setPaketPilihan([])
    setShowPaketModal(true)
  }

  function tambahPilihanRasa(product: Product) {
    const total = paketPilihan.reduce((s, p) => s + p.qty, 0)
    if (total >= selectedPaket!.qty_total) {
      toast.error(`Paket ini maksimal ${selectedPaket!.qty_total} pcs`)
      return
    }
    setPaketPilihan(prev => {
      const existing = prev.find(p => p.product.id === product.id)
      if (existing) return prev.map(p => p.product.id === product.id ? { ...p, qty: p.qty + 1 } : p)
      return [...prev, { product, qty: 1 }]
    })
  }

  function kurangiPilihanRasa(productId: string) {
    setPaketPilihan(prev => {
      const updated = prev.map(p => p.product.id === productId ? { ...p, qty: p.qty - 1 } : p)
      return updated.filter(p => p.qty > 0)
    })
  }

  function konfirmasiPaket() {
    if (!selectedPaket) return
    const totalPilihan = paketPilihan.reduce((s, p) => s + p.qty, 0)
    if (totalPilihan !== selectedPaket.qty_total) {
      toast.error(`Pilih tepat ${selectedPaket.qty_total} pcs`)
      return
    }
    setCartPakets(prev => [...prev, {
      paket: selectedPaket,
      pilihan: paketPilihan,
      subtotal: selectedPaket.price,
    }])
    setShowPaketModal(false)
    toast.success(`${selectedPaket.name} ditambahkan!`)
  }

  function hapusPaketCart(index: number) {
    setCartPakets(prev => prev.filter((_, i) => i !== index))
  }

  // ── Total keseluruhan (satuan + paket) ──────────────────────
  const totalPakets = cartPakets.reduce((s, p) => s + p.subtotal, 0)
  const grandTotal  = total() + totalPakets
  const totalQtyPilih = paketPilihan.reduce((s, p) => s + p.qty, 0)

  // ── Checkout ────────────────────────────────────────────────
  async function handleCheckout() {
    if (items.length === 0 && cartPakets.length === 0) return toast.error('Keranjang kosong')
    if (!activeShift) return toast.error('Belum buka shift')
    if (payMethod === 'cash' && Number(cashPaid) < grandTotal) return toast.error('Uang tidak cukup')

    setIsProcessing(true)
    try {
      const txId      = generateId()
      const receiptNo = generateReceiptNo(STORE_ID)
      const paidAmount = payMethod === 'cash' ? Number(cashPaid) : grandTotal
      const change     = paidAmount - grandTotal

      const tx = {
        id: txId, store_id: STORE_ID, shift_id: activeShift.id,
        cashier_id: user!.id, receipt_no: receiptNo,
        subtotal: subtotal() + totalPakets,
        discount: totalDiscount(), total: grandTotal,
        payment_method: payMethod, cash_paid: paidAmount,
        change_given: change, status: 'completed' as const,
        created_at: now(),
      }

      // Item satuan
      const txItems = items.map(item => {
        const pkg = item.product.auto_package
          ? calcPackaging(item.qty, item.product.pkg_qty)
          : { dus: 0, eceran: item.qty }
        return {
          id: generateId(), transaction_id: txId,
          product_id: item.product.id, product_name: item.product.name,
          qty_eceran: pkg.eceran, qty_dus: pkg.dus,
          unit_price: item.unit_price, discount: item.discount,
          subtotal: item.subtotal, item_type: 'unit',
        }
      })

      // Item paket
      const txPaketItems = cartPakets.flatMap(cp =>
        cp.pilihan.map(p => ({
          id: generateId(), transaction_id: txId,
          product_id: p.product.id, product_name: p.product.name,
          qty_eceran: p.qty, qty_dus: 0,
          unit_price: cp.paket.price / cp.paket.qty_total,
          discount: 0,
          subtotal: (cp.paket.price / cp.paket.qty_total) * p.qty,
          item_type: 'package', package_id: cp.paket.id,
        }))
      )

      await db.transactions.add(tx)
      await db.transaction_items.bulkAdd([...txItems, ...txPaketItems])
      await addToSyncQueue('transactions', txId, 'insert', tx, STORE_ID)
      for (const item of [...txItems, ...txPaketItems]) {
        await addToSyncQueue('transaction_items', item.id, 'insert', item, STORE_ID)
      }

      clearCart()
      setCartPakets([])
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

  const change = payMethod === 'cash' ? Number(cashPaid) - grandTotal : 0

  return (
    <div className="flex h-full">
      {/* Kiri: grid produk */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Kategori */}
        <div className="bg-white border-b border-gray-100 px-3 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
          <button onClick={() => setSelectedCat('all')}
            className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap',
              selectedCat === 'all' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600')}>
            Semua
          </button>
          {categories?.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
              className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap',
                selectedCat === cat.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600')}>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Paket tersedia */}
        {pakets.length > 0 && (
          <div className="bg-brand-50 border-b border-brand-100 px-3 py-2 flex gap-2 overflow-x-auto">
            <span className="text-xs font-medium text-brand-700 self-center mr-1">Paket:</span>
            {pakets.map(p => (
              <button key={p.id} onClick={() => openPaketModal(p)}
                className="flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap active:bg-brand-700">
                <Package size={14} />
                {p.name} — {formatRupiah(p.price)}
              </button>
            ))}
          </div>
        )}

        {/* Grid produk */}
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {products?.map(prod => (
              <ProductCard key={prod.id} product={prod} onAdd={() => addItem(prod)} />
            ))}
          </div>
        </div>
      </div>

      {/* Kanan: keranjang desktop */}
      <div className="w-72 bg-white border-l border-gray-100 flex-col hidden md:flex">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <ShoppingCart size={18} /> Keranjang
            {(items.length + cartPakets.length) > 0 && (
              <span className="ml-auto bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {items.length + cartPakets.length}
              </span>
            )}
          </h2>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {items.length === 0 && cartPakets.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
              Keranjang kosong
            </div>
          ) : (
            <>
              {items.map(item => (
                <CartItemRow key={item.product.id} item={item}
                  onQtyChange={(q) => updateQty(item.product.id, q)}
                  onRemove={() => removeItem(item.product.id)} />
              ))}
              {cartPakets.map((cp, i) => (
                <div key={i} className="bg-brand-50 rounded-xl p-2 border border-brand-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-brand-800 flex items-center gap-1">
                      <Package size={12} /> {cp.paket.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatRupiah(cp.subtotal)}</span>
                      <button onClick={() => hapusPaketCart(i)} className="text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {cp.pilihan.map(p => `${p.product.name} x${p.qty}`).join(', ')}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {(items.length > 0 || cartPakets.length > 0) && (
          <div className="p-4 border-t border-gray-100 space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span><span>{formatRupiah(subtotal() + totalPakets)}</span>
            </div>
            {totalDiscount() > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Diskon</span><span>-{formatRupiah(totalDiscount())}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-gray-900 text-base">
              <span>Total</span><span>{formatRupiah(grandTotal)}</span>
            </div>
            <button onClick={() => setShowCheckout(true)} className="btn-primary w-full">Bayar</button>
          </div>
        )}
      </div>

      {/* Mobile tombol bayar */}
      {(items.length > 0 || cartPakets.length > 0) && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 p-4 bg-white border-t border-gray-100">
          <button onClick={() => setShowCheckout(true)}
            className="btn-primary w-full flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShoppingCart size={18} />{items.length + cartPakets.length} item
            </span>
            <span>{formatRupiah(grandTotal)}</span>
          </button>
        </div>
      )}

      {/* Modal checkout */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Konfirmasi Bayar</h3>
              <button onClick={() => setShowCheckout(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-1 max-h-40 overflow-auto">
              {items.map(i => (
                <div key={i.product.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{i.product.name} x{i.qty}</span>
                  <span>{formatRupiah(i.subtotal)}</span>
                </div>
              ))}
              {cartPakets.map((cp, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-brand-700">{cp.paket.name} ({cp.pilihan.map(p => `${p.product.name.split(' ').pop()} x${p.qty}`).join(', ')})</span>
                  <span>{formatRupiah(cp.subtotal)}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-semibold">
                <span>Total</span><span className="text-brand-600">{formatRupiah(grandTotal)}</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Metode Pembayaran</p>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'qris', 'transfer'] as PaymentMethod[]).map(m => (
                  <button key={m} onClick={() => setPayMethod(m)}
                    className={cn('py-2 rounded-xl text-sm font-medium border capitalize',
                      payMethod === m ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-700')}>
                    {m === 'cash' ? 'Tunai' : m === 'qris' ? 'QRIS' : 'Transfer'}
                  </button>
                ))}
              </div>
            </div>
            {payMethod === 'cash' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Uang Diterima</label>
                <input className="input text-lg font-semibold" type="number" placeholder="0"
                  value={cashPaid} onChange={e => setCashPaid(e.target.value)} autoFocus />
                {Number(cashPaid) >= grandTotal && (
                  <p className="text-sm text-green-600 mt-1">Kembalian: <strong>{formatRupiah(change)}</strong></p>
                )}
              </div>
            )}
            <button onClick={handleCheckout} disabled={isProcessing}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {isProcessing ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <CheckCircle size={18} />}
              {isProcessing ? 'Memproses...' : 'Konfirmasi Bayar'}
            </button>
          </div>
        </div>
      )}

      {/* Modal pilih rasa paket */}
      {showPaketModal && selectedPaket && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{selectedPaket.name}</h3>
                <p className="text-sm text-gray-500">Pilih {selectedPaket.qty_total} pcs — bisa mix rasa</p>
              </div>
              <button onClick={() => setShowPaketModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            {/* Progress */}
            <div className="bg-gray-100 rounded-full h-2">
              <div className="bg-brand-600 h-2 rounded-full transition-all"
                style={{ width: `${(totalQtyPilih / selectedPaket.qty_total) * 100}%` }} />
            </div>
            <p className="text-center text-sm text-gray-600">
              {totalQtyPilih} / {selectedPaket.qty_total} dipilih
            </p>

            {/* Daftar produk */}
            <div className="space-y-2 max-h-52 overflow-auto">
              {products?.map(prod => {
                const pilihan = paketPilihan.find(p => p.product.id === prod.id)
                return (
                  <div key={prod.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-sm font-medium text-gray-800">{prod.name}</span>
                    <div className="flex items-center gap-2">
                      {pilihan && (
                        <button onClick={() => kurangiPilihanRasa(prod.id)}
                          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center active:bg-gray-300">
                          <Minus size={12} />
                        </button>
                      )}
                      {pilihan && <span className="w-5 text-center text-sm font-semibold">{pilihan.qty}</span>}
                      <button onClick={() => tambahPilihanRasa(prod)}
                        className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center active:bg-brand-200">
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPaketModal(false)} className="btn-secondary flex-1">Batal</button>
              <button onClick={konfirmasiPaket}
                disabled={totalQtyPilih !== selectedPaket.qty_total}
                className="btn-primary flex-1 disabled:opacity-50">
                Tambah — {formatRupiah(selectedPaket.price)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <button onClick={onAdd}
      className="bg-white rounded-2xl border border-gray-100 p-3 text-left active:scale-95 transition-transform shadow-sm">
      <div className="text-2xl mb-2">🧁</div>
      <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">{product.name}</p>
      <p className="text-brand-600 font-semibold text-sm mt-1">
        {formatRupiah(product.effective_price ?? product.base_price)}
      </p>
    </button>
  )
}

function CartItemRow({ item, onQtyChange, onRemove }: {
  item: { product: Product; qty: number; subtotal: number; unit_price: number; discount: number }
  onQtyChange: (qty: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
        <p className="text-xs text-gray-500">{formatRupiah(item.subtotal)}</p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onQtyChange(item.qty - 1)}
          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center active:bg-gray-300">
          <Minus size={12} />
        </button>
        <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
        <button onClick={() => onQtyChange(item.qty + 1)}
          className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center active:bg-brand-200">
          <Plus size={12} />
        </button>
        <button onClick={onRemove}
          className="w-7 h-7 rounded-full text-red-400 flex items-center justify-center active:bg-red-50 ml-1">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
