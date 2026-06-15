// src/pages/cashier/CashierPage.tsx
// CHANGELOG v6:
// - FIX: buildReceiptLines — W/SEP/sep/center/row/fmtRp dipindah ke dalam fungsi
//   (bug sebelumnya: variabel pakai overrideW yang belum ada di scope luar)
// - FIX: diskon per item tampil di struk (auto-print & modal)
// - FIX: auto-print block tambah Subtotal, Diskon B1G1, Diskon Paket, Diskon Promo
// - FIX: lebar AW konsisten: rawbt=28, server=35, browser=32
// CHANGELOG v5 (sebelumnya):
// - HAPUS: diskon manual per item (kasir tidak kontrol diskon)
// - PPN hanya tampil di modal konfirmasi bayar (bukan di sidebar)
// - Badge promo tetap ada di tombol produk
// - FIX: transactions filter hari ini di query

import { useState, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { pushToSupabase } from '@/lib/sync'
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
} from 'lucide-react'
import toast from 'react-hot-toast'

interface PaketItem {
  id: string; name: string; qty_total: number; price: number; is_mix: boolean
}
interface CartPaketItem {
  paket: PaketItem; pilihan: { product: Product; qty: number }[]; subtotal: number
}

type MainTab = 'pos' | 'riwayat'
type OnlinePlatform = 'gofood' | 'grabfood' | 'shopeefood'

const PLATFORM_PAYMENT: Record<OnlinePlatform, PaymentMethod> = {
  gofood: 'gopay', grabfood: 'grab', shopeefood: 'shopeefood',
}
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer',
  gopay: 'GoPay', grab: 'GrabPay', shopeefood: 'ShopeePay',
}
const OFFLINE_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Tunai' },
  { id: 'qris', label: 'QRIS' },
  { id: 'transfer', label: 'Transfer' },
]
const ORDER_TYPES: { id: OrderType; label: string; icon: React.ReactNode }[] = [
  { id: 'dine_in', label: 'Dine In', icon: <UtensilsCrossed size={13} /> },
  { id: 'take_away', label: 'Take Away', icon: <ShoppingBag size={13} /> },
  { id: 'online', label: 'Online', icon: <Bike size={13} /> },
]

