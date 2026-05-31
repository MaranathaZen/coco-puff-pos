// src/pages/cashier/CashierPage.tsx
// CHANGELOG:
// - Tambah syncProducts() — pull products + categories dari Supabase saat load
// - Fix: produk tidak muncul karena belum pernah di-sync ke IndexedDB kasir
// - Auto sync saat pertama buka halaman kasir

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { formatRupiah, generateReceiptNo, calcPackaging, formatDate } from '@/lib/utils'
import type { Product, Transaction } from '@/types'
type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'gopay' | 'grab' | 'shopeefood'
import {
  ShoppingCart, Plus, Minus, Trash2, X, CheckCircle,
  Package, History, WifiOff, Bike, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface PaketItem {
  id: string; name: string; qty_total: number; price: number; is_mix: boolean
}
interface CartPaketItem {
  paket: PaketItem; pilihan: { product: Product; qty: number }[]; subtotal: number
}

type MainTab = 'offline' | 'online' | 'riwayat'
type OnlinePlatform = 'gofood' | 'grabfood' | 'shopeefood'

const PLATFORM_PAYMENT: Record<OnlinePlatform, PaymentMethod> = {
  gofood: 'gopay', grabfood: 'grab', shopeefood: 'shopeefood',
}
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer',
  gopay: 'GoPay', grab: 'GrabPay', shopeefood: 'ShopeePay',
}
const OFFLINE_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash',     label: 'Tunai'    },
  { id: 'qris',     label: 'QRIS'     },
  { id: 'transfer', label: 'Transfer' },
]

