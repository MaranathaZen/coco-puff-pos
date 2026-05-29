// src/pages/biaya/UnifiedBiayaPage.tsx
import { useState, useMemo, useEffect, useContext, createContext } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatRupiah } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'

const ToolbarCtx = createContext<(n: React.ReactNode) => void>(() => {})
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

async function generateExpenseNumber() {
  const today = new Date()
  const ds = today.toISOString().slice(0,10).replace(/-/g,'')
  const prefix = `BIA-${ds}-`
  const ex = await db.warehouse_expenses.filter(e => (e as any).expense_number?.startsWith(prefix)).toArray()
  return `${prefix}${String(ex.length+1).padStart(3,'0')}`
}

const KATEGORI_BIAYA = [
  { value: 'beban_bahan_baku',    label: 'Bahan Baku',     desc: 'Bahan produksi' },
  { value: 'beban_tenaga_kerja',  label: 'Tenaga Kerja',   desc: 'Gaji, upah' },
  { value: 'beban_sewa',          label: 'Sewa',           desc: 'Sewa tempat' },
  { value: 'beban_utilitas',      label: 'Utilitas',       desc: 'Listrik, air, gas' },
  { value: 'beban_packaging',     label: 'Packaging',      desc: 'Dus, plastik' },
  { value: 'beban_transport',     label: 'Transport',      desc: 'Pengiriman, bbm' },
  { value: 'beban_pemasaran',     label: 'Pemasaran',      desc: 'Iklan, promo' },
  { value: 'beban_lainnya',       label: 'Lainnya',        desc: 'ATK, kebersihan' },
]
const METODE_BAYAR = [
  { value: 'tunai', label: 'Tunai' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'kredit', label: 'Kredit' },
]

function Modal({ title, onClose, children }: any) {
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

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={handleCopy}
      className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-600 ml-1 align-middle"
      title="Copy ID">
      {copied ? '✓' : '⧉'}
    </button>
  )
}