export default function CashierPage() {
  const { user, activeShift } = useAuthStore()
  const isOwnerManager = ['owner', 'manager'].includes(user?.role || '')
  const defaultStoreId = user?.store_id || ''

  const allStores = useLiveQuery(() =>
    isOwnerManager
      ? db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
      : Promise.resolve([])
    , [isOwnerManager])

  const [selectedStoreId, setSelectedStoreId] = useState(defaultStoreId)
  const STORE_ID = isOwnerManager ? selectedStoreId : defaultStoreId

  const { items, addItem, removeItem, updateQty, clearCart, subtotal, totalDiscount } = useCartStore()

  const [ppnPct, setPpnPct] = useState(0)
  useEffect(() => {
    if (!STORE_ID) return
    db.stores.get(STORE_ID).then(store => {
      if (store && (store as any).ppn_enabled && (store as any).ppn_rate > 0)
        setPpnPct(Number((store as any).ppn_rate) || 0)
    }).catch(() => { })
    supabase.from('stores').select('ppn_enabled, ppn_rate').eq('id', STORE_ID).single()
      .then(({ data }) => {
        if (data?.ppn_enabled && data?.ppn_rate > 0) setPpnPct(Number(data.ppn_rate) || 0)
        else setPpnPct(0)
      }).catch(() => { })
  }, [STORE_ID])

  const [mainTab, setMainTab] = useState<MainTab>('pos')
  const today = new Date().toLocaleDateString('sv-SE')
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [refreshKey, setRefreshKey] = useState(0)
  // Pull transaksi dari server saat owner ganti tanggal
  useEffect(() => {
    if (!isOwnerManager) return
    async function pullByDate() {
      console.log('[PULL BY DATE]', selectedDate, STORE_ID)
      const { data } = await supabase.from('transactions').select('*')
        .eq('store_id', STORE_ID)
        .gte('created_at', selectedDate + 'T00:00:00+07:00')
        .lte('created_at', selectedDate + 'T23:59:59+07:00')
      console.log('[PULL BY DATE] result:', data?.length)
      if (data?.length) {
        await db.transactions.bulkPut(data)
        const ids = data.map((t: any) => t.id)
        const { data: items } = await supabase.from('transaction_items').select('*').in('transaction_id', ids)
        if (items?.length) await db.transaction_items.bulkPut(items)
      }
      setRefreshKey(k => k + 1)
    }
    pullByDate()
  }, [selectedDate, isOwnerManager, STORE_ID])
  const [orderType, setOrderType] = useState<OrderType>('take_away')
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [showCheckout, setShowCheckout] = useState(false)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [cashPaid, setCashPaid] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [pendingSync, setPendingSync] = useState(0)
  const [printServerOk, setPrintServerOk] = useState<boolean | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const [onlinePlatform, setOnlinePlatform] = useState<OnlinePlatform>('gofood')
  const [onlineOrderNo, setOnlineOrderNo] = useState('')
  const [onlineBuyer, setOnlineBuyer] = useState('')

  const [showPaketModal, setShowPaketModal] = useState(false)
  const [selectedPaket, setSelectedPaket] = useState<PaketItem | null>(null)
  const [paketPilihan, setPaketPilihan] = useState<{ product: Product; qty: number }[]>([])
  const [cartPakets, setCartPakets] = useState<CartPaketItem[]>([])

  const [showVoidModal, setShowVoidModal] = useState(false)
  const [showPrinterModal, setShowPrinterModal] = useState(false)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const [printerConfigTs, setPrinterConfigTs] = useState(0)
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)
  const [payFilter, setPayFilter] = useState<string>('semua')
  const [voidTx, setVoidTx] = useState<Transaction | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [isVoiding, setIsVoiding] = useState(false)
  const [lastTxData, setLastTxData] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)

  const userStoreId = user?.store_id || ''
  const getPrinterConfig = (sid: string) => {
    try { return JSON.parse(localStorage.getItem(`printer_config_${sid}`) || '{}') } catch { return {} }
  }
  const [printerConfig, setPrinterConfig] = useState(() => getPrinterConfig(userStoreId))
  useEffect(() => { setPrinterConfig(getPrinterConfig(STORE_ID || userStoreId)) }, [STORE_ID, userStoreId, printerConfigTs])
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
      const [prodsRes, catsRes, pricesRes, promosRes, recipesRes, recipeItemsRes, stockRes] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('store_product_prices').select('*').eq('store_id', STORE_ID),
        supabase.from('promotions').select('*').eq('store_id', STORE_ID).eq('is_active', true),
        supabase.from('store_recipes').select('*').eq('store_id', STORE_ID),
        supabase.from('store_recipe_items').select('*'),
        supabase.from('stock').select('*').eq('store_id', STORE_ID),
      ])
      if (prodsRes.data !== null) { await db.products.clear(); if (prodsRes.data.length) await db.products.bulkPut(prodsRes.data) }
      if (catsRes.data !== null) { await db.categories.clear(); if (catsRes.data.length) await db.categories.bulkPut(catsRes.data) }
      if (pricesRes.data !== null) { await db.store_product_prices.where('store_id').equals(STORE_ID).delete(); if (pricesRes.data.length) await db.store_product_prices.bulkPut(pricesRes.data) }
      if (promosRes.data !== null) { await db.promotions.where('store_id').equals(STORE_ID).delete(); if (promosRes.data.length) await db.promotions.bulkPut(promosRes.data) }
      // Sync resep BOM dan stok untuk toko ini — penting agar stok berkurang saat penjualan
      if (recipesRes.data?.length) await db.store_recipes.bulkPut(recipesRes.data)
      if (recipeItemsRes.data?.length) await db.store_recipe_items.bulkPut(recipeItemsRes.data)
      if (stockRes.data) {
        await db.stock.where('store_id').equals(STORE_ID).delete()
        if (stockRes.data.length) await db.stock.bulkPut(stockRes.data)
      }
      if (showMsg) toast.success('Produk diperbarui')
    } catch (e) {
      console.warn('[SYNC PRODUCTS]', e)
      if (showMsg) toast.error('Gagal sync produk')
    } finally { setIsSyncing(false) }
  }

  useEffect(() => {
    const onOnline = () => { setIsOffline(false); toast.success('Kembali online') }
    const onOffline = () => { setIsOffline(true); toast.error('Koneksi terputus — mode offline') }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])

  useEffect(() => {
    async function checkPending() {
      try {
        const stuck = await db.sync_queue
          .where('status').anyOf(['pending', 'failed'])
          .filter((q: any) => (q.retry_count || 0) >= 5)
          .toArray()
        for (const item of stuck) await db.sync_queue.update(item.id, { status: 'abandoned' })
        const count = await db.sync_queue.where('status').anyOf(['pending', 'failed']).count()
        setPendingSync(count)
      } catch { }
    }
    checkPending()
    const interval = setInterval(checkPending, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const cfg = getPrinterConfig(STORE_ID || userStoreId)
    if (cfg.printMode !== 'server') return
    const url = cfg.serverUrl || 'https://localhost:7676'
    async function checkPrintServer() {
      const wsUrl = url.replace(/^https?/, 'wss') + '/ws'
      try {
        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(wsUrl)
          const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 3000)
          ws.onopen = () => ws.send(JSON.stringify({ type: 'health' }))
          ws.onmessage = (e) => {
            clearTimeout(timer)
            const d = JSON.parse(e.data)
            ws.close()
            setPrintServerOk(d.status === 'ok')
            resolve()
          }
          ws.onerror = () => { clearTimeout(timer); setPrintServerOk(false); resolve() }
        })
      } catch { setPrintServerOk(false) }
    }
    checkPrintServer()
    const interval = setInterval(checkPrintServer, 30000)
    return () => clearInterval(interval)
  }, [STORE_ID, userStoreId, printerConfigTs])

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
          if (orderType === 'dine_in' && (priceRecord as any).price_dine_in > 0) basePrice = (priceRecord as any).price_dine_in
          else if (orderType === 'take_away' && (priceRecord as any).price_take_away > 0) basePrice = (priceRecord as any).price_take_away
          else if (orderType === 'online' && (priceRecord as any).price_online > 0) basePrice = (priceRecord as any).price_online
          else if (priceRecord.override_price > 0) basePrice = priceRecord.override_price
        }
        const promo = promoMap[p.id]
        let effectivePrice = basePrice
        let promoDiscount = 0
        let promoName = ''
        let promoBuy1Get1 = false
        if (promo) {
          if (promo.promo_type === 'buy1get1') {
            promoBuy1Get1 = true
            promoName = promo.name || 'Buy 1 Get 1'
            effectivePrice = basePrice
          } else {
            promoDiscount = promo.promo_type === 'percent' ? basePrice * promo.value / 100 : promo.value
            effectivePrice = Math.max(0, basePrice - promoDiscount)
            promoName = promo.name || ''
          }
        }
        return {
          ...p,
          base_price: basePrice,
          effective_price: effectivePrice,
          promo_discount: promoDiscount,
          promo_name: promoName,
          promo_id: promo?.id || '',
          promo_buy1get1: promoBuy1Get1,
          promo_type: promo?.promo_type || '',
        }
      })
  }, [selectedCat, STORE_ID, orderType])

  const [pakets, setPakets] = useState<PaketItem[]>([])
  const [paketProducts, setPaketProds] = useState<Record<string, string[]>>({})

  useLiveQuery(async () => {
    const { data: pkgs } = await supabase.from('packages').select('*').eq('is_active', true)
      .or(`store_id.is.null,store_id.eq.${STORE_ID}`)
    const { data: pkgItems } = await supabase.from('package_items').select('*')
    if (pkgs) setPakets(pkgs)
    if (pkgItems) {
      const map: Record<string, string[]> = {}
      for (const item of pkgItems) {
        if (!map[item.package_id]) map[item.package_id] = []
        map[item.package_id].push(item.product_id)
      }
      setPaketProds(map)
    }
  }, [STORE_ID])

  const transactions = useLiveQuery(async () => {
    const today = new Date().toLocaleDateString('sv-SE')
    let txs = await db.transactions.where('store_id').equals(STORE_ID)
      .filter(t => t.created_at.slice(0, 10) === today)
      .reverse().sortBy('created_at')
    if (isOwnerManager) {
      const voidTxs = await db.transactions
        .filter(t => (t as any).status === 'void_requested' && t.created_at.slice(0, 10) === today && t.store_id !== STORE_ID)
        .reverse().sortBy('created_at')
      const existingIds = new Set(txs.map(t => t.id))
      for (const vt of voidTxs) {
        if (!existingIds.has(vt.id)) txs.push(vt)
      }
      txs.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    const txItems = await db.transaction_items.toArray()
    return txs.map(t => ({ ...t, items: txItems.filter(i => i.transaction_id === t.id) }))
  }, [mainTab, STORE_ID, isOwnerManager, selectedDate, refreshKey])

  useEffect(() => {
    if (!isOwnerManager || !STORE_ID) return
    const today = new Date().toLocaleDateString('sv-SE')
    async function pullVoidRequests() {
      const { data: voidData } = await supabase.from('transactions')
        .select('*').eq('status', 'void_requested')
        .gte('created_at', today + 'T00:00:00+07:00')
      if (voidData?.length) await db.transactions.bulkPut(voidData)
      const { data } = await supabase.from('transactions')
        .select('*').eq('store_id', STORE_ID)
        .gte('created_at', today + 'T00:00:00+07:00')
      if (data?.length) {
        await db.transactions.bulkPut(data)
        const ids = data.map((t: any) => t.id)
        const { data: txItems } = await supabase.from('transaction_items').select('*').in('transaction_id', ids)
        if (txItems?.length) await db.transaction_items.bulkPut(txItems)
      }
    }
    pullVoidRequests()
    const interval = setInterval(pullVoidRequests, 15000)
    return () => clearInterval(interval)
  }, [isOwnerManager, STORE_ID, mainTab])

  const totalPakets = cartPakets.reduce((s, p) => s + p.subtotal, 0)
  const rawSubtotal = subtotal() + totalPakets

  const buy1get1Discount = items.reduce((s, item) => {
    if ((item.product as any).promo_buy1get1 && item.qty >= 2)
      return s + Math.floor(item.qty / 2) * item.unit_price
    return s
  }, 0)

  const paketDiscount = useMemo(() => {
    if (!pakets.length || !Object.keys(paketProducts).length) return 0
    let total = 0
    for (const pkt of pakets) {
      const productIds = paketProducts[pkt.id] || []
      if (!productIds.length) continue
      const totalQtyInPaket = items
        .filter(item => productIds.includes(item.product.id))
        .reduce((s, item) => s + item.qty, 0)
      const fullPakets = Math.floor(totalQtyInPaket / pkt.qty_total)
      if (fullPakets <= 0) continue
      const qtyDapat = fullPakets * pkt.qty_total
      const avgHargaNormal = items
        .filter(item => productIds.includes(item.product.id))
        .reduce((s, item) => s + item.unit_price, 0) /
        (items.filter(item => productIds.includes(item.product.id)).length || 1)
      const discountTotal = qtyDapat * avgHargaNormal - fullPakets * pkt.price
      if (discountTotal > 0) total += discountTotal
    }
    return Math.round(total)
  }, [items, pakets, paketProducts])

  const rawDiscount = totalDiscount() + buy1get1Discount + paketDiscount
  const afterDiscount = rawSubtotal - rawDiscount
  const ppnAmount = ppnPct > 0 ? Math.round(afterDiscount * ppnPct / 100) : 0
  const grandTotal = afterDiscount + ppnAmount
  const totalQtyPilih = paketPilihan.reduce((s, p) => s + p.qty, 0)
  const change = payMethod === 'cash' ? Number(cashPaid) - grandTotal : 0
  const canVoid = ['owner', 'manager', 'kasir'].includes(user?.role || '')
  const isOnlineOrder = orderType === 'online'

  async function handleVoid() {
    if (!voidTx || !voidReason.trim()) return toast.error('Alasan void wajib diisi')
    setIsVoiding(true)
    try {
      const isOwnerMgr = ['owner', 'manager'].includes(user?.role || '')
      const newStatus = isOwnerMgr ? 'voided' : 'void_requested'
      const updated: any = { ...voidTx, status: newStatus, void_reason: voidReason.trim(), voided_by: user!.id, voided_at: now() }
      await db.transactions.put(updated)
      const { items: _items, ...updatedForSupabase } = updated
      const { error } = await supabase.from('transactions').upsert(updatedForSupabase)
      if (error) console.error('[VOID ERROR]', error)
      if (isOwnerMgr) {
        await restoreStockFromVoid(voidTx.id, STORE_ID)
        toast.success(`Transaksi ${voidTx.receipt_no} di-void & stok dikembalikan`)
      } else {
        toast.success(`Request void ${voidTx.receipt_no} dikirim ke owner`)
      }
      setShowVoidModal(false); setVoidTx(null); setVoidReason('')
    } catch (e) {
      console.error('[VOID]', e)
      toast.error('Gagal void transaksi')
    } finally { setIsVoiding(false) }
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
      const allRecipes = await db.store_recipes.where('store_id').equals(storeId).filter(r => r.is_active).toArray()
      const bomRecipes = allRecipes.filter(r =>
        (r as any).recipe_type !== 'production' && !r.product_id?.startsWith('prod-toko-')
      )
      const recipeItems = await db.store_recipe_items.toArray()
      const allMaterials = await db.materials.toArray()
      const matMap = Object.fromEntries(allMaterials.map(m => [m.id, m]))

      for (const txItem of txItems) {
        const recipe = bomRecipes.find(r => r.product_id === txItem.product_id)
        if (!recipe) continue
        const riList = recipeItems.filter(ri => ri.recipe_id === recipe.id)
        const _prod = await db.products.get(txItem.product_id);
        const _pkgQty = _prod?.pkg_qty || 1;
        const totalQty = (txItem.qty_eceran || 0) + (txItem.qty_dus || 0) * _pkgQty
        if (totalQty <= 0) continue
        for (const ri of riList) {
          const qty = ri.qty_used * totalQty
          if ((ri as any).source === 'store' || !(ri as any).source) {
            let storeStock = await db.stock.filter(s =>
              s.store_id === storeId && (
                s.ingredient_id === ri.material_id ||
                (s as any).material_id === ri.material_id
              )
            ).first()
            // FIX: compound index
            if (!storeStock) {
              storeStock = await (db.stock as any)
                .where('[store_id+material_id]')
                .equals([storeId, ri.material_id])
                .first()
            }
            if (!storeStock) {
              const { data: sv } = await supabase.from('stock').select('*').eq('store_id', storeId).eq('material_id', ri.material_id).maybeSingle()
              if (sv) { await db.stock.put(sv); storeStock = sv }
            }
            if (storeStock) {
              const newQty = Math.max(0, storeStock.qty_on_hand - qty)
              await db.stock.update(storeStock.id, { qty_on_hand: newQty, last_updated: now() })
              await supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', storeStock.id)
            } else {
              console.warn('[BOM] Stok tidak ditemukan untuk:', matMap[ri.material_id]?.name || ri.material_id)
            }
          }
        }
      }
    } catch (e) { console.warn('[BOM]', e) }
  }

  async function restoreStockFromVoid(txId: string, storeId: string) {
    try {
      const txItems = await db.transaction_items.where('transaction_id').equals(txId).toArray()
      const allRecipes = await db.store_recipes.where('store_id').equals(storeId).filter(r => r.is_active).toArray()
      const bomRecipes = allRecipes.filter(r =>
        (r as any).recipe_type !== 'production' && !r.product_id?.startsWith('prod-toko-')
      )
      const recipeItems = await db.store_recipe_items.toArray()
      const allMaterials = await db.materials.toArray()
      const matMap = Object.fromEntries(allMaterials.map(m => [m.id, m]))

      for (const txItem of txItems) {
        const recipe = bomRecipes.find(r => r.product_id === txItem.product_id)
        if (!recipe) continue
        const riList = recipeItems.filter(ri => ri.recipe_id === recipe.id)
        const _prod2 = await db.products.get(txItem.product_id)
        const _pkgQty2 = _prod2?.pkg_qty || 1
        const totalQty = (txItem.qty_eceran || 0) + (txItem.qty_dus || 0) * _pkgQty2
        if (totalQty <= 0) continue
        for (const ri of riList) {
          const qty = ri.qty_used * totalQty
          if ((ri as any).source === 'store' || !(ri as any).source) {
            let storeStock = await db.stock.filter(s =>
              s.store_id === storeId && (
                s.ingredient_id === ri.material_id ||
                (s as any).material_id === ri.material_id
              )
            ).first()
            // FIX: compound index
            if (!storeStock) {
              storeStock = await (db.stock as any)
                .where('[store_id+material_id]')
                .equals([storeId, ri.material_id])
                .first()
            }
            if (storeStock) {
              const newQty = storeStock.qty_on_hand + qty
              await db.stock.update(storeStock.id, { qty_on_hand: newQty, last_updated: now() })
              supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', storeStock.id).then(() => { })
            }
          }
        }
      }
    } catch (e) { console.warn('[VOID RESTORE]', e) }
  }

  async function handleCheckout() {
    if (items.length === 0 && cartPakets.length === 0) return toast.error('Keranjang kosong')
    if (!activeShift) return toast.error('Belum buka shift')
    if (isOnlineOrder && !onlineOrderNo.trim()) return toast.error('Nomor order wajib diisi')
    if (!isOnlineOrder && payMethod === 'cash' && Number(cashPaid) < grandTotal) return toast.error('Uang tidak cukup')
    setIsProcessing(true)
    try {
      const txId = generateId()
      const receiptNo = await generateReceiptNo(STORE_ID)
      const finalPay: PaymentMethod = isOnlineOrder ? PLATFORM_PAYMENT[onlinePlatform] : payMethod
      const paidAmt = finalPay === 'cash' ? Number(cashPaid) : grandTotal
      const tx: any = {
        id: txId, store_id: STORE_ID, shift_id: activeShift.id, cashier_id: user!.id, receipt_no: receiptNo,
        subtotal: rawSubtotal, discount: rawDiscount, ppn_amount: ppnAmount, ppn_percent: ppnPct,
        total: grandTotal, payment_method: finalPay, cash_paid: paidAmt, change_given: paidAmt - grandTotal,
        status: 'completed', order_type: orderType,
        order_source: isOnlineOrder ? onlinePlatform : 'pos',
        online_order_no: isOnlineOrder ? onlineOrderNo.trim() : null,
        online_buyer: isOnlineOrder ? (onlineBuyer.trim() || null) : null,
        created_at: now(),
      }
      const txItems = items.map(item => {
        const pkg = item.product.auto_package ? calcPackaging(item.qty, item.product.pkg_qty) : { dus: 0, eceran: item.qty }
        let itemPromoDiscount = (item.product as any).promo_discount || 0
        if ((item.product as any).promo_buy1get1 && item.qty >= 2)
          itemPromoDiscount = Math.floor(item.qty / 2) * item.unit_price
        const itemSubtotal = item.qty * item.unit_price - itemPromoDiscount
        return {
          id: generateId(), transaction_id: txId,
          product_id: item.product.id, product_name: item.product.name,
          qty_eceran: pkg.eceran, qty_dus: pkg.dus,
          unit_price: item.unit_price, discount: item.discount,
          promo_id: (item.product as any).promo_id || null,
          promo_discount: itemPromoDiscount,
          promo_name: (item.product as any).promo_name || null,
          subtotal: Math.max(0, itemSubtotal), item_type: 'unit',
        }
      })
      const txPakets = cartPakets.flatMap(cp => cp.pilihan.map(p => ({
        id: generateId(), transaction_id: txId, product_id: p.product.id,
        product_name: p.product.name, qty_eceran: p.qty, qty_dus: 0,
        unit_price: cp.paket.price / cp.paket.qty_total, discount: 0,
        promo_id: null, promo_discount: 0, promo_name: null,
        subtotal: (cp.paket.price / cp.paket.qty_total) * p.qty,
        item_type: 'package', package_id: cp.paket.id,
      })))

      await db.transactions.put(tx)
      await db.transaction_items.bulkPut([...txItems, ...txPakets])
      await addToSyncQueue('transactions', txId, 'upsert', tx, STORE_ID)
      for (const item of [...txItems, ...txPakets])
        await addToSyncQueue('transaction_items', item.id, 'upsert', item, STORE_ID)
      await deductStockFromRecipes([...txItems, ...txPakets], STORE_ID)
      pushToSupabase().catch(() => { })

      const storeRec = await db.stores.get(STORE_ID)
      const storeName = storeRec?.name || allStores?.find(s => s.id === STORE_ID)?.name || STORE_ID

      setLastTxData({
        tx, txItems: [...txItems, ...txPakets], receiptNo,
        storeName, storeId: STORE_ID,
        grandTotal, rawSubtotal, rawDiscount, ppnAmount, ppnPct,
        buy1get1Discount, paketDiscount,
        payMethod: finalPay, cashPaid: paidAmt, change: paidAmt - grandTotal,
        orderType,
        onlinePlatform: isOnlineOrder ? onlinePlatform : null,
        onlineOrderNo: isOnlineOrder ? onlineOrderNo : null,
        items: items.map(i => {
          const isBuy1Get1 = (i.product as any).promo_buy1get1 && i.qty >= 2
          const b1g1Discount = isBuy1Get1 ? Math.floor(i.qty / 2) * i.unit_price : 0
          const matchPaket = pakets.find(pkt => paketProducts[pkt.id]?.includes(i.product.id))
          let itemPaketDisc = 0
          if (matchPaket) {
            const productIds = paketProducts[matchPaket.id] || []
            const totalQty = items.filter(x => productIds.includes(x.product.id)).reduce((s, x) => s + x.qty, 0)
            const fullPakets = Math.floor(totalQty / matchPaket.qty_total)
            const qtyDapat = fullPakets * matchPaket.qty_total
            const discPerPkt = qtyDapat * i.unit_price - fullPakets * matchPaket.price
            itemPaketDisc = Math.round(Math.max(0, discPerPkt * (i.qty / totalQty)))
          }
          const totalItemDisc = isBuy1Get1
            ? b1g1Discount
            : ((i.product as any).promo_discount || 0) * i.qty + itemPaketDisc
          return {
            name: i.product.name, qty: i.qty, price: i.unit_price,
            subtotal: Math.max(0, i.qty * i.unit_price - totalItemDisc),
            promoName: matchPaket ? `Paket ${matchPaket.qty_total}` : (i.product as any).promo_name,
            promoDiscount: Math.round(totalItemDisc),
          }
        }),
        pakets: cartPakets.map(cp => ({ name: cp.paket.name, subtotal: cp.subtotal })),
      })

      clearCart(); setCartPakets([]); setShowCheckout(false)
      setCashPaid(''); setOnlineOrderNo(''); setOnlineBuyer('')

      const autoPrintNow = getAutoPrintNow()
      const printModeNow = getPrintModeNow()

      if (autoPrintNow) {
        // ── AUTO-PRINT ─────────────────────────────────────────
        setTimeout(() => {
          // Helper format Rupiah ASCII (no locale, no Unicode)
          function fmtA(n: number): string {
            const s = String(Math.round(n))
            let r = ''
            for (let i = 0; i < s.length; i++) {
              if (i > 0 && (s.length - i) % 3 === 0) r += '.'
              r += s[i]
            }
            return 'Rp ' + r
          }

          // ✅ FIX: lebar konsisten sesuai mode
          const AW = printModeNow === 'rawbt' ? 28 : printModeNow === 'server' ? 38 : 32
          const ASEP = '='.repeat(AW)
          const asep = '-'.repeat(AW)
          const actr = (s: string) => s.padStart(Math.floor((AW + Math.min(s.length, AW)) / 2)).padEnd(AW)
          const arow = (l: string, r: string) => {
            const sp = AW - l.length - r.length
            return l + (sp > 0 ? ' '.repeat(sp) : ' ') + r
          }

          const now2 = new Date()
          const aLines: string[] = [
            ASEP,
            actr('Coco Puff'),
            actr(storeName),
            ASEP,
            arow('No    :', receiptNo.substring(0, AW - 8)),
            arow('Tgl   :', now2.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).substring(0, AW - 8)),
            arow('Jam   :', now2.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })),
            asep,
          ]

          // Items + diskon per item
          for (const item of [...txItems, ...txPakets]) {
            const qty = (item.qty_eceran || 0) + (item.qty_dus || 0)
            const totalFmt = fmtA(item.unit_price * qty)
            const leftPart = `${qty}x ${item.product_name}`.substring(0, AW - totalFmt.length - 1)
            aLines.push(leftPart.padEnd(AW - totalFmt.length) + totalFmt)

            // ✅ FIX: tampilkan diskon per item
            if ((item.promo_discount || 0) > 0) {
              const discFmt = '-' + fmtA(item.promo_discount)
              const promoLbl = item.promo_name || 'Diskon'
              const discLabel = `  ${promoLbl}`.substring(0, AW - discFmt.length)
              aLines.push(discLabel.padEnd(AW - discFmt.length) + discFmt)
            }
          }

          aLines.push(asep)

          // ✅ FIX: Subtotal + semua baris diskon
          aLines.push(arow('Subtotal', fmtA(rawSubtotal)))
          if (buy1get1Discount > 0) aLines.push(arow('Diskon B1G1', '-' + fmtA(buy1get1Discount)))
          if (paketDiscount > 0) aLines.push(arow('Diskon Paket', '-' + fmtA(paketDiscount)))
          const promoOnly = rawDiscount - buy1get1Discount - paketDiscount
          if (promoOnly > 0) aLines.push(arow('Diskon Promo', '-' + fmtA(promoOnly)))
          if (ppnAmount > 0) aLines.push(arow(`PPN ${ppnPct}%`, '+' + fmtA(ppnAmount)))

          aLines.push(ASEP)
          aLines.push(arow('TOTAL', fmtA(grandTotal)))
          aLines.push(ASEP)

          const metodeMap: Record<string, string> = {
            cash: 'Cash', qris: 'QRIS', transfer: 'Transfer',
            gopay: 'GoPay', grab: 'GrabFood', shopeefood: 'ShopeeFood',
          }
          const mLabel = metodeMap[finalPay] || finalPay
          if (finalPay === 'cash') {
            aLines.push(arow('Bayar (Cash)', fmtA(paidAmt)))
            if (paidAmt > grandTotal) aLines.push(arow('Kembali', fmtA(paidAmt - grandTotal)))
          } else {
            aLines.push(arow(`Bayar (${mLabel})`, fmtA(paidAmt)))
          }

          aLines.push('')
          aLines.push(actr('Terima kasih atas kunjungan Anda'))
          aLines.push('')
          aLines.push('')
          aLines.push('')
          aLines.push('')

          // Strip non-ASCII
          const cleanLines = aLines.map(l => l.replace(/[^\x00-\x7F]/g, ''))
          const txt = cleanLines.join('\n')

          if (printModeNow === 'rawbt') {
            window.location.href = `rawbt://${encodeURIComponent(txt)}`
          } else if (printModeNow === 'server') {
            const url = (() => {
              try {
                const cfg = JSON.parse(localStorage.getItem(`printer_config_${STORE_ID}`) || '{}')
                return cfg.serverUrl || 'https://localhost:7676'
              } catch { return 'https://localhost:7676' }
            })()
            const wsUrl = url.replace(/^https?/, 'wss')
            const ws = new WebSocket(wsUrl)
            ws.onopen = () => ws.send(JSON.stringify({ type: 'print', text: txt }))
            ws.onmessage = (e) => {
              const d = JSON.parse(e.data)
              ws.close()
              if (!d.ok) toast.error('Print gagal: ' + d.message)
            }
            ws.onerror = () => { ws.close(); toast.error('Print server tidak merespons') }
          } else {
            // Browser print
            const html = `<html><head><style>
*{margin:0;padding:0;}
body{margin:0;padding:1mm 0;}
pre{font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.4;white-space:pre;}
@page{margin:0mm;size:76mm auto;}
@media print{pre{width:56mm;}}
</style></head><body><pre>${cleanLines.join('\n')}</pre></body></html>`
            const iframe = document.createElement('iframe')
            iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;'
            document.body.appendChild(iframe)
            const doc = iframe.contentWindow?.document
            if (doc) { doc.open(); doc.write(html); doc.close() }
            setTimeout(() => {
              iframe.contentWindow?.focus()
              iframe.contentWindow?.print()
              setTimeout(() => { try { document.body.removeChild(iframe) } catch { } }, 2000)
            }, 300)
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
      {!isOffline && pendingSync > 0 && (
        <div className="bg-orange-500 text-white text-xs font-medium px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <RefreshCw size={13} className="animate-spin" />
            {pendingSync} transaksi belum tersync ke server
          </div>
          <button
            onClick={async () => {
              try {
                await db.sync_queue.where('status').anyOf(['abandoned', 'failed']).delete()
                const stuck = await db.sync_queue.filter((q: any) => (q.retry_count || 0) >= 5).toArray()
                for (const item of stuck) await db.sync_queue.update(item.id, { status: 'abandoned' })
                setPendingSync(0)
              } catch { }
            }}
            className="text-white underline text-xs opacity-80 flex-shrink-0">
            Bersihkan
          </button>
        </div>
      )}
      {printServerOk === false && getPrinterConfig(STORE_ID || userStoreId).printMode === 'server' && (
        <div className="bg-red-500 text-white text-xs font-medium px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0">
          <span>Print server mati — struk tidak bisa tercetak</span>
          <button onClick={() => setShowPrinterModal(true)} className="underline text-xs">Setting</button>
        </div>
      )}

      <div className="bg-white border-b border-gray-100 flex-shrink-0">
        {isOwnerManager && allStores && allStores.length > 1 && (
          <div className="flex gap-1.5 px-3 pt-2 overflow-x-auto scrollbar-hide">
            {allStores.map(s => (
              <button key={s.id} onClick={() => { setSelectedStoreId(s.id); clearCart(); setCartPakets([]) }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedStoreId === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex border-b border-gray-50">
          {([
            { id: 'pos', label: 'Kasir' },
            { id: 'riwayat', label: 'Riwayat', icon: <History size={13} /> },
          ] as { id: MainTab; label: string; icon?: React.ReactNode }[]).map(tab => (
            <button key={tab.id} onClick={() => setMainTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${mainTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
          <button onClick={() => setShowPrinterModal(true)} title="Setting Printer"
            className="px-3 py-2.5 border-b-2 border-transparent text-gray-400 hover:text-gray-600 flex-shrink-0 relative">
            🖨️
            <span className={`absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full ${printMode === 'server' ? 'bg-green-500' : printMode === 'rawbt' ? 'bg-blue-500' : 'bg-gray-300'
              }`} />
          </button>
        </div>
        {mainTab === 'pos' && (
          <div className="flex gap-1.5 px-3 py-2">
            {ORDER_TYPES.map(ot => (
              <button key={ot.id} onClick={() => setOrderType(ot.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${orderType === ot.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
                {ot.icon}{ot.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RIWAYAT */}
      {mainTab === 'riwayat' && (
        <div className="flex-1 overflow-auto bg-gray-50 p-4 space-y-3">
          {isOwnerManager && transactions?.some(tx => tx.store_id !== STORE_ID && (tx as any).status === 'void_requested') && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2">
              <p className="text-xs font-medium text-amber-700 mb-2">⏳ Menunggu Persetujuan Void</p>
              {transactions?.filter(tx => tx.store_id !== STORE_ID && (tx as any).status === 'void_requested').map(tx => (
                <div key={tx.id} className="flex items-center justify-between py-1.5 border-t border-amber-100 first:border-0">
                  <div>
                    <p className="text-xs font-mono text-gray-800">{tx.receipt_no}</p>
                    <p className="text-xs text-gray-500">{(tx as any).void_reason}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={async e => {
                      e.stopPropagation()
                      await restoreStockFromVoid(tx.id, (tx as any).store_id || STORE_ID)
                      await db.transactions.put({ ...tx, status: 'voided' } as any)
                      await supabase.from('transactions').update({ status: 'voided' }).eq('id', tx.id)
                      toast.success('Void disetujui')
                    }} className="text-xs text-white bg-red-500 px-2 py-1 rounded-lg">✓ Setuju</button>
                    <button onClick={async e => {
                      e.stopPropagation()
                      await db.transactions.put({ ...tx, status: 'completed' } as any)
                      await supabase.from('transactions').update({ status: 'completed' }).eq('id', tx.id)
                      toast.success('Ditolak')
                    }} className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">✗ Tolak</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {isOwnerManager && (
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-500">Tanggal:</label>
              <input type="date" value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700" />
            </div>
          )}
          <p className="text-xs text-gray-400">{isOwnerManager ? `Transaksi ${selectedDate}` : "Transaksi hari ini"}</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {(['semua', 'cash', 'qris', 'transfer', 'gopay', 'grab', 'shopeefood'] as const).map(pm => (
              <button key={pm} onClick={() => setPayFilter(pm)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${payFilter === pm ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
                {pm === 'semua' ? 'Semua' : pm === 'cash' ? 'Tunai' : pm === 'qris' ? 'QRIS' : pm === 'transfer' ? 'Transfer' : pm === 'gopay' ? 'GoPay' : pm === 'grab' ? 'GrabPay' : 'ShopeePay'}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {(payFilter === 'semua' ? transactions : transactions?.filter(tx => tx.payment_method === payFilter))
              ?.filter(tx => tx.store_id === STORE_ID || ((tx as any).status === 'void_requested' && tx.store_id === STORE_ID))
              ?.map((tx, idx) => (
                <div key={tx.id} className={`${idx !== 0 ? 'border-t border-gray-50' : ''} ${(tx as any).status === 'voided' ? 'opacity-50' : ''}`}>
                  <div onClick={() => setExpandedTxId(expandedTxId === String(tx.id) ? null : String(tx.id))}
                    className="px-4 py-3 cursor-pointer active:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-mono text-gray-900">{tx.receipt_no}</p>
                          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(tx.receipt_no); toast.success('ID disalin') }}
                            className="text-[10px] text-blue-400 px-1 py-0.5 rounded border border-blue-200">copy</button>
                          {(tx as any).status === 'voided' && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">VOID</span>}
                          {(tx as any).status === 'void_requested' && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">⏳ Req.Void</span>}
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                            tx.payment_method === 'cash' ? 'bg-gray-100 text-gray-700' : tx.payment_method === 'qris' ? 'bg-blue-100 text-blue-700' :
                              tx.payment_method === 'transfer' ? 'bg-purple-100 text-purple-700' : tx.payment_method === 'gopay' ? 'bg-green-100 text-green-700' :
                                tx.payment_method === 'grab' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700')}>
                            {tx.payment_method === 'cash' ? 'Tunai' : tx.payment_method === 'qris' ? 'QRIS' : tx.payment_method === 'transfer' ? 'Transfer' : tx.payment_method === 'gopay' ? 'GoPay' : tx.payment_method === 'grab' ? 'GrabPay' : 'ShopeePay'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.created_at)}</p>
                        {(tx as any).online_order_no && <p className="text-xs text-gray-500 font-mono">#{(tx as any).online_order_no}</p>}
                        {(tx as any).void_reason && <p className="text-xs text-red-400">Alasan: {(tx as any).void_reason}</p>}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <p className={`text-sm font-semibold ${(tx as any).status === 'voided' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{formatRupiah(tx.total)}</p>
                        {canVoid && (tx as any).status === 'completed' && (
                          <button onClick={() => { setVoidTx(tx as any); setVoidReason(''); setShowVoidModal(true) }}
                            className="text-xs text-red-400 border border-red-200 px-2 py-0.5 rounded-lg">Void</button>
                        )}
                        {isOwnerManager && (tx as any).status === 'void_requested' && (
                          <div className="flex gap-1">
                            <button onClick={async e => {
                              e.stopPropagation()
                              await restoreStockFromVoid(tx.id, (tx as any).store_id || STORE_ID)
                              const { items: _i1, ...upd1 } = { ...tx, status: 'voided' } as any
                              await db.transactions.put({ ...tx, status: 'voided' } as any)
                              await supabase.from('transactions').upsert(upd1)
                              toast.success('Void disetujui & stok dikembalikan')
                            }} className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-lg">✓</button>
                            <button onClick={async e => {
                              e.stopPropagation()
                              const { items: _i2, ...upd2 } = { ...tx, status: 'completed' } as any
                              await db.transactions.put({ ...tx, status: 'completed' } as any)
                              await supabase.from('transactions').upsert(upd2)
                              toast.success('Ditolak')
                            }} className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">✗</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {expandedTxId === String(tx.id) && (
                    <TxDetailRow txId={String(tx.id)} total={tx.total} onReprint={(txData) => { setLastTxData(txData); setShowReceipt(true) }} />
                  )}
                </div>
              ))}
            {transactions?.length === 0 && <div className="py-12 text-center text-sm text-gray-400">Belum ada transaksi hari ini</div>}
          </div>
        </div>
      )}

      {/* POS */}
      {mainTab === 'pos' && (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            {isOnlineOrder && (
              <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2 flex-shrink-0">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {(['gofood', 'grabfood', 'shopeefood'] as OnlinePlatform[]).map(p => (
                    <button key={p} onClick={() => setOnlinePlatform(p)}
                      className={cn('px-3 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap flex-shrink-0',
                        onlinePlatform === p ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600')}>
                      {p === 'gofood' ? 'GoFood' : p === 'grabfood' ? 'GrabFood' : 'ShopeeFood'}
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
                className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0', selectedCat === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600')}>
                Semua
              </button>
              {categories?.map(cat => (
                <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                  className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0', selectedCat === cat.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600')}>
                  {cat.name}
                </button>
              ))}
              <button onClick={() => syncProducts(true)} disabled={isSyncing} className="flex-shrink-0 ml-auto p-1.5 text-gray-400 rounded-full">
                <RefreshCw size={14} className={isSyncing ? 'animate-spin text-blue-500' : ''} />
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
                {products?.map(prod => <ProductCard key={prod.id} product={prod} onAdd={() => addItem(prod)} />)}
              </div>
            </div>
          </div>

          {/* Keranjang desktop */}
          <div className="w-72 bg-white border-l border-gray-100 flex-col hidden md:flex">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <ShoppingCart size={18} /> Keranjang
                  {(items.length + cartPakets.length) > 0 && (
                    <span className="ml-1 bg-gray-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{items.length + cartPakets.length}</span>
                  )}
                </h2>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                  orderType === 'dine_in' ? 'bg-orange-100 text-orange-700' : orderType === 'take_away' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700')}>
                  {orderTypeLabel}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {items.length === 0 && cartPakets.length === 0 ? (
                <div className="text-center text-gray-400 py-12 text-sm"><ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />Keranjang kosong</div>
              ) : (
                <>
                  {items.map(item => <CartItemRow key={item.product.id} item={item} onQtyChange={q => updateQty(item.product.id, q)} onRemove={() => removeItem(item.product.id)} />)}
                  {cartPakets.map((cp, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-2 border border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 flex items-center gap-1"><Package size={12} />{cp.paket.name}</span>
                        <div className="flex items-center gap-2"><span className="text-sm font-semibold">{formatRupiah(cp.subtotal)}</span><button onClick={() => hapusPaketCart(i)} className="text-red-400"><Trash2 size={12} /></button></div>
                      </div>
                      <p className="text-xs text-gray-500">{cp.pilihan.map(p => `${p.product.name} x${p.qty}`).join(', ')}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
            {(items.length > 0 || cartPakets.length > 0) && (
              <div className="p-4 border-t border-gray-100 space-y-2">
                <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatRupiah(rawSubtotal)}</span></div>
                {buy1get1Discount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon B1G1</span><span>-{formatRupiah(buy1get1Discount)}</span></div>}
                {paketDiscount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon Paket 🎁</span><span>-{formatRupiah(paketDiscount)}</span></div>}
                {(totalDiscount() - buy1get1Discount) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>{items.some(i => (i.product as any).promo_type === 'percent') ? `Diskon %` : items.some(i => (i.product as any).promo_type === 'fixed') ? 'Diskon Nominal' : 'Diskon Promo'}</span>
                    <span>-{formatRupiah(totalDiscount() - buy1get1Discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-gray-900 text-base border-t border-gray-100 pt-2"><span>Total</span><span>{formatRupiah(grandTotal)}</span></div>
                <button onClick={() => setShowCheckout(true)} className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold">Bayar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile bayar */}
      {mainTab === 'pos' && (items.length > 0 || cartPakets.length > 0) && (
        <div className="md:hidden bg-white border-t border-gray-100 px-3 py-2.5 flex-shrink-0 flex gap-2">
          <button onClick={() => setShowMobileCart(true)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium relative">
            <ShoppingCart size={18} />
            <span className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {items.reduce((s, i) => s + i.qty, 0) + cartPakets.length}
            </span>
          </button>
          <button onClick={() => setShowCheckout(true)}
            className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold flex items-center justify-between px-4">
            <span>Bayar</span>
            <span>{formatRupiah(grandTotal)}</span>
          </button>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      {showMobileCart && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setShowMobileCart(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl max-h-[80vh] flex flex-col max-w-lg mx-auto w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <ShoppingCart size={16} /> Keranjang
                <span className="text-sm text-gray-400 font-normal">({items.reduce((s, i) => s + i.qty, 0) + cartPakets.length} item)</span>
              </h3>
              <div className="flex items-center gap-2">
                {(items.length > 0 || cartPakets.length > 0) && (
                  <button onClick={() => { clearCart(); setCartPakets([]); setShowMobileCart(false) }}
                    className="text-xs text-red-500 border border-red-200 px-2.5 py-1 rounded-lg">Kosongkan</button>
                )}
                <button onClick={() => setShowMobileCart(false)} className="p-1 text-gray-400"><X size={18} /></button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-3 space-y-2">
              {items.map(item => (
                <CartItemRow key={item.product.id} item={item}
                  onQtyChange={q => updateQty(item.product.id, q)} onRemove={() => removeItem(item.product.id)} />
              ))}
              {cartPakets.map((cp, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-2 border border-gray-100 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800 flex items-center gap-1"><Package size={12} />{cp.paket.name}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{cp.pilihan.map(p => `${p.product.name} x${p.qty}`).join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-sm font-semibold">{formatRupiah(cp.subtotal)}</span>
                    <button onClick={() => hapusPaketCart(i)} className="text-red-400 p-1"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 space-y-2 flex-shrink-0">
              <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatRupiah(rawSubtotal)}</span></div>
              {paketDiscount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon Paket 🎁</span><span>-{formatRupiah(paketDiscount)}</span></div>}
              {buy1get1Discount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon B1G1</span><span>-{formatRupiah(buy1get1Discount)}</span></div>}
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2">
                <span>Total</span><span>{formatRupiah(grandTotal)}</span>
              </div>
              <button onClick={() => { setShowMobileCart(false); setShowCheckout(true) }}
                className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold">Lanjut Bayar</button>
            </div>
          </div>
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
              orderType === 'dine_in' ? 'bg-orange-50 text-orange-700' : orderType === 'take_away' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700')}>
              {ORDER_TYPES.find(o => o.id === orderType)?.icon}
              {orderTypeLabel}
              {isOnlineOrder && <span className="ml-1 opacity-70">· {onlinePlatform === 'gofood' ? 'GoFood' : onlinePlatform === 'grabfood' ? 'GrabFood' : 'ShopeeFood'}</span>}
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-1 max-h-48 overflow-auto">
              {items.map(i => {
                const isBuy1Get1 = (i.product as any).promo_buy1get1 && i.qty >= 2
                const promoDisc = isBuy1Get1 ? Math.floor(i.qty / 2) * i.unit_price : ((i.product as any).promo_discount || 0) * i.qty
                return (
                  <div key={i.product.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-700">{i.product.name} ×{i.qty}</span>
                      <span>{formatRupiah(i.qty * i.unit_price - promoDisc)}</span>
                    </div>
                    {promoDisc > 0 && <p className="text-xs text-green-600">🎁 {(i.product as any).promo_name} (-{formatRupiah(promoDisc)})</p>}
                  </div>
                )
              })}
              {cartPakets.map((cp, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700"><Package size={12} className="inline mr-1" />{cp.paket.name}</span>
                  <span>{formatRupiah(cp.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border border-gray-100 rounded-xl p-3">
              <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatRupiah(rawSubtotal)}</span></div>
              {buy1get1Discount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon B1G1</span><span>-{formatRupiah(buy1get1Discount)}</span></div>}
              {paketDiscount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Diskon Paket 🎁</span><span>-{formatRupiah(paketDiscount)}</span></div>}
              {(totalDiscount() - buy1get1Discount) > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>{items.some(i => (i.product as any).promo_type === 'percent') ? 'Diskon %' : items.some(i => (i.product as any).promo_type === 'fixed') ? 'Diskon Nominal' : 'Diskon Promo'}</span>
                  <span>-{formatRupiah(totalDiscount() - buy1get1Discount)}</span>
                </div>
              )}
              {ppnAmount > 0 && <div className="flex justify-between text-sm text-gray-600"><span>PPN {ppnPct}%</span><span>+{formatRupiah(ppnAmount)}</span></div>}
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
                        payMethod === m.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-700')}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isOnlineOrder && payMethod === 'cash' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Uang Diterima</label>
                <input className="input text-lg font-semibold" inputMode="decimal" placeholder="0"
                  value={cashPaid} onChange={e => setCashPaid(e.target.value.replace(/[^0-9]/g, ''))} autoFocus />
                <div className="flex gap-2 mt-2">
                  {[grandTotal, Math.ceil(grandTotal / 5000) * 5000, Math.ceil(grandTotal / 10000) * 10000, Math.ceil(grandTotal / 50000) * 50000]
                    .filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).map(v => (
                      <button key={v} onClick={() => setCashPaid(String(v))}
                        className="flex-1 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-700 font-medium">{formatRupiah(v)}</button>
                    ))}
                </div>
                {Number(cashPaid) > 0 && Number(cashPaid) < grandTotal && <p className="text-sm text-red-500 mt-1">Kurang {formatRupiah(grandTotal - Number(cashPaid))}</p>}
                {Number(cashPaid) >= grandTotal && <p className="text-sm text-green-600 mt-1">Kembalian: <strong>{formatRupiah(change)}</strong></p>}
              </div>
            )}
            <button onClick={handleCheckout} disabled={isProcessing}
              className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {isProcessing ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <CheckCircle size={18} />}
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
              <button onClick={() => setShowVoidModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-sm font-medium text-red-800 font-mono">{voidTx.receipt_no}</p>
              <p className="text-sm text-red-700">{formatRupiah(voidTx.total)}</p>
              <p className="text-xs text-red-400">{formatDate(voidTx.created_at)}</p>
            </div>
            <input className="input" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Alasan void" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setShowVoidModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
              <button onClick={handleVoid} disabled={isVoiding || !voidReason.trim()} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50">
                {isVoiding ? 'Memproses...' : 'Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrinterModal && (
        <PrinterMiniModal storeId={STORE_ID || userStoreId} onClose={() => { setShowPrinterModal(false); setPrinterConfigTs(Date.now()) }} />
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
              <button onClick={() => setShowPaketModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="bg-gray-100 rounded-full h-2">
              <div className="bg-gray-900 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (totalQtyPilih / selectedPaket.qty_total) * 100)}%` }} />
            </div>
            <p className="text-center text-sm text-gray-600">{totalQtyPilih} / {selectedPaket.qty_total} dipilih</p>
            <div className="space-y-2 max-h-52 overflow-auto">
              {(selectedPaket && paketProducts[selectedPaket.id]
                ? products?.filter(prod => paketProducts[selectedPaket.id].includes(prod.id))
                : products
              )?.map(prod => {
                const pilihan = paketPilihan.find(p => p.product.id === prod.id)
                return (
                  <div key={prod.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-sm font-medium text-gray-800">{prod.name}</span>
                    <div className="flex items-center gap-2">
                      {pilihan && <button onClick={() => kurangiPilihanRasa(prod.id)} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center"><Minus size={12} /></button>}
                      {pilihan && <span className="w-5 text-center text-sm font-semibold">{pilihan.qty}</span>}
                      <button onClick={() => tambahPilihanRasa(prod)} className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center"><Plus size={12} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPaketModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
              <button onClick={konfirmasiPaket} disabled={totalQtyPilih !== selectedPaket.qty_total}
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

// ── PRODUCT CARD ──────────────────────────────────────────────
function ProductCard({ product, onAdd }: { product: any; onAdd: () => void }) {
  const hasPromo = product.promo_discount > 0
  const isBuy1Get1 = product.promo_buy1get1
  return (
    <button onClick={onAdd} className="bg-white rounded-2xl border border-gray-100 p-3 text-left active:scale-95 transition-transform shadow-sm relative overflow-hidden">
      {isBuy1Get1 && <div className="absolute top-0 right-0 bg-purple-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-bl-xl">B1G1</div>}
      {hasPromo && !isBuy1Get1 && <div className="absolute top-0 right-0 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-bl-xl">PROMO</div>}
      {(product as any).image_url ? (
        <img
          src={(product as any).image_url}
          alt={product.name}
          className="w-full h-20 object-cover rounded-xl mb-2"
        />
      ) : (
        <div className="text-2xl mb-2">🧁</div>
      )}
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

// ── CART ITEM ROW ─────────────────────────────────────────────
function CartItemRow({ item, onQtyChange, onRemove }: {
  item: { product: any; qty: number; subtotal: number; unit_price: number; discount: number }
  onQtyChange: (qty: number) => void
  onRemove: () => void
}) {
  const isBuy1Get1 = (item.product as any).promo_buy1get1 && item.qty >= 2
  const b1g1Discount = isBuy1Get1 ? Math.floor(item.qty / 2) * item.unit_price : 0
  const promoDisc = isBuy1Get1 ? b1g1Discount : ((item.product as any).promo_discount || 0) * item.qty
  const finalSubtotal = item.qty * item.unit_price - promoDisc

  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <p className="text-xs font-semibold text-gray-900">{formatRupiah(finalSubtotal)}</p>
          {isBuy1Get1 && <span className="text-[10px] text-purple-500">🎁 B1G1</span>}
          {!isBuy1Get1 && (item.product as any).promo_name && (
            <span className="text-[10px] text-green-600">🎁 {(item.product as any).promo_name}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onQtyChange(item.qty - 1)} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center"><Minus size={12} /></button>
        <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
        <button onClick={() => onQtyChange(item.qty + 1)} className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center"><Plus size={12} /></button>
        <button onClick={onRemove} className="w-7 h-7 rounded-full text-red-400 flex items-center justify-center ml-1"><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

// ── TX DETAIL ROW ─────────────────────────────────────────────
function TxDetailRow({ txId, total, onReprint }: { txId: string; total: number; onReprint: (data: any) => void }) {
  const [items, setItems] = useState<any[]>([])
  const [tx, setTx] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([
      db.transaction_items.where('transaction_id').equals(txId).toArray(),
      db.transactions.get(txId),
    ]).then(([its, txData]) => { setItems(its); setTx(txData); setLoading(false) })
  }, [txId])
  if (loading) return <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 text-xs text-gray-400">Memuat...</div>
  const payLabel: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer', gopay: 'GoPay', grab: 'GrabPay', shopeefood: 'ShopeePay' }
  const payColor: Record<string, string> = { cash: 'bg-gray-100 text-gray-700', qris: 'bg-blue-100 text-blue-700', transfer: 'bg-purple-100 text-purple-700', gopay: 'bg-green-100 text-green-700', grab: 'bg-emerald-100 text-emerald-700', shopeefood: 'bg-orange-100 text-orange-700' }
  return (
    <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 space-y-2">
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex justify-between text-xs">
            <span className="text-gray-700 flex-1 pr-2">
              {item.product_name}
              <span className="text-gray-400 ml-1">×{(item.qty_eceran || 0) + (item.qty_dus || 0)}</span>
              {(item.promo_discount || 0) > 0 && <span className="text-green-600 ml-1">-{formatRupiah(item.promo_discount)}</span>}
            </span>
            <span className="text-gray-700 font-medium">{formatRupiah(item.subtotal || 0)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200 pt-2 space-y-1">
        {tx?.ppn_amount > 0 && <div className="flex justify-between text-xs text-gray-500"><span>PPN {tx.ppn_percent}%</span><span>+{formatRupiah(tx.ppn_amount)}</span></div>}
        <div className="flex justify-between text-xs font-semibold text-gray-900"><span>Total</span><span>{formatRupiah(total)}</span></div>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${payColor[tx?.payment_method] || 'bg-gray-100 text-gray-600'}`}>
            {payLabel[tx?.payment_method] || tx?.payment_method}
          </span>
          {tx?.cash_paid > 0 && <span className="text-xs text-gray-500">{formatRupiah(tx.cash_paid)}</span>}
          {(tx?.change_given || 0) > 0 && <span className="text-xs text-gray-500">Kembali {formatRupiah(tx.change_given)}</span>}
        </div>
        {tx?.online_order_no && <p className="text-xs text-gray-400">Order #{tx.online_order_no}</p>}
      </div>
    </div>
  )
}

// ── PRINTER MINI MODAL ────────────────────────────────────────
function PrinterMiniModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const key = `printer_config_${storeId}`
  const [printMode, setPrintMode] = useState<'browser' | 'rawbt' | 'server'>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '{}').printMode || 'browser' } catch { return 'browser' }
  })
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '{}').autoPrint === true } catch { return false }
  })
  const [serverUrl, setServerUrl] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '{}').serverUrl || 'https://localhost:7676' } catch { return 'https://localhost:7676' }
  })
  const [serverStatus, setServerStatus] = useState<'unknown' | 'ok' | 'error'>('unknown')
  const [saved, setSaved] = useState(false)

  async function testServer() {
    const wsUrl = serverUrl.replace(/^https?/, 'wss') + '/ws'
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 3000)
        ws.onopen = () => ws.send(JSON.stringify({ type: 'health' }))
        ws.onmessage = (e) => {
          clearTimeout(timer)
          const d = JSON.parse(e.data)
          ws.close()
          if (d.status === 'ok') { setServerStatus('ok'); toast.success(`Terhubung: ${d.printer}`); resolve() }
          else reject(new Error('not ok'))
        }
        ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')) }
      })
    } catch {
      try {
        const res = await fetch(`${serverUrl}/health`, {
          signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 3000); return c.signal })()
        })
        const data = await res.json()
        setServerStatus('ok'); toast.success(`Terhubung ke printer: ${data.printer}`)
      } catch { setServerStatus('error'); toast.error('Print server tidak ditemukan') }
    }
  }

  function handleSave() {
    localStorage.setItem(key, JSON.stringify({ printMode, autoPrint, serverUrl }))
    setSaved(true); setTimeout(() => { setSaved(false); onClose() }, 1000)
    toast.success('Setting printer disimpan')
  }

  const MODES = [
    { v: 'server', l: '🖥️ Desktop / Windows', d: 'Print langsung ke EPSON TM-U220 — install print_server.py di PC kasir' },
    { v: 'rawbt', l: '📱 Android / RawBT', d: 'Printer Bluetooth — install app RawBT di Android' },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">🖨️ Setting Printer</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2">
            {MODES.map(m => (
              <button key={m.v} onClick={() => setPrintMode(m.v as any)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left ${printMode === m.v ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${printMode === m.v ? 'border-gray-900' : 'border-gray-300'}`}>
                  {printMode === m.v && <div className="w-2 h-2 rounded-full bg-gray-900" />}
                </div>
                <div><p className="text-sm font-semibold text-gray-900">{m.l}</p><p className="text-xs text-gray-500">{m.d}</p></div>
              </button>
            ))}
          </div>
          {printMode === 'server' && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-blue-800">URL Print Server</p>
              <div className="flex gap-2">
                <input className="input flex-1 text-sm" value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)} placeholder="https://localhost:7676" />
                <button onClick={testServer} className="px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg">Test</button>
              </div>
              {serverStatus === 'ok' && <p className="text-xs text-green-600">✓ Terhubung</p>}
              {serverStatus === 'error' && (
                <div className="text-xs text-red-600 space-y-0.5">
                  <p>✗ Tidak terhubung</p>
                  <p className="text-gray-500">Pastikan print_server.py sudah jalan di PC kasir</p>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <div><p className="text-sm font-medium text-gray-900">Print Otomatis</p><p className="text-xs text-gray-400">Langsung print tanpa pop up struk</p></div>
            <button onClick={() => setAutoPrint(!autoPrint)} className={`w-11 h-6 rounded-full transition-colors relative ${autoPrint ? 'bg-gray-900' : 'bg-gray-200'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${autoPrint ? 'left-[22px]' : 'left-0.5'}`} />
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
function ReceiptModal({ data, printMode, autoPrint, onClose }: {
  data: any; printMode?: string; autoPrint?: boolean; onClose: () => void
}) {
  const orderTypeLabel: Record<string, string> = { dine_in: 'Dine In', take_away: 'Take Away', online: 'Online' }
  const payLabel: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer', gopay: 'GoPay', grab: 'GrabPay', shopeefood: 'ShopeePay' }

  // ── ✅ FIX: buildReceiptLines — semua var di dalam fungsi ──────
  function buildReceiptLines(overrideW?: number): string[] {
    const W = overrideW ?? 32
    const SEP = '='.repeat(W)
    const sep = '-'.repeat(W)

    function fmtRp(n: number): string {
      const s = String(Math.round(n))
      let result = ''
      for (let i = 0; i < s.length; i++) {
        if (i > 0 && (s.length - i) % 3 === 0) result += '.'
        result += s[i]
      }
      return 'Rp ' + result
    }
    function center(s: string): string {
      const str = s.substring(0, W)
      return str.padStart(Math.floor((W + str.length) / 2)).padEnd(W)
    }
    function row(l: string, r: string): string {
      const sp = W - l.length - r.length
      return l + (sp > 0 ? ' '.repeat(sp) : ' ') + r
    }

    const lines: string[] = []
    const now2 = new Date()
    const tgl = now2.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    const jam = now2.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
    const payLabel2: Record<string, string> = {
      cash: 'Cash', qris: 'QRIS', transfer: 'Transfer',
      gopay: 'GoPay', grab: 'GrabFood', shopeefood: 'ShopeeFood',
    }
    const tipeLabel: Record<string, string> = {
      dine_in: 'Dine In', take_away: 'Take Away', online: 'Online',
    }

    lines.push(SEP)
    lines.push(center('Coco Puff'))
    lines.push(center(data.storeName))
    lines.push(SEP)
    lines.push(row('No    :', data.receiptNo.substring(0, W - 8)))
    lines.push(row('Tgl   :', tgl.substring(0, W - 8)))
    lines.push(row('Jam   :', jam))
    lines.push(row('Tipe  :', tipeLabel[data.orderType] || data.orderType))
    if (data.onlineOrderNo) lines.push(row('Order :', '#' + data.onlineOrderNo))
    lines.push(sep)

    // Items + diskon per item
    for (const item of (data.items || [])) {
      const totalFmt = fmtRp(item.subtotal)
      const leftPart = `${item.qty}x ${item.name}`.substring(0, W - totalFmt.length - 1)
      lines.push(leftPart.padEnd(W - totalFmt.length) + totalFmt)

      // ✅ FIX: tampilkan diskon per item
      if (item.promoDiscount > 0) {
        const discFmt = '-' + fmtRp(item.promoDiscount)
        const discLabel = `  ${item.promoName || 'Diskon'}`.substring(0, W - discFmt.length)
        lines.push(discLabel.padEnd(W - discFmt.length) + discFmt)
      }
    }

    for (const p of (data.pakets || [])) {
      const totalFmt = fmtRp(p.subtotal)
      const leftPart = `1x ${p.name}`.substring(0, W - totalFmt.length - 1)
      lines.push(leftPart.padEnd(W - totalFmt.length) + totalFmt)
    }

    lines.push(sep)

    // ✅ FIX: Subtotal + semua baris diskon
    lines.push(row('Subtotal', fmtRp(data.rawSubtotal)))
    if ((data.buy1get1Discount || 0) > 0) lines.push(row('Diskon B1G1', '-' + fmtRp(data.buy1get1Discount)))
    if ((data.paketDiscount || 0) > 0) lines.push(row('Diskon Paket', '-' + fmtRp(data.paketDiscount)))
    const promoOnlyDisc = (data.rawDiscount || 0) - (data.buy1get1Discount || 0) - (data.paketDiscount || 0)
    if (promoOnlyDisc > 0) lines.push(row('Diskon Promo', '-' + fmtRp(promoOnlyDisc)))
    if (data.ppnAmount > 0) lines.push(row(`PPN ${data.ppnPct}%`, '+' + fmtRp(data.ppnAmount)))

    lines.push(SEP)
    lines.push(row('TOTAL', fmtRp(data.grandTotal)))
    lines.push(SEP)

    const metode = payLabel2[data.payMethod] || data.payMethod
    if (data.payMethod === 'cash') {
      lines.push(row('Bayar (Cash)', fmtRp(data.cashPaid)))
      if (data.change > 0) lines.push(row('Kembali', fmtRp(data.change)))
    } else {
      lines.push(row(`Bayar (${metode})`, fmtRp(data.cashPaid)))
    }

    lines.push('')
    lines.push(center('Terima kasih atas kunjungan Anda'))
    lines.push('')
    lines.push('')
    lines.push('')
    lines.push('')

    return lines.map(l => l.replace(/[^\x00-\x7F]/g, ''))
  }

  function handlePrint() {
    const lines = buildReceiptLines(32)
    const html = `<html><head><style>
*{margin:0;padding:0;}
body{margin:0;padding:1mm 0;}
pre{font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.4;white-space:pre;}
@page{margin:0mm;size:76mm auto;}
@media print{pre{width:56mm;}}
</style></head><body><pre>${lines.join('\n')}</pre></body></html>`
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;'
    document.body.appendChild(iframe)
    const iframeDoc = iframe.contentWindow?.document
    if (!iframeDoc) { document.body.removeChild(iframe); return }
    iframeDoc.open(); iframeDoc.write(html); iframeDoc.close()
    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => { try { document.body.removeChild(iframe) } catch { } }, 2000)
    }, 300)
  }

  function handleRawBT() {
    const lines = buildReceiptLines(28)
    const txt = lines.join('\n')
    window.location.href = `rawbt://${encodeURIComponent(txt)}`
    setTimeout(() => {
      navigator.clipboard.writeText(txt)
        .then(() => toast.success('Struk disalin ke clipboard'))
        .catch(() => { })
    }, 1500)
  }

  async function handlePrintServer() {
    const lines = buildReceiptLines(35)
    const txt = lines.join('\n')
    const url = (() => {
      try {
        const cfg = JSON.parse(
          localStorage.getItem(`printer_config_${data.storeId}`) ||
          localStorage.getItem(`printer_config_${data.storeName}`) || '{}'
        )
        return cfg.serverUrl || 'http://localhost:7676'
      } catch { return 'http://localhost:7676' }
    })()
    const wsUrl = url.replace(/^https?/, 'wss') + '/ws'
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 5000)
        ws.onopen = () => ws.send(JSON.stringify({ type: 'print', text: txt }))
        ws.onmessage = (e) => {
          clearTimeout(timer); const d = JSON.parse(e.data); ws.close()
          if (d.ok) resolve(); else reject(new Error(d.message || 'Print gagal'))
        }
        ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket error')) }
      })
      toast.success('Print berhasil!')
    } catch {
      try {
        const res = await fetch(`${url}/print`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: txt }),
          signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 5000); return c.signal })(),
        })
        const d = await res.json()
        if (d.ok) toast.success('Print berhasil!'); else toast.error('Print gagal: ' + d.error)
      } catch { toast.error('Print server tidak merespons.'); handlePrint() }
    }
  }

  useEffect(() => {
    if (autoPrint) setTimeout(() => {
      if (printMode === 'rawbt') handleRawBT()
      else if (printMode === 'server') handlePrintServer()
      else handlePrint()
    }, 300)
  }, [])

  const now = new Date()
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Struk Pembayaran</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="font-mono text-xs space-y-1" style={{ fontFamily: 'Courier New, monospace' }}>
            <div className="text-center font-bold text-sm">{data.storeName}</div>
            <div className="text-center text-xs text-gray-500">Coco Puff</div>
            <div className="border-t border-dashed border-gray-300 my-2" />
            <div className="flex justify-between">
              <span>{now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span>{now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            </div>
            <div className="flex justify-between"><span>No.</span><span className="font-bold">{data.receiptNo}</span></div>
            <div className="flex justify-between"><span>Tipe</span><span>{orderTypeLabel[data.orderType] || data.orderType}</span></div>
            {data.onlineOrderNo && <div className="flex justify-between"><span>Order</span><span>#{data.onlineOrderNo}</span></div>}
            <div className="border-t border-dashed border-gray-300 my-2" />
            {data.items.map((item: any, i: number) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span className="flex-1 pr-2">{item.name}</span>
                  <span>{formatRupiah(item.subtotal)}</span>
                </div>
                <div className="text-gray-400">{item.qty} × {formatRupiah(item.price)}</div>
                {item.promoDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>🎁 {item.promoName}</span>
                    <span>-{formatRupiah(item.promoDiscount)}</span>
                  </div>
                )}
              </div>
            ))}
            {data.pakets.map((p: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span className="flex-1 pr-2">{p.name}</span>
                <span>{formatRupiah(p.subtotal)}</span>
              </div>
            ))}
            <div className="border-t border-dashed border-gray-300 my-2" />
            <div className="flex justify-between"><span>Subtotal</span><span>{formatRupiah(data.rawSubtotal)}</span></div>
            {(data.buy1get1Discount || 0) > 0 && <div className="flex justify-between text-green-600"><span>Diskon B1G1</span><span>-{formatRupiah(data.buy1get1Discount)}</span></div>}
            {(data.paketDiscount || 0) > 0 && <div className="flex justify-between text-green-600"><span>Diskon Paket</span><span>-{formatRupiah(data.paketDiscount)}</span></div>}
            {((data.rawDiscount || 0) - (data.buy1get1Discount || 0) - (data.paketDiscount || 0)) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Diskon Promo</span>
                <span>-{formatRupiah((data.rawDiscount || 0) - (data.buy1get1Discount || 0) - (data.paketDiscount || 0))}</span>
              </div>
            )}
            {data.ppnAmount > 0 && <div className="flex justify-between"><span>PPN {data.ppnPct}%</span><span>+{formatRupiah(data.ppnAmount)}</span></div>}
            <div className="flex justify-between font-bold text-sm border-t border-dashed border-gray-300 pt-1 mt-1">
              <span>TOTAL</span><span>{formatRupiah(data.grandTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Bayar ({payLabel[data.payMethod] || data.payMethod})</span>
              <span>{formatRupiah(data.cashPaid)}</span>
            </div>
            {data.payMethod === 'cash' && data.change > 0 && (
              <div className="flex justify-between font-bold"><span>Kembali</span><span>{formatRupiah(data.change)}</span></div>
            )}
            <div className="border-t border-dashed border-gray-300 my-2" />
            <div className="text-center text-xs text-gray-400">Terima kasih atas kunjungan Anda</div>
            <div className="text-center text-xs text-gray-400">Coco Puff — {data.storeName}</div>
          </div>
        </div>
        <div className="px-4 pb-4 space-y-2 flex-shrink-0">
          <button
            onClick={printMode === 'rawbt' ? handleRawBT : printMode === 'server' ? handlePrintServer : handlePrint}
            className={`w-full py-3 rounded-xl text-white text-sm font-semibold ${printMode === 'rawbt' ? 'bg-blue-600' : printMode === 'server' ? 'bg-green-700' : 'bg-gray-900'
              }`}>
            {printMode === 'rawbt' ? '📱 Print via RawBT' : printMode === 'server' ? '⚡ Print via Server' : '🖨️ Print Struk'}
          </button>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Tutup</button>
        </div>
      </div>
    </div>
  )
}
