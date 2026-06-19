// src/pages/produksi/ProduksiPage.tsx
// CHANGELOG v6:
// - FEAT: Void produksi divisi ├ó┬Ç┬ö owner/manager bisa void log, stok dikembalikan
// - FEAT: Realtime subscription production_logs ├ó┬Ç┬ö kasir lihat perubahan otomatis tanpa refresh
// - FIX: syncStoreRecipes pull logs hari ini dari Supabase saat mount
// - FEAT: Void produksi toko ├ó┬Ç┬ö owner/manager bisa void log, stok toko dikembalikan
// - UI: Row voided tampil strikethrough + badge "Dibatalkan"

import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, type ProductionLog } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

function groupBy<T>(arr: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const k = keyFn(item); if (!map.has(k)) map.set(k, []); map.get(k)!.push(item)
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
}
function groupLabel(dateStr: string, mode: 'hari' | 'bulan' | 'tahun'): string {
  const d = new Date(dateStr)
  if (mode === 'hari') return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (mode === 'bulan') return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  return String(d.getFullYear())
}
function groupKey(dateStr: string, mode: 'hari' | 'bulan' | 'tahun'): string {
  if (mode === 'hari') return dateStr.slice(0, 10)
  if (mode === 'bulan') return dateStr.slice(0, 7)
  return dateStr.slice(0, 4)
}

function GroupHeader({ label, count, expanded, onToggle }: {
  label: string; count: number; expanded: boolean; onToggle: () => void
}) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-1 py-2">
      <div className="flex items-center gap-2">
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        <p className="text-xs font-semibold text-gray-600">{label}</p>
      </div>
      <span className="text-xs text-gray-400">{count} item</span>
    </button>
  )
}

function GroupSelect({ value, onChange }: { value: 'hari' | 'bulan' | 'tahun'; onChange: (v: 'hari' | 'bulan' | 'tahun') => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value as any)}
        className="appearance-none text-xs font-medium text-gray-600 border border-gray-200 bg-white pl-2.5 pr-6 py-1.5 rounded-lg focus:outline-none">
        <option value="hari">Per Hari</option>
        <option value="bulan">Per Bulan</option>
        <option value="tahun">Per Tahun</option>
      </select>
      <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}

const ToolbarCtx = createContext<(node: React.ReactNode) => void>(() => { })

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-600 ml-1 align-middle">
      {copied ? 'OK' : 'Copy'}
    </button>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3 h-16" />
        <div className="bg-white rounded-xl border border-gray-100 p-3 h-16" />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-20" />
      ))}
    </div>
  )
}

