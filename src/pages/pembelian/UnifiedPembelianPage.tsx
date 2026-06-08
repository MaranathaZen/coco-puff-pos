// src/pages/pembelian/UnifiedPembelianPage.tsx
// CHANGELOG v7:
// - FEAT: Realtime subscription purchases — semua role lihat perubahan otomatis
// - FEAT: Void pembelian — owner/manager bisa void, stok gudang/toko dikurangi kembali
// - UI: Row voided tampil strikethrough + badge "Dibatalkan"

import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import type { WarehouseStock } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'

type Period = 'hari' | 'bulan'
function groupKey(d: string, m: Period) { return m === 'hari' ? d.slice(0,10) : d.slice(0,7) }
function groupLabel(d: string, m: Period) {
  const dt = new Date(d)
  return m === 'hari'
    ? dt.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : dt.toLocaleDateString('id-ID', { month:'long', year:'numeric' })
}
function groupBy<T>(arr: T[], fn: (i: T) => string) {
  const map = new Map<string, T[]>()
  for (const item of arr) { const k = fn(item); if (!map.has(k)) map.set(k,[]); map.get(k)!.push(item) }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
}
const METODE_BAYAR = [
  { value: 'tunai',    label: 'Tunai'    },
  { value: 'transfer', label: 'Transfer' },
  { value: 'kredit',   label: 'Kredit'   },
]
async function generatePONumber() {
  const ds = new Date().toISOString().slice(0,10).replace(/-/g,'')
  const prefix = `PO-${ds}-`
  const existing = await db.purchases.filter(p => (p as any).po_number?.startsWith(prefix)).toArray()
  return `${prefix}${String(existing.length + 1).padStart(3,'0')}`
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{children}{required && <span className="text-red-500 font-bold ml-0.5">*</span>}</label>
}
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 ml-1 align-middle">
      {copied ? '✓' : '⧉'}
    </button>
  )
}

