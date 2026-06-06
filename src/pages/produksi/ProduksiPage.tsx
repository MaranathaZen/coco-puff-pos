// src/pages/produksi/ProduksiPage.tsx
// CHANGELOG v4:
// - FIX: CatatProduksiTab logs query — hapus referensi activeStoreId yang tidak ada di scope
// - FIX: ProduksiTokoTab logs query — tambah load materials untuk detail bahan
// - FIX: tag penutup </div> yang kurang di ProduksiTokoTab
// - FIX: syncStoreRecipes tambah production_log_materials

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
function groupLabel(dateStr: string, mode: 'hari'|'bulan'|'tahun'): string {
  const d = new Date(dateStr)
  if (mode === 'hari')  return d.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  if (mode === 'bulan') return d.toLocaleDateString('id-ID', { month:'long', year:'numeric' })
  return String(d.getFullYear())
}
function groupKey(dateStr: string, mode: 'hari'|'bulan'|'tahun'): string {
  if (mode === 'hari')  return dateStr.slice(0,10)
  if (mode === 'bulan') return dateStr.slice(0,7)
  return dateStr.slice(0,4)
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

function GroupSelect({ value, onChange }: { value: 'hari'|'bulan'|'tahun'; onChange: (v: 'hari'|'bulan'|'tahun') => void }) {
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

const ToolbarCtx = createContext<(node: React.ReactNode) => void>(() => {})

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-600 ml-1 align-middle">
      {copied ? '✓' : '⧉'}
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
      {[1,2,3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-20" />
      ))}
    </div>
  )
}

type ProduksiTab = 'divisi' | 'toko'

