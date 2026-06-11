// src/pages/debug/DebugPage.tsx
// v3 — Rewrite bersih + Export JSON
import LogPage from '@/pages/debug/LogPage'
import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { RefreshCw, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronRight, Wifi, WifiOff, Download } from 'lucide-react'

type Status = 'ok' | 'warn' | 'error' | 'loading'
interface CheckResult { label: string; status: Status; value?: string; detail?: string }

function StatusIcon({ status }: { status: Status }) {
  if (status === 'loading') return <RefreshCw size={14} className="animate-spin text-gray-400" />
  if (status === 'ok') return <CheckCircle size={14} className="text-green-500" />
  if (status === 'warn') return <AlertCircle size={14} className="text-amber-500" />
  return <XCircle size={14} className="text-red-500" />
}

function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`border-t border-gray-50 ${check.status === 'error' ? 'bg-red-50' : check.status === 'warn' ? 'bg-amber-50' : ''}`}>
      <button onClick={() => check.detail && setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StatusIcon status={check.status} />
          <span className="text-sm text-gray-800 truncate">{check.label}</span>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {check.value && <span className="text-xs text-gray-500 font-mono">{check.value}</span>}
          {check.detail && (open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />)}
        </div>
      </button>
      {open && check.detail && (
        <div className="px-4 pb-2">
          <pre className="text-xs text-gray-600 bg-white rounded-lg p-2 border border-gray-100 overflow-auto max-h-48 whitespace-pre-wrap">{check.detail}</pre>
        </div>
      )}
    </div>
  )
}