export default function CashierPage() {
  const { user, activeShift } = useAuthStore()
  const STORE_ID = user?.store_id || ''
  const { items, addItem, removeItem, updateQty, clearCart, total, subtotal, totalDiscount } = useCartStore()

  const ppnSetting = useLiveQuery(async () => {
    try {
      const s = await (db as any).settings?.get('ppn_percent')
      return Number(s?.value) || 0
    } catch { return 0 }
  }, [])
  const ppnPct = ppnSetting ?? 0

  const [mainTab,       setMainTab]       = useState<MainTab>('offline')
  const [selectedCat,   setSelectedCat]   = useState<string>('all')
  const [showCheckout,  setShowCheckout]  = useState(false)
  const [payMethod,     setPayMethod]     = useState<PaymentMethod>('cash')
  const [cashPaid,      setCashPaid]      = useState('')
  const [isProcessing,  setIsProcessing]  = useState(false)
  const [isOffline,     setIsOffline]     = useState(!navigator.onLine)
  const [isSyncing,     setIsSyncing]     = useState(false)

  const [onlinePlatform, setOnlinePlatform] = useState<OnlinePlatform>('gofood')
  const [onlineOrderNo,  setOnlineOrderNo]  = useState('')
  const [onlineBuyer,    setOnlineBuyer]    = useState('')

  const [showPaketModal, setShowPaketModal] = useState(false)
  const [selectedPaket,  setSelectedPaket]  = useState<PaketItem | null>(null)
  const [paketPilihan,   setPaketPilihan]   = useState<{ product: Product; qty: number }[]>([])
  const [cartPakets,     setCartPakets]     = useState<CartPaketItem[]>([])

  const [showVoidModal, setShowVoidModal] = useState(false)
  const [voidTx,        setVoidTx]        = useState<Transaction | null>(null)
  const [voidReason,    setVoidReason]    = useState('')
  const [isVoiding,     setIsVoiding]     = useState(false)

  // ── Sync products + categories saat load ─────────────────
  useEffect(() => {
    syncProducts()
  }, [])

  async function syncProducts(showMsg = false) {
    setIsSyncing(true)
    try {
      const [prodsRes, catsRes] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('categories').select('*').order('sort_order'),
      ])
      // REPLACE strategy — hapus lokal dulu
      if (prodsRes.data !== null) {
        await db.products.clear()
        if (prodsRes.data.length) await db.products.bulkPut(prodsRes.data)
      }
      if (catsRes.data !== null) {
        await db.categories.clear()
        if (catsRes.data.length) await db.categories.bulkPut(catsRes.data)
      }
      if (showMsg) toast.success('Produk diperbarui')
    } catch (e) {
      console.warn('[SYNC PRODUCTS]', e)
      if (showMsg) toast.error('Gagal sync produk')
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    const onOnline  = () => { setIsOffline(false); toast.success('Kembali online') }
    const onOffline = () => { setIsOffline(true);  toast.error('Koneksi terputus — mode offline') }
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // ── Data queries ──────────────────────────────────────────
  const categories = useLiveQuery(() =>
    db.categories.orderBy('sort_order').toArray()
  , [])

  const products = useLiveQuery(async () => {
    const prods = await db.products
      .filter(p => p.is_active && (selectedCat === 'all' || p.category_id === selectedCat))
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
      const basePrice      = overrideMap[p.id] ?? p.base_price
      const promo          = promoMap[p.id]
      let effectivePrice   = basePrice
      if (promo) {
        effectivePrice = promo.promo_type === 'percent'
          ? basePrice * (1 - promo.value / 100)
          : basePrice - promo.value
      }
      return { ...p, effective_price: Math.max(0, effectivePrice) }
    })
  }, [selectedCat, STORE_ID])

  const [pakets, setPakets] = useState<PaketItem[]>([])
  useLiveQuery(async () => {
    const { data } = await supabase
      .from('packages').select('*').eq('is_active', true)
      .or(`store_id.is.null,store_id.eq.${STORE_ID}`)
    if (data) setPakets(data)
  }, [STORE_ID])

  const transactions = useLiveQuery(async () => {
    const today   = new Date().toISOString().slice(0, 10)
    const txs     = await db.transactions
      .where('store_id').equals(STORE_ID)
      .filter(t => t.created_at.startsWith(today))
      .reverse().sortBy('created_at')
    const txItems = await db.transaction_items.toArray()
    return txs.map(t => ({ ...t, items: txItems.filter(i => i.transaction_id === t.id) }))
  }, [mainTab, STORE_ID])

  // ── Derived ───────────────────────────────────────────────
  const totalPakets   = cartPakets.reduce((s, p) => s + p.subtotal, 0)
  const rawSubtotal   = subtotal() + totalPakets
  const rawDiscount   = totalDiscount()
  const afterDiscount = rawSubtotal - rawDiscount
  const ppnAmount     = ppnPct > 0 ? Math.round(afterDiscount * ppnPct / 100) : 0
  const grandTotal    = afterDiscount + ppnAmount
  const totalQtyPilih = paketPilihan.reduce((s, p) => s + p.qty, 0)
  const change        = payMethod === 'cash' ? Number(cashPaid) - grandTotal : 0
  const canVoid       = user?.role === 'owner' || user?.role === 'manager'
  const isOnlineTab   = mainTab === 'online'
  const showCart      = mainTab === 'offline' || mainTab === 'online'

  function handleSetPayMethod(m: PaymentMethod) {
    setPayMethod(m)
    if (m !== 'cash') setCashPaid('')
  }

  async function handleVoid() {
    if (!voidTx || !voidReason.trim()) return toast.error('Alasan void wajib diisi')
    setIsVoiding(true)
    try {
      const updated = { ...voidTx, status: 'voided' as const, void_reason: voidReason.trim(), voided_by: user!.id, voided_at: now() }
      await db.transactions.put(updated)
      await supabase.from('transactions').update({ status: 'voided', void_reason: voidReason.trim(), voided_by: user!.id, voided_at: updated.voided_at }).eq('id', voidTx.id)
      await addToSyncQueue('transactions', voidTx.id, 'update', updated, STORE_ID)
      toast.success(`Transaksi ${voidTx.receipt_no} di-void`)
      setShowVoidModal(false); setVoidTx(null); setVoidReason('')
    } catch { toast.error('Gagal void transaksi') }
    finally { setIsVoiding(false) }
  }

  function openPaketModal(paket: PaketItem) { setSelectedPaket(paket); setPaketPilihan([]); setShowPaketModal(true) }

  function tambahPilihanRasa(product: Product) {
    const tot = paketPilihan.reduce((s, p) => s + p.qty, 0)
    if (tot >= selectedPaket!.qty_total) { toast.error(`Maksimal ${selectedPaket!.qty_total} pcs`); return }
    setPaketPilihan(prev => {
      const ex = prev.find(p => p.product.id === product.id)
      if (ex) return prev.map(p => p.product.id === product.id ? { ...p, qty: p.qty + 1 } : p)
      return [...prev, { product, qty: 1 }]
    })
  }

  function kurangiPilihanRasa(productId: string) {
    setPaketPilihan(prev => prev.map(p => p.product.id === productId ? { ...p, qty: p.qty - 1 } : p).filter(p => p.qty > 0))
  }

  function konfirmasiPaket() {
    if (!selectedPaket) return
    const tot = paketPilihan.reduce((s, p) => s + p.qty, 0)
    if (tot !== selectedPaket.qty_total) { toast.error(`Pilih tepat ${selectedPaket.qty_total} pcs`); return }
    setCartPakets(prev => [...prev, { paket: selectedPaket, pilihan: paketPilihan, subtotal: selectedPaket.price }])
    setShowPaketModal(false)
    toast.success(`${selectedPaket.name} ditambahkan!`)
  }

  function hapusPaketCart(i: number) { setCartPakets(prev => prev.filter((_, idx) => idx !== i)) }

  async function deductStockFromRecipes(txItems: any[], storeId: string) {
    try {
      const recipes     = await db.store_recipes.where('store_id').equals(storeId).filter(r => r.is_active).toArray()
      const recipeItems = await db.store_recipe_items.toArray()
      for (const txItem of txItems) {
        const recipe = recipes.find(r => r.product_id === txItem.product_id)
        if (!recipe) continue
        const riList   = recipeItems.filter(ri => ri.recipe_id === recipe.id)
        const totalQty = (txItem.qty_eceran || 0) + (txItem.qty_dus || 0)
        if (totalQty <= 0) continue
        for (const ri of riList) {
          const qty = ri.qty_used * totalQty
          const src = (ri as any).source || 'store'

          if (src === 'store') {
            // Kurangi dari stok toko (tabel stock, kolom ingredient_id)
            const storeStock = await db.stock
              .filter(s => s.store_id === storeId && s.ingredient_id === ri.material_id)
              .first()
            if (storeStock) {
              const newQty = Math.max(0, storeStock.qty_on_hand - qty)
              await db.stock.update(storeStock.id, { qty_on_hand: newQty, last_updated: now() })
              supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', storeStock.id).then(() => {})
            }
          } else if (src === 'warehouse') {
            // Legacy: kurangi dari stok gudang
            const ws = await db.warehouse_stock.where('material_id').equals(ri.material_id).first()
            if (ws) {
              const n = Math.max(0, ws.qty_on_hand - qty)
              await db.warehouse_stock.update(ws.id, { qty_on_hand: n, last_updated: now() })
              supabase.from('warehouse_stock').update({ qty_on_hand: n }).eq('id', ws.id).then(() => {})
            }
          } else if (src === 'production') {
            // Legacy: kurangi dari stok produksi
            const ps = await db.production_stock.where('material_id').equals(ri.material_id).first()
            if (ps) {
              const n = Math.max(0, ps.qty_on_hand - qty)
              await db.production_stock.update(ps.id, { qty_on_hand: n, last_updated: now() })
              supabase.from('production_stock').update({ qty_on_hand: n }).eq('id', ps.id).then(() => {})
            }
          }
        }
      }
    } catch (e) { console.warn('[BOM]', e) }
  }

  async function handleCheckout() {
    if (items.length === 0 && cartPakets.length === 0) return toast.error('Keranjang kosong')
    if (!activeShift)                                   return toast.error('Belum buka shift')
    if (isOnlineTab && !onlineOrderNo.trim())           return toast.error('Nomor order wajib diisi')
    if (!isOnlineTab && payMethod === 'cash' && Number(cashPaid) < grandTotal) return toast.error('Uang tidak cukup')
    setIsProcessing(true)
    try {
      const txId      = generateId()
      const receiptNo = generateReceiptNo(STORE_ID)
      const finalPay: PaymentMethod = isOnlineTab ? PLATFORM_PAYMENT[onlinePlatform] : payMethod
      const paidAmt   = finalPay === 'cash' ? Number(cashPaid) : grandTotal
      const tx = {
        id: txId, store_id: STORE_ID, shift_id: activeShift.id, cashier_id: user!.id, receipt_no: receiptNo,
        subtotal: rawSubtotal, discount: rawDiscount, ppn_amount: ppnAmount, ppn_percent: ppnPct,
        total: grandTotal, payment_method: finalPay, cash_paid: paidAmt, change_given: paidAmt - grandTotal,
        status: 'completed' as const,
        order_source:    isOnlineTab ? onlinePlatform : 'pos',
        online_order_no: isOnlineTab ? onlineOrderNo.trim()    : null,
        online_buyer:    isOnlineTab ? (onlineBuyer.trim()||null) : null,
        created_at: now(),
      }
      const txItems = items.map(item => {
        const pkg = item.product.auto_package ? calcPackaging(item.qty, item.product.pkg_qty) : { dus: 0, eceran: item.qty }
        return { id: generateId(), transaction_id: txId, product_id: item.product.id, product_name: item.product.name, qty_eceran: pkg.eceran, qty_dus: pkg.dus, unit_price: item.unit_price, discount: item.discount, subtotal: item.subtotal, item_type: 'unit' }
      })
      const txPakets = cartPakets.flatMap(cp => cp.pilihan.map(p => ({ id: generateId(), transaction_id: txId, product_id: p.product.id, product_name: p.product.name, qty_eceran: p.qty, qty_dus: 0, unit_price: cp.paket.price/cp.paket.qty_total, discount: 0, subtotal: (cp.paket.price/cp.paket.qty_total)*p.qty, item_type: 'package', package_id: cp.paket.id })))
      await db.transactions.add(tx)
      await db.transaction_items.bulkAdd([...txItems, ...txPakets])
      await addToSyncQueue('transactions', txId, 'insert', tx, STORE_ID)
      for (const item of [...txItems, ...txPakets]) await addToSyncQueue('transaction_items', item.id, 'insert', item, STORE_ID)
      await deductStockFromRecipes([...txItems, ...txPakets], STORE_ID)
      clearCart(); setCartPakets([]); setShowCheckout(false); setCashPaid(''); setOnlineOrderNo(''); setOnlineBuyer('')
      toast.success(`Transaksi ${receiptNo} berhasil!`)
    } catch (e) { toast.error('Gagal menyimpan transaksi'); console.error(e) }
    finally { setIsProcessing(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {isOffline && (
        <div className="bg-amber-500 text-white text-xs font-medium px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <WifiOff size={13} />Mode offline — transaksi tersimpan lokal
        </div>
      )}

      {/* Tab */}
      <div className="bg-white border-b border-gray-100 flex flex-shrink-0">
        {([
          { id: 'offline', label: 'Offline' },
          { id: 'online',  label: 'Online',  icon: <Bike size={13} /> },
          { id: 'riwayat', label: 'Riwayat', icon: <History size={13} /> },
        ] as { id: MainTab; label: string; icon?: React.ReactNode }[]).map(tab => (
          <button key={tab.id} onClick={() => setMainTab(tab.id)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${mainTab===tab.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* RIWAYAT */}
      {mainTab === 'riwayat' && (
        <div className="flex-1 overflow-auto bg-gray-50 p-4 space-y-3">
          <p className="text-xs text-gray-400">Transaksi hari ini</p>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {transactions?.map((tx, idx) => (
              <div key={tx.id} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''} ${tx.status==='voided'?'opacity-50':''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 font-mono">{tx.receipt_no}</p>
                      {tx.status==='voided' && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">VOID</span>}
                      {tx.order_source && tx.order_source!=='pos' && (
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                          tx.order_source==='gofood'&&'bg-green-100 text-green-700',
                          tx.order_source==='grabfood'&&'bg-emerald-100 text-emerald-700',
                          tx.order_source==='shopeefood'&&'bg-orange-100 text-orange-700',
                        )}>
                          {tx.order_source==='gofood'?'GoFood':tx.order_source==='grabfood'?'GrabFood':'ShopeeFood'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.created_at)} · {PAYMENT_LABELS[tx.payment_method as PaymentMethod]??tx.payment_method}</p>
                    {tx.online_order_no && <p className="text-xs text-gray-500 font-mono">#{tx.online_order_no}</p>}
                    {tx.void_reason     && <p className="text-xs text-red-400">Alasan: {tx.void_reason}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <p className={`text-sm font-semibold ${tx.status==='voided'?'line-through text-gray-400':'text-gray-900'}`}>{formatRupiah(tx.total)}</p>
                    {canVoid && tx.status==='completed' && (
                      <button onClick={()=>{setVoidTx(tx as any);setVoidReason('');setShowVoidModal(true)}}
                        className="text-xs text-red-400 border border-red-200 px-2 py-0.5 rounded-lg">Void</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {transactions?.length===0 && <div className="py-12 text-center text-sm text-gray-400">Belum ada transaksi hari ini</div>}
          </div>
        </div>
      )}

      {/* OFFLINE & ONLINE */}
      {showCart && (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col min-w-0">

            {mainTab==='online' && (
              <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2 flex-shrink-0">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {(['gofood','grabfood','shopeefood'] as OnlinePlatform[]).map(p => (
                    <button key={p} onClick={() => setOnlinePlatform(p)}
                      className={cn('px-3 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap flex-shrink-0',
                        onlinePlatform===p?'bg-brand-600 text-white border-brand-600':'border-gray-200 text-gray-600')}>
                      {p==='gofood'?'GoFood':p==='grabfood'?'GrabFood':'ShopeeFood'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input flex-1 text-sm" placeholder="Nomor Order *" value={onlineOrderNo} onChange={e => setOnlineOrderNo(e.target.value)} />
                  <input className="input flex-1 text-sm" placeholder="Nama Pembeli (opsional)" value={onlineBuyer} onChange={e => setOnlineBuyer(e.target.value)} />
                </div>
              </div>
            )}

            {/* Kategori + tombol refresh */}
            <div className="bg-white border-b border-gray-100 px-3 py-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0 items-center">
              <button onClick={() => setSelectedCat('all')}
                className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0',selectedCat==='all'?'bg-brand-600 text-white':'bg-gray-100 text-gray-600')}>
                Semua
              </button>
              {categories?.map(cat => (
                <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                  className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0',selectedCat===cat.id?'bg-brand-600 text-white':'bg-gray-100 text-gray-600')}>
                  {cat.name}
                </button>
              ))}
              {/* Tombol refresh produk */}
              <button onClick={() => syncProducts(true)} disabled={isSyncing}
                className="flex-shrink-0 ml-auto p-1.5 text-gray-400 rounded-full">
                <RefreshCw size={14} className={isSyncing?'animate-spin text-blue-500':''} />
              </button>
            </div>

            {/* Paket */}
            {mainTab==='offline' && pakets.length>0 && (
              <div className="bg-brand-50 border-b border-brand-100 px-3 py-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0">
                <span className="text-xs font-medium text-brand-700 self-center mr-1 flex-shrink-0">Paket:</span>
                {pakets.map(p => (
                  <button key={p.id} onClick={() => openPaketModal(p)}
                    className="flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 active:bg-brand-700">
                    <Package size={14} />{p.name} — {formatRupiah(p.price)}
                  </button>
                ))}
              </div>
            )}

            {/* Grid produk */}
            <div className="flex-1 overflow-auto p-3">
              {products && products.length === 0 && !isSyncing && (
                <div className="text-center py-16">
                  <p className="text-sm text-gray-400 mb-3">Belum ada produk</p>
                  <button onClick={() => syncProducts(true)}
                    className="text-xs text-blue-500 border border-blue-200 px-3 py-1.5 rounded-lg">
                    Sync Produk
                  </button>
                </div>
              )}
              {isSyncing && products?.length === 0 && (
                <div className="text-center py-16 text-sm text-gray-400">
                  <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-brand-600 rounded-full mx-auto mb-2" />
                  Memuat produk...
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {products?.map(prod => <ProductCard key={prod.id} product={prod} onAdd={() => addItem(prod)} />)}
              </div>
            </div>
          </div>

          {/* Keranjang desktop */}
          <div className="w-72 bg-white border-l border-gray-100 flex-col hidden md:flex">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <ShoppingCart size={18} /> Keranjang
                {(items.length+cartPakets.length)>0 && (
                  <span className="ml-auto bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{items.length+cartPakets.length}</span>
                )}
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {items.length===0 && cartPakets.length===0 ? (
                <div className="text-center text-gray-400 py-12 text-sm"><ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />Keranjang kosong</div>
              ) : (
                <>
                  {items.map(item => <CartItemRow key={item.product.id} item={item} onQtyChange={q=>updateQty(item.product.id,q)} onRemove={()=>removeItem(item.product.id)} />)}
                  {cartPakets.map((cp,i) => (
                    <div key={i} className="bg-brand-50 rounded-xl p-2 border border-brand-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-brand-800 flex items-center gap-1"><Package size={12}/>{cp.paket.name}</span>
                        <div className="flex items-center gap-2"><span className="text-sm font-semibold">{formatRupiah(cp.subtotal)}</span><button onClick={()=>hapusPaketCart(i)} className="text-red-400"><Trash2 size={12}/></button></div>
                      </div>
                      <p className="text-xs text-gray-500">{cp.pilihan.map(p=>`${p.product.name} x${p.qty}`).join(', ')}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
            {(items.length>0||cartPakets.length>0) && (
              <div className="p-4 border-t border-gray-100 space-y-2">
                <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatRupiah(rawSubtotal)}</span></div>
                {rawDiscount>0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon</span><span>-{formatRupiah(rawDiscount)}</span></div>}
                {ppnAmount>0 && <div className="flex justify-between text-sm text-gray-600"><span>PPN {ppnPct}%</span><span>+{formatRupiah(ppnAmount)}</span></div>}
                <div className="flex justify-between font-semibold text-gray-900 text-base border-t border-gray-100 pt-2"><span>Total</span><span>{formatRupiah(grandTotal)}</span></div>
                <button onClick={() => setShowCheckout(true)} className="btn-primary w-full">Bayar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile bayar */}
      {showCart && (items.length>0||cartPakets.length>0) && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 flex-shrink-0">
          <button onClick={() => setShowCheckout(true)} className="btn-primary w-full flex items-center justify-between">
            <span className="flex items-center gap-2"><ShoppingCart size={18}/>{items.length+cartPakets.length} item</span>
            <span>{formatRupiah(grandTotal)}</span>
          </button>
        </div>
      )}

      {/* MODAL CHECKOUT */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Konfirmasi Bayar</h3>
              <button onClick={() => setShowCheckout(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-1 max-h-36 overflow-auto">
              {items.map(i => (
                <div key={i.product.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{i.product.name} ×{i.qty}</span>
                  <span>{formatRupiah(i.subtotal)}</span>
                </div>
              ))}
              {cartPakets.map((cp,i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-brand-700"><Package size={12} className="inline mr-1"/>{cp.paket.name}</span>
                  <span>{formatRupiah(cp.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border border-gray-100 rounded-xl p-3">
              <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatRupiah(rawSubtotal)}</span></div>
              {rawDiscount>0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon</span><span>-{formatRupiah(rawDiscount)}</span></div>}
              {ppnAmount>0 && <div className="flex justify-between text-sm text-gray-600"><span>PPN {ppnPct}%</span><span>+{formatRupiah(ppnAmount)}</span></div>}
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-1.5"><span>Total</span><span className="text-brand-600">{formatRupiah(grandTotal)}</span></div>
            </div>
            {isOnlineTab ? (
              <div className={cn('rounded-xl px-4 py-2.5 text-sm space-y-0.5 border',
                onlinePlatform==='gofood'&&'bg-green-50 border-green-100',
                onlinePlatform==='grabfood'&&'bg-emerald-50 border-emerald-100',
                onlinePlatform==='shopeefood'&&'bg-orange-50 border-orange-100',
              )}>
                <p className="font-medium text-gray-800">{onlinePlatform==='gofood'?'GoFood':onlinePlatform==='grabfood'?'GrabFood':'ShopeeFood'}</p>
                <p className="text-gray-600 font-mono text-xs">#{onlineOrderNo}</p>
                {onlineBuyer && <p className="text-gray-500 text-xs">{onlineBuyer}</p>}
                <p className="text-xs text-gray-400">Pembayaran via {PAYMENT_LABELS[PLATFORM_PAYMENT[onlinePlatform]]} (otomatis)</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Metode Pembayaran</p>
                <div className="grid grid-cols-3 gap-2">
                  {OFFLINE_METHODS.map(m => (
                    <button key={m.id} onClick={() => handleSetPayMethod(m.id)}
                      className={cn('py-2.5 rounded-xl text-sm font-medium border transition-colors',
                        payMethod===m.id?'bg-brand-600 text-white border-brand-600':'border-gray-200 text-gray-700')}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isOnlineTab && payMethod==='cash' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Uang Diterima</label>
                <input className="input text-lg font-semibold" inputMode="decimal" placeholder="0"
                  value={cashPaid} onChange={e => setCashPaid(e.target.value.replace(/[^0-9]/g,''))} autoFocus />
                {Number(cashPaid)>0 && Number(cashPaid)<grandTotal && (
                  <p className="text-sm text-red-500 mt-1">Kurang {formatRupiah(grandTotal-Number(cashPaid))}</p>
                )}
                {Number(cashPaid)>=grandTotal && (
                  <p className="text-sm text-green-600 mt-1">Kembalian: <strong>{formatRupiah(change)}</strong></p>
                )}
              </div>
            )}
            <button onClick={handleCheckout} disabled={isProcessing}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {isProcessing ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"/> : <CheckCircle size={18}/>}
              {isProcessing ? 'Memproses...' : 'Konfirmasi Bayar'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL VOID */}
      {showVoidModal && voidTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Void Transaksi</h3>
              <button onClick={() => setShowVoidModal(false)}><X size={18} className="text-gray-400"/></button>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-sm font-medium text-red-800 font-mono">{voidTx.receipt_no}</p>
              <p className="text-sm text-red-700">{formatRupiah(voidTx.total)}</p>
              <p className="text-xs text-red-400">{formatDate(voidTx.created_at)}</p>
            </div>
            <input className="input" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Alasan void" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setShowVoidModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
              <button onClick={handleVoid} disabled={isVoiding||!voidReason.trim()} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50">
                {isVoiding?'Memproses...':'Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PAKET */}
      {showPaketModal && selectedPaket && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{selectedPaket.name}</h3>
                <p className="text-sm text-gray-500">Pilih {selectedPaket.qty_total} pcs — bisa mix rasa</p>
              </div>
              <button onClick={() => setShowPaketModal(false)}><X size={20} className="text-gray-400"/></button>
            </div>
            <div className="bg-gray-100 rounded-full h-2">
              <div className="bg-brand-600 h-2 rounded-full transition-all" style={{width:`${Math.min(100,(totalQtyPilih/selectedPaket.qty_total)*100)}%`}} />
            </div>
            <p className="text-center text-sm text-gray-600">{totalQtyPilih} / {selectedPaket.qty_total} dipilih</p>
            <div className="space-y-2 max-h-52 overflow-auto">
              {products?.map(prod => {
                const pilihan = paketPilihan.find(p => p.product.id === prod.id)
                return (
                  <div key={prod.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-sm font-medium text-gray-800">{prod.name}</span>
                    <div className="flex items-center gap-2">
                      {pilihan && <button onClick={() => kurangiPilihanRasa(prod.id)} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center"><Minus size={12}/></button>}
                      {pilihan && <span className="w-5 text-center text-sm font-semibold">{pilihan.qty}</span>}
                      <button onClick={() => tambahPilihanRasa(prod)} className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center"><Plus size={12}/></button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPaketModal(false)} className="btn-secondary flex-1">Batal</button>
              <button onClick={konfirmasiPaket} disabled={totalQtyPilih!==selectedPaket.qty_total} className="btn-primary flex-1 disabled:opacity-50">
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
    <button onClick={onAdd} className="bg-white rounded-2xl border border-gray-100 p-3 text-left active:scale-95 transition-transform shadow-sm">
      <div className="text-2xl mb-2">🧁</div>
      <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">{product.name}</p>
      <p className="text-brand-600 font-semibold text-sm mt-1">{formatRupiah(product.effective_price ?? product.base_price)}</p>
    </button>
  )
}

function CartItemRow({ item, onQtyChange, onRemove }: {
  item: { product: Product; qty: number; subtotal: number; unit_price: number; discount: number }
  onQtyChange: (qty: number) => void; onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
        <p className="text-xs text-gray-500">{formatRupiah(item.subtotal)}</p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onQtyChange(item.qty-1)} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center"><Minus size={12}/></button>
        <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
        <button onClick={() => onQtyChange(item.qty+1)} className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center"><Plus size={12}/></button>
        <button onClick={onRemove} className="w-7 h-7 rounded-full text-red-400 flex items-center justify-center ml-1"><Trash2 size={12}/></button>
      </div>
    </div>
  )
}
