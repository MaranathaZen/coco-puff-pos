// src/pages/stock/StockPage.tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { useAuthStore } from '@/store/auth'
import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'

export default function StockPage() {
  const { user } = useAuthStore()
  const STORE_ID = user?.store_id || ''
  const [showAdd, setShowAdd] = useState(false)

  const stocks = useLiveQuery(async () => {
    const all = await db.stock.where('store_id').equals(STORE_ID).toArray()
    const ings = await db.ingredients.toArray()
    const ingMap = Object.fromEntries(ings.map(i => [i.id, i]))
    return all.map(s => ({ ...s, ingredient: ingMap[s.ingredient_id] }))
  }, [STORE_ID])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Stok Bahan</h2>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Input
        </button>
      </div>

      <div className="space-y-2">
        {stocks?.map(s => (
          <div key={s.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">{s.ingredient?.name || '-'}</p>
              <p className="text-xs text-gray-500">Update: {formatDate(s.last_updated)}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-lg text-gray-800">{s.qty_on_hand}</p>
              <p className="text-xs text-gray-500">{s.ingredient?.unit}</p>
            </div>
          </div>
        ))}
        {stocks?.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">Belum ada data stok</div>
        )}
      </div>

      {showAdd && (
        <StockInputForm storeId={STORE_ID} onClose={() => setShowAdd(false)} userId={user!.id} />
      )}
    </div>
  )
}

function StockInputForm({ onClose, userId, storeId }: {
  onClose: () => void
  userId: string
  storeId: string
}) {
  const ingredients = useLiveQuery(() => db.ingredients.filter(i => i.is_active).toArray(), [])
  const [ingId, setIngId]   = useState('')
  const [qty, setQty]       = useState('')
  const [note, setNote]     = useState('')
  const [type, setType]     = useState<'purchase' | 'adjustment'>('purchase')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!ingId || !qty) return toast.error('Pilih bahan dan masukkan qty')
    setSaving(true)
    try {
      const existing = await db.stock
        .where('[store_id+ingredient_id]')
        .equals([storeId, ingId]).first()

      const qtyBefore = existing?.qty_on_hand ?? 0
      const qtyNum    = Number(qty)
      const qtyAfter  = type === 'adjustment' ? qtyNum : qtyBefore + qtyNum

      const stockData = {
        id:            existing?.id || generateId(),
        store_id:      storeId,
        ingredient_id: ingId,
        qty_on_hand:   qtyAfter,
        last_updated:  now(),
      }
      await db.stock.put(stockData)
      await addToSyncQueue('stock', stockData.id, existing ? 'update' : 'insert', stockData, storeId)

      const mutation = {
        id:            generateId(),
        store_id:      storeId,
        ingredient_id: ingId,
        mutation_type: type as any,
        qty:           type === 'adjustment' ? qtyNum - qtyBefore : qtyNum,
        qty_before:    qtyBefore,
        qty_after:     qtyAfter,
        note,
        created_by:    userId,
        created_at:    now(),
      }
      await db.stock_mutations.add(mutation)
      await addToSyncQueue('stock_mutations', mutation.id, 'insert', mutation, storeId)

      toast.success('Stok berhasil diupdate')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-lg">Input Stok</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Bahan</label>
            <select className="input" value={ingId} onChange={e => setIngId(e.target.value)}>
              <option value="">-- Pilih Bahan --</option>
              {ingredients?.map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Jenis</label>
            <div className="grid grid-cols-2 gap-2">
              {(['purchase', 'adjustment'] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`py-2 rounded-xl text-sm font-medium border ${type === t ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-700'}`}>
                  {t === 'purchase' ? 'Pembelian' : 'Koreksi'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              {type === 'adjustment' ? 'Stok Aktual' : 'Qty Masuk'}
            </label>
            <input className="input" type="number" value={qty}
              onChange={e => setQty(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Catatan</label>
            <input className="input" value={note}
              onChange={e => setNote(e.target.value)} placeholder="Opsional" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}
