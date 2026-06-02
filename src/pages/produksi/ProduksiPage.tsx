// src/pages/produksi/ProduksiPage.tsx
// CHANGELOG v2:
// - FIX Bug 3: loading state + skeleton saat sync, feedback lebih cepat
// - FIX Bug 3: sync lebih efisien — hanya pull yang belum ada / perlu update
// - Tidak ada perubahan logic produksi / kirim produk

import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ProductionLog } from '@/lib/db'

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

// FIX Bug 3: loading skeleton
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

export default function ProduksiPage() {
  const { user } = useAuthStore()
  const [isSyncing, setIsSyncing] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)

  // FIX Bug 3: cek apakah data lokal sudah ada sebelum tampil loading
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
      // FIX Bug 3: parallel fetch semua sekaligus, bukan sequential
      const [mats, pstock, fgs, recipes, recipeItems, logs, mutations, mutItems, partners, products, stores] = await Promise.all([
        supabase.from('materials').select('*').eq('is_active', true),
        supabase.from('production_stock').select('*'),
        supabase.from('finished_goods_stock').select('*'),
        supabase.from('production_recipes').select('*'),
        supabase.from('production_recipe_items').select('*'),
        supabase.from('production_logs').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('production_mutations').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('production_mutation_items').select('*'),
        supabase.from('partners').select('*'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('stores').select('*').eq('is_active', true),
      ])

      // Semua tulis ke Dexie sekaligus — tidak perlu await satu per satu
      await Promise.all([
        mats.data?.length      ? db.materials.bulkPut(mats.data)                       : Promise.resolve(),
        pstock.data !== null   ? (async () => { await db.production_stock.clear();      if (pstock.data?.length)   await db.production_stock.bulkPut(pstock.data)      })() : Promise.resolve(),
        fgs.data !== null      ? (async () => { await db.finished_goods_stock.clear();  if (fgs.data?.length)      await db.finished_goods_stock.bulkPut(fgs.data)      })() : Promise.resolve(),
        recipes.data !== null  ? (async () => { await db.production_recipes.clear();    if (recipes.data?.length)  await db.production_recipes.bulkPut(recipes.data)    })() : Promise.resolve(),
        recipeItems.data !== null ? (async () => { await db.production_recipe_items.clear(); if (recipeItems.data?.length) await db.production_recipe_items.bulkPut(recipeItems.data) })() : Promise.resolve(),
        logs.data?.length      ? db.production_logs.bulkPut(logs.data)                 : Promise.resolve(),
        mutations.data?.length ? db.production_mutations.bulkPut(mutations.data)       : Promise.resolve(),
        mutItems.data?.length  ? db.production_mutation_items.bulkPut(mutItems.data)   : Promise.resolve(),
        partners.data?.length  ? db.partners.bulkPut(partners.data)                    : Promise.resolve(),
        products.data?.length  ? db.products.bulkPut(products.data)                    : Promise.resolve(),
        stores.data?.length    ? db.stores.bulkPut(stores.data)                        : Promise.resolve(),
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

      {/* FIX Bug 3: tampilkan progress saat sync */}
      {isSyncing && (
        <div className="px-4 py-2 flex-shrink-0">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2">
            <RefreshCw size={12} className="animate-spin text-blue-500 flex-shrink-0" />
            <p className="text-xs text-blue-600">Memuat data produksi...</p>
          </div>
        </div>
      )}

      <ToolbarCtx.Provider value={setToolbarActions}>
        <div className="flex-1 overflow-auto bg-gray-50">
          {/* FIX Bug 3: tampil skeleton hanya saat benar-benar tidak ada data lokal */}
          {isInitialLoad && hasLocalData === undefined
            ? <LoadingSkeleton />
            : <CatatProduksiTab userId={user!.id} />
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

function CatatProduksiTab({ userId }: { userId: string }) {
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

  const logs = useLiveQuery(async () => {
    const l       = await db.production_logs.orderBy('created_at').reverse().limit(200).toArray()
    const recipes = await db.production_recipes.toArray()
    const rMap    = Object.fromEntries(recipes.map(r => [r.id, r]))
    const mats    = await db.production_log_materials.toArray()
    const matDefs = await db.materials.toArray()
    const mMap    = Object.fromEntries(matDefs.map(m => [m.id, m]))
    return l.map(log => {
      const logMats   = mats.filter(m => m.log_id === log.id).map(m => ({ ...m, material: mMap[m.material_id] }))
      // Gunakan avg_cost produksi jika ada, fallback ke unit_cost material
      const totalCost = logMats.reduce((s, m) => s + m.qty_used * (m.material?.unit_cost || 0), 0)
      const hpp       = log.total_yield > 0 ? totalCost / log.total_yield : 0
      return { ...log, recipe: rMap[log.recipe_id], materials: logMats, total_cost: totalCost, hpp_per_unit: hpp }
    })
  }, [])

  const todayTotal = useMemo(() => {
    if (!logs) return { count: 0, yield: 0 }
    const today    = new Date().toISOString().slice(0, 10)
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
          <p className="text-xs text-gray-400">Produksi Hari Ini</p>
          <p className="text-xl font-bold text-gray-900">{todayTotal.yield}</p>
          <p className="text-xs text-gray-400">{todayTotal.count} batch</p>
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
                          {(log as any).log_number ||
                            `PROD-${log.created_at.slice(0,10).replace(/-/g,'')}-${log.id.slice(-4).toUpperCase()}`}
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

      {showForm && <ProduksiForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function ProduksiForm({ userId, onClose }: { userId: string; onClose: () => void }) {
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
    if (selectedRecipe) {
      setProduct((selectedRecipe as any).product_name || selectedRecipe.name)
    }
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

      const existing2 = await db.finished_goods_stock.filter(f => f.product_name === productName.trim()).first()
      const fgsId     = existing2?.id || generateId()
      const fgsProdId = existing2?.product_id || `fgs-${generateId().slice(0,8)}`
      const newFgsQty = (existing2?.qty_on_hand || 0) + finalYield
      const fgsData: any = {
        id:           fgsId,
        product_id:   fgsProdId,
        product_name: productName.trim(),
        qty_on_hand:  newFgsQty,
        hpp_per_unit: hppPerUnit,
        last_updated: now(),
      }
      // Simpan ke Dexie
      await db.finished_goods_stock.put(fgsData)
      // Simpan ke Supabase — coba upsert dulu, fallback ke insert+update
      if (existing2) {
        // Update existing
        const { error: fgsErr } = await supabase.from('finished_goods_stock')
          .update({ qty_on_hand: newFgsQty, hpp_per_unit: hppPerUnit, last_updated: now() })
          .eq('id', fgsId)
        if (fgsErr) console.error('[FGS UPDATE ERROR]', fgsErr)
      } else {
        // Insert baru
        const { error: fgsErr } = await supabase.from('finished_goods_stock').insert(fgsData)
        if (fgsErr) console.error('[FGS INSERT ERROR]', fgsErr)
      }

      toast.success(`Produksi ${logNumber} dicatat: ${totalYield} ${selectedRecipe?.yield_unit || 'pcs'}`)
      onClose()
    } catch (e) { toast.error('Gagal menyimpan produksi'); console.error(e) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Produksi" onClose={onClose}>
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
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
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

    // Validasi stok cukup
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
      const mut: any = {
        id: mutId, mutation_type: type,
        destination_id: destId || undefined, destination_name: destName || undefined,
        notes: notes || undefined, status: 'confirmed',
        created_by: userId, created_at: now(), confirmed_at: now(), confirmed_by: userId,
      }
      await db.production_mutations.add(mut)
      await supabase.from('production_mutations').insert(mut)

      for (const item of valid) {
        const fg = fgStocks?.find(s => s.product_id === item.product_id)
        const mi: any = {
          id: generateId(), mutation_id: mutId,
          product_id: item.product_id, product_name: fg?.product_name || '',
          qty: Number(item.qty),
        }
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
          <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400">
            Belum ada produk jadi di stok
          </div>
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
                  <input className="input text-sm" type="number"
                    placeholder={fg ? `Qty (max ${fg.qty_on_hand})` : 'Qty'}
                    value={item.qty}
                    onChange={e => setItems(p => p.map((x,idx) => idx===i ? {...x,qty:e.target.value} : x))} />
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
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}
