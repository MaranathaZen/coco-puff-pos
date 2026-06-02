// src/pages/pembelian/UnifiedPembelianPage.tsx
// CHANGELOG v2:
// - owner/manager/gudang: filter toko + lihat semua history pembelian
// - kasir: hanya pembelian toko sendiri (read-only)
// - auto expand hari ini

import { useState, useMemo, useEffect, useContext, createContext } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { WarehouseStock } from '@/lib/db'

const ToolbarCtx = createContext<(node: React.ReactNode) => void>(() => {})
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

  async function syncData() {
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
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Pembelian</h1>
        <div className="flex items-center gap-2">
          {toolbarActions}
          <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400 rounded-full">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>
      <ToolbarCtx.Provider value={setToolbarActions}>
        <div className="flex-1 overflow-auto bg-gray-50">
          <PembelianList userId={user!.id} role={user!.role} storeId={user!.store_id || ''} />
        </div>
      </ToolbarCtx.Provider>
    </div>
  )
}

function PembelianList({ userId, role, storeId }: { userId: string; role: string; storeId: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm,     setShowForm]     = useState(false)
  const [groupMode,    setGroupMode]    = useState<Period>('hari')
  const [search,       setSearch]       = useState('')
  const [filterStore,  setFilterStore]  = useState(() => role === 'gudang' ? storeId : 'semua')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({
    [new Date().toISOString().slice(0, 10)]: true
  }))

  const isOwnerManager = ['owner','manager','gudang'].includes(role)

  // Toko real + Gudang untuk filter (owner/manager/gudang saja)
  const stores = useLiveQuery(() =>
    isOwnerManager
      ? db.stores.filter(s => s.is_active).toArray()
      : Promise.resolve([])
  , [isOwnerManager])

  // Default filter: gudang jika role gudang, semua jika owner/manager
  const defaultFilter = role === 'gudang' ? storeId : 'semua'

  useEffect(() => {
    setToolbar(
      <div className="flex items-center gap-2">
        <select value={groupMode} onChange={e => setGroupMode(e.target.value as Period)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600">
          <option value="hari">Per Hari</option>
          <option value="bulan">Per Bulan</option>
        </select>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg">
          <Plus size={13} /> Baru
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const purchases = useLiveQuery(async () => {
    let p = await db.purchases.orderBy('created_at').reverse().toArray()
    if (role === 'kasir') {
      p = p.filter(x => (x as any).store_id === storeId || x.created_by === userId)
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
    // Filter by toko
    if (isOwnerManager && filterStore !== 'semua') {
      list = list.filter(p => (p as any).storeId === filterStore)
    }
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

  const totalBulanIni = useMemo(() => {
    const now2 = new Date()
    return (filtered || []).filter(p => {
      const d = new Date(p.created_at)
      return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
    }).reduce((s, p) => s + p.total_amount, 0)
  }, [filtered])

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">Total Pembelian Bulan Ini</p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalBulanIni)}</p>
        {!isOwnerManager && <p className="text-xs text-gray-400 mt-0.5">Data toko ini saja</p>}
      </div>

      {/* Filter toko — hanya untuk owner/manager/gudang */}
      {isOwnerManager && stores && stores.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilterStore('semua')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore==='semua'?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
            Semua Toko
          </button>
          {stores.map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id?'bg-gray-900 text-white':'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari supplier, PO, bahan..." />

      {grouped.map(({ key, items: grpItems }) => {
        const total    = grpItems.reduce((s, p) => s + p.total_amount, 0)
        const today    = new Date().toISOString().slice(0,10)
        const expanded = expandedGroups[key] !== undefined ? expandedGroups[key] : key === today
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
              {grpItems.map((p, idx) => (
                <div key={p.id} className={`px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      {(p as any).po_number && (
                        <p className="text-xs font-mono text-blue-600 mb-0.5">{(p as any).po_number}<CopyBtn text={(p as any).po_number} /></p>
                      )}
                      <p className="text-sm font-medium text-gray-900">{p.supplier?.name || 'Tanpa Supplier'}</p>
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
                    <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(p.total_amount)}</p>
                  </div>
                  {p.items.length > 0 && (
                    <div className="mt-1.5 border-t border-gray-50 pt-1.5 space-y-0.5">
                      {p.items.map(i => (
                        <div key={i.id} className="flex justify-between text-xs text-gray-400">
                          <span>{i.material?.name} × {i.qty} {i.material?.unit}{i.unit_cost > 0 ? ` @ ${formatRupiah(i.unit_cost)}` : ''}</span>
                          <span>{formatRupiah(i.subtotal)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-medium text-gray-600 pt-1 border-t border-gray-50 mt-1">
                        <span>Total</span><span>{formatRupiah(p.items.reduce((s,i)=>s+i.subtotal,0))}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
          {isOwnerManager && filterStore !== 'semua' ? 'Belum ada pembelian untuk toko ini' : 'Belum ada pembelian'}
        </div>
      )}
      {showForm && <PembelianForm userId={userId} storeId={storeId} role={role} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function PembelianForm({ userId, storeId, role, onClose }: { userId: string; storeId: string; role: string; onClose: () => void }) {
  const isOwnerManager = ['owner','manager'].includes(role)
  const allStores = useLiveQuery(() =>
    isOwnerManager ? db.stores.filter(s => s.is_active).toArray() : Promise.resolve([])
  , [isOwnerManager])
  const [inputAsStore, setInputAsStore] = useState(storeId)
  const activeStoreId = isOwnerManager ? inputAsStore : storeId

  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const suppliers = useLiveQuery(() => db.suppliers.filter(s => s.is_active !== false).toArray(), [])

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
      await supabase.from('purchases').insert(purch)

      for (const item of valid) {
        const uc = getUnitCost(item)
        const pi = { id: generateId(), purchase_id: purchId, material_id: item.material_id, qty: Number(item.qty), unit_cost: uc, subtotal: Number(item.qty) * uc, qty_returned: 0 }
        await db.purchase_items.add(pi)
        await supabase.from('purchase_items').insert(pi)

        const ws  = await db.warehouse_stock.where('material_id').equals(item.material_id).first()
        const wsd: WarehouseStock = { id: ws?.id || generateId(), material_id: item.material_id, qty_on_hand: (ws?.qty_on_hand || 0) + Number(item.qty), last_updated: now() }
        await db.warehouse_stock.put(wsd)
        await supabase.from('warehouse_stock').upsert(wsd)

        if (uc > 0) {
          const mat = await db.materials.get(item.material_id)
          if (mat) {
            const prevQty  = (mat as any).total_qty_purchased  || 0
            const prevCost = (mat as any).total_cost_purchased || 0
            const newQty   = prevQty  + Number(item.qty)
            const newCost  = prevCost + Number(item.qty) * uc
            const avgCost  = newQty > 0 ? newCost / newQty : uc
            await db.materials.update(item.material_id, { unit_cost: avgCost, avg_cost: avgCost, total_qty_purchased: newQty, total_cost_purchased: newCost, updated_at: now() })
            await supabase.from('materials').update({ unit_cost: avgCost, avg_cost: avgCost, total_qty_purchased: newQty, total_cost_purchased: newCost }).eq('id', item.material_id)
          }
        }
      }
      toast.success(`Pembelian ${poNumber} dicatat`)
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
            {allStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
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
            const mat = materials?.find(m => m.id === item.material_id)
            const uc  = getUnitCost(item)
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50">
                <select className="input text-sm" value={item.material_id} onChange={e => updateItem(i,'material_id',e.target.value)}>
                  <option value="">Pilih bahan</option>
                  {materials?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
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