// ├ó┬ö┬Ç├ó┬ö┬Ç VOID CONFIRM MODAL ├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç
function VoidConfirmModal({ logNumber, onConfirm, onClose }: {
  logNumber: string; onConfirm: () => void; onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  async function handleConfirm() {
    if (loading || done) return  // guard double-click
    setLoading(true)
    setDone(true)
    await onConfirm()
    setLoading(false)
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <span className="text-red-600 text-lg">├ó┬Ü┬á</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Batalkan Produksi?</p>
            <p className="text-xs text-gray-500 mt-0.5">{logNumber}</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Stok bahan/produk akan dikembalikan ke kondisi sebelum produksi ini. Aksi ini tidak bisa diurungkan.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">
            Batal
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50">
            {loading ? 'Memproses...' : 'Ya, Batalkan'}
          </button>
        </div>
      </div>
    </div>
  )
}

type ProduksiTab = 'divisi' | 'toko'

export default function ProduksiPage() {
  const { user } = useAuthStore()
  const role = user?.role || 'produksi'
  const isOwnerManager = ['owner', 'manager'].includes(role)
  const canSeeToko = ['owner', 'manager', 'kasir'].includes(role)
  const canSeeDivisi = ['owner', 'manager', 'produksi'].includes(role)
  const defaultTab: ProduksiTab = canSeeDivisi ? 'divisi' : 'toko'
  const [activeTab, setActiveTab] = useState<ProduksiTab>(defaultTab)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)

  useEffect(() => { syncData(false) }, [])

  const hasLocalData = useLiveQuery(async () => {
    const count = await db.production_recipes.count()
    return count > 0
  }, [])

  useEffect(() => {
    if (hasLocalData !== undefined) setIsInitialLoad(false)
  }, [hasLocalData])

  async function syncData(showToast = true) {
    setIsSyncing(true)
    try {
      const storeId = user?.store_id || ''
      const [mats, pstock, fgs, recipes, recipeItems, logs, logMats, mutations, mutItems, partners, products, stores, storeRecipes, storeRecipeItems] = await Promise.all([
        supabase.from('materials').select('*').eq('is_active', true),
        supabase.from('production_stock').select('*'),
        supabase.from('finished_goods_stock').select('*'),
        supabase.from('production_recipes').select('*'),
        supabase.from('production_recipe_items').select('*'),
        supabase.from('production_logs').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('production_log_materials').select('*'),
        supabase.from('production_mutations').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('production_mutation_items').select('*'),
        supabase.from('partners').select('*'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('stores').select('*').eq('is_active', true),
        storeId ? supabase.from('store_recipes').select('*').eq('store_id', storeId) : Promise.resolve({ data: [] }),
        supabase.from('store_recipe_items').select('*'),
      ])

      await Promise.all([
        mats.data?.length ? db.materials.bulkPut(mats.data) : Promise.resolve(),
        pstock.data !== null ? (async () => { await db.production_stock.clear(); if (pstock.data?.length) await db.production_stock.bulkPut(pstock.data) })() : Promise.resolve(),
        fgs.data?.length ? db.finished_goods_stock.bulkPut(fgs.data) : Promise.resolve(),
        recipes.data !== null ? (async () => { await db.production_recipes.clear(); if (recipes.data?.length) await db.production_recipes.bulkPut(recipes.data) })() : Promise.resolve(),
        recipeItems.data !== null ? (async () => { await db.production_recipe_items.clear(); if (recipeItems.data?.length) await db.production_recipe_items.bulkPut(recipeItems.data) })() : Promise.resolve(),
        logs.data !== null ? (async () => { await db.production_logs.clear(); if (logs.data?.length) await db.production_logs.bulkPut(logs.data) })() : Promise.resolve(),
        logMats.data !== null ? (async () => { await db.production_log_materials.clear(); if (logMats.data?.length) await db.production_log_materials.bulkPut(logMats.data) })() : Promise.resolve(),
        mutations.data?.length ? db.production_mutations.bulkPut(mutations.data) : Promise.resolve(),
        mutItems.data?.length ? db.production_mutation_items.bulkPut(mutItems.data) : Promise.resolve(),
        partners.data?.length ? db.partners.bulkPut(partners.data) : Promise.resolve(),
        products.data?.length ? db.products.bulkPut(products.data) : Promise.resolve(),
        stores.data?.length ? db.stores.bulkPut(stores.data) : Promise.resolve(),
        (storeRecipes as any).data?.length ? db.store_recipes.bulkPut((storeRecipes as any).data) : Promise.resolve(),
        (storeRecipeItems as any).data?.length ? db.store_recipe_items.bulkPut((storeRecipeItems as any).data) : Promise.resolve(),
      ])

      if (showToast) toast.success('Data produksi diperbarui')
    } catch (e) {
      console.error('[ProduksiPage sync]', e)
      if (showToast) toast.error('Gagal sync data')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Produksi</h1>
        <div className="flex items-center gap-2">
          {toolbarActions}
          <button onClick={syncData} disabled={isSyncing} className="p-2 rounded-full text-gray-400">
            <RefreshCw size={16} className={isSyncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>

      {isSyncing && (
        <div className="px-4 py-2 flex-shrink-0">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2">
            <RefreshCw size={12} className="animate-spin text-blue-500 flex-shrink-0" />
            <p className="text-xs text-blue-600">Memuat data produksi...</p>
          </div>
        </div>
      )}

      {canSeeDivisi && canSeeToko && (
        <div className="bg-white border-b border-gray-100 flex flex-shrink-0">
          <button onClick={() => setActiveTab('divisi')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab === 'divisi' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
            🏭 Divisi Produksi
          </button>
          <button onClick={() => setActiveTab('toko')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab === 'toko' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
            🏪 Produksi Toko
          </button>
        </div>
      )}

      <ToolbarCtx.Provider value={setToolbarActions}>
        <div className="flex-1 overflow-auto bg-gray-50">
          {isInitialLoad && hasLocalData === undefined
            ? <LoadingSkeleton />
            : activeTab === 'divisi'
              ? <CatatProduksiTab userId={user!.id} isOwnerManager={isOwnerManager} />
              : <ProduksiTokoTab userId={user!.id} storeId={user?.store_id || ''} role={role} />
          }
        </div>
      </ToolbarCtx.Provider>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

// ├ó┬ö┬Ç├ó┬ö┬Ç DIVISI PRODUKSI ├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç
function CatatProduksiTab({ userId, isOwnerManager }: { userId: string; isOwnerManager?: boolean }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm] = useState(false)
  const [groupMode, setGroupMode] = useState<'hari' | 'bulan' | 'tahun'>('hari')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const today = new Date().toISOString().slice(0, 10)
    return { [today]: true }
  })
  const [search, setSearch] = useState('')
  const [voidTarget, setVoidTarget] = useState<{ id: string; logNumber: string } | null>(null)

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={13} /> Catat
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const logs = useLiveQuery(async () => {
    const all = await db.production_logs.orderBy('created_at').reverse().limit(200).toArray()
    const l = all.filter(log => !(log as any).store_id)
    const recipes = await db.production_recipes.toArray()
    const rMap = Object.fromEntries(recipes.map(r => [r.id, r]))
    const mats = await db.production_log_materials.toArray()
    const matDefs = await db.materials.toArray()
    const mMap = Object.fromEntries(matDefs.map(m => [m.id, m]))
    return l.map(log => {
      const logMats = mats.filter(m => m.log_id === log.id).map(m => ({ ...m, material: mMap[m.material_id] }))
      const totalCost = logMats.reduce((s, m) => s + m.qty_used * (m.material?.unit_cost || 0), 0)
      const hpp = log.total_yield > 0 ? totalCost / log.total_yield : 0
      return { ...log, recipe: rMap[log.recipe_id], materials: logMats, total_cost: totalCost, hpp_per_unit: hpp }
    })
  }, [])

  const filteredLogs = useMemo(() => {
    if (!logs) return []
    if (!search) return logs
    const q = search.toLowerCase()
    return logs.filter(l =>
      l.recipe?.name?.toLowerCase().includes(q) ||
      (l as any).log_number?.toLowerCase().includes(q) ||
      l.notes?.toLowerCase().includes(q)
    )
  }, [logs, search])

  // ├ó┬ö┬Ç├ó┬ö┬Ç VOID HANDLER: DIVISI ├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç
  // Rollback stok ditangani oleh DB trigger (trigger_rollback_production_stock)
  // Client hanya update status
  async function handleVoidDivisi(logId: string) {
    try {
      // Guard: cek sudah voided belum
      const { data: existingLog } = await supabase
        .from('production_logs')
        .select('status')
        .eq('id', logId)
        .single()
      if (existingLog?.status === 'voided') {
        toast.error('Produksi ini sudah dibatalkan sebelumnya')
        setVoidTarget(null)
        return
      }

      // Update status voided ├ó┬Ç┬ö DB trigger otomatis rollback stok
      await supabase.from('production_logs').update({
        status: 'voided',
        voided_at: new Date().toISOString(),
      }).eq('id', logId)
      await db.production_logs.update(logId, { status: 'voided', voided_at: now() } as any)

      toast.success('Produksi dibatalkan & stok dikembalikan')
      setVoidTarget(null)
    } catch (e) {
      console.error('[VoidDivisi]', e)
      toast.error('Gagal membatalkan produksi')
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Produksi Bulan Ini</p>
          <p className="text-xl font-bold text-gray-900">{logs?.filter(l => (l as any).status !== 'voided' && l.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, l) => s + l.total_yield, 0) || 0}</p>
          <p className="text-xs text-gray-400">{logs?.filter(l => (l as any).status !== 'voided' && l.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length || 0} batch</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Total Semua</p>
          <p className="text-xl font-bold text-gray-900">{logs?.filter(l => (l as any).status !== 'voided').reduce((s, l) => s + l.total_yield, 0) || 0}</p>
          <p className="text-xs text-gray-400">{logs?.filter(l => (l as any).status !== 'voided').length || 0} produksi</p>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari nama resep, nomor log..." />

      {(() => {
        const grouped = groupBy(filteredLogs, l => groupKey(l.created_at, groupMode))
        if (!grouped.length) return (
          <div className="bg-white rounded-xl border border-gray-100 py-10 text-center text-sm text-gray-400">
            Belum ada catatan produksi
          </div>
        )
        return grouped.map(({ key, items: grpItems }) => {
          const today = new Date().toISOString().slice(0, 10)
          const expanded = expandedGroups[key] !== undefined ? expandedGroups[key] : key === today
          return (
            <div key={key}>
              <GroupHeader
                label={groupLabel(grpItems[0].created_at, groupMode)}
                count={grpItems.length}
                expanded={expanded}
                onToggle={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))}
              />
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden"
                style={{ display: expanded ? undefined : 'none' }}>
                {grpItems.map((log, idx) => {
                  const isVoided = (log as any).status === 'voided'
                  const logNumber = (log as any).log_number || `PROD-${log.created_at.slice(0, 10).replace(/-/g, '')}-${log.id.slice(-4).toUpperCase()}`
                  return (
                    <div key={log.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${isVoided ? 'opacity-50 bg-gray-50' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-xs font-mono text-blue-600 ${isVoided ? 'line-through' : ''}`}>
                              {logNumber}
                              {!isVoided && <CopyBtn text={log.id} />}
                            </p>
                            {isVoided && (
                              <span className="text-[10px] font-medium text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                                Dibatalkan
                              </span>
                            )}
                          </div>
                          <p className={`text-sm font-medium text-gray-900 ${isVoided ? 'line-through' : ''}`}>{log.recipe?.name || '├ó┬Ç┬ö'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {', '}
                            {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            {' ├é┬╖ '}{log.batch_count} batch
                            {log.notes && ` ├é┬╖ ${log.notes}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <div className="text-right">
                            <p className={`text-sm font-bold text-gray-900 ${isVoided ? 'line-through' : ''}`}>{log.total_yield} {log.recipe?.yield_unit || 'pcs'}</p>
                          </div>
                          {isOwnerManager && !isVoided && (
                            <button
                              onClick={() => setVoidTarget({ id: log.id, logNumber })}
                              className="text-[10px] font-medium text-red-400 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                              Void
                            </button>
                          )}
                        </div>
                      </div>
                      {!isVoided && log.materials.length > 0 && (
                        <div className="mt-1.5 border-t border-gray-50 pt-1.5 space-y-0.5">
                          {log.materials.map(m => (
                            <div key={m.id} className="flex justify-between text-xs text-gray-400">
                              <span>{m.material?.name} ├â┬ù {m.qty_used} {m.material?.unit} @ {formatRupiah(m.material?.unit_cost || 0)}</span>
                              <span>{formatRupiah(m.qty_used * (m.material?.unit_cost || 0))}</span>
                            </div>
                          ))}
                          {(log as any).total_cost > 0 && (
                            <div className="pt-1 border-t border-gray-50 mt-1 space-y-0.5">
                              <div className="flex justify-between text-xs font-medium text-gray-700">
                                <span>Total Biaya Bahan</span>
                                <span>{formatRupiah((log as any).total_cost)}</span>
                              </div>
                              {(log as any).hpp_per_unit > 0 && (
                                <div className="flex justify-between text-xs text-gray-500">
                                  <span>HPP per pcs</span>
                                  <span>{formatRupiah((log as any).hpp_per_unit)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      })()}

      {showForm && <ProduksiForm userId={userId} isOwnerManager={isOwnerManager} onClose={() => setShowForm(false)} />}

      {voidTarget && (
        <VoidConfirmModal
          logNumber={voidTarget.logNumber}
          onConfirm={() => handleVoidDivisi(voidTarget.id)}
          onClose={() => setVoidTarget(null)}
        />
      )}
    </div>
  )
}

function ProduksiForm({ userId, isOwnerManager, onClose }: { userId: string; isOwnerManager?: boolean; onClose: () => void }) {
  const allStores = useLiveQuery(() =>
    isOwnerManager ? db.stores.filter(s => s.is_active).toArray() : Promise.resolve([])
    , [isOwnerManager])

  const [inputAsStore, setInputAsStore] = useState('')
  const recipes = useLiveQuery(() => db.production_recipes.filter(r => r.is_active).toArray(), [])

  const [recipeId, setRecipeId] = useState('')
  const [batchCount, setBatch] = useState('1')
  const [productName, setProduct] = useState('')
  const [actualYield, setActualYield] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedRecipe = recipes?.find(r => r.id === recipeId)
  const estimatedYield = selectedRecipe ? selectedRecipe.batch_yield * Number(batchCount) : 0
  const totalYield = actualYield && Number(actualYield) > 0 ? Number(actualYield) : estimatedYield

  useEffect(() => {
    if (selectedRecipe) setProduct((selectedRecipe as any).product_name || selectedRecipe.name)
  }, [recipeId])

  async function handleSave() {
    if (!recipeId) return toast.error('Pilih resep')
    if (!productName.trim()) return toast.error('Nama produk wajib diisi')
    if (Number(batchCount) <= 0) return toast.error('Jumlah batch harus lebih dari 0')
    setSaving(true)
    try {
      const recipeItems = await db.production_recipe_items.where('recipe_id').equals(recipeId).toArray()
      const matDefs = await db.materials.toArray()
      const mMap = Object.fromEntries(matDefs.map(m => [m.id, m]))
      const finalYield = actualYield && Number(actualYield) > 0 ? Number(actualYield) : estimatedYield
      const totalCost = recipeItems.reduce((s, ri) => s + ri.qty_per_batch * Number(batchCount) * (mMap[ri.material_id]?.unit_cost || 0), 0)
      const hppPerUnit = finalYield > 0 ? totalCost / finalYield : 0

      const logDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const logPrefix = `PROD-${logDate}-`
      const existing = await db.production_logs.filter(l => (l as any).log_number?.startsWith(logPrefix)).toArray()
      const logNumber = `${logPrefix}${String(existing.length + 1).padStart(3, '0')}`

      const logId = generateId()
      const log: any = {
        id: logId, log_number: logNumber, recipe_id: recipeId,
        batch_count: Number(batchCount), total_yield: finalYield,
        notes: notes || undefined, created_by: userId, created_at: now(),
        status: 'done',
      }
      await db.production_logs.add(log)
      await supabase.from('production_logs').upsert(log)

      for (const ri of recipeItems) {
        const qtyUsed = ri.qty_per_batch * Number(batchCount)
        const logMat: any = { id: generateId(), log_id: logId, material_id: ri.material_id, qty_used: qtyUsed }
        await db.production_log_materials.add(logMat)
        await supabase.from('production_log_materials').upsert(logMat)

        const ps = await db.production_stock.where('material_id').equals(ri.material_id).first()
        if (ps) {
          const newQty = Math.max(0, ps.qty_on_hand - qtyUsed)
          await db.production_stock.update(ps.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('production_stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', ps.id)
        }
      }

      const existingMat = await db.materials.filter(m =>
        m.name.toLowerCase() === productName.trim().toLowerCase()
      ).first()

      let fgsProductId: string
      if (existingMat) {
        fgsProductId = existingMat.id
      } else {
        const newMatId = `mat-${generateId().slice(0, 8)}`
        const newMat: any = {
          id: newMatId, name: productName.trim(), unit: selectedRecipe?.yield_unit || 'pcs',
          unit_cost: hppPerUnit, min_stock: 0, category: 'bahan_setengah_jadi',
          is_active: true, created_at: now(), updated_at: now(),
        }
        await db.materials.put(newMat)
        await supabase.from('materials').upsert(newMat)
        fgsProductId = newMatId
      }

      if (hppPerUnit > 0) {
        await db.materials.update(fgsProductId, { unit_cost: hppPerUnit, avg_cost: hppPerUnit, updated_at: now() } as any)
        await supabase.from('materials').update({ unit_cost: hppPerUnit, avg_cost: hppPerUnit }).eq('id', fgsProductId)
      }

      const outputType = (selectedRecipe as any)?.output_type || 'finished_goods'
      if (outputType === 'production_stock') {
        const existingPs = await db.production_stock.where('material_id').equals(fgsProductId).first()
        const newPsQty = (existingPs?.qty_on_hand || 0) + finalYield
        const psData: any = { id: existingPs?.id || generateId(), material_id: fgsProductId, qty_on_hand: newPsQty, avg_cost: hppPerUnit, last_updated: now() }
        await db.production_stock.put(psData)
        await supabase.from('production_stock').upsert(psData)
      } else {
        const existing2 = await db.finished_goods_stock.filter(f =>
          f.product_name === productName.trim() || f.product_id === fgsProductId
        ).first()
        const fgsId = existing2?.id || generateId()
        const newFgsQty = (existing2?.qty_on_hand || 0) + finalYield
        const fgsData: any = { id: fgsId, product_id: fgsProductId, product_name: productName.trim(), qty_on_hand: newFgsQty, hpp_per_unit: hppPerUnit, last_updated: now() }
        await db.finished_goods_stock.put(fgsData)
        if (existing2) {
          await supabase.from('finished_goods_stock').update({ qty_on_hand: newFgsQty, hpp_per_unit: hppPerUnit, last_updated: now() }).eq('id', fgsId)
        } else {
          const { error } = await supabase.from('finished_goods_stock').upsert(fgsData)
          if (error) await supabase.from('finished_goods_stock').upsert(fgsData)
        }
      }

      toast.success(`Produksi ${logNumber} dicatat: ${totalYield} ${selectedRecipe?.yield_unit || 'pcs'}`)
      onClose()
    } catch (e) { toast.error('Gagal menyimpan produksi'); console.error(e) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Produksi" onClose={onClose}>
      {isOwnerManager && allStores && allStores.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Input Sebagai</label>
          <select className="input" value={inputAsStore} onChange={e => setInputAsStore(e.target.value)}>
            <option value="">Divisi Produksi</option>
            {allStores.filter(s => !s.id.includes('gudang')).map(s => (
              <option key={s.id} value={s.id}>{s.name.replace(' Malang', '').replace(' Bali', '')}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <Label required>Resep</Label>
        <select className="input" value={recipeId} onChange={e => setRecipeId(e.target.value)}>
          <option value="">Pilih resep</option>
          {recipes?.map(r => <option key={r.id} value={r.id}>{r.name} ({r.batch_yield} {r.yield_unit}/batch)</option>)}
        </select>
        {recipes?.length === 0 && (
          <p className="text-xs text-amber-600 mt-1.5">├ó┬Ü┬á Belum ada resep. Buat resep di menu Resep terlebih dahulu.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Jumlah Batch</Label>
          <input className="input" type="number" min="0.1" step="0.5" value={batchCount} onChange={e => setBatch(e.target.value)} />
          <p className="text-[10px] text-gray-400 mt-1">Bisa desimal: 0.5, 1.5, dst</p>
        </div>
        {selectedRecipe && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col justify-center">
            <p className="text-xs text-gray-500">Total hasil</p>
            <p className="text-xl font-bold text-gray-900">{totalYield}</p>
            <p className="text-xs text-gray-400">{selectedRecipe.yield_unit}</p>
          </div>
        )}
      </div>
      {selectedRecipe && (
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-1">Produk yang dihasilkan</p>
          <p className="text-sm font-medium text-gray-900">{productName || selectedRecipe.name}</p>
        </div>
      )}
      <div>
        <Label required>Hasil Aktual</Label>
        <input className="input" type="number" step="1" value={actualYield} onChange={e => setActualYield(e.target.value)} placeholder={String(totalYield || 0)} />
        <p className="text-xs text-gray-400 mt-1">Isi sesuai hasil nyata (bisa berbeda dari estimasi)</p>
      </div>
      <div>
        <Label>Catatan</Label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}

function KirimForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])
  const partners = useLiveQuery(() => db.partners.filter(p => p.is_active).toArray(), [])
  const fgStocks = useLiveQuery(() => db.finished_goods_stock.filter(f => f.qty_on_hand > 0).toArray(), [])

  const [type, setType] = useState<'to_store' | 'to_partner' | 'return_from_store' | 'adjustment'>('to_store')
  const [destId, setDestId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<{ product_id: string; qty: string }[]>([{ product_id: '', qty: '' }])
  const [saving, setSaving] = useState(false)

  const totalQty = items.reduce((s, i) => s + Number(i.qty), 0)

  async function handleSave() {
    const valid = items.filter(i => i.product_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 produk')
    if ((type === 'to_store' || type === 'return_from_store') && !destId) return toast.error('Pilih toko tujuan')
    if (type === 'to_partner' && !destId) return toast.error('Pilih franchise tujuan')
    for (const item of valid) {
      const fg = fgStocks?.find(f => f.product_id === item.product_id)
      if (fg && type !== 'return_from_store' && Number(item.qty) > fg.qty_on_hand) {
        return toast.error(`Stok ${fg.product_name} tidak cukup (tersedia: ${fg.qty_on_hand})`)
      }
    }
    setSaving(true)
    try {
      let destName = ''
      if (type === 'to_store' || type === 'return_from_store') destName = stores?.find(s => s.id === destId)?.name || ''
      else if (type === 'to_partner') destName = partners?.find(p => p.id === destId)?.name || ''
      const mutId = generateId()
      const mut: any = { id: mutId, mutation_type: type, destination_id: destId || undefined, destination_name: destName || undefined, notes: notes || undefined, status: 'confirmed', created_by: userId, created_at: now(), confirmed_at: now(), confirmed_by: userId }
      await db.production_mutations.add(mut)
      await supabase.from('production_mutations').upsert(mut)
      for (const item of valid) {
        const fg = fgStocks?.find(s => s.product_id === item.product_id)
        const mi: any = { id: generateId(), mutation_id: mutId, product_id: item.product_id, product_name: fg?.product_name || '', qty: Number(item.qty) }
        await db.production_mutation_items.add(mi)
        await supabase.from('production_mutation_items').upsert(mi)
        if (fg) {
          const isReturn = type === 'return_from_store'
          const newQty = isReturn ? fg.qty_on_hand + Number(item.qty) : Math.max(0, fg.qty_on_hand - Number(item.qty))
          await db.finished_goods_stock.update(fg.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('finished_goods_stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', fg.id)
        }
      }
      toast.success('Pengiriman dicatat')
      onClose()
    } catch (e) { toast.error('Gagal menyimpan'); console.error(e) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Kirim Produk" onClose={onClose}>
      <div>
        <Label required>Tujuan</Label>
        <div className="grid grid-cols-2 gap-2">
          {([{ v: 'to_store', l: '├ó┬å┬Æ Toko' }, { v: 'to_partner', l: '├ó┬å┬Æ Franchise' }, { v: 'return_from_store', l: '├ó┬å┬É Retur' }, { v: 'adjustment', l: 'Koreksi' }] as const).map(t => (
            <button key={t.v} onClick={() => setType(t.v)}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${type === t.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>{t.l}</button>
          ))}
        </div>
      </div>
      {(type === 'to_store' || type === 'return_from_store') && (
        <div><Label required>Toko</Label>
          <select className="input" value={destId} onChange={e => setDestId(e.target.value)}>
            <option value="">Pilih toko</option>
            {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {type === 'to_partner' && (
        <div><Label required>Franchise</Label>
          <select className="input" value={destId} onChange={e => setDestId(e.target.value)}>
            <option value="">Pilih franchise</option>
            {partners?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <Label required>Produk</Label>
        {(!fgStocks || fgStocks.length === 0) ? (
          <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400">Belum ada produk jadi di stok</div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => {
              const fg = fgStocks?.find(f => f.product_id === item.product_id)
              return (
                <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <select className="input text-sm" value={item.product_id}
                    onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, product_id: e.target.value, qty: '' } : x))}>
                    <option value="">Pilih produk</option>
                    {fgStocks?.map(s => <option key={s.product_id} value={s.product_id}>{s.product_name} (stok: {s.qty_on_hand})</option>)}
                  </select>
                  <input className="input text-sm" type="number" placeholder={fg ? `Qty (max ${fg.qty_on_hand})` : 'Qty'}
                    value={item.qty} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x))} />
                  {items.length > 1 && <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-500">Hapus</button>}
                </div>
              )
            })}
            <button onClick={() => setItems(p => [...p, { product_id: '', qty: '' }])} className="text-sm text-blue-600 font-medium">+ Tambah Produk</button>
          </div>
        )}
      </div>
      {totalQty > 0 && (
        <div className="flex items-center justify-between py-2 bg-gray-50 rounded-xl px-3">
          <span className="text-sm text-gray-600">Total</span>
          <span className="text-sm font-semibold text-gray-900">{totalQty} pcs</span>
        </div>
      )}
      <div><Label>Catatan</Label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}

// ├ó┬ö┬Ç├ó┬ö┬Ç PRODUKSI TOKO ├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç
function ProduksiTokoTab({ userId, storeId, role }: { userId: string; storeId: string; role: string }) {
  const isOwnerManager = ['owner', 'manager'].includes(role)
  const [isSyncing, setIsSyncing] = useState(false)
  const [voidTarget, setVoidTarget] = useState<{ id: string; logNumber: string; storeId: string; recipeId: string; totalYield: number } | null>(null)

  const stores = useLiveQuery(() =>
    isOwnerManager
      ? db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
      : Promise.resolve([])
    , [isOwnerManager])

  const setToolbar = useContext(ToolbarCtx)
  const [activeStoreId, setActiveStoreId] = useState(storeId)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    setToolbar(
      <button onClick={() => setShowForm(true)} disabled={isSyncing}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg disabled:opacity-50">
        <Plus size={13} /> Catat
      </button>
    )
    return () => setToolbar(null)
  }, [isSyncing])

  useEffect(() => {
    if (isOwnerManager && (storeId.includes('gudang') || storeId.includes('produksi'))) {
      if (stores && stores.length > 0) setActiveStoreId(stores[0].id)
    }
  }, [stores])

  async function syncStoreRecipes(sid: string) {
    setIsSyncing(true)
    try {
      const today = new Date().toLocaleDateString('sv-SE')
      const [{ data: recs }, { data: items }, { data: logMats }, { data: logs }] = await Promise.all([
        supabase.from('store_recipes').select('*').eq('store_id', sid),
        supabase.from('store_recipe_items').select('*'),
        supabase.from('production_log_materials').select('*'),
        // Pull logs hari ini dari Supabase ├ó┬Ç┬ö termasuk yang sudah di-void dari device lain
        supabase.from('production_logs')
          .select('*')
          .eq('store_id', sid)
          .gte('created_at', `${today}T00:00:00.000Z`),
      ])
      if (recs?.length) await db.store_recipes.bulkPut(recs)
      if (items?.length) await db.store_recipe_items.bulkPut(items)
      if (logMats?.length) await db.production_log_materials.bulkPut(logMats)
      // Update Dexie dengan data terbaru dari Supabase (termasuk status voided)
      if (logs?.length) await db.production_logs.bulkPut(logs)
    } catch (e) {
      console.warn('[ProduksiToko] sync gagal:', e)
    } finally {
      setIsSyncing(false)
    }
  }

  // Realtime subscription ├ó┬Ç┬ö update Dexie otomatis saat ada perubahan production_logs
  useEffect(() => {
    if (!activeStoreId) return

    const channel = supabase
      .channel(`production_logs:${activeStoreId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'production_logs',
          filter: `store_id=eq.${activeStoreId}`,
        },
        async (payload) => {
          console.log('[Realtime] production_logs change:', payload.eventType)
          if (payload.eventType === 'DELETE') {
            await db.production_logs.delete((payload.old as any).id)
          } else if (payload.new) {
            // INSERT atau UPDATE (termasuk saat di-void dari device lain)
            await db.production_logs.put(payload.new as any)
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeStoreId])

  useEffect(() => {
    if (!activeStoreId) return
    syncStoreRecipes(activeStoreId)
  }, [activeStoreId])

  const recipes = useLiveQuery(async () => {
    const all = await db.store_recipes.where('store_id').equals(activeStoreId).toArray()
    return all.filter(r => (r as any).recipe_type === 'production')
  }, [activeStoreId])

  const logs = useLiveQuery(async () => {
    const today = new Date().toLocaleDateString('sv-SE')
    const all = await db.production_logs
      .filter(l => (l as any).store_id === activeStoreId && l.created_at.slice(0, 10) === today)
      .reverse().sortBy('created_at')
    const rMap = Object.fromEntries((await db.store_recipes.toArray()).map(r => [r.id, r]))
    const logMats = await db.production_log_materials.toArray()
    const matDefs = await db.materials.toArray()
    const mMap = Object.fromEntries(matDefs.map(m => [m.id, m]))
    return all.map(l => {
      const materials = logMats.filter(m => m.log_id === l.id).map(m => ({ ...m, material: mMap[m.material_id] }))
      const totalCost = materials.reduce((s, m) => s + m.qty_used * (m.material?.unit_cost || 0), 0)
      const hppPerUnit = l.total_yield > 0 ? totalCost / l.total_yield : 0
      return { ...l, recipe: rMap[(l as any).recipe_id], materials, total_cost: totalCost, hpp_per_unit: hppPerUnit }
    })
  }, [activeStoreId])

  const totalHariIni = logs?.filter(l => (l as any).status !== 'voided').reduce((s, l) => s + l.total_yield, 0) || 0

  // ├ó┬ö┬Ç├ó┬ö┬Ç VOID HANDLER: TOKO ├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç├ó┬ö┬Ç
  // Rollback stok ditangani oleh DB trigger (trigger_rollback_production_stock)
  // Client hanya update status ├ó┬Ç┬ö tidak ada logic stok di sini
  async function handleVoidToko(logId: string, logStoreId: string, recipeId: string, totalYield: number) {
    try {
      // Guard: cek dulu di Supabase ├ó┬Ç┬ö kalau sudah voided, jangan proses lagi
      const { data: existingLog } = await supabase
        .from('production_logs')
        .select('status')
        .eq('id', logId)
        .single()
      if (existingLog?.status === 'voided') {
        toast.error('Produksi ini sudah dibatalkan sebelumnya')
        setVoidTarget(null)
        return
      }

      // Update status voided ├ó┬Ç┬ö DB trigger otomatis rollback stok
      await supabase.from('production_logs').update({
        status: 'voided',
        voided_at: new Date().toISOString(),
      }).eq('id', logId)
      await db.production_logs.update(logId, { status: 'voided', voided_at: now() } as any)

      toast.success('Produksi dibatalkan & stok dikembalikan')
      setVoidTarget(null)
    } catch (e) {
      console.error('[VoidToko]', e)
      toast.error('Gagal membatalkan produksi')
    }
  }

  return (
    <div className="p-4 space-y-4">
      {isOwnerManager && stores && stores.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {stores.map(s => (
            <button key={s.id} onClick={() => setActiveStoreId(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${activeStoreId === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Produksi Hari Ini</p>
          <p className="text-lg font-bold text-gray-900">{totalHariIni}</p>
          <p className="text-xs text-gray-400">{logs?.filter(l => (l as any).status !== 'voided').length || 0} batch</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Resep Tersedia</p>
          <p className="text-lg font-bold text-blue-600">{isSyncing ? '...' : (recipes?.length || 0)}</p>
          <p className="text-xs text-gray-400">jenis produk</p>
        </div>
      </div>

      {isSyncing && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2">
          <RefreshCw size={12} className="animate-spin text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-600">Memuat resep...</p>
        </div>
      )}

      {!isSyncing && recipes?.length === 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
          <p className="text-sm font-medium text-amber-800">Belum ada resep produksi toko</p>
          <p className="text-xs text-amber-600 mt-1">Buat resep di menu Resep ├ó┬å┬Æ Resep Produksi Toko</p>
          <button onClick={() => syncStoreRecipes(activeStoreId)}
            className="mt-2 text-xs text-blue-600 border border-blue-200 px-3 py-1 rounded-lg">
            Sync ulang resep
          </button>
        </div>
      )}

      {logs && logs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-50">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Produksi Hari Ini</p>
          </div>
          {logs.map((l, idx) => {
            const isVoided = (l as any).status === 'voided'
            const logNumber = (l as any).log_number || l.id
            return (
              <div key={l.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} ${isVoided ? 'opacity-50 bg-gray-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {(l as any).log_number && (
                        <p className={`text-xs font-mono text-blue-600 ${isVoided ? 'line-through' : ''}`}>
                          {(l as any).log_number}
                          {!isVoided && <CopyBtn text={(l as any).log_number} />}
                                                    
                        </p>
                      )}
                      {isVoided && (
                        <span className="text-[10px] font-medium text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                          Dibatalkan
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-medium text-gray-900 ${isVoided ? 'line-through' : ''}`}>
                      {(l.recipe as any)?.product_name || 'Produksi'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(l.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {', '}
                      {new Date(l.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      {' ├é┬╖ '}{l.batch_count} batch
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <p className={`text-sm font-bold text-blue-600 ${isVoided ? 'line-through' : ''}`}>
                      {l.total_yield} {(l.recipe as any)?.yield_unit || 'pcs'}
                    </p>
                    {isOwnerManager && !isVoided && (
                      <button
                        onClick={() => setVoidTarget({
                          id: l.id,
                          logNumber,
                          storeId: (l as any).store_id || activeStoreId,
                          recipeId: (l as any).recipe_id,
                          totalYield: l.total_yield,
                        })}
                        className="text-[10px] font-medium text-red-400 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                        Void
                      </button>
                    )}
                  </div>
                </div>
                {!isVoided && (l as any).materials?.length > 0 && (
                  <div className="mt-2 border-t border-gray-50 pt-1.5 space-y-0.5">
                    {(l as any).materials.map((m: any) => (
                      <div key={m.id} className="flex justify-between text-xs text-gray-400">
                        <span>{m.material?.name} ├â┬ù {m.qty_used} {m.material?.unit}{m.material?.unit_cost > 0 ? ` @ ${formatRupiah(m.material.unit_cost)}` : ''}</span>
                        {m.material?.unit_cost > 0 && <span>{formatRupiah(m.qty_used * m.material.unit_cost)}</span>}
                      </div>
                    ))}
                    {(l as any).total_cost > 0 && (
                      <div className="pt-1 border-t border-gray-100 mt-1 space-y-0.5">
                        <div className="flex justify-between text-xs font-medium text-gray-700">
                          <span>Total Biaya Bahan</span>
                          <span>{formatRupiah((l as any).total_cost)}</span>
                        </div>
                        {(l as any).hpp_per_unit > 0 && (
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>HPP per {(l.recipe as any)?.yield_unit || 'pcs'}</span>
                            <span>{formatRupiah((l as any).hpp_per_unit)}</span>
                            {(l.recipe as any)?.yield_unit === 'ml' && (l as any).hpp_per_unit > 0 && (
                              <>
                                <span className="text-gray-400">HPP per porsi (300ml)</span>
                                <span className="text-gray-400">{formatRupiah((l as any).hpp_per_unit * 300)}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <ProduksiTokoForm
          userId={userId}
          storeId={activeStoreId}
          recipes={recipes || []}
          onClose={() => setShowForm(false)}
        />
      )}

      {voidTarget && (
        <VoidConfirmModal
          logNumber={voidTarget.logNumber}
          onConfirm={() => handleVoidToko(voidTarget.id, voidTarget.storeId, voidTarget.recipeId, voidTarget.totalYield)}
          onClose={() => setVoidTarget(null)}
        />
      )}
    </div>
  )
}

function ProduksiTokoForm({ userId, storeId, recipes, onClose }: {
  userId: string; storeId: string; recipes: any[]; onClose: () => void
}) {
  const [recipeId, setRecipeId] = useState('')
  const [batchCount, setBatchCount] = useState('1')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedRecipe = recipes.find(r => r.id === recipeId)
  const batchYield = (selectedRecipe as any)?.batch_yield || 1
  const yieldUnit = (selectedRecipe as any)?.yield_unit || 'pcs'
  const finalYield = Number(batchCount) * batchYield

  async function handleSave() {
    if (!recipeId) return toast.error('Pilih resep')
    if (Number(batchCount) <= 0) return toast.error('Batch harus lebih dari 0')
    setSaving(true)
    try {
      // FIX: refresh stok dari server sebelum produksi supaya data terbaru
      const { data: freshStocks } = await supabase.from('stock').select('*').eq('store_id', storeId)
      if (freshStocks?.length) await db.stock.bulkPut(freshStocks)

      const logId = generateId()
      const ds = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const prefix = `PTOKO-${ds}-`
      const existing = await db.production_logs.filter(l => (l as any).log_number?.startsWith(prefix)).toArray()
      const logNumber = `${prefix}${String(existing.length + 1).padStart(3, '0')}`

      const logData: any = {
        id: logId, log_number: logNumber, recipe_id: recipeId,
        batch_count: Number(batchCount), total_yield: finalYield,
        notes: notes || undefined, created_by: userId, store_id: storeId,
        created_at: now(), status: 'done',
      }
      await db.production_logs.add(logData)
      const { error } = await supabase.from('production_logs').upsert(logData)
      if (error) console.error('[PTOKO LOG ERROR]', error)

      // FIX: query langsung dari Supabase, bukan Dexie
      // Dexie bisa stale ├ó┬Ç┬ö qty_used tersimpan salah (semua jadi 1)
      const { data: riFromSupabase, error: riErr } = await supabase
        .from('store_recipe_items')
        .select('*')
        .eq('recipe_id', recipeId)
      if (riErr) console.error('[PTOKO RI ERROR]', riErr)
      // Fallback ke Dexie kalau Supabase gagal
      const recipeItems = riFromSupabase?.length
        ? riFromSupabase
        : await db.store_recipe_items.where('recipe_id').equals(recipeId).toArray()
      // Sync hasil Supabase ke Dexie supaya konsisten ke depannya
      if (riFromSupabase?.length) await db.store_recipe_items.bulkPut(riFromSupabase)

      for (const ri of recipeItems) {
        const used = ri.qty_used * Number(batchCount)
        const existing = await db.stock
          .filter(s => s.store_id === storeId && (s.ingredient_id === ri.material_id || (s as any).material_id === ri.material_id))
          .first()
        if (existing) {
          const newQty = Math.max(0, existing.qty_on_hand - used)
          await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
          // FIX: await supaya server update tidak fire-and-forget
          await supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', existing.id)
        } else {
          // FIX: kalau tidak ada di Dexie, cek langsung ke server
          const { data: serverStock } = await supabase.from('stock')
            .select('id, qty_on_hand')
            .eq('store_id', storeId)
            .eq('material_id', ri.material_id)
            .maybeSingle()
          if (serverStock) {
            const newQty = Math.max(0, serverStock.qty_on_hand - used)
            await supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', serverStock.id)
            await db.stock.put({ ...serverStock, store_id: storeId, ingredient_id: ri.material_id, material_id: ri.material_id, qty_on_hand: newQty, last_updated: now() })
          } else {
            console.warn('[PTOKO] Stok tidak ditemukan untuk:', ri.material_id)
          }
        }
        const lm: any = { id: generateId(), log_id: logId, material_id: ri.material_id, qty_used: used }
        await db.production_log_materials.add(lm)
        supabase.from('production_log_materials').upsert(lm).then(() => { })
      }

      const productName = (selectedRecipe as any)?.product_name || ''
      if (productName) {
        const mat = await db.materials.filter(m => m.name.toLowerCase() === productName.toLowerCase()).first()
        if (mat) {
          const existing = await db.stock
            .filter(s => s.store_id === storeId && (s.ingredient_id === mat.id || (s as any).material_id === mat.id))
            .first()
          const newQty = (existing?.qty_on_hand || 0) + finalYield
          if (existing) {
            await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
            // FIX: await supaya server update tidak fire-and-forget
            await supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', existing.id)
          } else {
            const newStock: any = { id: generateId(), store_id: storeId, ingredient_id: mat.id, material_id: mat.id, qty_on_hand: newQty, avg_cost: 0, last_updated: now() }
            await db.stock.add(newStock)
            // FIX: await supaya server upsert tidak fire-and-forget
            await supabase.from('stock').upsert(newStock, { onConflict: 'store_id,ingredient_id' })
          }
        }
      }

      toast.success(`${logNumber} ├ó┬Ç┬ö ${finalYield} ${yieldUnit} dicatat`)
      onClose()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Produksi Toko" onClose={onClose}>
      <div>
        <Label required>Pilih Resep</Label>
        {recipes.length === 0 ? (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
            <p className="text-xs text-amber-700">Belum ada resep. Buat di menu Resep ├ó┬å┬Æ Resep Produksi Toko</p>
          </div>
        ) : (
          <select className="input" value={recipeId} onChange={e => setRecipeId(e.target.value)}>
            <option value="">-- Pilih resep --</option>
            {recipes.map(r => (
              <option key={r.id} value={r.id}>{(r as any).product_name}</option>
            ))}
          </select>
        )}
      </div>
      {selectedRecipe && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          <p className="text-xs text-blue-700">1 batch = {batchYield} {yieldUnit}</p>
        </div>
      )}
      <div>
        <Label required>Jumlah Batch</Label>
        <input className="input" type="number" min="1" value={batchCount} onChange={e => setBatchCount(e.target.value)} />
        {selectedRecipe && <p className="text-xs text-gray-400 mt-1">Total: {finalYield} {yieldUnit}</p>}
      </div>
      <div>
        <Label>Catatan</Label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving || recipes.length === 0}
          className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}
