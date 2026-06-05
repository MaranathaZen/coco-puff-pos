// src/pages/cashier/CashierPage.tsx
// CHANGELOG v3:
// - FIX: deductStockFromRecipes exclude recipe_type === 'production' (resep produksi toko)
//   Sebelumnya semua store_recipes ikut dicocokkan, termasuk resep produksi toko yang punya
//   product_id = 'prod-toko-xxx' yang tidak match dengan product_id transaksi
// - FIX: transactions useLiveQuery kasir filter hari ini di query (bukan hanya di card)
//   Sebelumnya semua transaksi toko tampil, sekarang hanya hari ini
// - FIX: Promotion type include 'buy1get1' (sudah ada di kode, fix di types)
// - FIX: PPN setting load dari db lewat fallback key yang benar
// - TAMBAH: UI promo manager — kasir bisa lihat semua promo aktif toko
// - TAMBAH: Diskon manual per item di cart (kasir bisa beri diskon)

import { useState, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { formatRupiah, generateReceiptNo, calcPackaging, formatDate, cn } from '@/lib/utils'
import type { Product, Transaction } from '@/types'
type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'gopay' | 'grab' | 'shopeefood'
type OrderType = 'dine_in' | 'take_away' | 'online'
import {
  ShoppingCart, Plus, Minus, Trash2, X, CheckCircle,
  Package, History, WifiOff, Bike, RefreshCw, UtensilsCrossed, ShoppingBag,
  Tag, Percent,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface PaketItem {
  id: string; name: string; qty_total: number; price: number; is_mix: boolean
}
interface CartPaketItem {
  paket: PaketItem; pilihan: { product: Product; qty: number }[]; subtotal: number
}

type MainTab = 'pos' | 'riwayat' | 'promo'
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
const ORDER_TYPES: { id: OrderType; label: string; icon: React.ReactNode }[] = [
  { id: 'dine_in',  label: 'Dine In',   icon: <UtensilsCrossed size={13} /> },
  { id: 'take_away',label: 'Take Away', icon: <ShoppingBag size={13} /> },
  { id: 'online',   label: 'Online',    icon: <Bike size={13} /> },
]

export default function CashierPage() {
  const { user, activeShift } = useAuthStore()
  const isOwnerManager = ['owner','manager'].includes(user?.role || '')
  const defaultStoreId = user?.store_id || ''

  const allStores = useLiveQuery(() =>
    isOwnerManager
      ? db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
      : Promise.resolve([])
  , [isOwnerManager])

  const [selectedStoreId, setSelectedStoreId] = useState(defaultStoreId)
  const STORE_ID = isOwnerManager ? selectedStoreId : defaultStoreId

  const { items, addItem, removeItem, updateQty, clearCart, total, subtotal, totalDiscount } = useCartStore()

  // FIX: PPN — coba dari db.settings dengan beberapa key fallback
  const ppnSetting = useLiveQuery(async () => {
    try {
      // Coba berbagai kemungkinan key
      const keys = ['ppn_percent', 'ppn', 'tax_percent']
      for (const key of keys) {
        const s = await (db as any).settings?.get?.(key)
        if (s?.value !== undefined) return Number(s.value) || 0
      }
      return 0
    } catch { return 0 }
  }, [])
  const ppnPct = ppnSetting ?? 0

  const [mainTab,       setMainTab]       = useState<MainTab>('pos')
  const [orderType,     setOrderType]     = useState<OrderType>('take_away')
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

  const [showVoidModal,    setShowVoidModal]    = useState(false)
  const [showPrinterModal, setShowPrinterModal] = useState(false)
  const [printerConfigTs,  setPrinterConfigTs]  = useState(0)
  const [expandedTxId,   setExpandedTxId]   = useState<string|null>(null)
  const [payFilter,      setPayFilter]      = useState<string>('semua')
  const [voidTx,         setVoidTx]         = useState<Transaction | null>(null)
  const [voidReason,     setVoidReason]     = useState('')
  const [isVoiding,      setIsVoiding]      = useState(false)
  const [lastTxData,     setLastTxData]     = useState<any>(null)
  const [showReceipt,    setShowReceipt]    = useState(false)

  // Diskon manual — map product_id → nominal diskon
  const [manualDiscounts, setManualDiscounts] = useState<Record<string, number>>({})
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [discountTarget, setDiscountTarget] = useState<{ productId: string; name: string; price: number } | null>(null)
  const [discountInput, setDiscountInput] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'nominal'>('percent')

  const userStoreId = user?.store_id || ''
  const getPrinterConfig = (sid: string) => {
    try { return JSON.parse(localStorage.getItem(`printer_config_${sid}`) || '{}') }
    catch { return {} }
  }
  const [printerConfig, setPrinterConfig] = useState(() => getPrinterConfig(userStoreId))
  useEffect(() => {
    const cfg = getPrinterConfig(STORE_ID || userStoreId)
    setPrinterConfig(cfg)
  }, [STORE_ID, userStoreId, printerConfigTs])
  const getPrintModeNow = () => (getPrinterConfig(STORE_ID || userStoreId).printMode || 'browser')
  const getAutoPrintNow = () => {
    const cfg = getPrinterConfig(STORE_ID || userStoreId)
    return cfg.autoPrint === true || cfg.autoPrint === 'true'
  }
  const printMode = printerConfig.printMode || 'browser'
  const autoPrint = printerConfig.autoPrint === true || printerConfig.autoPrint === 'true'

  useEffect(() => {
    if (orderType === 'online') setPayMethod(PLATFORM_PAYMENT[onlinePlatform])
    else setPayMethod('cash')
  }, [orderType, onlinePlatform])

  useEffect(() => { syncProducts() }, [])
  useEffect(() => { if (STORE_ID) syncProducts() }, [STORE_ID])

  async function syncProducts(showMsg = false) {
    setIsSyncing(true)
    try {
      const [prodsRes, catsRes, pricesRes, promosRes] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('store_product_prices').select('*').eq('store_id', STORE_ID),
        supabase.from('promotions').select('*').eq('store_id', STORE_ID).eq('is_active', true),
      ])
      if (prodsRes.data !== null)  { await db.products.clear(); if (prodsRes.data.length) await db.products.bulkPut(prodsRes.data) }
      if (catsRes.data !== null)   { await db.categories.clear(); if (catsRes.data.length) await db.categories.bulkPut(catsRes.data) }
      if (pricesRes.data !== null) { await db.store_product_prices.where('store_id').equals(STORE_ID).delete(); if (pricesRes.data.length) await db.store_product_prices.bulkPut(pricesRes.data) }
      if (promosRes.data !== null) { await db.promotions.where('store_id').equals(STORE_ID).delete(); if (promosRes.data.length) await db.promotions.bulkPut(promosRes.data) }
      if (showMsg) toast.success('Produk diperbarui')
    } catch (e) {
      console.warn('[SYNC PRODUCTS]', e)
      if (showMsg) toast.error('Gagal sync produk')
    } finally { setIsSyncing(false) }
  }

  useEffect(() => {
    const onOnline  = () => { setIsOffline(false); toast.success('Kembali online') }
    const onOffline = () => { setIsOffline(true);  toast.error('Koneksi terputus — mode offline') }
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])

  const categories = useLiveQuery(() => db.categories.orderBy('sort_order').toArray(), [])

  const products = useLiveQuery(async () => {
    const prods = await db.products
      .filter(p => p.is_active && (selectedCat === 'all' || p.category_id === selectedCat))
      .toArray()
    const prices = await db.store_product_prices.where('store_id').equals(STORE_ID).toArray()
    const priceMap = Object.fromEntries(prices.map(o => [o.product_id, o]))
    const disabledProductIds = new Set(prices.filter(p => (p as any).is_active === false).map(p => p.product_id))
    const nowStr = new Date().toISOString()
    const promos = await db.promotions.where('store_id').equals(STORE_ID)
      .filter(p => p.is_active && p.valid_from <= nowStr && p.valid_until >= nowStr)
      .toArray()
    const promoMap = Object.fromEntries(promos.map(p => [p.product_id, p]))

    return prods
      .filter(p => !disabledProductIds.has(p.id))
      .map(p => {
        const priceRecord = priceMap[p.id]
        let basePrice = p.base_price
        if (priceRecord) {
          if (orderType === 'dine_in'   && (priceRecord as any).price_dine_in  > 0) basePrice = (priceRecord as any).price_dine_in
          else if (orderType === 'take_away' && (priceRecord as any).price_take_away > 0) basePrice = (priceRecord as any).price_take_away
          else if (orderType === 'online'    && (priceRecord as any).price_online    > 0) basePrice = (priceRecord as any).price_online
          else if (priceRecord.override_price > 0) basePrice = priceRecord.override_price
        }
        const promo = promoMap[p.id]
        let effectivePrice = basePrice
        let promoDiscount  = 0
        let promoName      = ''
        let promoBuy1Get1  = false
        if (promo) {
          if (promo.promo_type === 'buy1get1') {
            promoBuy1Get1  = true
            promoName      = promo.name || 'Buy 1 Get 1'
            promoDiscount  = 0
            effectivePrice = basePrice
          } else {
            promoDiscount  = promo.promo_type === 'percent' ? basePrice * promo.value / 100 : promo.value
            effectivePrice = Math.max(0, basePrice - promoDiscount)
            promoName      = promo.name || ''
          }
        }
        return { ...p, base_price: basePrice, effective_price: effectivePrice, promo_discount: promoDiscount, promo_name: promoName, promo_id: promo?.id || '', promo_buy1get1: promoBuy1Get1, promo_type: promo?.promo_type || '' }
      })
  }, [selectedCat, STORE_ID, orderType])

  // Semua promo aktif untuk tab Promo
  const allPromos = useLiveQuery(async () => {
    const nowStr = new Date().toISOString()
    const promos = await db.promotions.where('store_id').equals(STORE_ID)
      .filter(p => p.is_active && p.valid_from <= nowStr && p.valid_until >= nowStr)
      .toArray()
    const prods = await db.products.toArray()
    const pMap = Object.fromEntries(prods.map(p => [p.id, p]))
    return promos.map(p => ({ ...p, product: pMap[p.product_id] }))
  }, [STORE_ID])

  const [pakets, setPakets] = useState<PaketItem[]>([])
  useLiveQuery(async () => {
    const { data } = await supabase.from('packages').select('*').eq('is_active', true)
      .or(`store_id.is.null,store_id.eq.${STORE_ID}`)
    if (data) setPakets(data)
  }, [STORE_ID])

  // FIX: transactions — kasir hanya hari ini (filter di query, bukan hanya di card)
  const transactions = useLiveQuery(async () => {
    const today = new Date().toLocaleDateString('sv-SE')
    let txs = await db.transactions.where('store_id').equals(STORE_ID)
      .filter(t => {
        const txDate = t.created_at.slice(0, 10)
        return txDate === today
      })
      .reverse().sortBy('created_at')
    const txItems = await db.transaction_items.toArray()
    return txs.map(t => ({ ...t, items: txItems.filter(i => i.transaction_id === t.id) }))
  }, [mainTab, STORE_ID])

  useEffect(() => {
    if (!isOwnerManager || !STORE_ID) return
    const today = new Date().toLocaleDateString('sv-SE')
    async function pullVoidRequests() {
      const { data } = await supabase.from('transactions')
        .select('*').eq('store_id', STORE_ID)
        .gte('created_at', today + 'T00:00:00+07:00')
      if (data?.length) {
        await db.transactions.bulkPut(data)
        const ids = data.map((t: any) => t.id)
        const { data: txItems } = await supabase.from('transaction_items')
          .select('*').in('transaction_id', ids)
        if (txItems?.length) await db.transaction_items.bulkPut(txItems)
      }
    }
    pullVoidRequests()
    const interval = setInterval(pullVoidRequests, 30000)
    return () => clearInterval(interval)
  }, [isOwnerManager, STORE_ID, mainTab])

  const totalPakets = cartPakets.reduce((s, p) => s + p.subtotal, 0)
  const rawSubtotal = subtotal() + totalPakets

  // Hitung diskon promo (buy1get1 + regular)
  const buy1get1Discount = items.reduce((s, item) => {
    if ((item.product as any).promo_buy1get1 && item.qty >= 2) {
      const freeQty = Math.floor(item.qty / 2)
      return s + freeQty * item.unit_price
    }
    return s
  }, 0)
  const promoDiscount = totalDiscount() + buy1get1Discount

  // Diskon manual total
  const manualDiscountTotal = items.reduce((s, item) => {
    const d = manualDiscounts[item.product.id] || 0
    return s + d * item.qty
  }, 0)

  const rawDiscount   = promoDiscount + manualDiscountTotal
  const afterDiscount = rawSubtotal - rawDiscount
  const ppnAmount     = ppnPct > 0 ? Math.round(afterDiscount * ppnPct / 100) : 0
  const grandTotal    = afterDiscount + ppnAmount
  const totalQtyPilih = paketPilihan.reduce((s, p) => s + p.qty, 0)
  const change        = payMethod === 'cash' ? Number(cashPaid) - grandTotal : 0
  const canVoid       = ['owner','manager','kasir'].includes(user?.role || '')
  const isOnlineOrder = orderType === 'online'

  // Fungsi diskon manual
  function applyManualDiscount() {
    if (!discountTarget) return
    const val = Number(discountInput)
    if (isNaN(val) || val < 0) return toast.error('Nominal tidak valid')
    let nominal = val
    if (discountType === 'percent') {
      if (val > 100) return toast.error('Persen maksimal 100%')
      nominal = Math.round(discountTarget.price * val / 100)
    }
    if (nominal > discountTarget.price) return toast.error('Diskon melebihi harga')
    setManualDiscounts(prev => ({ ...prev, [discountTarget.productId]: nominal }))
    setShowDiscountModal(false)
    setDiscountInput('')
    toast.success(`Diskon ${formatRupiah(nominal)} diterapkan`)
  }
  function removeManualDiscount(productId: string) {
    setManualDiscounts(prev => { const n = { ...prev }; delete n[productId]; return n })
  }

  async function handleVoid() {
    if (!voidTx || !voidReason.trim()) return toast.error('Alasan void wajib diisi')
    setIsVoiding(true)
    try {
      const isOwnerMgr = ['owner','manager'].includes(user?.role || '')
      const newStatus  = isOwnerMgr ? 'voided' : 'void_requested'
      const updated: any = { ...voidTx, status: newStatus, void_reason: voidReason.trim(), voided_by: user!.id, voided_at: now() }
      await db.transactions.put(updated)
      await supabase.from('transactions').update({ status: newStatus, void_reason: voidReason.trim(), voided_by: user!.id, voided_at: updated.voided_at }).eq('id', voidTx.id)
      if (isOwnerMgr) toast.success(`Transaksi ${voidTx.receipt_no} di-void`)
      else            toast.success(`Request void ${voidTx.receipt_no} dikirim ke owner`)
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

  // FIX: deductStockFromRecipes — exclude recipe_type === 'production' (resep produksi toko)
  // Resep produksi toko punya product_id = 'prod-toko-xxx' dan tidak match dengan produk menu
  async function deductStockFromRecipes(txItems: any[], storeId: string) {
    try {
      // FIX: hanya ambil resep TOKO (bukan resep produksi toko)
      // Recipe produksi toko ditandai dengan recipe_type === 'production' atau product_id prefix 'prod-toko-'
      const allRecipes  = await db.store_recipes.where('store_id').equals(storeId).filter(r => r.is_active).toArray()
      // Filter: hanya resep BOM kasir (bukan resep produksi toko)
      const recipes     = allRecipes.filter(r =>
        !(r as any).recipe_type || (r as any).recipe_type === 'bom' || (r as any).recipe_type === ''
        // Exclude yang punya recipe_type === 'production'
        // Juga exclude yang product_id-nya prefix 'prod-toko-' (marker resep produksi toko)
        ? !((r as any).recipe_type === 'production' || r.product_id?.startsWith('prod-toko-'))
        : false
      )
      // Sederhanakan: exclude recipe_type === 'production' dan product_id prefix 'prod-toko-'
      const bomRecipes = allRecipes.filter(r =>
        (r as any).recipe_type !== 'production' && !r.product_id?.startsWith('prod-toko-')
      )

      const recipeItems = await db.store_recipe_items.toArray()
      for (const txItem of txItems) {
        const recipe = bomRecipes.find(r => r.product_id === txItem.product_id)
        if (!recipe) continue
        const riList   = recipeItems.filter(ri => ri.recipe_id === recipe.id)
        const totalQty = (txItem.qty_eceran || 0) + (txItem.qty_dus || 0)
        if (totalQty <= 0) continue
        for (const ri of riList) {
          const qty = ri.qty_used * totalQty
          const src = (ri as any).source || 'store'
          if (src === 'store') {
            const storeStock = await db.stock.filter(s =>
              s.store_id === storeId && (
                s.ingredient_id === ri.material_id ||
                (s as any).material_id === ri.material_id
              )
            ).first()
            if (storeStock) {
              const newQty = Math.max(0, storeStock.qty_on_hand - qty)
              await db.stock.update(storeStock.id, { qty_on_hand: newQty, last_updated: now() })
              supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', storeStock.id).then(() => {})
            }
          }
        }
      }
    } catch (e) { console.warn('[BOM]', e) }
  }

  async function handleCheckout() {
    if (items.length === 0 && cartPakets.length === 0) return toast.error('Keranjang kosong')
    if (!activeShift)                                   return toast.error('Belum buka shift')
    if (isOnlineOrder && !onlineOrderNo.trim())         return toast.error('Nomor order wajib diisi')
    if (!isOnlineOrder && payMethod === 'cash' && Number(cashPaid) < grandTotal) return toast.error('Uang tidak cukup')
    setIsProcessing(true)
    try {
      const txId      = generateId()
      const receiptNo = generateReceiptNo(STORE_ID)
      const finalPay: PaymentMethod = isOnlineOrder ? PLATFORM_PAYMENT[onlinePlatform] : payMethod
      const paidAmt   = finalPay === 'cash' ? Number(cashPaid) : grandTotal
      const tx: any = {
        id: txId, store_id: STORE_ID, shift_id: activeShift.id, cashier_id: user!.id, receipt_no: receiptNo,
        subtotal: rawSubtotal, discount: rawDiscount, ppn_amount: ppnAmount, ppn_percent: ppnPct,
        total: grandTotal, payment_method: finalPay, cash_paid: paidAmt, change_given: paidAmt - grandTotal,
        status: 'completed',
        order_type:      orderType,
        order_source:    isOnlineOrder ? onlinePlatform : 'pos',
        online_order_no: isOnlineOrder ? onlineOrderNo.trim() : null,
        online_buyer:    isOnlineOrder ? (onlineBuyer.trim() || null) : null,
        created_at: now(),
      }
      const txItems = items.map(item => {
        const pkg = item.product.auto_package ? calcPackaging(item.qty, item.product.pkg_qty) : { dus: 0, eceran: item.qty }
        let itemPromoDiscount = (item.product as any).promo_discount || 0
        if ((item.product as any).promo_buy1get1 && item.qty >= 2) {
          const freeQty = Math.floor(item.qty / 2)
          itemPromoDiscount = freeQty * item.unit_price
        }
        // Tambahkan diskon manual
        const manDisc = (manualDiscounts[item.product.id] || 0) * item.qty
        const totalItemDiscount = itemPromoDiscount + manDisc
        const itemSubtotal = item.qty * item.unit_price - totalItemDiscount
        return {
          id: generateId(), transaction_id: txId,
          product_id: item.product.id, product_name: item.product.name,
          qty_eceran: pkg.eceran, qty_dus: pkg.dus,
          unit_price: item.unit_price, discount: item.discount + (manualDiscounts[item.product.id] || 0),
          promo_id: (item.product as any).promo_id || null,
          promo_discount: itemPromoDiscount,
          manual_discount: manDisc,
          subtotal: Math.max(0, itemSubtotal), item_type: 'unit',
        }
      })
      const txPakets = cartPakets.flatMap(cp => cp.pilihan.map(p => ({
        id: generateId(), transaction_id: txId, product_id: p.product.id,
        product_name: p.product.name, qty_eceran: p.qty, qty_dus: 0,
        unit_price: cp.paket.price / cp.paket.qty_total, discount: 0,
        promo_id: null, promo_discount: 0, manual_discount: 0,
        subtotal: (cp.paket.price / cp.paket.qty_total) * p.qty,
        item_type: 'package', package_id: cp.paket.id,
      })))
      await db.transactions.add(tx)
      await db.transaction_items.bulkAdd([...txItems, ...txPakets])
      await addToSyncQueue('transactions', txId, 'insert', tx, STORE_ID)
      for (const item of [...txItems, ...txPakets]) await addToSyncQueue('transaction_items', item.id, 'insert', item, STORE_ID)
      await deductStockFromRecipes([...txItems, ...txPakets], STORE_ID)

      const storeRec  = await db.stores.get(STORE_ID)
      const storeName = storeRec?.name || allStores?.find(s => s.id === STORE_ID)?.name || STORE_ID
      setLastTxData({
        tx, txItems: [...txItems, ...txPakets], receiptNo,
        storeName, grandTotal, rawSubtotal, rawDiscount, ppnAmount, ppnPct,
        payMethod: finalPay, cashPaid: paidAmt, change: paidAmt - grandTotal,
        orderType, onlinePlatform: isOnlineOrder ? onlinePlatform : null,
        onlineOrderNo: isOnlineOrder ? onlineOrderNo : null,
        items: items.map(i => {
          const isBuy1Get1 = (i.product as any).promo_buy1get1 && i.qty >= 2
          const b1g1Discount = isBuy1Get1 ? Math.floor(i.qty / 2) * i.unit_price : 0
          const manDisc = (manualDiscounts[i.product.id] || 0) * i.qty
          const totalItemDisc = b1g1Discount + (isBuy1Get1 ? 0 : (i.product as any).promo_discount * i.qty) + manDisc
          return {
            name: i.product.name, qty: i.qty, price: i.unit_price,
            subtotal: i.qty * i.unit_price - totalItemDisc,
            promoName: (i.product as any).promo_name,
            promoDiscount: b1g1Discount + (isBuy1Get1 ? 0 : (i.product as any).promo_discount * i.qty),
            manualDiscount: manDisc,
          }
        }),
        pakets: cartPakets.map(cp => ({ name: cp.paket.name, subtotal: cp.subtotal })),
      })

      clearCart(); setCartPakets([]); setShowCheckout(false); setCashPaid('')
      setOnlineOrderNo(''); setOnlineBuyer(''); setManualDiscounts({})

      const autoPrintNow = getAutoPrintNow()
      const printModeNow = getPrintModeNow()
      if (autoPrintNow) {
        setTimeout(() => {
          if (printModeNow === 'rawbt') {
            const W = 32; const line2 = '-'.repeat(W); let txt = ''
            txt += storeName.substring(0,W).padStart(Math.floor((W+Math.min(storeName.length,W))/2)) + '\n'
            txt += line2 + '\n' + `No: ${receiptNo}\n`
            txt += `${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}\n`
            txt += line2 + '\n'
            for (const item of txItems) txt += item.product_name.substring(0,W) + '\n'
            txt += line2 + '\n'
            txt += 'TOTAL'.padEnd(22) + formatRupiah(grandTotal).padStart(10) + '\n'
            txt += '\n\n\n'
            window.location.href = `rawbt:${encodeURIComponent(txt)}`
          } else {
            const W2 = 28; const lineStr = '-'.repeat(W2)
            const rowFn = (l: string, r: string) => { const sp = W2-l.length-r.length; return l+(sp>0?' '.repeat(sp):' ')+r }
            const lines2: string[] = []
            lines2.push(storeName.padStart(Math.floor((W2+storeName.length)/2)))
            lines2.push('Coco Puff'.padStart(Math.floor((W2+9)/2)))
            lines2.push(lineStr)
            lines2.push(rowFn(new Date().toLocaleDateString('id-ID'), new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})))
            lines2.push(rowFn('No.', receiptNo))
            lines2.push(lineStr)
            for (const item of txItems) {
              lines2.push(item.product_name.substring(0,W2))
              lines2.push('  '+item.qty_eceran+' x '+formatRupiah(item.unit_price))
            }
            lines2.push(lineStr)
            lines2.push(rowFn('TOTAL', formatRupiah(grandTotal)))
            lines2.push(rowFn('Bayar ('+finalPay+')', formatRupiah(paidAmt)))
            if (paidAmt > grandTotal) lines2.push(rowFn('Kembali', formatRupiah(paidAmt-grandTotal)))
            lines2.push(lineStr)
            lines2.push('Terima kasih!'.padStart(Math.floor((W2+13)/2)))
            lines2.push('')
            const html2 = `<html><head><style>*{margin:0;padding:0;}pre{font-family:'Courier New',monospace;font-size:11px;line-height:1.5;white-space:pre;}@page{margin:1mm;size:58mm auto;}</style></head><body><pre>${lines2.join('\n')}</pre></body></html>`
            const iframe2 = document.createElement('iframe')
            iframe2.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;'
            document.body.appendChild(iframe2)
            const doc2 = iframe2.contentWindow?.document
            if (doc2) { doc2.open(); doc2.write(html2); doc2.close() }
            setTimeout(() => { iframe2.contentWindow?.focus(); iframe2.contentWindow?.print(); setTimeout(()=>{try{document.body.removeChild(iframe2)}catch{}},2000) }, 300)
          }
        }, 200)
        toast.success(`Transaksi ${receiptNo} berhasil! ✓ Auto-print`)
      } else {
        setShowReceipt(true)
        toast.success(`Transaksi ${receiptNo} berhasil!`)
      }
    } catch (e) { toast.error('Gagal menyimpan transaksi'); console.error(e) }
    finally { setIsProcessing(false) }
  }

  const orderTypeLabel = ORDER_TYPES.find(o => o.id === orderType)?.label || ''

  return (
    <div className="flex flex-col h-full">
      {isOffline && (
        <div className="bg-amber-500 text-white text-xs font-medium px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <WifiOff size={13} />Mode offline — transaksi tersimpan lokal
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 flex-shrink-0">
        {isOwnerManager && allStores && allStores.length > 1 && (
          <div className="flex gap-1.5 px-3 pt-2 overflow-x-auto scrollbar-hide">
            {allStores.map(s => (
              <button key={s.id} onClick={() => { setSelectedStoreId(s.id); clearCart(); setCartPakets([]) }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedStoreId===s.id?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex border-b border-gray-50">
          {([
            { id: 'pos',     label: 'Kasir'  },
            { id: 'riwayat', label: 'Riwayat', icon: <History size={13} /> },
            { id: 'promo',   label: 'Promo',   icon: <Tag size={13} /> },
          ] as { id: MainTab; label: string; icon?: React.ReactNode }[]).map(tab => (
            <button key={tab.id} onClick={() => setMainTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${mainTab===tab.id?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
              {tab.icon}{tab.label}
              {tab.id === 'promo' && (allPromos?.length || 0) > 0 && (
                <span className="ml-0.5 bg-green-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{allPromos?.length}</span>
              )}
            </button>
          ))}
        </div>
        {mainTab === 'pos' && (
          <div className="flex gap-1.5 px-3 py-2">
            {ORDER_TYPES.map(ot => (
              <button key={ot.id} onClick={() => setOrderType(ot.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${orderType===ot.id?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>
                {ot.icon}{ot.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TAB PROMO */}
      {mainTab === 'promo' && (
        <div className="flex-1 overflow-auto bg-gray-50 p-4 space-y-3">
          <p className="text-xs text-gray-400">Promo aktif hari ini</p>
          {!allPromos?.length && (
            <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
              <Tag size={28} className="text-gray-200 mx-auto mb-2" />
              Belum ada promo aktif
            </div>
          )}
          <div className="space-y-2">
            {allPromos?.map(promo => (
              <div key={promo.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full',
                        promo.promo_type === 'buy1get1' ? 'bg-purple-100 text-purple-700' :
                        promo.promo_type === 'percent'  ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700')}>
                        {promo.promo_type === 'buy1get1' ? 'B1G1' :
                         promo.promo_type === 'percent'  ? `${promo.value}% OFF` :
                         `Diskon ${formatRupiah(promo.value)}`}
                      </span>
                      <p className="text-sm font-semibold text-gray-900">{promo.name}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Produk: <strong>{(promo as any).product?.name || promo.product_id}</strong>
                    </p>
                    {promo.promo_type === 'buy1get1' && (
                      <p className="text-xs text-purple-600 mt-0.5">Beli 2 bayar 1 — otomatis diterapkan di kasir</p>
                    )}
                    {promo.promo_type === 'percent' && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Hemat {promo.value}% = {formatRupiah(Math.round(((promo as any).product?.base_price || 0) * promo.value / 100))} per item
                      </p>
                    )}
                    {promo.promo_type === 'fixed' && (
                      <p className="text-xs text-blue-600 mt-0.5">Hemat {formatRupiah(promo.value)} per item</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Berlaku: {new Date(promo.valid_from).toLocaleDateString('id-ID')} – {new Date(promo.valid_until).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs font-medium text-amber-800">Catatan</p>
            <p className="text-xs text-amber-700 mt-0.5">Promo otomatis diterapkan saat produk ditambahkan ke keranjang. Untuk diskon manual, klik item di keranjang.</p>
          </div>
        </div>
      )}

      {/* TAB RIWAYAT */}
      {mainTab === 'riwayat' && (
        <div className="flex-1 overflow-auto bg-gray-50 p-4 space-y-3">
          <p className="text-xs text-gray-400">Transaksi hari ini</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {(['semua','cash','qris','transfer','gopay','grab','shopeefood'] as const).map(pm => (
              <button key={pm} onClick={() => setPayFilter(pm)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${payFilter===pm?'bg-gray-900 text-white':'bg-white text-gray-500 border border-gray-200'}`}>
                {pm==='semua'?'Semua':pm==='cash'?'Tunai':pm==='qris'?'QRIS':pm==='transfer'?'Transfer':pm==='gopay'?'GoPay':pm==='grab'?'GrabPay':'ShopeePay'}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {(payFilter === 'semua' ? transactions : transactions?.filter(tx => tx.payment_method === payFilter))?.map((tx, idx) => (
              <div key={tx.id} className={`${idx!==0?'border-t border-gray-50':''} ${(tx as any).status==='voided'?'opacity-50':''}`}>
                <div onClick={() => setExpandedTxId(expandedTxId===String(tx.id) ? null : String(tx.id))}
                  className="px-4 py-3 cursor-pointer active:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-gray-900 font-mono text-xs">{tx.receipt_no}</p>
                        <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(tx.receipt_no); toast.success('ID disalin') }}
                          className="text-[10px] text-blue-400 px-1 py-0.5 rounded border border-blue-200">copy</button>
                        {(tx as any).status==='voided' && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">VOID</span>}
                        {(tx as any).status==='void_requested' && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">⏳ Req.Void</span>}
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                          tx.payment_method==='cash'?'bg-gray-100 text-gray-700':tx.payment_method==='qris'?'bg-blue-100 text-blue-700':
                          tx.payment_method==='transfer'?'bg-purple-100 text-purple-700':tx.payment_method==='gopay'?'bg-green-100 text-green-700':
                          tx.payment_method==='grab'?'bg-emerald-100 text-emerald-700':'bg-orange-100 text-orange-700')}>
                          {tx.payment_method==='cash'?'Tunai':tx.payment_method==='qris'?'QRIS':tx.payment_method==='transfer'?'Transfer':tx.payment_method==='gopay'?'GoPay':tx.payment_method==='grab'?'GrabPay':'ShopeePay'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.created_at)} · {PAYMENT_LABELS[tx.payment_method as PaymentMethod]??tx.payment_method}</p>
                      {(tx as any).online_order_no && <p className="text-xs text-gray-500 font-mono">#{(tx as any).online_order_no}</p>}
                      {(tx as any).void_reason     && <p className="text-xs text-red-400">Alasan: {(tx as any).void_reason}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <p className={`text-sm font-semibold ${(tx as any).status==='voided'?'line-through text-gray-400':'text-gray-900'}`}>{formatRupiah(tx.total)}</p>
                      {canVoid && (tx as any).status==='completed' && (
                        <button onClick={() => { setVoidTx(tx as any); setVoidReason(''); setShowVoidModal(true) }}
                          className="text-xs text-red-400 border border-red-200 px-2 py-0.5 rounded-lg">Void</button>
                      )}
                      {isOwnerManager && (tx as any).status==='void_requested' && (
                        <div className="flex gap-1">
                          <button onClick={async e => {
                            e.stopPropagation()
                            const txItems = await db.transaction_items.where('transaction_id').equals(tx.id).toArray()
                            for (const item of txItems) {
                              const stk = await db.stock.where('store_id').equals(STORE_ID).and(s => s.product_id === item.product_id).first()
                              if (stk) await db.stock.update(stk.id, { qty: (stk.qty||0) + (item.qty_eceran||0) })
                            }
                            const upd: any = { ...tx, status: 'voided' }
                            await db.transactions.put(upd)
                            await supabase.from('transactions').update({ status: 'voided' }).eq('id', tx.id)
                            toast.success('Void disetujui, stok dikembalikan')
                          }} className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-lg">✓ Setuju</button>
                          <button onClick={async e => {
                            e.stopPropagation()
                            const upd: any = { ...tx, status: 'completed' }
                            await db.transactions.put(upd)
                            await supabase.from('transactions').update({ status: 'completed' }).eq('id', tx.id)
                            toast.success('Request void ditolak')
                          }} className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">✗ Tolak</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {expandedTxId !== null && expandedTxId === String(tx.id) && (
                  <TxDetailRow txId={String(tx.id)} total={tx.total} onReprint={(txData) => { setLastTxData(txData); setShowReceipt(true) }} />
                )}
              </div>
            ))}
            {transactions?.length===0 && <div className="py-12 text-center text-sm text-gray-400">Belum ada transaksi hari ini</div>}
          </div>
        </div>
      )}

      {/* TAB POS */}
      {mainTab === 'pos' && (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            {isOnlineOrder && (
              <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2 flex-shrink-0">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {(['gofood','grabfood','shopeefood'] as OnlinePlatform[]).map(p => (
                    <button key={p} onClick={() => setOnlinePlatform(p)}
                      className={cn('px-3 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap flex-shrink-0',
                        onlinePlatform===p?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600')}>
                      {p==='gofood'?'GoFood':p==='grabfood'?'GrabFood':'ShopeeFood'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input flex-1 text-sm" placeholder="Nomor Order *" value={onlineOrderNo} onChange={e => setOnlineOrderNo(e.target.value)} />
                  <input className="input flex-1 text-sm" placeholder="Nama Pembeli" value={onlineBuyer} onChange={e => setOnlineBuyer(e.target.value)} />
                </div>
              </div>
            )}

            <div className="bg-white border-b border-gray-100 px-3 py-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0 items-center">
              <button onClick={() => setSelectedCat('all')}
                className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0',selectedCat==='all'?'bg-gray-900 text-white':'bg-gray-100 text-gray-600')}>
                Semua
              </button>
              {categories?.map(cat => (
                <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                  className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0',selectedCat===cat.id?'bg-gray-900 text-white':'bg-gray-100 text-gray-600')}>
                  {cat.name}
                </button>
              ))}
              <button onClick={() => syncProducts(true)} disabled={isSyncing} className="flex-shrink-0 ml-auto p-1.5 text-gray-400 rounded-full">
                <RefreshCw size={14} className={isSyncing?'animate-spin text-blue-500':''} />
              </button>
            </div>

            {pakets.length > 0 && (
              <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0">
                <span className="text-xs font-medium text-gray-500 self-center mr-1 flex-shrink-0">Paket:</span>
                {pakets.map(p => (
                  <button key={p.id} onClick={() => openPaketModal(p)}
                    className="flex items-center gap-1.5 bg-gray-900 text-white px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                    <Package size={12} />{p.name} — {formatRupiah(p.price)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-auto p-3">
              {products && products.length === 0 && !isSyncing && (
                <div className="text-center py-16">
                  <p className="text-sm text-gray-400 mb-3">Belum ada produk</p>
                  <button onClick={() => syncProducts(true)} className="text-xs text-blue-500 border border-blue-200 px-3 py-1.5 rounded-lg">Sync Produk</button>
                </div>
              )}
              {isSyncing && products?.length === 0 && (
                <div className="text-center py-16 text-sm text-gray-400">
                  <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-2" />
                  Memuat produk...
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {products?.map(prod => <ProductCard key={prod.id} product={prod} orderType={orderType} onAdd={() => addItem(prod)} />)}
              </div>
            </div>
          </div>

          {/* Keranjang desktop */}
          <div className="w-72 bg-white border-l border-gray-100 flex-col hidden md:flex">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <ShoppingCart size={18} /> Keranjang
                  {(items.length+cartPakets.length)>0 && (
                    <span className="ml-1 bg-gray-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{items.length+cartPakets.length}</span>
                  )}
                </h2>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                  orderType==='dine_in'?'bg-orange-100 text-orange-700':orderType==='take_away'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700')}>
                  {orderTypeLabel}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {items.length===0 && cartPakets.length===0 ? (
                <div className="text-center text-gray-400 py-12 text-sm"><ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />Keranjang kosong</div>
              ) : (
                <>
                  {items.map(item => (
                    <CartItemRow
                      key={item.product.id}
                      item={item}
                      manualDiscount={manualDiscounts[item.product.id] || 0}
                      onQtyChange={q => updateQty(item.product.id, q)}
                      onRemove={() => { removeItem(item.product.id); removeManualDiscount(item.product.id) }}
                      onDiscount={() => {
                        setDiscountTarget({ productId: item.product.id, name: item.product.name, price: item.unit_price })
                        setDiscountInput('')
                        setDiscountType('percent')
                        setShowDiscountModal(true)
                      }}
                      onRemoveDiscount={() => removeManualDiscount(item.product.id)}
                    />
                  ))}
                  {cartPakets.map((cp,i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-2 border border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 flex items-center gap-1"><Package size={12}/>{cp.paket.name}</span>
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
                {promoDiscount>0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon Promo</span><span>-{formatRupiah(promoDiscount)}</span></div>}
                {manualDiscountTotal>0 && <div className="flex justify-between text-sm text-blue-600"><span>Diskon Manual</span><span>-{formatRupiah(manualDiscountTotal)}</span></div>}
                {ppnAmount>0 && <div className="flex justify-between text-sm text-gray-600"><span>PPN {ppnPct}%</span><span>+{formatRupiah(ppnAmount)}</span></div>}
                <div className="flex justify-between font-semibold text-gray-900 text-base border-t border-gray-100 pt-2"><span>Total</span><span>{formatRupiah(grandTotal)}</span></div>
                <button onClick={() => setShowCheckout(true)} className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold">Bayar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile bayar */}
      {mainTab === 'pos' && (items.length>0||cartPakets.length>0) && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 flex-shrink-0">
          <button onClick={() => setShowCheckout(true)} className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold flex items-center justify-between px-4">
            <span className="flex items-center gap-2"><ShoppingCart size={18}/>{items.length+cartPakets.length} item</span>
            <span>{formatRupiah(grandTotal)}</span>
          </button>
        </div>
      )}

      {/* MODAL CHECKOUT */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Konfirmasi Bayar</h3>
              <button onClick={() => setShowCheckout(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
              orderType==='dine_in'?'bg-orange-50 text-orange-700':orderType==='take_away'?'bg-blue-50 text-blue-700':'bg-green-50 text-green-700')}>
              {ORDER_TYPES.find(o=>o.id===orderType)?.icon}
              {orderTypeLabel}
              {isOnlineOrder && onlinePlatform && <span className="ml-1 opacity-70">· {onlinePlatform==='gofood'?'GoFood':onlinePlatform==='grabfood'?'GrabFood':'ShopeeFood'}</span>}
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-1 max-h-40 overflow-auto">
              {items.map(i => {
                const manDisc = (manualDiscounts[i.product.id] || 0) * i.qty
                const isBuy1Get1 = (i.product as any).promo_buy1get1 && i.qty >= 2
                const b1g1Disc  = isBuy1Get1 ? Math.floor(i.qty/2) * i.unit_price : 0
                const promoDisc = isBuy1Get1 ? b1g1Disc : ((i.product as any).promo_discount || 0) * i.qty
                const totalDisc = promoDisc + manDisc
                return (
                  <div key={i.product.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-700">{i.product.name} ×{i.qty}</span>
                      <span>{formatRupiah(i.qty * i.unit_price - totalDisc)}</span>
                    </div>
                    {promoDisc > 0 && <p className="text-xs text-green-600">🎁 {(i.product as any).promo_name} (-{formatRupiah(promoDisc)})</p>}
                    {manDisc > 0 && <p className="text-xs text-blue-600">✂️ Diskon manual (-{formatRupiah(manDisc)})</p>}
                  </div>
                )
              })}
              {cartPakets.map((cp,i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700"><Package size={12} className="inline mr-1"/>{cp.paket.name}</span>
                  <span>{formatRupiah(cp.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border border-gray-100 rounded-xl p-3">
              <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatRupiah(rawSubtotal)}</span></div>
              {promoDiscount>0   && <div className="flex justify-between text-sm text-green-600"><span>Diskon Promo</span><span>-{formatRupiah(promoDiscount)}</span></div>}
              {manualDiscountTotal>0 && <div className="flex justify-between text-sm text-blue-600"><span>Diskon Manual</span><span>-{formatRupiah(manualDiscountTotal)}</span></div>}
              {ppnAmount>0       && <div className="flex justify-between text-sm text-gray-600"><span>PPN {ppnPct}%</span><span>+{formatRupiah(ppnAmount)}</span></div>}
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-1.5"><span>Total</span><span>{formatRupiah(grandTotal)}</span></div>
            </div>
            {isOnlineOrder && (
              <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2.5 space-y-0.5">
                <p className="text-xs font-medium text-gray-700 font-mono">#{onlineOrderNo}</p>
                {onlineBuyer && <p className="text-xs text-gray-500">{onlineBuyer}</p>}
                <p className="text-xs text-gray-400">Bayar via {PAYMENT_LABELS[PLATFORM_PAYMENT[onlinePlatform]]}</p>
              </div>
            )}
            {!isOnlineOrder && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Metode Pembayaran</p>
                <div className="grid grid-cols-3 gap-2">
                  {OFFLINE_METHODS.map(m => (
                    <button key={m.id} onClick={() => setPayMethod(m.id)}
                      className={cn('py-2.5 rounded-xl text-sm font-medium border transition-colors',
                        payMethod===m.id?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-700')}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isOnlineOrder && payMethod==='cash' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Uang Diterima</label>
                <input className="input text-lg font-semibold" inputMode="decimal" placeholder="0"
                  value={cashPaid} onChange={e => setCashPaid(e.target.value.replace(/[^0-9]/g,''))} autoFocus />
                {/* Quick cash buttons */}
                <div className="flex gap-2 mt-2">
                  {[grandTotal, Math.ceil(grandTotal/5000)*5000, Math.ceil(grandTotal/10000)*10000, Math.ceil(grandTotal/50000)*50000].filter((v,i,a)=>a.indexOf(v)===i).slice(0,4).map(v => (
                    <button key={v} onClick={() => setCashPaid(String(v))}
                      className="flex-1 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-700 font-medium">{formatRupiah(v)}</button>
                  ))}
                </div>
                {Number(cashPaid)>0 && Number(cashPaid)<grandTotal && <p className="text-sm text-red-500 mt-1">Kurang {formatRupiah(grandTotal-Number(cashPaid))}</p>}
                {Number(cashPaid)>=grandTotal && <p className="text-sm text-green-600 mt-1">Kembalian: <strong>{formatRupiah(change)}</strong></p>}
              </div>
            )}
            <button onClick={handleCheckout} disabled={isProcessing}
              className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {isProcessing ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"/> : <CheckCircle size={18}/>}
              {isProcessing ? 'Memproses...' : 'Konfirmasi Bayar'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DISKON MANUAL */}
      {showDiscountModal && discountTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Percent size={16}/>Diskon Manual</h3>
              <button onClick={() => setShowDiscountModal(false)}><X size={18} className="text-gray-400"/></button>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm font-medium text-gray-900">{discountTarget.name}</p>
              <p className="text-xs text-gray-500">Harga: {formatRupiah(discountTarget.price)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDiscountType('percent')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border ${discountType==='percent'?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>
                Persen (%)
              </button>
              <button onClick={() => setDiscountType('nominal')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border ${discountType==='nominal'?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>
                Nominal (Rp)
              </button>
            </div>
            <input className="input text-lg font-semibold" inputMode="decimal" autoFocus
              placeholder={discountType==='percent' ? 'Contoh: 10 (= 10%)' : 'Contoh: 5000'}
              value={discountInput} onChange={e => setDiscountInput(e.target.value.replace(/[^0-9]/g,''))} />
            {discountInput && discountType==='percent' && Number(discountInput) <= 100 && (
              <p className="text-sm text-blue-600">= Diskon {formatRupiah(Math.round(discountTarget.price * Number(discountInput) / 100))} per item</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowDiscountModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
              <button onClick={applyManualDiscount} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium">Terapkan</button>
            </div>
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

      {showPrinterModal && (
        <PrinterMiniModal storeId={STORE_ID} onClose={() => { setShowPrinterModal(false); setPrinterConfigTs(Date.now()) }} />
      )}
      {showReceipt && lastTxData && (
        <ReceiptModal data={lastTxData} printMode={printMode} autoPrint={autoPrint} onClose={() => setShowReceipt(false)} />
      )}

      {/* MODAL PAKET */}
      {showPaketModal && selectedPaket && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><h3 className="font-semibold text-lg">{selectedPaket.name}</h3><p className="text-sm text-gray-500">Pilih {selectedPaket.qty_total} pcs — bisa mix rasa</p></div>
              <button onClick={() => setShowPaketModal(false)}><X size={20} className="text-gray-400"/></button>
            </div>
            <div className="bg-gray-100 rounded-full h-2">
              <div className="bg-gray-900 h-2 rounded-full transition-all" style={{width:`${Math.min(100,(totalQtyPilih/selectedPaket.qty_total)*100)}%`}} />
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
                      <button onClick={() => tambahPilihanRasa(prod)} className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center"><Plus size={12}/></button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPaketModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
              <button onClick={konfirmasiPaket} disabled={totalQtyPilih!==selectedPaket.qty_total}
                className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
                Tambah — {formatRupiah(selectedPaket.price)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PRODUCT CARD ─────────────────────────────────────────────
function ProductCard({ product, orderType, onAdd }: { product: any; orderType: OrderType; onAdd: () => void }) {
  const hasPromo   = product.promo_discount > 0
  const isBuy1Get1 = product.promo_buy1get1
  return (
    <button onClick={onAdd} className="bg-white rounded-2xl border border-gray-100 p-3 text-left active:scale-95 transition-transform shadow-sm relative overflow-hidden">
      {isBuy1Get1 && (
        <div className="absolute top-0 right-0 bg-purple-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-bl-xl">B1G1</div>
      )}
      {hasPromo && !isBuy1Get1 && (
        <div className="absolute top-0 right-0 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-bl-xl">PROMO</div>
      )}
      <div className="text-2xl mb-2">🧁</div>
      <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">{product.name}</p>
      {isBuy1Get1 ? (
        <div className="mt-1">
          <p className="text-purple-600 font-semibold text-sm">{formatRupiah(product.base_price)}</p>
          <p className="text-[10px] text-purple-400">Beli 2 bayar 1!</p>
        </div>
      ) : hasPromo ? (
        <div className="mt-1">
          <p className="text-[10px] text-gray-400 line-through">{formatRupiah(product.base_price)}</p>
          <p className="text-green-600 font-semibold text-sm">{formatRupiah(product.effective_price)}</p>
        </div>
      ) : (
        <p className="text-gray-900 font-semibold text-sm mt-1">{formatRupiah(product.effective_price ?? product.base_price)}</p>
      )}
    </button>
  )
}

// ── CART ITEM ROW — dengan tombol diskon ──────────────────────
function CartItemRow({ item, manualDiscount, onQtyChange, onRemove, onDiscount, onRemoveDiscount }: {
  item: { product: any; qty: number; subtotal: number; unit_price: number; discount: number }
  manualDiscount: number
  onQtyChange: (qty: number) => void
  onRemove: () => void
  onDiscount: () => void
  onRemoveDiscount: () => void
}) {
  const isBuy1Get1    = (item.product as any).promo_buy1get1 && item.qty >= 2
  const b1g1Discount  = isBuy1Get1 ? Math.floor(item.qty / 2) * item.unit_price : 0
  const promoDiscTotal = isBuy1Get1 ? b1g1Discount : ((item.product as any).promo_discount || 0) * item.qty
  const manDiscTotal  = manualDiscount * item.qty
  const finalSubtotal = item.qty * item.unit_price - promoDiscTotal - manDiscTotal

  return (
    <div className="bg-gray-50 rounded-xl p-2 border border-gray-100">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-xs font-semibold text-gray-900">{formatRupiah(finalSubtotal)}</p>
            {isBuy1Get1 && <span className="text-[10px] text-purple-500">B1G1 -{formatRupiah(b1g1Discount)}</span>}
            {!isBuy1Get1 && (item.product as any).promo_name && (
              <span className="text-[10px] text-green-600">🎁{(item.product as any).promo_name}</span>
            )}
            {manualDiscount > 0 && <span className="text-[10px] text-blue-600">✂️-{formatRupiah(manDiscTotal)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onQtyChange(item.qty-1)} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center"><Minus size={12}/></button>
          <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
          <button onClick={() => onQtyChange(item.qty+1)} className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center"><Plus size={12}/></button>
          <button onClick={onRemove} className="w-7 h-7 rounded-full text-red-400 flex items-center justify-center ml-1"><Trash2 size={12}/></button>
        </div>
      </div>
      {/* Tombol diskon manual */}
      <div className="flex items-center gap-1.5 mt-1.5">
        {manualDiscount > 0 ? (
          <button onClick={onRemoveDiscount} className="text-[10px] text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 flex items-center gap-1">
            ✂️ Diskon {formatRupiah(manualDiscount)}/pcs <X size={8}/>
          </button>
        ) : (
          <button onClick={onDiscount} className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-2 py-0.5 flex items-center gap-1">
            <Percent size={9}/> Tambah Diskon
          </button>
        )}
      </div>
    </div>
  )
}

// ── TX DETAIL ROW ─────────────────────────────────────────────
function TxDetailRow({ txId, total, onReprint }: { txId: string; total: number; onReprint: (data: any) => void }) {
  const [items,   setItems]   = useState<any[]>([])
  const [tx,      setTx]      = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      db.transaction_items.where('transaction_id').equals(txId).toArray(),
      db.transactions.get(txId),
    ]).then(([its, txData]) => { setItems(its); setTx(txData); setLoading(false) })
  }, [txId])

  if (loading) return <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 text-xs text-gray-400">Memuat...</div>

  const payMethod = tx?.payment_method || ''
  const cashPaid  = tx?.cash_paid || tx?.total || 0
  const change    = tx?.change_amount || 0
  const payLabel: Record<string,string> = { cash:'Tunai', qris:'QRIS', transfer:'Transfer', gopay:'GoPay', grab:'GrabPay', shopeefood:'ShopeePay' }
  const payColor: Record<string,string> = { cash:'bg-gray-100 text-gray-700', qris:'bg-blue-100 text-blue-700', transfer:'bg-purple-100 text-purple-700', gopay:'bg-green-100 text-green-700', grab:'bg-emerald-100 text-emerald-700', shopeefood:'bg-orange-100 text-orange-700' }

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 space-y-2">
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex justify-between text-xs">
            <span className="text-gray-700 flex-1 pr-2">
              {item.product_name}
              <span className="text-gray-400 ml-1">×{(item.qty_eceran||0)+(item.qty_dus||0)}</span>
              {(item.promo_discount || 0) > 0 && <span className="text-green-600 ml-1">-{formatRupiah(item.promo_discount)}</span>}
              {(item.manual_discount || 0) > 0 && <span className="text-blue-600 ml-1">✂️-{formatRupiah(item.manual_discount)}</span>}
            </span>
            <span className="text-gray-700 font-medium">{formatRupiah(item.subtotal||0)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200 pt-2 space-y-1">
        {tx?.ppn_amount > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>PPN {tx.ppn_percent}%</span><span>+{formatRupiah(tx.ppn_amount)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-semibold text-gray-900">
          <span>Total</span><span>{formatRupiah(total)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${payColor[payMethod]||'bg-gray-100 text-gray-600'}`}>
              {payLabel[payMethod]||payMethod}
            </span>
            {cashPaid > 0 && <span className="text-xs text-gray-500">{formatRupiah(cashPaid)}</span>}
          </div>
          {change > 0 && <span className="text-xs text-gray-500">Kembali {formatRupiah(change)}</span>}
        </div>
        {tx?.online_order_no && <p className="text-xs text-gray-400">Order #{tx.online_order_no}</p>}
      </div>
    </div>
  )
}

// ── PRINTER MINI MODAL ────────────────────────────────────────
function PrinterMiniModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const key = `printer_config_${storeId}`
  const [printMode, setPrintMode] = useState<'browser'|'rawbt'>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '{}').printMode || 'browser' } catch { return 'browser' }
  })
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '{}').autoPrint === true } catch { return false }
  })
  const [saved, setSaved] = useState(false)

  function handleSave() {
    localStorage.setItem(key, JSON.stringify({ printMode, autoPrint }))
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 1000)
    toast.success('Setting printer disimpan')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">🖨️ Setting Printer</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2">
            <button onClick={() => setPrintMode('browser')}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left ${printMode==='browser'?'border-gray-900 bg-gray-50':'border-gray-200'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${printMode==='browser'?'border-gray-900':'border-gray-300'}`}>
                {printMode==='browser' && <div className="w-2 h-2 bg-gray-900 rounded-full" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">🖥️ Browser Print (USB)</p>
                <p className="text-xs text-gray-500">Buka dialog print browser</p>
              </div>
            </button>
            <button onClick={() => setPrintMode('rawbt')}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left ${printMode==='rawbt'?'border-blue-600 bg-blue-50':'border-gray-200'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${printMode==='rawbt'?'border-blue-600':'border-gray-300'}`}>
                {printMode==='rawbt' && <div className="w-2 h-2 bg-blue-600 rounded-full" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">📱 RawBT (Bluetooth)</p>
                <p className="text-xs text-gray-500">Android + printer thermal Bluetooth</p>
              </div>
            </button>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-900">Print Otomatis</p>
              <p className="text-xs text-gray-400">Langsung print tanpa pop up struk</p>
            </div>
            <button onClick={() => setAutoPrint(!autoPrint)}
              className={`w-11 h-6 rounded-full transition-colors relative ${autoPrint?'bg-gray-900':'bg-gray-200'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${autoPrint?'left-[22px]':'left-0.5'}`} />
            </button>
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold">
            {saved ? '✓ Tersimpan!' : 'Simpan Setting'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RECEIPT MODAL ─────────────────────────────────────────────
function ReceiptModal({ data, printMode, autoPrint, onClose }: { data: any; printMode?: string; autoPrint?: boolean; onClose: () => void }) {
  const orderTypeLabel: Record<string, string> = { dine_in: 'Dine In', take_away: 'Take Away', online: 'Online' }
  const payLabel: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer', gopay: 'GoPay', grab: 'GrabPay', shopeefood: 'ShopeePay' }

  function handlePrint() {
    const W = 28; const line = '-'.repeat(W)
    const center = (s: string) => s.padStart(Math.floor((W + s.length) / 2)).padEnd(W)
    const row = (l: string, r: string) => { const space = W - l.length - r.length; return l + (space > 0 ? ' '.repeat(space) : ' ') + r }
    const now2 = new Date()
    let lines: string[] = []
    lines.push(center(data.storeName))
    lines.push(center('Coco Puff'))
    lines.push(line)
    lines.push(row(now2.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'}), now2.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})))
    lines.push(row('No.', data.receiptNo.length > 20 ? data.receiptNo.substring(0,20)+'...' : data.receiptNo))
    lines.push(row('Tipe', orderTypeLabel[data.orderType] || data.orderType))
    if (data.onlineOrderNo) lines.push(row('Order', '#' + data.onlineOrderNo))
    lines.push(line)
    for (const item of data.items) {
      lines.push(item.name.substring(0, W))
      lines.push(row(`  ${item.qty} x ${formatRupiah(item.price)}`, formatRupiah(item.subtotal)))
      if (item.promoDiscount > 0) lines.push(row('  Promo', '-' + formatRupiah(item.promoDiscount)))
      if (item.manualDiscount > 0) lines.push(row('  Diskon', '-' + formatRupiah(item.manualDiscount)))
    }
    for (const p of data.pakets) { lines.push(p.name.substring(0, W)); lines.push(row('', formatRupiah(p.subtotal))) }
    lines.push(line)
    lines.push(row('Subtotal', formatRupiah(data.rawSubtotal)))
    if (data.rawDiscount > 0) lines.push(row('Diskon', '-' + formatRupiah(data.rawDiscount)))
    if (data.ppnAmount > 0) lines.push(row('PPN ' + data.ppnPct + '%', '+' + formatRupiah(data.ppnAmount)))
    lines.push(line)
    lines.push(row('TOTAL', formatRupiah(data.grandTotal)))
    lines.push(row('Bayar (' + (payLabel[data.payMethod] || data.payMethod) + ')', formatRupiah(data.cashPaid)))
    if (data.payMethod === 'cash' && data.change > 0) lines.push(row('Kembali', formatRupiah(data.change)))
    lines.push(line)
    lines.push(center('Terima kasih!'))
    lines.push(center('Coco Puff - ' + data.storeName))
    lines.push(''); lines.push(''); lines.push('')
    const html = `<html><head><title>Struk</title><style>*{margin:0;padding:0;}body{margin:0;padding:2px;}pre{font-family:'Courier New',Courier,monospace;font-size:8px;line-height:1.3;white-space:pre;}@page{margin:0mm;size:58mm auto;}@media print{pre{width:56mm;}}</style></head><body><pre>${lines.join('\n')}</pre></body></html>`
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;'
    document.body.appendChild(iframe)
    const iframeDoc = iframe.contentWindow?.document
    if (!iframeDoc) { document.body.removeChild(iframe); return }
    iframeDoc.open(); iframeDoc.write(html); iframeDoc.close()
    setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => { try { document.body.removeChild(iframe) } catch {} }, 2000) }, 300)
  }

  function handleRawBT() {
    const line = '-'.repeat(32); const nl = '\n'
    let txt = ''
    txt += data.storeName.toUpperCase().padStart((32+data.storeName.length)/2|0) + nl + 'COCO PUFF'.padStart(20) + nl + line + nl
    txt += `No: ${data.receiptNo}` + nl + `Tgl: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}` + nl
    txt += `Tipe: ${data.orderType==='dine_in'?'Dine In':data.orderType==='take_away'?'Take Away':'Online'}` + nl
    if (data.onlineOrderNo) txt += `Order: #${data.onlineOrderNo}` + nl
    txt += line + nl
    for (const item of data.items) {
      txt += item.name.substring(0,22) + nl
      txt += `  ${item.qty} x ${formatRupiah(item.price)}`.padEnd(22) + formatRupiah(item.subtotal).padStart(10) + nl
      if (item.promoDiscount > 0) txt += `  Promo: -${formatRupiah(item.promoDiscount)}` + nl
      if (item.manualDiscount > 0) txt += `  Diskon: -${formatRupiah(item.manualDiscount)}` + nl
    }
    txt += line + nl
    txt += 'Subtotal'.padEnd(22) + formatRupiah(data.rawSubtotal).padStart(10) + nl
    if (data.rawDiscount > 0) txt += 'Diskon'.padEnd(22) + ('-'+formatRupiah(data.rawDiscount)).padStart(10) + nl
    if (data.ppnAmount > 0)   txt += `PPN ${data.ppnPct}%`.padEnd(22) + ('+'+formatRupiah(data.ppnAmount)).padStart(10) + nl
    txt += 'TOTAL'.padEnd(22) + formatRupiah(data.grandTotal).padStart(10) + nl
    txt += 'Bayar'.padEnd(22) + formatRupiah(data.cashPaid).padStart(10) + nl
    if (data.payMethod==='cash' && data.change>0) txt += 'Kembali'.padEnd(22) + formatRupiah(data.change).padStart(10) + nl
    txt += line + nl + 'Terima kasih!'.padStart(22) + nl + nl + nl + nl
    window.location.href = `rawbt:${encodeURIComponent(txt)}`
    setTimeout(() => { navigator.clipboard.writeText(txt).then(() => toast.success('Teks struk disalin ke clipboard')).catch(() => {}) }, 1000)
  }

  useEffect(() => {
    if (!autoPrint) return
    setTimeout(() => { if (printMode === 'rawbt') handleRawBT(); else handlePrint() }, 300)
  }, [])

  const now = new Date()
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Struk Pembayaran</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="font-mono text-xs space-y-1" style={{fontFamily:'Courier New, monospace'}}>
            <div className="text-center font-bold text-sm">{data.storeName}</div>
            <div className="text-center text-xs text-gray-500">Coco Puff</div>
            <div className="border-t border-dashed border-gray-300 my-2" />
            <div className="flex justify-between"><span>{now.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</span><span>{now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}</span></div>
            <div className="flex justify-between"><span>No.</span><span className="font-bold">{data.receiptNo}</span></div>
            <div className="flex justify-between"><span>Tipe</span><span>{orderTypeLabel[data.orderType] || data.orderType}</span></div>
            {data.onlineOrderNo && <div className="flex justify-between"><span>Order</span><span>#{data.onlineOrderNo}</span></div>}
            <div className="border-t border-dashed border-gray-300 my-2" />
            {data.items.map((item: any, i: number) => (
              <div key={i}>
                <div className="flex justify-between"><span className="flex-1 pr-2">{item.name}</span><span>{formatRupiah(item.subtotal)}</span></div>
                <div className="flex justify-between text-gray-400"><span>{item.qty} × {formatRupiah(item.price)}</span></div>
                {item.promoDiscount > 0 && <div className="flex justify-between text-green-600"><span>🎁 {item.promoName}</span><span>-{formatRupiah(item.promoDiscount)}</span></div>}
                {item.manualDiscount > 0 && <div className="flex justify-between text-blue-600"><span>✂️ Diskon manual</span><span>-{formatRupiah(item.manualDiscount)}</span></div>}
              </div>
            ))}
            {data.pakets.map((p: any, i: number) => (
              <div key={i} className="flex justify-between"><span className="flex-1 pr-2">{p.name}</span><span>{formatRupiah(p.subtotal)}</span></div>
            ))}
            <div className="border-t border-dashed border-gray-300 my-2" />
            <div className="flex justify-between"><span>Subtotal</span><span>{formatRupiah(data.rawSubtotal)}</span></div>
            {data.rawDiscount > 0 && <div className="flex justify-between text-green-600"><span>Diskon</span><span>-{formatRupiah(data.rawDiscount)}</span></div>}
            {data.ppnAmount > 0 && <div className="flex justify-between"><span>PPN {data.ppnPct}%</span><span>+{formatRupiah(data.ppnAmount)}</span></div>}
            <div className="flex justify-between font-bold text-sm border-t border-dashed border-gray-300 pt-1 mt-1"><span>TOTAL</span><span>{formatRupiah(data.grandTotal)}</span></div>
            <div className="flex justify-between"><span>Bayar ({payLabel[data.payMethod] || data.payMethod})</span><span>{formatRupiah(data.cashPaid)}</span></div>
            {data.payMethod === 'cash' && data.change > 0 && <div className="flex justify-between font-bold"><span>Kembali</span><span>{formatRupiah(data.change)}</span></div>}
            <div className="border-t border-dashed border-gray-300 my-2" />
            <div className="text-center text-xs text-gray-400">Terima kasih atas kunjungan Anda</div>
            <div className="text-center text-xs text-gray-400">Coco Puff — {data.storeName}</div>
          </div>
        </div>
        <div className="px-4 pb-4 space-y-2 flex-shrink-0">
          <button onClick={printMode === 'rawbt' ? handleRawBT : handlePrint}
            className={`w-full py-3 rounded-xl text-white text-sm font-semibold ${printMode==='rawbt'?'bg-blue-600':'bg-gray-900'}`}>
            {printMode === 'rawbt' ? '📱 Print via RawBT' : '🖨️ Print Struk'}
          </button>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Tutup</button>
        </div>
      </div>
    </div>
  )
}