export default function UnifiedBiayaPage() {
  const { user } = useAuthStore()
  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)
  const [syncing, setSyncing] = useState(false)

  async function syncData() {
    setSyncing(true)
    try {
      const { data } = await supabase.from('warehouse_expenses').select('*').order('created_at', { ascending: false }).limit(200)
      if (data?.length) { await db.warehouse_expenses.clear(); await db.warehouse_expenses.bulkPut(data) }
      toast.success('Data diperbarui')
    } catch { toast.error('Gagal sync') }
    finally { setSyncing(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Biaya</h1>
        <div className="flex items-center gap-2">
          {toolbarActions}
          <button onClick={syncData} disabled={syncing} className="p-2 text-gray-400 rounded-full">
            <RefreshCw size={16} className={syncing ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>
      <ToolbarCtx.Provider value={setToolbarActions}>
        <div className="flex-1 overflow-auto bg-gray-50">
          <BiayaList userId={user!.id} role={user!.role} />
        </div>
      </ToolbarCtx.Provider>
    </div>
  )
}

function BiayaList({ userId, role }: { userId: string; role: string }) {
  const setToolbar = useContext(ToolbarCtx)
  const [showForm, setShowForm] = useState(false)
  const [groupMode, setGroupMode] = useState<Period>('hari')
  const [filterCat, setFilterCat] = useState('semua')
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    // Auto expand hari ini saja
    const today = new Date().toISOString().slice(0, 10)
    return { [today]: true }
  })

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
          <Plus size={13} /> Catat
        </button>
      </div>
    )
    return () => setToolbar(null)
  }, [groupMode])

  const expenses = useLiveQuery(async () => {
    let list = await db.warehouse_expenses.orderBy('created_at').reverse().toArray()
    // Produksi dan kasir hanya lihat biaya yang mereka input sendiri
    if (role === 'produksi' || role === 'kasir') {
      list = list.filter(e => e.created_by === userId)
    }
    return list
  }, [role, userId])

  const filtered = useMemo(() => {
    if (!expenses) return []
    let list = expenses
    if (filterCat !== 'semua') list = list.filter(e => e.category === filterCat)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e as any).expense_number?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q) ||
        (e as any).payment_method?.toLowerCase().includes(q)
      )
    }
    return list
  }, [expenses, filterCat, search])

  const grouped = useMemo(() => groupBy(filtered, e => groupKey(e.created_at, groupMode)), [filtered, groupMode])

  const totalBulanIni = useMemo(() => {
    const now2 = new Date()
    return (expenses || []).filter(e => {
      const d = new Date(e.created_at)
      return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear()
    }).reduce((s, e) => s + e.amount, 0)
  }, [expenses])

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-1">Total Biaya Bulan Ini</p>
        <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalBulanIni)}</p>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        placeholder="Cari keterangan biaya..." />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setFilterCat('semua')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterCat === 'semua' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>Semua</button>
        {KATEGORI_BIAYA.map(k => (
          <button key={k.value} onClick={() => setFilterCat(k.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterCat === k.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>{k.label}</button>
        ))}
      </div>

      {grouped.map(({ key, items: grpItems }) => {
        const total = grpItems.reduce((s, e) => s + e.amount, 0)
        const expanded = expandedGroups[key] !== false
        return (
          <div key={key}>
            <button onClick={() => setExpandedGroups(prev => ({ ...prev, [key]: !expanded }))}
              className="w-full flex items-center justify-between px-1 py-2">
              <div className="flex items-center gap-2">
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
                <p className="text-xs font-semibold text-gray-600">{groupLabel(grpItems[0].created_at, groupMode)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{grpItems.length} item</span>
                <span className="text-xs font-medium text-gray-700">{formatRupiah(total)}</span>
              </div>
            </button>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden"
              style={{ display: expanded ? undefined : 'none' }}>
              {grpItems.map((e, idx) => (
                <div key={e.id} className={`flex items-start justify-between px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    {(e as any).expense_number && <p className="text-xs font-mono text-blue-600 mb-0.5">{(e as any).expense_number}<CopyBtn text={(e as any).expense_number} /></p>}
                    <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {KATEGORI_BIAYA.find(k => k.value === e.category)?.label || e.category}
                      {' · '}{new Date(e.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}, {new Date(e.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', hour12: false })}
                      {(e as any).payment_method ? ` · ${(e as any).payment_method}` : ''}
                      {(e as any).transfer_to ? ` → ${(e as any).transfer_to}` : ''}
                    </p>
                    {e.notes && <p className="text-xs text-gray-500 italic mt-0.5">📝 {e.notes}</p>}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatRupiah(e.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Belum ada catatan biaya</div>
      )}

      {showForm && <BiayaForm userId={userId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function BiayaForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [name, setName]             = useState('')
  const [amount, setAmount]         = useState('')
  const [category, setCat]          = useState('beban_lainnya')
  const [payMethod, setPay]         = useState('tunai')
  const [transferTo, setTransferTo] = useState('')
  const [dueDate, setDueDate]       = useState('')
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Keterangan wajib diisi')
    if (!amount || Number(amount) <= 0) return toast.error('Jumlah wajib diisi')
    setSaving(true)
    try {
      const expNumber = await generateExpenseNumber()
      const data: any = { id: generateId(), expense_number: expNumber, name: name.trim(), amount: Number(amount), expense_date: now().slice(0,10), category, payment_method: payMethod, transfer_to: transferTo || undefined, due_date: dueDate || undefined, notes: notes || undefined, created_by: userId, created_at: now() }
      await db.warehouse_expenses.add(data)
      await supabase.from('warehouse_expenses').insert(data)
      toast.success('Biaya dicatat')
      onClose()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Catat Biaya" onClose={onClose}>
      <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Keterangan <span className="text-red-400">*</span></label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Bayar listrik Mei 2026" autoFocus />
      </div>
      <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Jumlah (Rp) <span className="text-red-400">*</span></label>
        <input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
      </div>
      <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Kategori <span className="text-red-400">*</span></label>
        <div className="grid grid-cols-2 gap-2">
          {KATEGORI_BIAYA.map(c => (
            <button key={c.value} onClick={() => setCat(c.value)}
              className={`px-3 py-2 rounded-xl text-left border transition-colors ${category === c.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>
              <p className="text-xs font-medium">{c.label}</p>
              <p className={`text-[10px] leading-tight mt-0.5 ${category === c.value ? 'text-gray-300' : 'text-gray-400'}`}>{c.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Metode Bayar <span className="text-red-400">*</span></label>
        <div className="flex gap-2">
          {METODE_BAYAR.map(m => (
            <button key={m.value} onClick={() => setPay(m.value)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${payMethod === m.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>{m.label}</button>
          ))}
        </div>
      </div>
      {payMethod === 'transfer' && <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Transfer ke</label><input className="input" value={transferTo} onChange={e => setTransferTo(e.target.value)} placeholder="BCA 1234567890" /></div>}
      {payMethod === 'kredit'   && <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Jatuh Tempo</label><input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>}
      <div><label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Catatan</label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}
