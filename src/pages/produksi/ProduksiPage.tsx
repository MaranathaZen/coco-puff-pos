// src/pages/produksi/ProduksiPage.tsx
import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah, formatDate } from '@/lib/utils'
import { Plus, RefreshCw, X, FlaskConical, Package, ArrowRightLeft, ChevronRight, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ProductionRecipe, ProductionRecipeItem, ProductionLog, ProductionMutation, ProductionMutationItem } from '@/lib/db'


// ── Helpers ───────────────────────────────────────────────────
function groupBy<T>(arr: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const k = keyFn(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
}

function groupLabel(dateStr: string, mode: 'hari'|'bulan'|'tahun'): string {
  const d = new Date(dateStr)
  if (mode === 'hari')   return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (mode === 'bulan')  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  return String(d.getFullYear())
}

function groupKey(dateStr: string, mode: 'hari'|'bulan'|'tahun'): string {
  if (mode === 'hari')  return dateStr.slice(0, 10)
  if (mode === 'bulan') return dateStr.slice(0, 7)
  return dateStr.slice(0, 4)
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-1 py-1.5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <span className="text-xs text-gray-400">{count} item</span>
    </div>
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

// Context untuk toolbar
const ToolbarCtx = createContext<(node: React.ReactNode) => void>(() => {})

type Tab = 'produksi'

// Produk setengah jadi (hasil produksi, bukan produk menu kasir)
// Ini yang diproduksi oleh tim produksi: Puff kosong, Fla, dll
const PRODUK_SETENGAH_JADI_KATEGORI = ['bahan_setengah_jadi']

export default function ProduksiPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('produksi')
  const [isSyncing, setIsSyncing] = useState(false)
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)

  async function syncData() {
    setIsSyncing(true)
    try {
      const tables = [
        ['materials',               supabase.from('materials').select('*').eq('is_active', true)],
        ['production_stock',        supabase.from('production_stock').select('*')],
        ['finished_goods_stock',    supabase.from('finished_goods_stock').select('*')],
        ['production_recipes',      supabase.from('production_recipes').select('*')],
        ['production_recipe_items', supabase.from('production_recipe_items').select('*')],
        ['production_logs',         supabase.from('production_logs').select('*').order('created_at', { ascending: false }).limit(50)],
        ['production_mutations',    supabase.from('production_mutations').select('*').order('created_at', { ascending: false }).limit(50)],
        ['production_mutation_items', supabase.from('production_mutation_items').select('*')],
        ['partners',                supabase.from('partners').select('*')],
        ['products',                supabase.from('products').select('*').eq('is_active', true)],
      ] as const

      for (const [table, query] of tables) {
        const { data } = await query
        if (data?.length) await (db as any)[table].bulkPut(data)
      }
      toast.success('Data produksi diperbarui')
    } catch {
      toast.error('Gagal sync data')
    } finally {
      setIsSyncing(false)
    }
  }

  const TABS = [
    { id: 'produksi', label: 'Produksi', icon: FlaskConical },
  ] as const

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Produksi</h1>
        <div className="flex items-center gap-2">
          {toolbarActions}
          <button onClick={syncData} disabled={isSyncing} className="p-2 rounded-full text-gray-400 hover:text-gray-600">
            <RefreshCw size={16} className={isSyncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>



      <ToolbarCtx.Provider value={setToolbarActions}>
        <div className="flex-1 overflow-auto bg-gray-50">
          {tab === 'produksi' && <CatatProduksiTab userId={user!.id} />}
        </div>
      </ToolbarCtx.Provider>
    </div>
  )
}

// ── Modal base — center seperti gudang ────────────────────────
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

