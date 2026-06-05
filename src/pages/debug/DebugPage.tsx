// src/pages/debug/DebugPage.tsx
// Halaman debug khusus owner — cek status sistem secara menyeluruh
// Hanya tampil untuk role owner/manager

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { RefreshCw, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'

type Status = 'ok' | 'warn' | 'error' | 'loading'

interface CheckResult {
  label: string
  status: Status
  value?: string
  detail?: string
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'loading') return <RefreshCw size={14} className="animate-spin text-gray-400" />
  if (status === 'ok')      return <CheckCircle size={14} className="text-green-500" />
  if (status === 'warn')    return <AlertCircle size={14} className="text-amber-500" />
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
          {check.detail && (open ? <ChevronDown size={12} className="text-gray-400"/> : <ChevronRight size={12} className="text-gray-400"/>)}
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

function Section({ title, checks }: { title: string; checks: CheckResult[] }) {
  const hasError = checks.some(c => c.status === 'error')
  const hasWarn  = checks.some(c => c.status === 'warn')
  const allOk    = checks.every(c => c.status === 'ok')
  const loading  = checks.some(c => c.status === 'loading')
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${hasError ? 'border-red-100 bg-red-50' : hasWarn ? 'border-amber-100 bg-amber-50' : 'border-gray-50 bg-gray-50'}`}>
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</p>
        {loading ? <RefreshCw size={12} className="animate-spin text-gray-400" />
          : hasError ? <XCircle size={14} className="text-red-500" />
          : hasWarn  ? <AlertCircle size={14} className="text-amber-500" />
          : allOk    ? <CheckCircle size={14} className="text-green-500" />
          : null}
      </div>
      {checks.map((c, i) => <CheckRow key={i} check={c} />)}
    </div>
  )
}

export default function DebugPage() {
  const { user } = useAuthStore()
  const storeId  = user?.store_id || ''
  const [running,    setRunning]    = useState(false)
  const [lastRun,    setLastRun]    = useState<Date | null>(null)
  const [ppnChecks,  setPpnChecks]  = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [stokChecks, setStokChecks] = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [bomChecks,  setBomChecks]  = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [syncChecks, setSyncChecks] = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])
  const [txChecks,   setTxChecks]   = useState<CheckResult[]>([{ label: 'Memuat...', status: 'loading' }])

  if (!['owner','manager'].includes(user?.role || '')) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-400">Halaman ini hanya untuk owner/manager</p>
      </div>
    )
  }

  async function runChecks() {
    setRunning(true)
    setLastRun(new Date())

    // ── PPN ─────────────────────────────────────────────────
    try {
      const { data: storeData } = await supabase.from('stores')
        .select('ppn_enabled, ppn_rate, ppn_mode').eq('id', storeId).single()
      const dexieStore = await db.stores.get(storeId)

      setPpnChecks([
        {
          label: 'PPN Supabase',
          status: storeData?.ppn_enabled ? 'ok' : 'warn',
          value: storeData?.ppn_enabled ? `${storeData.ppn_rate}% (${storeData.ppn_mode})` : 'Nonaktif',
        },
        {
          label: 'PPN Dexie (lokal)',
          status: (dexieStore as any)?.ppn_rate > 0 ? 'ok' : 'warn',
          value: (dexieStore as any)?.ppn_rate ? `${(dexieStore as any).ppn_rate}%` : 'Tidak ada',
          detail: dexieStore ? JSON.stringify(dexieStore, null, 2) : 'Store tidak ada di Dexie',
        },
        {
          label: 'Sinkronisasi PPN',
          status: storeData?.ppn_rate === (dexieStore as any)?.ppn_rate ? 'ok' : 'warn',
          value: storeData?.ppn_rate === (dexieStore as any)?.ppn_rate ? 'Sinkron' : 'Tidak sinkron',
        },
      ])
    } catch (e) {
      setPpnChecks([{ label: 'Error cek PPN', status: 'error', detail: String(e) }])
    }

    // ── STOK TOKO ────────────────────────────────────────────
    try {
      const { data: stocks } = await supabase.from('stock')
        .select('ingredient_id, material_id, qty_on_hand')
        .eq('store_id', storeId)
      const { data: mats } = await supabase.from('materials').select('id, name, unit')
      const matMap = Object.fromEntries((mats || []).map(m => [m.id, m]))

      const stokList = (stocks || []).map(s => {
        const id   = s.ingredient_id || s.material_id || ''
        const mat  = matMap[id]
        const nama = mat?.name || `ID: ${id.slice(0,8)}`
        return { ...s, nama, hasName: !!mat }
      })

      const noName = stokList.filter(s => !s.hasName)
      const hasStok = stokList.length > 0

      setStokChecks([
        {
          label: 'Jumlah item stok toko',
          status: hasStok ? 'ok' : 'warn',
          value: `${stokList.length} item`,
          detail: stokList.map(s => `${s.nama}: ${s.qty_on_hand} ${matMap[s.ingredient_id || s.material_id || '']?.unit || 'pcs'}`).join('\n'),
        },
        {
          label: 'Item tanpa nama (ID tidak match materials)',
          status: noName.length === 0 ? 'ok' : 'error',
          value: noName.length === 0 ? 'Semua match ✓' : `${noName.length} item`,
          detail: noName.length > 0
            ? noName.map(s => `ID: ${s.ingredient_id || s.material_id}`).join('\n')
            : undefined,
        },
      ])
    } catch (e) {
      setStokChecks([{ label: 'Error cek stok', status: 'error', detail: String(e) }])
    }

    // ── RESEP BOM ─────────────────────────────────────────────
    try {
      const { data: recipes } = await supabase.from('store_recipes')
        .select('id, product_id, product_name, recipe_type').eq('store_id', storeId)
      const { data: recipeItems } = await supabase.from('store_recipe_items').select('*')
      const { data: stocks } = await supabase.from('stock').select('ingredient_id, material_id, qty_on_hand').eq('store_id', storeId)
      const { data: mats } = await supabase.from('materials').select('id, name')
      const { data: products } = await supabase.from('products').select('id, name').eq('is_active', true)

      const matMap  = Object.fromEntries((mats || []).map(m => [m.id, m]))
      const prodMap = Object.fromEntries((products || []).map(p => [p.id, p]))
      const stockIds = new Set([
        ...(stocks || []).map(s => s.ingredient_id),
        ...(stocks || []).map(s => s.material_id),
      ].filter(Boolean))

      const bomRecipes = (recipes || []).filter(r => r.recipe_type !== 'production')
      const bomChecksResult: CheckResult[] = []

      // Cek apakah product_id di resep ada di tabel products
      for (const recipe of bomRecipes) {
        const prodName = prodMap[recipe.product_id || '']?.name || recipe.product_name
        const items    = (recipeItems || []).filter(ri => ri.recipe_id === recipe.id)
        const missingStock: string[] = []

        for (const item of items) {
          if (!stockIds.has(item.material_id)) {
            const matName = matMap[item.material_id]?.name || item.material_id
            missingStock.push(matName)
          }
        }

        bomChecksResult.push({
          label: `Resep: ${prodName || recipe.product_id?.slice(0,8)}`,
          status: missingStock.length === 0 ? 'ok' : 'error',
          value: missingStock.length === 0 ? `${items.length} bahan ✓` : `${missingStock.length} bahan tidak ada stok`,
          detail: missingStock.length > 0
            ? `Bahan berikut tidak ada di stok toko:\n${missingStock.map(m => `❌ ${m}`).join('\n')}\n\nSolusi: mutasi bahan ini ke toko`
            : items.map(i => `✓ ${matMap[i.material_id]?.name || i.material_id}: ${i.qty_used} per unit`).join('\n'),
        })
      }

      if (bomChecksResult.length === 0) {
        bomChecksResult.push({ label: 'Belum ada resep BOM', status: 'warn', value: '0 resep' })
      }

      setBomChecks(bomChecksResult)
    } catch (e) {
      setBomChecks([{ label: 'Error cek BOM', status: 'error', detail: String(e) }])
    }

    // ── SYNC DEXIE VS SUPABASE ───────────────────────────────
    try {
      const [
        dexieTx, dexieStock, dexieMats, dexieRecipes,
        { count: sbTx }, { count: sbStock }, { count: sbMats }, { count: sbRecipes }
      ] = await Promise.all([
        db.transactions.count(),
        db.stock.count(),
        db.materials.count(),
        db.store_recipes.count(),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('stock').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('materials').select('*', { count: 'exact', head: true }),
        supabase.from('store_recipes').select('*', { count: 'exact', head: true }).eq('store_id', storeId),
      ])

      setSyncChecks([
        {
          label: 'Transaksi',
          status: Math.abs(dexieTx - (sbTx || 0)) <= 2 ? 'ok' : 'warn',
          value: `Lokal: ${dexieTx} | Server: ${sbTx}`,
        },
        {
          label: 'Stok toko',
          status: Math.abs(dexieStock - (sbStock || 0)) <= 1 ? 'ok' : 'warn',
          value: `Lokal: ${dexieStock} | Server: ${sbStock}`,
        },
        {
          label: 'Materials',
          status: Math.abs(dexieMats - (sbMats || 0)) <= 5 ? 'ok' : 'warn',
          value: `Lokal: ${dexieMats} | Server: ${sbMats}`,
        },
        {
          label: 'Resep toko',
          status: dexieRecipes === (sbRecipes || 0) ? 'ok' : 'warn',
          value: `Lokal: ${dexieRecipes} | Server: ${sbRecipes}`,
        },
      ])
    } catch (e) {
      setSyncChecks([{ label: 'Error cek sync', status: 'error', detail: String(e) }])
    }

    // ── TRANSAKSI TERAKHIR ───────────────────────────────────
    try {
      const today = new Date().toLocaleDateString('sv-SE')
      const { data: txs } = await supabase.from('transactions')
        .select('id, receipt_no, total, status, created_at, payment_method')
        .eq('store_id', storeId)
        .gte('created_at', today + 'T00:00:00+07:00')
        .order('created_at', { ascending: false })
        .limit(5)

      const { data: voidTxs } = await supabase.from('transactions')
        .select('id, receipt_no, total, status, void_reason')
        .eq('store_id', storeId)
        .in('status', ['voided', 'void_requested'])
        .gte('created_at', today + 'T00:00:00+07:00')

      const totalHariIni = (txs || []).filter(t => t.status === 'completed').reduce((s, t) => s + t.total, 0)

      setTxChecks([
        {
          label: 'Transaksi hari ini',
          status: 'ok',
          value: `${(txs || []).filter(t => t.status === 'completed').length} tx · ${formatRupiah(totalHariIni)}`,
          detail: (txs || []).map(t =>
            `${t.receipt_no} | ${formatRupiah(t.total)} | ${t.payment_method} | ${t.status} | ${new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
          ).join('\n') || 'Belum ada transaksi',
        },
        {
          label: 'Void hari ini',
          status: (voidTxs || []).length === 0 ? 'ok' : 'warn',
          value: `${(voidTxs || []).length} transaksi`,
          detail: (voidTxs || []).length > 0
            ? (voidTxs || []).map(t => `${t.receipt_no} | ${formatRupiah(t.total)} | ${t.status}\nAlasan: ${t.void_reason || '-'}`).join('\n\n')
            : undefined,
        },
        {
          label: 'Status Supabase',
          status: 'ok',
          value: 'Terhubung ✓',
        },
      ])
    } catch (e) {
      setTxChecks([{ label: 'Error cek transaksi', status: 'error', detail: String(e) }])
    }

    setRunning(false)
  }

  useEffect(() => { runChecks() }, [storeId])

  const allChecks = [...ppnChecks, ...stokChecks, ...bomChecks, ...syncChecks, ...txChecks]
  const errorCount = allChecks.filter(c => c.status === 'error').length
  const warnCount  = allChecks.filter(c => c.status === 'warn').length
  const okCount    = allChecks.filter(c => c.status === 'ok').length

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Debug & Diagnostik</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {lastRun ? `Terakhir cek: ${lastRun.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Belum pernah cek'}
          </p>
        </div>
        <button onClick={runChecks} disabled={running}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg disabled:opacity-50">
          <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
          {running ? 'Cek...' : 'Cek Ulang'}
        </button>
      </div>

      {/* Summary bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-4 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <XCircle size={13} className="text-red-500" />
          <span className="text-sm font-medium text-red-600">{errorCount} error</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertCircle size={13} className="text-amber-500" />
          <span className="text-sm font-medium text-amber-600">{warnCount} warning</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle size={13} className="text-green-500" />
          <span className="text-sm font-medium text-green-600">{okCount} ok</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        <Section title="💰 PPN & Pajak"        checks={ppnChecks}  />
        <Section title="📦 Stok Toko"           checks={stokChecks} />
        <Section title="🧾 Resep BOM (Kasir)"   checks={bomChecks}  />
        <Section title="🔄 Sinkronisasi Dexie"  checks={syncChecks} />
        <Section title="🧾 Transaksi Hari Ini"  checks={txChecks}   />

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">⚡ Quick Fix</p>
          </div>
          <div className="p-4 space-y-2">
            <button onClick={async () => {
              const { data } = await supabase.from('stores').select('*').eq('id', storeId).single()
              if (data) { await db.stores.put(data); alert('Store sync berhasil!') }
            }} className="w-full py-2 text-sm text-left px-3 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
              🔄 Sync store data (PPN) dari Supabase ke Dexie
            </button>
            <button onClick={async () => {
              const { data: recs }  = await supabase.from('store_recipes').select('*').eq('store_id', storeId)
              const { data: items } = await supabase.from('store_recipe_items').select('*')
              const { data: mats }  = await supabase.from('materials').select('*')
              const { data: stocks } = await supabase.from('stock').select('*').eq('store_id', storeId)
              if (recs?.length)   await db.store_recipes.bulkPut(recs)
              if (items?.length)  await db.store_recipe_items.bulkPut(items)
              if (mats?.length)   await db.materials.bulkPut(mats)
              if (stocks?.length) await db.stock.bulkPut(stocks)
              alert(`Sync selesai: ${recs?.length} resep, ${mats?.length} material, ${stocks?.length} stok`)
              runChecks()
            }} className="w-full py-2 text-sm text-left px-3 bg-green-50 text-green-700 rounded-lg border border-green-100">
              🔄 Sync resep, material & stok toko dari Supabase
            </button>
            <button onClick={async () => {
              const { data } = await supabase.from('stock').select('ingredient_id, material_id, qty_on_hand').eq('store_id', storeId)
              const { data: mats } = await supabase.from('materials').select('id, name, unit')
              const matMap = Object.fromEntries((mats || []).map(m => [m.id, m]))
              const result = (data || []).map(s => {
                const id = s.ingredient_id || s.material_id || ''
                return `${matMap[id]?.name || id}: ${s.qty_on_hand} ${matMap[id]?.unit || 'pcs'}`
              }).join('\n')
              alert('STOK TOKO SEKARANG:\n\n' + (result || 'Kosong'))
            }} className="w-full py-2 text-sm text-left px-3 bg-gray-50 text-gray-700 rounded-lg border border-gray-200">
              👁 Lihat stok toko saat ini (dari Supabase)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