// ── VOID CONFIRM MODAL ────────────────────────────────────────
function VoidConfirmModal({ poNumber, onConfirm, onClose }: {
  poNumber: string; onConfirm: () => Promise<void>; onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  async function handleConfirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <span className="text-red-600 text-lg">⚠</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Batalkan Pembelian?</p>
            <p className="text-xs text-gray-500 mt-0.5">{poNumber}</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Stok gudang/toko akan dikurangi kembali sesuai item pembelian ini. Aksi ini tidak bisa diurungkan.
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

export default function UnifiedPembelianPage() {
  const { user } = useAuthStore()
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)
  const [syncing, setSyncing] = useState(false)

  if (user?.role === 'produksi') {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-900">Pembelian</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <p className="text-4xl mb-3">🚫</p>
            <p className="text-sm font-medium text-gray-700">Akses Terbatas</p>
            <p className="text-xs text-gray-400 mt-1">Divisi produksi tidak memiliki akses pembelian</p>
          </div>
        </div>
      </div>
    )
  }

  async function doSync(showToast = false) {
    setSyncing(true)
    try {
      const isOwnerManager = ['owner','manager','gudang'].includes(user?.role || '')
      const [p, pi, m, s] = await Promise.all([
        isOwnerManager
          ? supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(500)
          : supabase.from('purchases').select('*').eq('store_id', user?.store_id).order('created_at', { ascending: false }).limit(200),
        supabase.from('purchase_items').select('*'),
        supabase.from('materials').select('*'),
        supabase.from('suppliers').select('*'),
      ])
      if (p.data !== null) { await db.purchases.clear(); if (p.data.length) await db.purchases.bulkPut(p.data) }
      if (pi.data?.length) { await db.purchase_items.clear(); await db.purchase_items.bulkPut(pi.data) }
      if (m.data?.length)  await db.materials.bulkPut(m.data)
      if (s.data?.length)  await db.suppliers.bulkPut(s.data)
      if (showToast) toast.success('Data diperbarui')
    } catch { if (showToast) toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  useEffect(() => { doSync(false) }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Pembelian</h1>
        <div className="flex items-center gap-2">
          {toolbarActions}
          <button onClick={() => doSync(true)} disabled={syncing} className="p-2 text-gray-400 rounded-full">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-50">
        <PembelianList userId={user!.id} role={user!.role} storeId={user!.store_id || ''} setToolbarActions={setToolbarActions} />
      </div>
    </div>
  )
}

function PembelianList({ userId, role, storeId, setToolbarActions }: { userId: string; role: string; storeId: string; setToolbarActions: (n: React.ReactNode) => void }) {
  const [showForm,     setShowForm]     = useState(false)
  const [groupMode,    setGroupMode]    = useState<Period>('hari')
  const [search,       setSearch]       = useState('')
  const [filterStore,  setFilterStore]  = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({
    [new Date().toISOString().slice(0, 10)]: true
  }))
  const [voidTarget, setVoidTarget] = useState<{ id: string; poNumber: string } | null>(null)

  const isOwnerManager = ['owner','manager','gudang'].includes(role)
  const isKasir = role === 'kasir'

  const stores = useLiveQuery(() =>
    isOwnerManager
      ? db.stores.filter(s => s.is_active && !s.id.includes('produksi')).toArray()
      : Promise.resolve([])
  , [isOwnerManager])

  useEffect(() => {
    if (stores && stores.length > 0 && !filterStore) setFilterStore(stores[0].id)
  }, [stores])

  useEffect(() => {
    setToolbarActions(
      <div className="flex items-center gap-2">
        {!isKasir && (
          <select value={groupMode} onChange={e => setGroupMode(e.target.value as Period)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600">
            <option value="hari">Per Hari</option>
            <option value="bulan">Per Bulan</option>
          </select>
        )}
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={13} /> Baru
        </button>
      </div>
    )
    return () => setToolbarActions(null)
  }, [groupMode, isKasir])

  // Realtime — update Dexie otomatis saat ada perubahan purchases
  useEffect(() => {
    const filter = isOwnerManager ? undefined : `store_id=eq.${storeId}`
    const channel = supabase
      .channel(`purchases:${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchases', ...(filter ? { filter } : {}) },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            await db.purchases.delete((payload.old as any).id)
          } else if (payload.new) {
            await db.purchases.put(payload.new as any)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [storeId, isOwnerManager])

  const purchases = useLiveQuery(async () => {
    let p = await db.purchases.orderBy('created_at').reverse().toArray()
    if (role === 'kasir') {
      const today = new Date().toLocaleDateString('sv-SE')
      p = p.filter(x =>
        ((x as any).store_id === storeId || x.created_by === userId) &&
        x.created_at.slice(0, 10) === today
      )
    }
    const pi   = await db.purchase_items.toArray()
    const mats = await db.materials.toArray()
    const sups = await db.suppliers.toArray()
    const mMap = Object.fromEntries(mats.map(m => [m.id, m]))
    const sMap = Object.fromEntries(sups.map(s => [s.id, s]))
    return p.map(pur => ({
      ...pur,
      supplier: sMap[(pur as any).supplier_id || ''],
      storeId:  (pur as any).store_id || '',
      items: pi.filter(i => i.purchase_id === pur.id).map(i => ({ ...i, material: mMap[i.material_id] }))
    }))
  }, [role, userId, storeId])

  const storeMap = Object.fromEntries((stores || []).map(s => [s.id, s.name]))

  const filtered = useMemo(() => {
    if (!purchases) return []
    let list = purchases
    if (isOwnerManager && filterStore) list = list.filter(p => (p as any).storeId === filterStore)
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(p =>
      p.supplier?.name?.toLowerCase().includes(q) ||
      (p as any).po_number?.toLowerCase().includes(q) ||
      p.items.some(i => i.material?.name?.toLowerCase().includes(q)) ||
      p.notes?.toLowerCase().includes(q)
    )
  }, [purchases, search, filterStore, isOwnerManager])

  const grouped = useMemo(() => groupBy(filtered, p => groupKey(p.created_at, groupMode)), [filtered, groupMode])

  const { totalCardAmount, totalCardCount } = useMemo(() => ({
    // Exclude voided from totals
    totalCardAmount: filtered.filter(p => (p as any).status !== 'voided').reduce((s, p) => s + p.total_amount, 0),
    totalCardCount: filtered.filter(p => (p as any).status !== 'voided').length,
  }), [filtered])

  // ── VOID HANDLER: PEMBELIAN ───────────────────────────────
  async function handleVoidPembelian(purchaseId: string) {
    try {
      const purchase = await db.purchases.get(purchaseId)
      if (!purchase) return

      const purchStoreId = (purchase as any).store_id || ''
      const isGudang = purchStoreId.includes('gudang') || role === 'gudang'
      const items = await db.purchase_items.where('purchase_id').equals(purchaseId).toArray()

      for (const item of items) {
        if (isGudang) {
          // Kurangi warehouse_stock
          const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
          if (ws) {
            const newQty = Math.max(0, ws.qty_on_hand - item.qty)
            await db.warehouse_stock.update(ws.id, { qty_on_hand: newQty, last_updated: now() })
            await supabase.from('warehouse_stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', ws.id)
          }
        } else {
          // Kurangi stock toko
          const existing = await db.stock
            .filter(s => s.store_id === purchStoreId &&
              (s.ingredient_id === item.material_id || (s as any).material_id === item.material_id))
            .first()
          if (existing) {
            const newQty = Math.max(0, existing.qty_on_hand - item.qty)
            await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
            await supabase.from('stock').update({ qty_on_hand: newQty }).eq('id', existing.id)
          }
        }
      }

      // Set status voided
      await db.purchases.update(purchaseId, { status: 'voided', voided_at: now() } as any)
      await supabase.from('purchases').update({
        status: 'voided',
        voided_at: new Date().toISOString(),
      }).eq('id', purchaseId)

      toast.success('Pembelian dibatalkan & stok dikurangi kembali')
      setVoidTarget(null)
    } catch (e) {
      console.error('[VoidPembelian]', e)
      toast.error('Gagal membatalkan pembelian')
    }
  }

  function PurchaseRow({ p, idx }: { p: any; idx: number }) {
    const isVoided = (p as any).status === 'voided'
    const poNumber = (p as any).po_number || p.id
    return (
      <div className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''} ${isVoided ? 'opacity-50 bg-gray-50' : ''}`}>
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {(p as any).po_number && (
                <p className={`text-xs font-mono text-blue-600 ${isVoided ? 'line-through' : ''}`}>
                  {(p as any).po_number}
                  {!isVoided && <CopyBtn text={(p as any).po_number} />}
                </p>
              )}
              {isVoided && (
                <span className="text-[10px] font-medium text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                  Dibatalkan
                </span>
              )}
            </div>
            <p className={`text-sm font-medium text-gray-900 ${isVoided ? 'line-through' : ''}`}>
              {p.supplier?.name || 'Tanpa Supplier'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(p.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})},{' '}
              {new Date(p.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false})}
              {(p as any).payment_method ? ` · ${(p as any).payment_method}` : ''}
              {isOwnerManager && storeMap[(p as any).storeId] && (
                <span className="ml-1 text-gray-300">· {storeMap[(p as any).storeId]}</span>
              )}
            </p>
            {p.notes && <p className="text-xs text-gray-500 italic mt-0.5">📝 {p.notes}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <p className={`text-sm font-semibold text-gray-900 ${isVoided ? 'line-through' : ''}`}>
              {formatRupiah(p.total_amount)}
            </p>
            {isOwnerManager && !isVoided && (
              <button
                onClick={() => setVoidTarget({ id: p.id, poNumber })}
                className="text-[10px] font-medium text-red-400 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                Void
              </button>
            )}
          </div>
        </div>
        {!isVoided && p.items.length > 0 && (
          <div className="mt-1.5 border-t border-gray-50 pt-1.5 space-y-0.5">
            {p.items.map((i: any) => (
              <div key={i.id} className="flex justify-between text-xs text-gray-400">
                <span>{i.material?.name} × {i.qty} {i.material?.unit}{i.unit_cost > 0 ? ` @ ${formatRupiah(i.unit_cost)}` : ''}</span>
                <span>{formatRupiah(i.subtotal)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">{isKasir ? 'Total Pembelian Hari Ini' : 'Total Pembelian'}</p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalCardAmount)}</p>
        <p className="text-xs text-gray-400 mt-0.5">{totalCardCount} transaksi</p>
      </div>

      {isOwnerManager && stores && stores.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {stores.map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name.replace(' Malang','').replace(' Bali','')}
            </button>
          ))}
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari supplier, PO, bahan..." />

      {isKasir ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.length === 0
            ? <div className="py-12 text-center text-sm text-gray-400">Belum ada pembelian hari ini</div>
            : filtered.map((p, idx) => <PurchaseRow key={p.id} p={p} idx={idx} />)
          }
        </div>
      ) : (
        <>
          {grouped.map(({ key, items: grpItems }) => {
            const total    = grpItems.filter(p => (p as any).status !== 'voided').reduce((s, p) => s + p.total_amount, 0)
            const today    = new Date().toLocaleDateString('sv-SE')
            const isFirst  = grouped[0]?.key === key
            const expanded = expandedGroups[key] !== undefined ? expandedGroups[key] : (key === today || isFirst)
            return (
              <div key={key}>
                <button onClick={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))}
                  className="w-full flex items-center justify-between px-1 py-2">
                  <div className="flex items-center gap-2">
                    <svg className={`w-3 h-3 text-gray-400 transition-transform ${expanded?'rotate-90':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                    <p className="text-xs font-semibold text-gray-600">{groupLabel(grpItems[0].created_at, groupMode)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{grpItems.length} item</span>
                    <span className="text-xs font-medium text-gray-700">{formatRupiah(total)}</span>
                  </div>
                </button>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ display: expanded ? undefined : 'none' }}>
                  {grpItems.map((p, idx) => <PurchaseRow key={p.id} p={p} idx={idx} />)}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada pembelian</div>
          )}
        </>
      )}

      {showForm && <PembelianForm userId={userId} storeId={storeId} role={role} onClose={() => setShowForm(false)} />}

      {voidTarget && (
        <VoidConfirmModal
          poNumber={voidTarget.poNumber}
          onConfirm={() => handleVoidPembelian(voidTarget.id)}
          onClose={() => setVoidTarget(null)}
        />
      )}
    </div>
  )
}

function PembelianForm({ userId, storeId, role, onClose }: { userId: string; storeId: string; role: string; onClose: () => void }) {
  const isOwnerManager = ['owner','manager'].includes(role)
  
  const allStores = useLiveQuery(() =>
    isOwnerManager ? db.stores.filter(s => s.is_active && !s.id.includes('produksi')).toArray() : Promise.resolve([])
  , [isOwnerManager])

  const [inputAsStore, setInputAsStore] = useState('')
  
  useEffect(() => {
    if (!allStores || allStores.length === 0) return
    const gudang = allStores.find(s => s.id.includes('gudang'))
    setInputAsStore(gudang?.id || storeId)
  }, [allStores])

  const activeStoreId = isOwnerManager ? inputAsStore : storeId

  const isInputAsGudang = activeStoreId.includes('gudang') || 
    allStores?.find(s => s.id === activeStoreId)?.id.includes('gudang') || 
    role === 'gudang'

  const materials = useLiveQuery(async () => {
    if (!activeStoreId || activeStoreId.includes('gudang') || role === 'gudang') {
      return db.materials.filter(m => m.is_active).toArray()
    }
    const stokToko = await db.stock.where('store_id').equals(activeStoreId).toArray()
    const matIds = new Set(stokToko.map((s: any) => s.ingredient_id || s.material_id).filter(Boolean))
    if (matIds.size === 0) return db.materials.filter(m => m.is_active).toArray()
    return db.materials.filter(m => m.is_active && matIds.has(m.id)).toArray()
  }, [activeStoreId, role])
  const suppliers  = useLiveQuery(() => db.suppliers.filter(s => s.is_active !== false).toArray(), [])

  const [supplierId, setSupp]       = useState('')
  const [invoiceNo,  setInv]        = useState('')
  const [notes,      setNotes]      = useState('')
  const [payMethod,  setPay]        = useState('tunai')
  const [transferTo, setTransferTo] = useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [items,      setItems]      = useState([{ material_id:'', qty:'', unit_cost:'', pack_mode:false, pack_price:'', pack_qty:'' }])
  const [saving,     setSaving]     = useState(false)

  function getUnitCost(item: typeof items[0]) {
    if (item.pack_mode && Number(item.pack_qty) > 0 && Number(item.pack_price) > 0)
      return Number(item.pack_price) / Number(item.pack_qty)
    return Number(item.unit_cost) || 0
  }
  const total = items.reduce((s, i) => s + Number(i.qty) * getUnitCost(i), 0)

  function updateItem(i: number, f: string, v: any) {
    setItems(p => p.map((item, idx) => {
      if (idx !== i) return item
      const u = { ...item, [f]: v }
      if (f === 'material_id') { const m = materials?.find(m => m.id === v); if (m?.unit_cost) u.unit_cost = String(m.unit_cost) }
      if ((f === 'pack_price' || f === 'pack_qty') && u.pack_mode) {
        const pp = Number(f === 'pack_price' ? v : u.pack_price)
        const pq = Number(f === 'pack_qty'   ? v : u.pack_qty)
        if (pp > 0 && pq > 0) u.unit_cost = String((pp/pq).toFixed(4))
      }
      return u
    }))
  }

  async function handleSave() {
    const valid = items.filter(i => i.material_id && Number(i.qty) > 0)
    if (!valid.length) return toast.error('Tambahkan minimal 1 item')
    setSaving(true)
    try {
      const poNumber = await generatePONumber()
      const purchId  = generateId()
      const purch: any = {
        id: purchId, po_number: poNumber, store_id: activeStoreId,
        supplier_id: supplierId || undefined, invoice_no: invoiceNo || undefined,
        total_amount: total, payment_method: payMethod,
        transfer_to: transferTo || undefined, due_date: dueDate || undefined,
        status: 'received', notes: notes || undefined,
        created_by: userId, created_at: now(),
      }
      await db.purchases.add(purch)
      await supabase.from('purchases').upsert(purch)

      for (const item of valid) {
        const uc = getUnitCost(item)
        const pi = {
          id: generateId(), purchase_id: purchId, material_id: item.material_id,
          qty: Number(item.qty), unit_cost: uc, subtotal: Number(item.qty) * uc, qty_returned: 0
        }
        await db.purchase_items.add(pi)
        await supabase.from('purchase_items').upsert(pi)

        if (isInputAsGudang) {
          const ws = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
          const wsd: WarehouseStock = {
            id: ws?.id || generateId(),
            material_id: item.material_id,
            qty_on_hand: (ws?.qty_on_hand || 0) + Number(item.qty),
            last_updated: now()
          }
          await db.warehouse_stock.put(wsd)
          await supabase.from('warehouse_stock').upsert(wsd)
        } else {
          const existing = await db.stock
            .filter(s => s.store_id === activeStoreId &&
              (s.ingredient_id === item.material_id || (s as any).material_id === item.material_id))
            .first()
          const newQty = (existing?.qty_on_hand || 0) + Number(item.qty)
          if (existing) {
            await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
            await supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', existing.id)
          } else {
            const newStock: any = {
              id: generateId(), store_id: activeStoreId,
              ingredient_id: item.material_id, material_id: item.material_id,
              qty_on_hand: newQty, avg_cost: uc, last_updated: now()
            }
            await db.stock.add(newStock)
            await supabase.from('stock').upsert(newStock)
          }
        }

        if (uc > 0) {
          const mat = await db.materials.get(item.material_id)
          if (mat) {
            const prevQty  = (mat as any).total_qty_purchased  || 0
            const prevCost = (mat as any).total_cost_purchased || 0
            const newQty   = prevQty  + Number(item.qty)
            const newCost  = prevCost + Number(item.qty) * uc
            const avgCost  = newQty > 0 ? newCost / newQty : uc
            await db.materials.update(item.material_id, {
              unit_cost: avgCost, avg_cost: avgCost,
              total_qty_purchased: newQty, total_cost_purchased: newCost, updated_at: now()
            })
            await supabase.from('materials').update({
              unit_cost: avgCost, avg_cost: avgCost,
              total_qty_purchased: newQty, total_cost_purchased: newCost
            }).eq('id', item.material_id)
          }
        }
      }
      toast.success(`Pembelian ${poNumber} dicatat — stok masuk ke ${isInputAsGudang ? 'gudang' : allStores?.find(s => s.id === activeStoreId)?.name || 'toko'}`)
      onClose()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Pembelian Baru" onClose={onClose}>
      {isOwnerManager && allStores && allStores.length > 0 && (
        <div>
          <Label>Input Sebagai</Label>
          <select className="input" value={inputAsStore} onChange={e => setInputAsStore(e.target.value)}>
            {allStores.map(s => (
              <option key={s.id} value={s.id}>
                {s.id.includes('gudang') ? '🏭 ' : '🏪 '}
                {s.name.replace(' Malang','').replace(' Bali','')}
              </option>
            ))}
          </select>
          <p className="text-xs mt-1 text-gray-400">
            {isInputAsGudang 
              ? '📦 Stok masuk ke gudang' 
              : `🏪 Stok masuk ke stok toko ${allStores?.find(s => s.id === activeStoreId)?.name || ''}`}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Supplier</Label>
          <select className="input" value={supplierId} onChange={e => setSupp(e.target.value)}>
            <option value="">Tanpa Supplier</option>
            {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><Label>No. Invoice</Label>
          <input className="input" value={invoiceNo} onChange={e => setInv(e.target.value)} placeholder="INV-001" />
        </div>
      </div>
      <div><Label required>Metode Bayar</Label>
        <div className="flex gap-2">
          {METODE_BAYAR.map(m => (
            <button key={m.value} onClick={() => setPay(m.value)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border ${payMethod===m.value?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>{m.label}</button>
          ))}
        </div>
      </div>
      {payMethod === 'transfer' && <div><Label>Transfer ke</Label><input className="input" value={transferTo} onChange={e => setTransferTo(e.target.value)} placeholder="BCA 1234567890" /></div>}
      {payMethod === 'kredit'   && <div><Label>Jatuh Tempo</Label><input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>}
      <div><Label required>Item</Label>
        <div className="space-y-2">
          {items.map((item, i) => {
            const mat = materials?.find((m: any) => m.id === item.material_id) as any
            const uc  = getUnitCost(item)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id} onChange={e => updateItem(i,'material_id',e.target.value)}>
                  <option value="">Pilih bahan</option>
                  {materials?.map((m: any) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Input per pack?</span>
                  <button onClick={() => updateItem(i,'pack_mode',!item.pack_mode)}
                    className={`w-9 h-5 rounded-full relative ${item.pack_mode?'bg-blue-500':'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${item.pack_mode?'left-4':'left-0.5'}`} />
                  </button>
                </div>
                {item.pack_mode ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-[10px] text-gray-400 mb-1">Harga/pack</p><input className="input text-sm" type="number" value={item.pack_price} onChange={e => updateItem(i,'pack_price',e.target.value)} /></div>
                      <div><p className="text-[10px] text-gray-400 mb-1">Isi/pack ({mat?.unit})</p><input className="input text-sm" type="number" value={item.pack_qty} onChange={e => updateItem(i,'pack_qty',e.target.value)} /></div>
                    </div>
                    {uc > 0 && <p className="text-xs text-blue-600">= {formatRupiah(uc)}/{mat?.unit}</p>}
                    <div><p className="text-[10px] text-gray-400 mb-1">Qty ({mat?.unit})</p><input className="input text-sm" type="number" value={item.qty} onChange={e => updateItem(i,'qty',e.target.value)} /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input text-sm" type="number" placeholder={`Qty (${mat?.unit||''})`} value={item.qty} onChange={e => updateItem(i,'qty',e.target.value)} />
                    <input className="input text-sm" type="number" placeholder={`Harga/${mat?.unit||'unit'}`} value={item.unit_cost} onChange={e => updateItem(i,'unit_cost',e.target.value)} />
                  </div>
                )}
                {item.qty && uc > 0 && <p className="text-xs text-gray-400">Subtotal: {formatRupiah(Number(item.qty)*uc)}</p>}
                {items.length > 1 && <button onClick={() => setItems(p => p.filter((_,idx) => idx!==i))} className="text-xs text-red-400">Hapus</button>}
              </div>
            )
          })}
        </div>
        <button onClick={() => setItems(p => [...p,{material_id:'',qty:'',unit_cost:'',pack_mode:false,pack_price:'',pack_qty:''}])} className="mt-2 text-sm text-blue-600 font-medium">+ Tambah Item</button>
      </div>
      <div><Label>Catatan</Label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <span className="text-sm font-medium text-gray-700">Total</span>
        <span className="text-base font-semibold text-gray-900">{formatRupiah(total)}</span>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button>
      </div>
    </Modal>
  )
}