export default function ProduksiPage() {
  const { user } = useAuthStore()
  const role = user?.role || 'produksi'
  const isOwnerManager = ['owner','manager'].includes(role)
  const canSeeToko   = ['owner','manager','kasir'].includes(role)
  const canSeeDivisi = ['owner','manager','produksi'].includes(role)
  const defaultTab: ProduksiTab = canSeeDivisi ? 'divisi' : 'toko'
  const [activeTab,      setActiveTab]      = useState<ProduksiTab>(defaultTab)
  const [isSyncing,      setIsSyncing]      = useState(false)
  const [isInitialLoad,  setIsInitialLoad]  = useState(true)
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)

  const hasLocalData = useLiveQuery(async () => {
    const count = await db.production_recipes.count()
    return count > 0
  }, [])

  useEffect(() => {
    if (hasLocalData !== undefined) setIsInitialLoad(false)
  }, [hasLocalData])

  async function syncData() {
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
        mats.data?.length         ? db.materials.bulkPut(mats.data)                           : Promise.resolve(),
        pstock.data !== null      ? (async () => { await db.production_stock.clear();          if (pstock.data?.length)       await db.production_stock.bulkPut(pstock.data)       })() : Promise.resolve(),
        fgs.data?.length          ? db.finished_goods_stock.bulkPut(fgs.data)                 : Promise.resolve(),
        recipes.data !== null     ? (async () => { await db.production_recipes.clear();        if (recipes.data?.length)      await db.production_recipes.bulkPut(recipes.data)     })() : Promise.resolve(),
        recipeItems.data !== null ? (async () => { await db.production_recipe_items.clear();   if (recipeItems.data?.length)  await db.production_recipe_items.bulkPut(recipeItems.data) })() : Promise.resolve(),
        logs.data?.length         ? db.production_logs.bulkPut(logs.data)                     : Promise.resolve(),
        logMats.data?.length      ? db.production_log_materials.bulkPut(logMats.data)         : Promise.resolve(),
        mutations.data?.length    ? db.production_mutations.bulkPut(mutations.data)           : Promise.resolve(),
        mutItems.data?.length     ? db.production_mutation_items.bulkPut(mutItems.data)       : Promise.resolve(),
        partners.data?.length     ? db.partners.bulkPut(partners.data)                        : Promise.resolve(),
        products.data?.length     ? db.products.bulkPut(products.data)                        : Promise.resolve(),
        stores.data?.length       ? db.stores.bulkPut(stores.data)                            : Promise.resolve(),
        (storeRecipes as any).data?.length     ? db.store_recipes.bulkPut((storeRecipes as any).data)          : Promise.resolve(),
        (storeRecipeItems as any).data?.length ? db.store_recipe_items.bulkPut((storeRecipeItems as any).data) : Promise.resolve(),
      ])

      toast.success('Data produksi diperbarui')
    } catch (e) {
      console.error('[ProduksiPage sync]', e)
      toast.error('Gagal sync data')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
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
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab==='divisi'?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
            🏭 Divisi Produksi
          </button>
          <button onClick={() => setActiveTab('toko')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab==='toko'?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
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

// ── DIVISI PRODUKSI ───────────────────────────────────────────
function CatatProduksiTab({ userId, isOwnerManager }: { userId: string; isOwnerManager?: boolean }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm,       setShowForm]       = useState(false)
  const [groupMode,      setGroupMode]      = useState<'hari'|'bulan'|'tahun'>('hari')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const today = new Date().toISOString().slice(0, 10)
    return { [today]: true }
  })
  const [search, setSearch] = useState('')

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

  // FIX: hanya load log divisi produksi — yang TIDAK punya store_id (bukan log produksi toko)
  const logs = useLiveQuery(async () => {
    const all     = await db.production_logs.orderBy('created_at').reverse().limit(200).toArray()
    const l       = all.filter(log => !(log as any).store_id)
    const recipes = await db.production_recipes.toArray()
    const rMap    = Object.fromEntries(recipes.map(r => [r.id, r]))
    const mats    = await db.production_log_materials.toArray()
    const matDefs = await db.materials.toArray()
    const mMap    = Object.fromEntries(matDefs.map(m => [m.id, m]))
    return l.map(log => {
      const logMats   = mats.filter(m => m.log_id === log.id).map(m => ({ ...m, material: mMap[m.material_id] }))
      const totalCost = logMats.reduce((s, m) => s + m.qty_used * (m.material?.unit_cost || 0), 0)
      const hpp       = log.total_yield > 0 ? totalCost / log.total_yield : 0
      return { ...log, recipe: rMap[log.recipe_id], materials: logMats, total_cost: totalCost, hpp_per_unit: hpp }
    })
  }, [])

  const todayTotal = useMemo(() => {
    if (!logs) return { count: 0, yield: 0 }
    const today     = new Date().toISOString().slice(0, 10)
    const todayLogs = logs.filter(l => l.created_at.slice(0,10) === today)
    return { count: todayLogs.length, yield: todayLogs.reduce((s, l) => s + l.total_yield, 0) }
  }, [logs])

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

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Produksi Bulan Ini</p>
          <p className="text-xl font-bold text-gray-900">{logs?.filter(l => l.created_at.slice(0,7) === new Date().toISOString().slice(0,7)).reduce((s,l) => s + l.total_yield, 0) || 0}</p>
          <p className="text-xs text-gray-400">{logs?.filter(l => l.created_at.slice(0,7) === new Date().toISOString().slice(0,7)).length || 0} batch</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Total Semua</p>
          <p className="text-xl font-bold text-gray-900">{logs?.reduce((s,l) => s + l.total_yield, 0) || 0}</p>
          <p className="text-xs text-gray-400">{logs?.length || 0} produksi</p>
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
          const today    = new Date().toISOString().slice(0,10)
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
                {grpItems.map((log, idx) => (
                  <div key={log.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-blue-600 mb-0.5">
                          {(log as any).log_number || `PROD-${log.created_at.slice(0,10).replace(/-/g,'')}-${log.id.slice(-4).toUpperCase()}`}
                          <CopyBtn text={log.id} />
                        </p>
                        <p className="text-sm font-medium text-gray-900">{log.recipe?.name || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(log.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}
                          {', '}
                          {new Date(log.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                          {' · '}{log.batch_count} batch
                          {log.notes && ` · ${log.notes}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold text-gray-900">{log.total_yield} {log.recipe?.yield_unit || 'pcs'}</p>
                      </div>
                    </div>
                    {log.materials.length > 0 && (
                      <div className="mt-1.5 border-t border-gray-50 pt-1.5 space-y-0.5">
                        {log.materials.map(m => (
                          <div key={m.id} className="flex justify-between text-xs text-gray-400">
                            <span>{m.material?.name} × {m.qty_used} {m.material?.unit} @ {formatRupiah(m.material?.unit_cost || 0)}</span>
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
                ))}
              </div>
            </div>
          )
        })
      })()}

      {showForm && <ProduksiForm userId={userId} isOwnerManager={isOwnerManager} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function ProduksiForm({ userId, isOwnerManager, onClose }: { userId: string; isOwnerManager?: boolean; onClose: () => void }) {
  const allStores = useLiveQuery(() =>
    isOwnerManager ? db.stores.filter(s => s.is_active).toArray() : Promise.resolve([])
  , [isOwnerManager])

  const [inputAsStore, setInputAsStore] = useState('')
  const recipes = useLiveQuery(() => db.production_recipes.filter(r => r.is_active).toArray(), [])

  const [recipeId,    setRecipeId]    = useState('')
  const [batchCount,  setBatch]       = useState('1')
  const [productName, setProduct]     = useState('')
  const [actualYield, setActualYield] = useState('')
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  const selectedRecipe = recipes?.find(r => r.id === recipeId)
  const estimatedYield = selectedRecipe ? selectedRecipe.batch_yield * Number(batchCount) : 0
  const totalYield     = actualYield && Number(actualYield) > 0 ? Number(actualYield) : estimatedYield

  useEffect(() => {
    if (selectedRecipe) setProduct((selectedRecipe as any).product_name || selectedRecipe.name)
  }, [recipeId])

  async function handleSave() {
    if (!recipeId)               return toast.error('Pilih resep')
    if (!productName.trim())     return toast.error('Nama produk wajib diisi')
    if (Number(batchCount) <= 0) return toast.error('Jumlah batch harus lebih dari 0')
    setSaving(true)
    try {
      const recipeItems = await db.production_recipe_items.where('recipe_id').equals(recipeId).toArray()
      const matDefs     = await db.materials.toArray()
      const mMap        = Object.fromEntries(matDefs.map(m => [m.id, m]))
      const finalYield  = actualYield && Number(actualYield) > 0 ? Number(actualYield) : estimatedYield
      const totalCost   = recipeItems.reduce((s, ri) => s + ri.qty_per_batch * Number(batchCount) * (mMap[ri.material_id]?.unit_cost || 0), 0)
      const hppPerUnit  = finalYield > 0 ? totalCost / finalYield : 0

      const logDate   = new Date().toISOString().slice(0,10).replace(/-/g,'')
      const logPrefix = `PROD-${logDate}-`
      const existing  = await db.production_logs.filter(l => (l as any).log_number?.startsWith(logPrefix)).toArray()
      const logNumber = `${logPrefix}${String(existing.length + 1).padStart(3,'0')}`

      const logId = generateId()
      const log: any = {
        id: logId, log_number: logNumber, recipe_id: recipeId,
        batch_count: Number(batchCount), total_yield: finalYield,
        notes: notes || undefined, created_by: userId, created_at: now(),
      }
      await db.production_logs.add(log)
      await supabase.from('production_logs').insert(log)

      for (const ri of recipeItems) {
        const qtyUsed = ri.qty_per_batch * Number(batchCount)
        const logMat: any = { id: generateId(), log_id: logId, material_id: ri.material_id, qty_used: qtyUsed }
        await db.production_log_materials.add(logMat)
        await supabase.from('production_log_materials').insert(logMat)

        const ps = await db.production_stock.where('material_id').equals(ri.material_id).first()
        if (ps) {
          const newQty = Math.max(0, ps.qty_on_hand - qtyUsed)
          await db.production_stock.update(ps.id, { qty_on_hand: newQty, last_updated: now() })
          await supabase.from('production_stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', ps.id)
        }
      }

      // FIX: cari material yang namanya sama dengan produk yang dihasilkan
      // Kalau ada di materials → pakai ID-nya supaya konsisten dengan resep BOM kasir
      // Kalau tidak ada → buat material baru sekalian supaya stok kasir bisa match
      const existingMat = await db.materials.filter(m =>
        m.name.toLowerCase() === productName.trim().toLowerCase()
      ).first()

      let fgsProductId: string
      if (existingMat) {
        // Pakai ID material yang sudah ada
        fgsProductId = existingMat.id
      } else {
        // Buat material baru dengan ID yang konsisten
        const newMatId = `mat-${generateId().slice(0,8)}`
        const newMat: any = {
          id: newMatId, name: productName.trim(), unit: selectedRecipe?.yield_unit || 'pcs',
          unit_cost: hppPerUnit, min_stock: 0, category: 'bahan_setengah_jadi',
          is_active: true, created_at: now(), updated_at: now(),
        }
        await db.materials.put(newMat)
        await supabase.from('materials').upsert(newMat)
        fgsProductId = newMatId
      }

      // Update HPP di materials supaya resep BOM bisa hitung biaya
      if (hppPerUnit > 0) {
        await db.materials.update(fgsProductId, { unit_cost: hppPerUnit, avg_cost: hppPerUnit, updated_at: now() } as any)
        await supabase.from('materials').update({ unit_cost: hppPerUnit, avg_cost: hppPerUnit }).eq('id', fgsProductId)
      }

      const existing2 = await db.finished_goods_stock.filter(f =>
        f.product_name === productName.trim() || f.product_id === fgsProductId
      ).first()
      const fgsId     = existing2?.id || generateId()
      const newFgsQty = (existing2?.qty_on_hand || 0) + finalYield
      const fgsData: any = { id: fgsId, product_id: fgsProductId, product_name: productName.trim(), qty_on_hand: newFgsQty, hpp_per_unit: hppPerUnit, last_updated: now() }
      await db.finished_goods_stock.put(fgsData)
      if (existing2) {
        await supabase.from('finished_goods_stock').update({ qty_on_hand: newFgsQty, hpp_per_unit: hppPerUnit, last_updated: now() }).eq('id', fgsId)
      } else {
        const { error } = await supabase.from('finished_goods_stock').insert(fgsData)
        if (error) await supabase.from('finished_goods_stock').upsert(fgsData)
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
              <option key={s.id} value={s.id}>{s.name.replace(' Malang','').replace(' Bali','')}</option>
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
          <p className="text-xs text-amber-600 mt-1.5">⚠ Belum ada resep. Buat resep di menu Resep terlebih dahulu.</p>
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
  const stores   = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])
  const partners = useLiveQuery(() => db.partners.filter(p => p.is_active).toArray(), [])
  const fgStocks = useLiveQuery(() => db.finished_goods_stock.filter(f => f.qty_on_hand > 0).toArray(), [])

  const [type,   setType]   = useState<'to_store'|'to_partner'|'return_from_store'|'adjustment'>('to_store')
  const [destId, setDestId] = useState('')
  const [notes,  setNotes]  = useState('')
  const [items,  setItems]  = useState<{ product_id: string; qty: string }[]>([{ product_id: '', qty: '' }])
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
      await supabase.from('production_mutations').insert(mut)
      for (const item of valid) {
        const fg = fgStocks?.find(s => s.product_id === item.product_id)
        const mi: any = { id: generateId(), mutation_id: mutId, product_id: item.product_id, product_name: fg?.product_name || '', qty: Number(item.qty) }
        await db.production_mutation_items.add(mi)
        await supabase.from('production_mutation_items').insert(mi)
        if (fg) {
          const isReturn = type === 'return_from_store'
          const newQty   = isReturn ? fg.qty_on_hand + Number(item.qty) : Math.max(0, fg.qty_on_hand - Number(item.qty))
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
          {([{v:'to_store',l:'→ Toko'},{v:'to_partner',l:'→ Franchise'},{v:'return_from_store',l:'← Retur'},{v:'adjustment',l:'Koreksi'}] as const).map(t => (
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
                    onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x,product_id:e.target.value,qty:''} : x))}>
                    <option value="">Pilih produk</option>
                    {fgStocks?.map(s => <option key={s.product_id} value={s.product_id}>{s.product_name} (stok: {s.qty_on_hand})</option>)}
                  </select>
                  <input className="input text-sm" type="number" placeholder={fg ? `Qty (max ${fg.qty_on_hand})` : 'Qty'}
                    value={item.qty} onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x,qty:e.target.value} : x))} />
                  {items.length > 1 && <button onClick={() => setItems(p => p.filter((_,idx) => idx!==i))} className="text-xs text-red-500">Hapus</button>}
                </div>
              )
            })}
            <button onClick={() => setItems(p => [...p, {product_id:'',qty:''}])} className="text-sm text-blue-600 font-medium">+ Tambah Produk</button>
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

// ── PRODUKSI TOKO ─────────────────────────────────────────────
function ProduksiTokoTab({ userId, storeId, role }: { userId: string; storeId: string; role: string }) {
  const isOwnerManager = ['owner','manager'].includes(role)
  const [isSyncing, setIsSyncing] = useState(false)

  const stores = useLiveQuery(() =>
    isOwnerManager
      ? db.stores.filter(s => s.is_active && !s.id.includes('gudang') && !s.id.includes('produksi')).toArray()
      : Promise.resolve([])
  , [isOwnerManager])

  const setToolbar = useContext(ToolbarCtx)
  const [activeStoreId, setActiveStoreId] = useState(storeId)
  const [showForm, setShowForm] = useState(false)

  // Button Catat di toolbar kanan atas (sama seperti tab divisi)
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
      const [{ data: recs }, { data: items }, { data: logMats }] = await Promise.all([
        supabase.from('store_recipes').select('*').eq('store_id', sid),
        supabase.from('store_recipe_items').select('*'),
        supabase.from('production_log_materials').select('*'),
      ])
      if (recs?.length)    await db.store_recipes.bulkPut(recs)
      if (items?.length)   await db.store_recipe_items.bulkPut(items)
      if (logMats?.length) await db.production_log_materials.bulkPut(logMats)
      console.log('[ProduksiToko] sync done:', recs?.length, 'resep,', items?.length, 'items,', logMats?.length, 'log materials')
    } catch (e) {
      console.warn('[ProduksiToko] sync gagal:', e)
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    if (!activeStoreId) return
    syncStoreRecipes(activeStoreId)
  }, [activeStoreId])

  const recipes = useLiveQuery(async () => {
    const all = await db.store_recipes.where('store_id').equals(activeStoreId).toArray()
    return all.filter(r => (r as any).recipe_type === 'production')
  }, [activeStoreId])

  // FIX: load materials untuk detail bahan di log produksi toko
  const logs = useLiveQuery(async () => {
    const today = new Date().toLocaleDateString('sv-SE')
    const all = await db.production_logs
      .filter(l => (l as any).store_id === activeStoreId && l.created_at.slice(0, 10) === today)
      .reverse().sortBy('created_at')
    const rMap    = Object.fromEntries((await db.store_recipes.toArray()).map(r => [r.id, r]))
    const logMats = await db.production_log_materials.toArray()
    const matDefs = await db.materials.toArray()
    const mMap    = Object.fromEntries(matDefs.map(m => [m.id, m]))
    return all.map(l => {
      const materials  = logMats.filter(m => m.log_id === l.id).map(m => ({ ...m, material: mMap[m.material_id] }))
      const totalCost  = materials.reduce((s, m) => s + m.qty_used * (m.material?.unit_cost || 0), 0)
      const hppPerUnit = l.total_yield > 0 ? totalCost / l.total_yield : 0
      return { ...l, recipe: rMap[(l as any).recipe_id], materials, total_cost: totalCost, hpp_per_unit: hppPerUnit }
    })
  }, [activeStoreId])

  const totalHariIni = logs?.reduce((s, l) => s + l.total_yield, 0) || 0

  return (
    <div className="p-4 space-y-4">
      {isOwnerManager && stores && stores.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {stores.map(s => (
            <button key={s.id} onClick={() => setActiveStoreId(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${activeStoreId===s.id?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Produksi Hari Ini</p>
          <p className="text-lg font-bold text-gray-900">{totalHariIni}</p>
          <p className="text-xs text-gray-400">{logs?.length || 0} batch</p>
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
          <p className="text-xs text-amber-600 mt-1">Buat resep di menu Resep → Resep Produksi Toko</p>
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
          {logs.map((l, idx) => (
            <div key={l.id} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {(l as any).log_number && (
                    <p className="text-xs font-mono text-blue-600 mb-0.5">
                      {(l as any).log_number}
                      {/* FIX #2: tambah CopyBtn di log produksi toko */}
                      <CopyBtn text={(l as any).log_number} />
                    </p>
                  )}
                  <p className="text-sm font-medium text-gray-900">{(l.recipe as any)?.product_name || 'Produksi'}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(l.created_at).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit',hour12:false})}
                    {' · '}{l.batch_count} batch
                  </p>
                </div>
                <p className="text-sm font-bold text-blue-600 flex-shrink-0 ml-3">
                  {l.total_yield} {(l.recipe as any)?.yield_unit || 'pcs'}
                </p>
              </div>
              {(l as any).materials?.length > 0 && (
                <div className="mt-2 border-t border-gray-50 pt-1.5 space-y-0.5">
                  {(l as any).materials.map((m: any) => (
                    <div key={m.id} className="flex justify-between text-xs text-gray-400">
                      <span>{m.material?.name} × {m.qty_used} {m.material?.unit}{m.material?.unit_cost > 0 ? ` @ ${formatRupiah(m.material.unit_cost)}` : ''}</span>
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
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
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
    </div>
  )
}

function ProduksiTokoForm({ userId, storeId, recipes, onClose }: {
  userId: string; storeId: string; recipes: any[]; onClose: () => void
}) {
  const [recipeId,   setRecipeId]   = useState('')
  const [batchCount, setBatchCount] = useState('1')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)

  const selectedRecipe = recipes.find(r => r.id === recipeId)
  const batchYield = (selectedRecipe as any)?.batch_yield || 1
  const yieldUnit  = (selectedRecipe as any)?.yield_unit || 'pcs'
  const finalYield = Number(batchCount) * batchYield

  async function handleSave() {
    if (!recipeId)               return toast.error('Pilih resep')
    if (Number(batchCount) <= 0) return toast.error('Batch harus lebih dari 0')
    setSaving(true)
    try {
      const logId    = generateId()
      const ds       = new Date().toISOString().slice(0,10).replace(/-/g,'')
      const prefix   = `PTOKO-${ds}-`
      const existing = await db.production_logs.filter(l => (l as any).log_number?.startsWith(prefix)).toArray()
      const logNumber = `${prefix}${String(existing.length + 1).padStart(3,'0')}`

      const logData: any = {
        id: logId, log_number: logNumber, recipe_id: recipeId,
        batch_count: Number(batchCount), total_yield: finalYield,
        notes: notes || undefined, created_by: userId, store_id: storeId, created_at: now(),
      }
      await db.production_logs.add(logData)
      const { error } = await supabase.from('production_logs').insert(logData)
      if (error) console.error('[PTOKO LOG ERROR]', error)

      const recipeItems = await db.store_recipe_items.where('recipe_id').equals(recipeId).toArray()
      for (const ri of recipeItems) {
        const used     = ri.qty_used * Number(batchCount)
        const existing = await db.stock
          .filter(s => s.store_id === storeId && (s.ingredient_id === ri.material_id || (s as any).material_id === ri.material_id))
          .first()
        if (existing) {
          const newQty = Math.max(0, existing.qty_on_hand - used)
          await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
          supabase.from('stock').update({ qty_on_hand: newQty }).eq('id', existing.id).then(() => {})
        }
        const lm: any = { id: generateId(), log_id: logId, material_id: ri.material_id, qty_used: used }
        await db.production_log_materials.add(lm)
        supabase.from('production_log_materials').insert(lm).then(() => {})
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
            supabase.from('stock').update({ qty_on_hand: newQty }).eq('id', existing.id).then(() => {})
          } else {
            const newStock: any = { id: generateId(), store_id: storeId, ingredient_id: mat.id, material_id: mat.id, qty_on_hand: newQty, avg_cost: 0, last_updated: now() }
            await db.stock.add(newStock)
            supabase.from('stock').insert(newStock).then(() => {})
          }
        }
      }

      toast.success(`${logNumber} — ${finalYield} ${yieldUnit} dicatat`)
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
            <p className="text-xs text-amber-700">Belum ada resep. Buat di menu Resep → Resep Produksi Toko</p>
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