function Section({ title, checks, emoji }: { title: string; checks: CheckResult[]; emoji: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const hasError = checks.some(c => c.status === 'error')
  const hasWarn  = checks.some(c => c.status === 'warn')
  const allOk    = checks.every(c => c.status === 'ok')
  const loading  = checks.some(c => c.status === 'loading')
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
        className={`w-full flex items-center justify-between px-4 py-3 border-b text-left ${hasError ? 'border-red-100 bg-red-50' : hasWarn ? 'border-amber-100 bg-amber-50' : 'border-gray-50 bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <span>{emoji}</span>
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</p>
        </div>
        <div className="flex items-center gap-2">
          {loading ? <RefreshCw size={12} className="animate-spin text-gray-400" />
            : hasError ? <XCircle size={14} className="text-red-500" />
            : hasWarn  ? <AlertCircle size={14} className="text-amber-500" />
            : allOk    ? <CheckCircle size={14} className="text-green-500" />
            : null}
          {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>
      {!collapsed && checks.map((c, i) => <CheckRow key={i} check={c} />)}
    </div>
  )
}

export default function DebugPage() {
  const { user } = useAuthStore()
  const [selectedStoreId, setSelectedStoreId] = useState(user?.store_id || '')
  const storeId = selectedStoreId || user?.store_id || ''
  const [allStores, setAllStores] = useState<any[]>([])
  const [running,   setRunning]   = useState(false)
  const [lastRun,   setLastRun]   = useState<Date | null>(null)
  const [latency,   setLatency]   = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'diagnostik' | 'log'>('diagnostik')

  const [ppnChecks,   setPpnChecks]   = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [stokChecks,  setStokChecks]  = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [bomChecks,   setBomChecks]   = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [syncChecks,  setSyncChecks]  = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [txChecks,    setTxChecks]    = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [shiftChecks, setShiftChecks] = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [mutasiChecks,setMutasiChecks]= useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [paketChecks, setPaketChecks] = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [userChecks,  setUserChecks]  = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [netChecks,   setNetChecks]   = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [perfChecks,  setPerfChecks]  = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [syncQChecks, setSyncQChecks] = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])

  if (!['owner', 'manager'].includes(user?.role || '')) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-400">Halaman ini hanya untuk owner/manager</p>
      </div>
    )
  }

  async function runChecks() {
    setRunning(true)
    setLastRun(new Date())

    // 1. NETWORK
    try {
      const t0 = Date.now()
      const { error } = await supabase.from('stores').select('id').eq('id', storeId).single()
      const ms = Date.now() - t0
      setLatency(ms)
      setNetChecks([
        { label: 'Koneksi Supabase', status: error ? 'error' : ms < 500 ? 'ok' : 'warn', value: error ? 'Gagal' : `${ms}ms`, detail: error ? JSON.stringify(error) : undefined },
        { label: 'Status Browser', status: navigator.onLine ? 'ok' : 'error', value: navigator.onLine ? 'Online' : 'Offline' },
      ])
    } catch (e) {
      setNetChecks([{ label: 'Koneksi Supabase', status: 'error', value: 'Timeout', detail: String(e) }])
    }

    // 2. PPN
    try {
      const { data: sd } = await supabase.from('stores').select('ppn_enabled, ppn_rate, ppn_mode').eq('id', storeId).single()
      const dx = await db.stores.get(storeId)
      const match = sd?.ppn_rate === (dx as any)?.ppn_rate
      setPpnChecks([
        { label: 'PPN Supabase', status: sd?.ppn_enabled ? 'ok' : 'warn', value: sd?.ppn_enabled ? `${sd.ppn_rate}% (${sd.ppn_mode})` : 'Nonaktif' },
        { label: 'PPN Dexie (lokal)', status: (dx as any)?.ppn_rate > 0 ? 'ok' : 'warn', value: (dx as any)?.ppn_rate ? `${(dx as any).ppn_rate}%` : 'Tidak ada' },
        { label: 'Sinkronisasi PPN', status: match ? 'ok' : 'warn', value: match ? 'Sinkron ✓' : '⚠ Tidak sinkron', detail: !match ? `Supabase: ${sd?.ppn_rate}% | Dexie: ${(dx as any)?.ppn_rate}%` : undefined },
      ])
    } catch (e) { setPpnChecks([{ label: 'Error cek PPN', status: 'error', detail: String(e) }]) }

    // 3. STOK
    try {
      const { data: stocks } = await supabase.from('stock').select('ingredient_id, material_id, qty_on_hand').eq('store_id', storeId)
      const stocksDex = await db.stock.where('store_id').equals(storeId).toArray()
      const { data: mats } = await supabase.from('materials').select('id, name, unit')
      const matMap = Object.fromEntries((mats || []).map(m => [m.id, m]))
      const noName = (stocks || []).filter(s => !matMap[s.ingredient_id || s.material_id || ''])
      const qtyMismatch = (stocks || []).filter(s => {
        const id = s.ingredient_id || s.material_id || ''
        const dx = stocksDex.find(d => (d.ingredient_id || (d as any).material_id) === id)
        return dx && Math.abs(dx.qty_on_hand - s.qty_on_hand) > 0.01
      })
      setStokChecks([
        { label: 'Jumlah item stok', status: (stocks || []).length > 0 ? 'ok' : 'warn', value: `${(stocks || []).length} item`, detail: (stocks || []).map(s => { const id = s.ingredient_id || s.material_id || ''; return `${matMap[id]?.name || id}: ${s.qty_on_hand}` }).join('\n') },
        { label: 'ID tidak ada di materials', status: noName.length === 0 ? 'ok' : 'error', value: noName.length === 0 ? 'Semua match ✓' : `${noName.length} item`, detail: noName.length > 0 ? noName.map(s => s.ingredient_id || s.material_id).join('\n') : undefined },
        { label: 'Qty Supabase vs Dexie', status: qtyMismatch.length === 0 ? 'ok' : 'warn', value: qtyMismatch.length === 0 ? 'Sinkron ✓' : `${qtyMismatch.length} berbeda`, detail: qtyMismatch.length > 0 ? qtyMismatch.map(s => { const id = s.ingredient_id || s.material_id || ''; const dx = stocksDex.find(d => (d.ingredient_id || (d as any).material_id) === id); return `${matMap[id]?.name || id}: SB=${s.qty_on_hand} | DX=${dx?.qty_on_hand}` }).join('\n') : undefined },
      ])
    } catch (e) { setStokChecks([{ label: 'Error cek stok', status: 'error', detail: String(e) }]) }

    // 4. BOM
    try {
      const { data: recipes } = await supabase.from('store_recipes').select('id, product_id, product_name, recipe_type').eq('store_id', storeId)
      const { data: recipeItems } = await supabase.from('store_recipe_items').select('*')
      const { data: stocks } = await supabase.from('stock').select('ingredient_id, material_id').eq('store_id', storeId)
      const { data: mats } = await supabase.from('materials').select('id, name, unit')
      const { data: products } = await supabase.from('products').select('id, name').eq('is_active', true)
      const matMap = Object.fromEntries((mats || []).map(m => [m.id, m]))
      const prodMap = Object.fromEntries((products || []).map(p => [p.id, p]))
      const stockIds = new Set([...(stocks || []).map(s => s.ingredient_id), ...(stocks || []).map(s => s.material_id)].filter(Boolean))
      const bomRecipes = (recipes || []).filter(r => r.recipe_type !== 'production')
      const bomResult: CheckResult[] = bomRecipes.length === 0 ? [{ label: 'Belum ada resep BOM', status: 'warn', value: '0 resep' }] : []
      for (const recipe of bomRecipes) {
        const items = (recipeItems || []).filter(ri => ri.recipe_id === recipe.id)
        const prodName = prodMap[recipe.product_id || '']?.name || recipe.product_name || recipe.product_id?.slice(0, 8)
        const missing = items.filter(i => !stockIds.has(i.material_id)).map(i => `❌ ${matMap[i.material_id]?.name || i.material_id}`)
        const present = items.filter(i => stockIds.has(i.material_id)).map(i => `✓ ${matMap[i.material_id]?.name || i.material_id}`)
        bomResult.push({ label: `${prodName}`, status: missing.length === 0 ? 'ok' : 'error', value: missing.length === 0 ? `${items.length} bahan ✓` : `${missing.length} kurang`, detail: [...present, ...missing].join('\n') || 'Tidak ada bahan' })
      }
      setBomChecks(bomResult)
    } catch (e) { setBomChecks([{ label: 'Error cek BOM', status: 'error', detail: String(e) }]) }

    // 5. SYNC
    try {
      const today = new Date().toLocaleDateString('sv-SE')
      const [dxTx, dxStock, dxMats, dxRecipes, dxProds, { count: sbTx }, { count: sbStock }, { count: sbMats }, { count: sbRecipes }, { count: sbProds }] = await Promise.all([
        db.transactions.count(), db.stock.count(), db.materials.count(), db.store_recipes.count(), db.products.count(),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('created_at', today + 'T00:00:00+07:00').lte('created_at', today + 'T23:59:59+07:00'),
        supabase.from('stock').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('materials').select('*', { count: 'exact', head: true }),
        supabase.from('store_recipes').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      ])
      setSyncChecks([
        { label: 'Transaksi hari ini', status: Math.abs(dxTx - (sbTx || 0)) <= 3 ? 'ok' : 'warn', value: `Lokal: ${dxTx} | Server: ${sbTx}` },
        { label: 'Stok toko', status: Math.abs(dxStock - (sbStock || 0)) <= 1 ? 'ok' : 'warn', value: `Lokal: ${dxStock} | Server: ${sbStock}` },
        { label: 'Materials', status: Math.abs(dxMats - (sbMats || 0)) <= 5 ? 'ok' : 'warn', value: `Lokal: ${dxMats} | Server: ${sbMats}` },
        { label: 'Resep toko', status: dxRecipes === (sbRecipes || 0) ? 'ok' : 'warn', value: `Lokal: ${dxRecipes} | Server: ${sbRecipes}` },
        { label: 'Produk', status: Math.abs(dxProds - (sbProds || 0)) <= 2 ? 'ok' : 'warn', value: `Lokal: ${dxProds} | Server: ${sbProds}` },
      ])
    } catch (e) { setSyncChecks([{ label: 'Error cek sync', status: 'error', detail: String(e) }]) }

    // 6. TRANSAKSI
    try {
      const today = new Date().toLocaleDateString('sv-SE')
      const { data: txs } = await supabase.from('transactions').select('id, receipt_no, total, status, payment_method, created_at').eq('store_id', storeId).gte('created_at', today + 'T00:00:00+07:00').lte('created_at', today + 'T23:59:59+07:00').order('created_at', { ascending: false })
      const completed = (txs || []).filter(t => t.status === 'completed')
      const voided    = (txs || []).filter(t => t.status === 'voided')
      const voidReq   = (txs || []).filter(t => t.status === 'void_requested')
      const dexieTxs  = await db.transactions.where('store_id').equals(storeId).filter(t => { const wib = new Date(new Date(t.created_at).getTime() + 7*60*60*1000); return wib.toISOString().slice(0,10) === today }).toArray()
      const sbIds     = new Set((txs || []).map(t => t.id))
      const notSynced = dexieTxs.filter(t => !sbIds.has(t.id))
      setTxChecks([
        { label: 'Transaksi hari ini', status: 'ok', value: `${completed.length} tx · ${formatRupiah(completed.reduce((s, t) => s + t.total, 0))}`, detail: completed.map(t => `${t.receipt_no} | ${formatRupiah(t.total)} | ${t.payment_method} | ${new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`).join('\n') || 'Belum ada' },
        { label: 'Void hari ini', status: voided.length === 0 && voidReq.length === 0 ? 'ok' : 'warn', value: `${voided.length} void, ${voidReq.length} pending`, detail: [...voided, ...voidReq].map(t => `${t.receipt_no} | ${t.status} | ${formatRupiah(t.total)}`).join('\n') || undefined },
        { label: 'Transaksi belum sync', status: notSynced.length === 0 ? 'ok' : 'error', value: notSynced.length === 0 ? 'Semua tersync ✓' : `${notSynced.length} belum sync`, detail: notSynced.map(t => `${(t as any).receipt_no} | ${formatRupiah(t.total)} | ${t.status}`).join('\n') || undefined },
      ])
    } catch (e) { setTxChecks([{ label: 'Error cek transaksi', status: 'error', detail: String(e) }]) }

    // 7. SHIFT
    try {
      const { data: shifts } = await supabase.from('shifts').select('id, store_id, user_id, status, opened_at, closed_at').eq('store_id', storeId).order('opened_at', { ascending: false }).limit(10)
      const { data: users } = await supabase.from('users').select('id, name').eq('store_id', storeId)
      const uMap = Object.fromEntries((users || []).map(u => [u.id, u.name]))
      const openShifts = (shifts || []).filter(s => s.status === 'open')
      const today = new Date().toLocaleDateString('sv-SE')
      const oldOpen = openShifts.filter(s => s.opened_at.slice(0, 10) < today)
      setShiftChecks([
        { label: 'Shift aktif sekarang', status: openShifts.length <= 3 ? 'ok' : 'warn', value: `${openShifts.length} shift open`, detail: openShifts.map(s => `${uMap[s.user_id] || s.user_id} | Open: ${new Date(s.opened_at).toLocaleString('id-ID')}`).join('\n') || 'Tidak ada' },
        { label: 'Shift lama tidak ditutup', status: oldOpen.length === 0 ? 'ok' : 'warn', value: oldOpen.length === 0 ? 'Bersih ✓' : `${oldOpen.length} shift`, detail: oldOpen.map(s => `${uMap[s.user_id] || s.user_id} | Dibuka: ${new Date(s.opened_at).toLocaleString('id-ID')}`).join('\n') || undefined },
        { label: '5 shift terakhir', status: 'ok', value: `${(shifts || []).length} total`, detail: (shifts || []).slice(0, 5).map(s => `${uMap[s.user_id] || s.user_id} | ${s.status} | ${new Date(s.opened_at).toLocaleString('id-ID')}`).join('\n') },
      ])
    } catch (e) { setShiftChecks([{ label: 'Error cek shift', status: 'error', detail: String(e) }]) }

    // 8. MUTASI
    try {
      const { data: mutations } = await supabase.from('warehouse_mutations').select('id, mutation_type, mutation_number, destination_id, created_at').or(`destination_id.eq.${storeId},acting_store_id.eq.${storeId}`).order('created_at', { ascending: false }).limit(20)
      const { data: mutItems } = await supabase.from('warehouse_mutation_items').select('mutation_id')
      const mutWithItems = new Set((mutItems || []).map(m => m.mutation_id))
      const emptyMuts = (mutations || []).filter(m => !mutWithItems.has(m.id))
      setMutasiChecks([
        { label: 'Mutasi terbaru', status: 'ok', value: `${(mutations || []).length} mutasi`, detail: (mutations || []).slice(0, 10).map(m => `${m.mutation_number || m.id.slice(0, 8)} | ${m.mutation_type} | ${new Date(m.created_at).toLocaleDateString('id-ID')}`).join('\n') || 'Belum ada' },
        { label: 'Mutasi tanpa items', status: emptyMuts.length === 0 ? 'ok' : 'error', value: emptyMuts.length === 0 ? 'Semua lengkap ✓' : `${emptyMuts.length} mutasi kosong`, detail: emptyMuts.map(m => `${m.mutation_number || m.id} | ${m.mutation_type}`).join('\n') || undefined },
      ])
    } catch (e) { setMutasiChecks([{ label: 'Error cek mutasi', status: 'error', detail: String(e) }]) }

    // 9. PAKET
    try {
      const { data: pkgs } = await supabase.from('packages').select('*').eq('is_active', true)
      const { data: pkgItems, error: pkgErr } = await supabase.from('package_items').select('*')
      const { data: prods } = await supabase.from('products').select('id, name').eq('is_active', true)
      const prodMap = Object.fromEntries((prods || []).map(p => [p.id, p.name]))
      if (pkgErr) {
        setPaketChecks([{ label: 'Tabel package_items', status: 'error', value: 'Tidak ada' }])
      } else {
        const res: CheckResult[] = (pkgs || []).length === 0 ? [{ label: 'Belum ada paket', status: 'warn', value: '0 paket' }] : []
        for (const pkg of (pkgs || [])) {
          const items = (pkgItems || []).filter(i => i.package_id === pkg.id)
          res.push({ label: pkg.name, status: items.length > 0 ? 'ok' : 'warn', value: items.length > 0 ? `${items.length} produk` : 'Belum ada produk', detail: items.map(i => `- ${prodMap[i.product_id] || i.product_id}`).join('\n') || undefined })
        }
        setPaketChecks(res)
      }
    } catch (e) { setPaketChecks([{ label: 'Error cek paket', status: 'error', detail: String(e) }]) }

    // 10. USER
    try {
      const { data: users } = await supabase.from('users').select('id, name, role, is_active').eq('store_id', storeId)
      const active   = (users || []).filter(u => u.is_active)
      const inactive = (users || []).filter(u => !u.is_active)
      setUserChecks([
        { label: 'User aktif', status: active.length > 0 ? 'ok' : 'warn', value: `${active.length} user`, detail: active.map(u => `${u.name} (${u.role})`).join('\n') || 'Tidak ada' },
        { label: 'User nonaktif', status: 'ok', value: `${inactive.length} user`, detail: inactive.length > 0 ? inactive.map(u => `${u.name} (${u.role})`).join('\n') : undefined },
      ])
    } catch (e) { setUserChecks([{ label: 'Error cek user', status: 'error', detail: String(e) }]) }

    // 11. SYNC QUEUE
    try {
      const syncQueue = await (db as any).sync_queue?.toArray() ?? []
      const pending = syncQueue.filter((q: any) => q.status === 'pending' || !q.status)
      const failed  = syncQueue.filter((q: any) => q.status === 'failed' || (q.retry_count || 0) >= 3)
      setSyncQChecks([
        { label: 'Antrian sync pending', status: pending.length === 0 ? 'ok' : pending.length < 10 ? 'warn' : 'error', value: `${pending.length} item`, detail: pending.length > 0 ? pending.slice(0, 10).map((q: any) => `${q.table_name} | ${q.operation} | ${q.record_id?.slice(0, 8)}`).join('\n') : undefined },
        { label: 'Sync gagal', status: failed.length === 0 ? 'ok' : 'error', value: failed.length === 0 ? 'Tidak ada ✓' : `${failed.length} item`, detail: failed.length > 0 ? failed.slice(0, 10).map((q: any) => `${q.table_name} | ${q.operation} | ${q.error_msg || '-'}`).join('\n') : undefined },
      ])
    } catch (e) { setSyncQChecks([{ label: 'Sync queue tidak tersedia', status: 'warn', detail: String(e) }]) }

    // 12. PERFORMANCE
    try {
      const counts = await Promise.all([db.transactions.count(), db.transaction_items.count(), db.stock.count(), db.materials.count(), db.products.count(), db.warehouse_mutations.count()])
      const labels = ['Transaksi', 'Tx Items', 'Stok', 'Materials', 'Produk', 'Mutasi']
      setPerfChecks([
        { label: 'Ukuran database Dexie', status: counts[0] < 10000 ? 'ok' : counts[0] < 50000 ? 'warn' : 'error', value: `${counts.reduce((a, b) => a + b, 0).toLocaleString()} records`, detail: counts.map((c, i) => `${labels[i]}: ${c.toLocaleString()}`).join('\n') },
        { label: 'Cache produk', status: counts[4] > 0 ? 'ok' : 'warn', value: `${counts[4]} produk` },
      ])
    } catch (e) { setPerfChecks([{ label: 'Error cek performa', status: 'error', detail: String(e) }]) }

    setRunning(false)
  }

  useEffect(() => {
    supabase.from('stores').select('id, name').eq('is_active', true)
      .then(({ data }) => {
        if (data) setAllStores(data.filter((s: any) => !s.id.includes('gudang') && !s.id.includes('produksi')))
      })
  }, [])

  useEffect(() => { runChecks() }, [storeId])

  const allChecks = [...ppnChecks, ...stokChecks, ...bomChecks, ...syncChecks, ...txChecks, ...shiftChecks, ...mutasiChecks, ...paketChecks, ...userChecks, ...netChecks, ...perfChecks, ...syncQChecks]
  const errorCount = allChecks.filter(c => c.status === 'error').length
  const warnCount  = allChecks.filter(c => c.status === 'warn').length
  const okCount    = allChecks.filter(c => c.status === 'ok').length

  function exportJSON() {
    const data = {
      exported_at: new Date().toISOString(),
      store_id: storeId,
      user: user?.name,
      latency_ms: latency,
      summary: { error: errorCount, warn: warnCount, ok: okCount },
      sections: {
        network:      netChecks,
        ppn:          ppnChecks,
        stok:         stokChecks,
        bom:          bomChecks,
        paket:        paketChecks,
        transaksi:    txChecks,
        shift:        shiftChecks,
        mutasi:       mutasiChecks,
        user:         userChecks,
        sync:         syncChecks,
        sync_queue:   syncQChecks,
        performance:  perfChecks,
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `debug-${storeId}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Debug & Diagnostik</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {lastRun ? `Terakhir: ${lastRun.toLocaleTimeString('id-ID')}${latency ? ` · Latensi: ${latency}ms` : ''}` : 'Belum pernah cek'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allStores.length > 1 && (
            <select
              value={selectedStoreId}
              onChange={e => setSelectedStoreId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 outline-none">
              {allStores.map(s => (
                <option key={s.id} value={s.id}>{s.name.replace(/ Malang$/,'').replace(/ Bali$/,'')}</option>
              ))}
            </select>
          )}
          <button onClick={exportJSON}
            className="flex items-center gap-1.5 text-sm font-medium text-green-700 border border-green-200 bg-green-50 px-3 py-1.5 rounded-lg">
            <Download size={14} /> Export JSON
          </button>
          <button onClick={runChecks} disabled={running}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg disabled:opacity-50">
            <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
            {running ? 'Cek...' : 'Cek Ulang'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 flex flex-shrink-0 px-4">
        <button onClick={() => setActiveTab('diagnostik')}
          className={`py-2.5 mr-5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'diagnostik' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
          Diagnostik
        </button>
        <button onClick={() => setActiveTab('log')}
          className={`py-2.5 mr-5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'log' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
          Log Error
        </button>
      </div>

      {activeTab === 'log' && <LogPage />}

      {activeTab === 'diagnostik' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Summary bar */}
          <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-4 flex-shrink-0">
            <div className="flex items-center gap-1.5"><XCircle size={13} className="text-red-500" /><span className="text-sm font-medium text-red-600">{errorCount} error</span></div>
            <div className="flex items-center gap-1.5"><AlertCircle size={13} className="text-amber-500" /><span className="text-sm font-medium text-amber-600">{warnCount} warning</span></div>
            <div className="flex items-center gap-1.5"><CheckCircle size={13} className="text-green-500" /><span className="text-sm font-medium text-green-600">{okCount} ok</span></div>
            <div className="flex items-center gap-1.5 ml-auto">
              {navigator.onLine
                ? <><Wifi size={13} className="text-green-500" /><span className="text-xs text-green-600">Online</span></>
                : <><WifiOff size={13} className="text-red-500" /><span className="text-xs text-red-600">Offline</span></>}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            <Section emoji="🌐" title="Network & Koneksi"     checks={netChecks} />
            <Section emoji="💰" title="PPN & Pajak"           checks={ppnChecks} />
            <Section emoji="📦" title="Stok Toko"             checks={stokChecks} />
            <Section emoji="🧾" title="Resep BOM (Kasir)"     checks={bomChecks} />
            <Section emoji="🎁" title="Paket & Diskon"        checks={paketChecks} />
            <Section emoji="💳" title="Transaksi Hari Ini"    checks={txChecks} />
            <Section emoji="⏱️" title="Shift Kasir"           checks={shiftChecks} />
            <Section emoji="🔄" title="Mutasi Stok"           checks={mutasiChecks} />
            <Section emoji="👥" title="User & Akses"          checks={userChecks} />
            <Section emoji="🔁" title="Sinkronisasi Dexie/Server" checks={syncChecks} />
            <Section emoji="⚡" title="Antrian Sync"          checks={syncQChecks} />
            <Section emoji="📊" title="Performa Database"     checks={perfChecks} />

            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">⚡ Quick Fix</p>
              </div>
              <div className="p-4 space-y-2">
                <button onClick={async () => {
                  const { data } = await supabase.from('stores').select('*').eq('id', storeId).single()
                  if (data) { await db.stores.put(data); alert('Store sync berhasil!') }
                }} className="w-full py-2 text-sm text-left px-3 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                  🔄 Sync store data (PPN) dari Supabase
                </button>
                <button onClick={async () => {
                  const [recs, items, mats, stocks] = await Promise.all([
                    supabase.from('store_recipes').select('*').eq('store_id', storeId),
                    supabase.from('store_recipe_items').select('*'),
                    supabase.from('materials').select('*'),
                    supabase.from('stock').select('*').eq('store_id', storeId),
                  ])
                  if (recs.data?.length)   await db.store_recipes.bulkPut(recs.data)
                  if (items.data?.length)  await db.store_recipe_items.bulkPut(items.data)
                  if (mats.data?.length)   await db.materials.bulkPut(mats.data)
                  if (stocks.data?.length) await db.stock.bulkPut(stocks.data)
                  alert(`Sync selesai:\n- ${recs.data?.length || 0} resep\n- ${mats.data?.length || 0} material\n- ${stocks.data?.length || 0} stok`)
                  runChecks()
                }} className="w-full py-2 text-sm text-left px-3 bg-green-50 text-green-700 rounded-lg border border-green-100">
                  🔄 Sync resep, material, stok dari Supabase
                </button>
                <button onClick={async () => {
                  const { data: txs } = await supabase.from('transactions').select('*').eq('store_id', storeId).gte('created_at', new Date().toLocaleDateString('sv-SE') + 'T00:00:00+07:00')
                  const { data: txItems } = await supabase.from('transaction_items').select('*').in('transaction_id', (txs || []).map((t: any) => t.id))
                  if (txs?.length)     await db.transactions.bulkPut(txs)
                  if (txItems?.length) await db.transaction_items.bulkPut(txItems)
                  alert(`Sync ${txs?.length || 0} transaksi hari ini selesai`)
                  runChecks()
                }} className="w-full py-2 text-sm text-left px-3 bg-purple-50 text-purple-700 rounded-lg border border-purple-100">
                  🔄 Sync transaksi hari ini dari Supabase
                </button>
                <button onClick={async () => {
                  try {
                    const stuck = await (db as any).sync_queue?.filter((q: any) => (q.retry_count || 0) >= 5).toArray() ?? []
                    for (const item of stuck) await (db as any).sync_queue?.update(item.id, { status: 'abandoned' })
                    await (db as any).sync_queue?.where('status').anyOf(['abandoned']).delete()
                    alert(`Berhasil! ${stuck.length} item stuck dihapus`)
                    runChecks()
                  } catch (e) { alert('Gagal: ' + String(e)) }
                }} className="w-full py-2 text-sm text-left px-3 bg-red-50 text-red-700 rounded-lg border border-red-100">
                  🗑 Bersihkan antrian sync yang stuck
                </button>
                <button onClick={() => {
                  const info = [`User: ${user?.name} (${user?.role})`, `Store: ${storeId}`, `Online: ${navigator.onLine}`, `Latency: ${latency}ms`, `Waktu: ${new Date().toLocaleString('id-ID')}`, `Checks: ${errorCount} error, ${warnCount} warn, ${okCount} ok`].join('\n')
                  navigator.clipboard.writeText(info).then(() => alert('Info debug disalin ke clipboard!'))
                }} className="w-full py-2 text-sm text-left px-3 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">
                  📋 Copy info debug ke clipboard
                </button>
                <button onClick={async () => {
                  if (!confirm('Tutup semua shift lama yang belum ditutup? (lebih dari 24 jam)')) return
                  const { error } = await supabase.from('shifts').update({ status: 'closed', closed_at: new Date().toISOString(), note: 'Auto-closed by system' }).eq('store_id', storeId).eq('status', 'open').lt('opened_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                  if (error) alert('Gagal: ' + error.message)
                  else { alert('Shift lama berhasil ditutup'); runChecks() }
                }} className="w-full py-2 text-sm text-left px-3 bg-orange-50 text-orange-700 rounded-lg border border-orange-100">
                  ⏱ Tutup shift lama (lebih dari 24 jam)
                </button>
              </div>
            </div>
            <div className="h-4" />
          </div>
        </div>
      )}
    </div>
  )
}