// ── STOK PRODUKSI ─────────────────────────────────────────────
function StokProduksiTab() {
  const stocks = useLiveQuery(async () => {
    const ps     = await db.production_stock.toArray()
    const mats   = await db.materials.toArray()
    const matMap = Object.fromEntries(mats.map(m => [m.id, m]))
    return ps.map(s => ({ ...s, material: matMap[s.material_id] }))
  }, [])

  const fgStocks = useLiveQuery(() => db.finished_goods_stock.toArray(), [])

  const totalNilaiBahan = useMemo(() =>
    (stocks || []).reduce((s, i) => s + i.qty_on_hand * (i.material?.unit_cost || 0), 0), [stocks])

  const totalQtyProdukJadi = useMemo(() =>
    (fgStocks || []).reduce((s, i) => s + i.qty_on_hand, 0), [fgStocks])

  return (
    <div className="p-4 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400 mb-0.5">Nilai Bahan Baku</p>
          <p className="text-base font-semibold text-gray-900 truncate">{formatRupiah(totalNilaiBahan)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{stocks?.length || 0} jenis bahan</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400 mb-0.5">Produk Siap Kirim</p>
          <p className="text-base font-semibold text-brand-600">{totalQtyProdukJadi} pcs</p>
          <p className="text-xs text-gray-400 mt-0.5">{fgStocks?.length || 0} jenis produk</p>
        </div>
      </div>

      {/* Produk siap kirim — di atas stok bahan */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Produk Siap Kirim</p>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {fgStocks?.map((s, idx) => (
            <div key={s.id} className={`flex items-center justify-between px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
              <div>
                <p className="text-sm font-medium text-gray-800">{s.product_name}</p>
                <p className="text-xs text-gray-400">Siap kirim ke toko/franchise</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-brand-600">{s.qty_on_hand} pcs</p>
              </div>
            </div>
          ))}
          {!fgStocks?.length && <div className="py-6 text-center text-sm text-gray-400">Belum ada produk siap kirim</div>}
        </div>
      </div>

      {/* Stok bahan */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Stok Bahan Baku</p>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {stocks?.map((s, idx) => (
            <div key={s.id} className={`flex items-center justify-between px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{s.material?.name || '-'}</p>
                <p className="text-xs text-gray-400">Avg {formatRupiah(s.material?.unit_cost || 0)}/{s.material?.unit}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {s.qty_on_hand} <span className="font-normal text-gray-400 text-xs">{s.material?.unit}</span>
                </p>
                <p className="text-xs text-gray-400">{formatRupiah(s.qty_on_hand * (s.material?.unit_cost || 0))}</p>
              </div>
            </div>
          ))}
          {!stocks?.length && <div className="py-8 text-center text-sm text-gray-400">Belum ada stok bahan di produksi</div>}
        </div>
      </div>


    </div>
  )
}

// ── CATAT PRODUKSI ────────────────────────────────────────────
function CatatProduksiTab({ userId }: { userId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const { user } = useAuthStore()
  const [showForm, setShowForm]     = useState(false)
  const [showResep, setShowResep]   = useState(false)
  const [editResep, setEditResep]   = useState<any | null>(null)
  const [groupMode, setGroupMode]   = useState<'hari'|'bulan'|'tahun'>('hari')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg active:bg-gray-50">
          <Plus size={13} /> Catat
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const logs = useLiveQuery(async () => {
    const l       = await db.production_logs.orderBy('created_at').reverse().limit(50).toArray()
    const recipes = await db.production_recipes.toArray()
    const rMap    = Object.fromEntries(recipes.map(r => [r.id, r]))
    const mats    = await db.production_log_materials.toArray()
    const matDefs = await db.materials.toArray()
    const mMap    = Object.fromEntries(matDefs.map(m => [m.id, m]))
    return l.map(log => {
      const logMats = mats.filter(m => m.log_id === log.id).map(m => ({ ...m, material: mMap[m.material_id] }))
      // HPP = total biaya bahan / total hasil produksi
      const totalCost = logMats.reduce((s, m) => s + m.qty_used * (m.material?.unit_cost || 0), 0)
      const hpp = log.total_yield > 0 ? totalCost / log.total_yield : 0
      return {
        ...log,
        recipe: rMap[log.recipe_id],
        materials: logMats,
        total_cost: totalCost,
        hpp_per_unit: hpp,
      }
    })
  }, [])

  const recipes = useLiveQuery(async () => {
    const r     = await db.production_recipes.toArray()
    const items = await db.production_recipe_items.toArray()
    const mats  = await db.materials.toArray()
    const mMap  = Object.fromEntries(mats.map(m => [m.id, m]))
    return r.map(recipe => ({
      ...recipe,
      items: items.filter(i => i.recipe_id === recipe.id).map(i => ({ ...i, material: mMap[i.material_id] }))
    }))
  }, [])

  // Summary hari ini
  const todayTotal = useMemo(() => {
    if (!logs) return { count: 0, yield: 0 }
    const today = new Date().toISOString().slice(0, 10)
    const todayLogs = logs.filter(l => l.created_at.slice(0, 10) === today)
    return { count: todayLogs.length, yield: todayLogs.reduce((s, l) => s + l.total_yield, 0) }
  }, [logs])

  const [search, setSearch] = useState('')

  const filteredLogs = useMemo(() => {
    if (!logs || !search) return logs || []
    const q = search.toLowerCase()
    return logs.filter(l =>
      l.recipe?.name?.toLowerCase().includes(q) ||
      (l as any).productName?.toLowerCase().includes(q) ||
      l.notes?.toLowerCase().includes(q)
    )
  }, [logs, search])

  return (
    <div className="p-4 space-y-3">
      {/* Summary card */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Produksi Hari Ini</p>
          <p className="text-xl font-bold text-gray-900">{todayTotal.yield}</p>
          <p className="text-xs text-gray-400">{todayTotal.count} batch</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400">Total Semua</p>
          <p className="text-xl font-bold text-brand-600">{logs?.reduce((s,l) => s + l.total_yield, 0) || 0}</p>
          <p className="text-xs text-gray-400">{logs?.length || 0} produksi</p>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari nama resep, produk..." />

      {/* Log produksi — grouped */}
      {(() => {
        const grouped = groupBy(filteredLogs, l => groupKey(l.created_at, groupMode))
        if (!grouped.length) return <div className="bg-white rounded-xl border border-gray-100 py-10 text-center text-sm text-gray-400">Belum ada catatan produksi</div>
        return grouped.map(({ key, items: grpItems }) => {
          const expanded = expandedGroups[key] !== false
          return (
          <div key={key}>
            <GroupHeader label={groupLabel(grpItems[0].created_at, groupMode)} count={grpItems.length}
              expanded={expanded} onToggle={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))} />
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{display: expanded ? undefined : "none"}}>
              {grpItems.map((log, idx) => (
                <div key={log.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{log.recipe?.name || '-'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(log.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' }) + ', ' + new Date(log.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                        {' · '}{log.batch_count} batch
                        {log.notes ? ` · ${log.notes}` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-bold text-brand-600">{log.total_yield} {log.recipe?.yield_unit || 'pcs'}</p>
                      {(log as any).hpp_per_unit > 0 && (
                        <p className="text-xs text-gray-500">HPP {formatRupiah((log as any).hpp_per_unit)}/pcs</p>
                      )}
                      {(log as any).total_cost > 0 && (
                        <p className="text-xs font-medium text-gray-700">{formatRupiah((log as any).total_cost)}</p>
                      )}
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
                        <div className="space-y-0.5 pt-1 border-t border-gray-50 mt-1">
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

      {showForm  && <ProduksiForm userId={userId} onClose={() => setShowForm(false)} />}
      {showResep && <ResepForm recipe={editResep} onClose={() => { setShowResep(false); setEditResep(null) }} />}
    </div>
  )
}

// ── KIRIM (MUTASI PRODUKSI) ───────────────────────────────────
function KirimTab({ userId }: { userId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm]   = useState(false)
  const [groupMode, setGroupMode] = useState<'hari'|'bulan'|'tahun'>('hari')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <GroupSelect value={groupMode} onChange={setGroupMode} />
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg active:bg-gray-50">
          <Plus size={13} /> Kirim
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const mutations = useLiveQuery(async () => {
    const m    = await db.production_mutations.orderBy('created_at').reverse().limit(50).toArray()
    const its  = await db.production_mutation_items.toArray()
    const fgs  = await db.finished_goods_stock.toArray()
    const fgMap = Object.fromEntries(fgs.map(f => [f.product_id, f]))
    return m.map(x => ({
      ...x,
      items: its.filter(i => i.mutation_id === x.id).map(i => ({
        ...i,
        hpp_per_unit: (fgMap[i.product_id] as any)?.hpp_per_unit || 0,
      }))
    }))
  }, [])

  const typeConfig: Record<string, { label: string; color: string }> = {
    to_store:           { label: '→ Toko',       color: 'text-green-600 bg-green-50' },
    to_partner:         { label: '→ Franchise',  color: 'text-purple-600 bg-purple-50' },
    return_from_store:  { label: '← Retur',      color: 'text-orange-600 bg-orange-50' },
    adjustment:         { label: 'Koreksi',       color: 'text-gray-600 bg-gray-100' },
  }

  return (
    <div className="p-4 space-y-3">
      {(() => {
        const grouped = groupBy(mutations || [], m => groupKey(m.created_at, groupMode))
        if (!grouped.length) return <div className="bg-white rounded-xl border border-gray-100 py-10 text-center text-sm text-gray-400">Belum ada pengiriman</div>
        return grouped.map(({ key, items: grpItems }) => {
          const expanded = expandedGroups[key] !== false
          return (
          <div key={key}>
            <GroupHeader label={groupLabel(grpItems[0].created_at, groupMode)} count={grpItems.length}
              expanded={expanded} onToggle={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))} />
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{display: expanded ? undefined : "none"}}>
              {grpItems.map((m, idx) => {
                const tc = typeConfig[m.mutation_type] || { label: m.mutation_type, color: 'text-gray-600 bg-gray-100' }
                const totalQty = m.items.reduce((s, i) => s + i.qty, 0)
                return (
                  <div key={m.id} className={`px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tc.color}`}>{tc.label}</span>
                        {m.destination_name && <span className="text-xs text-gray-600 font-medium">{m.destination_name}</span>}
                      </div>
                      <p className="text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'}) + ', ' + new Date(m.created_at).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', hour12: false})}</p>
                    </div>
                    {m.items.length > 0 && (
                      <div className="mt-1.5 space-y-0.5 border-t border-gray-50 pt-1.5">
                        {m.items.map(i => {
                          const nilaiItem = i.qty * ((i as any).hpp_per_unit || 0)
                          return (
                            <div key={i.id} className="flex justify-between text-xs text-gray-400">
                              <span>{i.product_name}</span>
                              <span>
                                {i.qty} pcs
                                {(i as any).hpp_per_unit > 0 && ` · ${formatRupiah(nilaiItem)}`}
                              </span>
                            </div>
                          )
                        })}
                        <div className="flex justify-between text-xs font-medium text-gray-700 pt-1 border-t border-gray-50 mt-1">
                          <span>Total Dikirim</span>
                          <div className="text-right">
                            <span className="font-semibold">{totalQty} pcs</span>
                            {m.items.some(i => (i as any).hpp_per_unit > 0) && (
                              <p className="text-gray-500">
                                {formatRupiah(m.items.reduce((s, i) => s + i.qty * ((i as any).hpp_per_unit || 0), 0))}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {m.notes && <p className="text-xs text-gray-400 mt-1">{m.notes}</p>}
                  </div>
                )
              })}
            </div>
          </div>
          )
        })
      })()}

      {showForm && <KirimForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}


// Dropdown nama produk — pilih existing atau ketik baru
function ProductNameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fgStocks = useLiveQuery(() => db.finished_goods_stock.toArray(), [])
  const [mode, setMode] = useState<'select'|'new'>('select')

  const existingNames = fgStocks?.map(f => f.product_name) || []
  const isNew = value && !existingNames.includes(value)

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setMode('select')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mode === 'select' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
          Pilih Existing
        </button>
        <button onClick={() => { setMode('new'); onChange('') }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mode === 'new' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
          + Produk Baru
        </button>
      </div>
      {mode === 'select' ? (
        <select className="input" value={value} onChange={e => onChange(e.target.value)}>
          <option value="">-- Pilih produk</option>
          {existingNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : (
        <input className="input" value={value} onChange={e => onChange(e.target.value)}
          placeholder="Nama produk baru (Puff, Fla Vanilla, dll)" autoFocus />
      )}
    </div>
  )
}

// ── FORM: Catat Produksi ──────────────────────────────────────
function ProduksiForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const recipes = useLiveQuery(() => db.production_recipes.filter(r => r.is_active).toArray(), [])

  const [recipeId, setRecipeId]   = useState('')
  const [batchCount, setBatch]    = useState('1')
  const [productName, setProduct] = useState('')
  const [actualYield, setActualYield] = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)

  const selectedRecipe = recipes?.find(r => r.id === recipeId)
  const estimatedYield = selectedRecipe ? selectedRecipe.batch_yield * Number(batchCount) : 0
  const totalYield = actualYield && Number(actualYield) > 0 ? Number(actualYield) : estimatedYield

  // Auto-isi nama produk dari field product_name di resep
  useEffect(() => {
    if (selectedRecipe) {
      const pName = (selectedRecipe as any).product_name || selectedRecipe.name
      setProduct(pName)
    }
  }, [recipeId])

  async function handleSave() {
    if (!recipeId)       return toast.error('Pilih resep')
    if (!productName.trim()) return toast.error('Nama produk yang dihasilkan wajib diisi')
    if (Number(batchCount) <= 0) return toast.error('Jumlah batch harus lebih dari 0')

    setSaving(true)
    try {
      // Hitung finalYield dan HPP DULU sebelum insert apapun
      const recipeItems = await db.production_recipe_items.where('recipe_id').equals(recipeId).toArray()
      const matDefs = await db.materials.toArray()
      const mMapHPP = Object.fromEntries(matDefs.map(m => [m.id, m]))
      const finalYield = actualYield && Number(actualYield) > 0 ? Number(actualYield) : estimatedYield
      const totalCostHPP = recipeItems.reduce((s, ri) => {
        return s + ri.qty_per_batch * Number(batchCount) * (mMapHPP[ri.material_id]?.unit_cost || 0)
      }, 0)
      const hppPerUnit = finalYield > 0 ? totalCostHPP / finalYield : 0

      const logId = generateId()
      const log: ProductionLog = {
        id: logId, recipe_id: recipeId,
        batch_count: Number(batchCount),
        total_yield: finalYield,
        notes: notes || undefined,
        created_by: userId, created_at: now(),
      }
      await db.production_logs.add(log)
      await supabase.from('production_logs').insert(log)

      // Kurangi bahan dari production_stock
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

      // Tambah stok produk setengah jadi + simpan HPP
      const existing = await db.finished_goods_stock.filter(f => f.product_name === productName.trim()).first()
      const fgsData: any = {
        id:           existing?.id || generateId(),
        product_id:   existing?.product_id || `prod-${generateId().slice(0,8)}`,
        product_name: productName.trim(),
        qty_on_hand:  (existing?.qty_on_hand || 0) + finalYield,
        hpp_per_unit: hppPerUnit, // HPP dari produksi ini
        last_updated: now(),
      }
      await db.finished_goods_stock.put(fgsData)
      await supabase.from('finished_goods_stock').upsert(fgsData)

      toast.success(`Produksi dicatat: ${totalYield} ${selectedRecipe?.yield_unit || 'pcs'}`)
      onClose()
    } catch (e) {
      toast.error('Gagal menyimpan produksi'); console.error(e)
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Produksi" onClose={onClose}>
      <div>
        <Label required>Resep</Label>
        <select className="input" value={recipeId} onChange={e => setRecipeId(e.target.value)}>
          <option value="">Pilih resep</option>
          {recipes?.map(r => <option key={r.id} value={r.id}>{r.name} ({r.batch_yield} {r.yield_unit}/batch)</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Jumlah Batch</Label>
          <input className="input" type="number" min="0.1" step="0.5" value={batchCount}
            onChange={e => setBatch(e.target.value)} placeholder="1" />
          <p className="text-[10px] text-gray-400 mt-1">Bisa desimal: 0.5, 1.5, dst</p>
        </div>
        {selectedRecipe && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 flex flex-col justify-center">
            <p className="text-xs text-brand-600">Total hasil</p>
            <p className="text-xl font-bold text-brand-700">{totalYield}</p>
            <p className="text-xs text-brand-500">{selectedRecipe.yield_unit}</p>
          </div>
        )}
      </div>

      {selectedRecipe && (
        <div className="bg-brand-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Produk yang dihasilkan</p>
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">dari resep</span>
          </div>
          <p className="text-sm font-medium text-gray-900">{productName || selectedRecipe.name}</p>
          <p className="text-xs text-gray-500">Estimasi: <span className="font-medium">{totalYield} {selectedRecipe.yield_unit}</span></p>
        </div>
      )}
      <div>
        <Label required>Hasil Aktual</Label>
        <input className="input" type="number" step="1"
          value={actualYield} onChange={e => setActualYield(e.target.value)}
          placeholder={String(totalYield || 0)} />
        <p className="text-xs text-gray-400 mt-1">Isi sesuai hasil nyata produksi (bisa lebih/kurang dari estimasi)</p>
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

// ── FORM: Kirim Produk ────────────────────────────────────────
function KirimForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const stores   = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])
  const partners = useLiveQuery(() => db.partners.filter(p => p.is_active).toArray(), [])
  const fgStocks = useLiveQuery(() => db.finished_goods_stock.toArray(), [])

  const [type, setType]     = useState<'to_store'|'to_partner'|'return_from_store'|'adjustment'>('to_store')
  const [destId, setDestId] = useState('')
  const [notes, setNotes]   = useState('')
  const [items, setItems]   = useState<{ product_id: string; qty: string }[]>([{ product_id: '', qty: '' }])
  const [saving, setSaving] = useState(false)

  function addItem() { setItems(prev => [...prev, { product_id: '', qty: '' }]) }
  function updateItem(i: number, f: string, v: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [f]: v } : item))
  }

  const totalQty = items.reduce((s, i) => s + Number(i.qty), 0)

  async function handleSave() {
    const valid = items.filter(i => i.product_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 produk')
    if ((type === 'to_store' || type === 'return_from_store') && !destId) return toast.error('Pilih toko tujuan')
    if (type === 'to_partner' && !destId) return toast.error('Pilih franchise tujuan')

    setSaving(true)
    try {
      let destName = ''
      if (type === 'to_store' || type === 'return_from_store') destName = stores?.find(s => s.id === destId)?.name || ''
      else if (type === 'to_partner') destName = partners?.find(p => p.id === destId)?.name || ''

      const mutId = generateId()
      const mut: ProductionMutation = {
        id: mutId, mutation_type: type,
        destination_id: destId || undefined,
        destination_name: destName || undefined,
        notes: notes || undefined, status: 'confirmed',
        created_by: userId, created_at: now(),
        confirmed_at: now(), confirmed_by: userId,
      }
      await db.production_mutations.add(mut)
      await supabase.from('production_mutations').insert(mut)

      for (const item of valid) {
        const fg = fgStocks?.find(s => s.product_id === item.product_id)
        const mi: ProductionMutationItem = {
          id: generateId(), mutation_id: mutId,
          product_id: item.product_id,
          product_name: fg?.product_name || '',
          qty: Number(item.qty),
        }
        await db.production_mutation_items.add(mi)
        await supabase.from('production_mutation_items').insert(mi)

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
          {([
            { v: 'to_store',          l: '→ Toko' },
            { v: 'to_partner',        l: '→ Franchise' },
            { v: 'return_from_store', l: '← Retur Toko' },
            { v: 'adjustment',        l: 'Koreksi Stok' },
          ] as const).map(t => (
            <button key={t.v} onClick={() => setType(t.v)}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                type === t.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'
              }`}>{t.l}</button>
          ))}
        </div>
      </div>

      {(type === 'to_store' || type === 'return_from_store') && (
        <div>
          <Label required>Toko Tujuan</Label>
          <select className="input" value={destId} onChange={e => setDestId(e.target.value)}>
            <option value="">Pilih toko</option>
            {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {type === 'to_partner' && (
        <div>
          <Label required>Franchise Tujuan</Label>
          <select className="input" value={destId} onChange={e => setDestId(e.target.value)}>
            <option value="">Pilih franchise</option>
            {partners?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <Label required>Produk</Label>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
              <select className="input text-sm" value={item.product_id}
                onChange={e => updateItem(i, 'product_id', e.target.value)}>
                <option value="">Pilih produk</option>
                {fgStocks?.map(s => (
                  <option key={s.product_id} value={s.product_id}>
                    {s.product_name} (stok: {s.qty_on_hand})
                  </option>
                ))}
              </select>
              <input className="input text-sm" type="number" placeholder="Qty" value={item.qty}
                onChange={e => updateItem(i, 'qty', e.target.value)} />
              {items.length > 1 && (
                <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-500">Hapus</button>
              )}
            </div>
          ))}
          <button onClick={addItem} className="text-sm text-blue-600 font-medium">+ Tambah Produk</button>
        </div>
      </div>

      {totalQty > 0 && (
        <div className="flex items-center justify-between py-2 bg-gray-50 rounded-xl px-3">
          <span className="text-sm text-gray-600">Total Dikirim</span>
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

// ── FORM: Resep ───────────────────────────────────────────────
function ResepForm({ recipe, onClose }: { recipe: any | null; onClose: () => void }) {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])

  const [name, setName]           = useState(recipe?.name || '')
  const [productName, setProductName] = useState((recipe as any)?.product_name || recipe?.name || '')
  const [batchYield, setBatch]    = useState(String(recipe?.batch_yield || '120'))
  const [yieldUnit, setYieldUnit] = useState(recipe?.yield_unit || 'pcs')
  const [isActive, setIsActive]   = useState(recipe?.is_active ?? true)
  const [items, setItems]         = useState<{ id?: string; material_id: string; qty: string; notes: string }[]>([])
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(!!recipe)

  // Load bahan existing saat edit
  useEffect(() => {
    if (!recipe) {
      setItems([{ material_id: '', qty: '', notes: '' }])
      return
    }
    async function loadItems() {
      const existing = await db.production_recipe_items.where('recipe_id').equals(recipe.id).toArray()
      if (existing.length > 0) {
        setItems(existing.map(i => ({ id: i.id, material_id: i.material_id, qty: String(i.qty_per_batch), notes: i.notes || '' })))
      } else {
        setItems([{ material_id: '', qty: '', notes: '' }])
      }
      setLoading(false)
    }
    loadItems()
  }, [recipe?.id])

  function addItem() { setItems(prev => [...prev, { material_id: '', qty: '', notes: '' }]) }
  function updateItem(i: number, f: string, v: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [f]: v } : item))
  }

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama resep wajib diisi')
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 bahan')

    setSaving(true)
    try {
      const isNew    = !recipe
      const recipeId = recipe?.id || generateId()
      const data: any = {
        id: recipeId,
        name: name.trim(),
        product_name: productName.trim() || name.trim(),
        batch_yield: Number(batchYield),
        yield_unit: yieldUnit,
        is_active: isActive,
        created_at: recipe?.created_at || now(),
      }
      await db.production_recipes.put(data)
      await supabase.from('production_recipes').upsert(data)

      // Hapus items lama, insert baru
      await db.production_recipe_items.where('recipe_id').equals(recipeId).delete()
      await supabase.from('production_recipe_items').delete().eq('recipe_id', recipeId)

      for (const item of valid) {
        const ri: ProductionRecipeItem = {
          id: item.id || generateId(),
          recipe_id: recipeId,
          material_id: item.material_id,
          qty_per_batch: Number(item.qty),
          notes: item.notes || undefined,
        }
        await db.production_recipe_items.add(ri)
        await supabase.from('production_recipe_items').insert(ri)
      }

      toast.success(isNew ? 'Resep ditambahkan' : 'Resep diperbarui')
      onClose()
    } catch (e) { toast.error('Gagal menyimpan resep'); console.error(e) }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <Modal title="Edit Resep" onClose={onClose}>
        <div className="py-8 text-center text-sm text-gray-400">Memuat bahan...</div>
      </Modal>
    )
  }

  return (
    <Modal title={recipe ? 'Edit Resep' : 'Resep Baru'} onClose={onClose}>
      <div><Label required>Nama Resep</Label><input className="input" value={name} onChange={e => { setName(e.target.value); if (!productName || productName === name) setProductName(e.target.value) }} placeholder="Resep Puff Standard" autoFocus /></div>
      <div>
        <Label required>Nama Produk yang Dihasilkan</Label>
        <input className="input" value={productName} onChange={e => setProductName(e.target.value)} placeholder="Puff, Fla Vanilla, dll" />
        <p className="text-xs text-gray-400 mt-1">Nama ini otomatis terisi saat catat produksi</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Hasil per Batch</Label>
          <input className="input" type="number" value={batchYield} onChange={e => setBatch(e.target.value)} />
        </div>
        <div>
          <Label>Satuan</Label>
          <input className="input" value={yieldUnit} onChange={e => setYieldUnit(e.target.value)} placeholder="pcs" />
        </div>
      </div>

      <div>
        <Label required>Bahan per Batch</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find(m => m.id === item.material_id)
            return (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <select className="input text-sm" value={item.material_id} onChange={e => updateItem(i, 'material_id', e.target.value)}>
                  <option value="">Pilih bahan</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" type="number" placeholder={`Qty/${mat?.unit || 'unit'}/batch`}
                    value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  <input className="input text-sm" placeholder="Catatan (opsional)"
                    value={item.notes} onChange={e => updateItem(i, 'notes', e.target.value)} />
                </div>
                {items.length > 1 && (
                  <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-xs text-red-500">Hapus</button>
                )}
              </div>
            )
          })}
        </div>
        <button onClick={addItem} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Bahan</button>
      </div>

      <div className="flex items-center justify-between py-3 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-800">Resep Aktif</p>
          <p className="text-xs text-gray-400">Nonaktif tidak muncul di pilihan produksi</p>
        </div>
        <button onClick={() => setIsActive(!isActive)}
          className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-5.5' : 'left-0.5'}`} />
        </button>
      </div>

      <div className="flex gap-3 pt-1 border-t border-gray-100">
        {recipe && isOwner && (
          <button onClick={async () => {
            if (!confirm(`Hapus resep "${recipe.name}"?`)) return
            await db.production_recipe_items.where('recipe_id').equals(recipe.id).delete()
            await db.production_recipes.delete(recipe.id)
            await supabase.from('production_recipe_items').delete().eq('recipe_id', recipe.id)
            await supabase.from('production_recipes').delete().eq('id', recipe.id)
            toast.success('Resep dihapus')
            onClose()
          }} className="px-4 py-3 rounded-xl border border-red-200 text-sm font-medium text-red-500">
            Hapus
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}
