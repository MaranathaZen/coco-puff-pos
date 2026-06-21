import re

with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace EditStokGudangForm
start = content.find('function EditStokGudangForm(')
end = content.find('\nexport default', start)
if end == -1:
    end = len(content)

old_form = content[start:end]

new_form = '''function EditStokGudangForm({ item, onClose }: { item: any; onClose: () => void }) {
  const [name, setName] = useState(item.name || '')
  const [category, setCategory] = useState(item.category || 'bahan_baku')
  const [unit, setUnit] = useState(item.unit || '')
  const [unitCost, setUnitCost] = useState(String(item.unit_cost || item.avg_cost || 0))
  const [minStock, setMinStock] = useState(String(item.min_stock || 0))
  const [qty, setQty] = useState(String(item.qty || 0))
  const [avg, setAvg] = useState(String(item.avg_cost || 0))
  const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!name.trim()) return toast.error('Nama wajib diisi')
    if (!unit) return toast.error('Satuan wajib diisi')
    if (Number(qty) < 0) return toast.error('Qty tidak boleh negatif')
    setSaving(true)
    try {
      await db.materials.update(item.id, { name: name.trim(), category, unit, unit_cost: Number(unitCost), min_stock: Number(minStock), updated_at: now() })
      await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), min_stock: Number(minStock) }).eq('id', item.id)
      const ws = await db.warehouse_stock.where('material_id').equals(item.id).first()
      const wsd: any = { id: ws?.id || generateId(), material_id: item.id, qty_on_hand: Number(qty), avg_cost: Number(avg) || Number(unitCost) || 0, last_updated: now() }
      await db.warehouse_stock.put(wsd)
      await supabase.from('warehouse_stock').upsert(wsd)
      toast.success('Stok gudang diperbarui')
      onClose()
    } catch (e) { toast.error('Gagal: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }
  const CATS = ['bahan_baku','bahan_setengah_jadi','packaging','non_produksi']
  return (
    <Modal title="Edit: Bahan" onClose={onClose}>
      <div><Label required>Nama Bahan</Label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
      <div><Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {CATS.map(k => <button key={k} onClick={() => setCategory(k)} className={`py-2 px-3 rounded-xl text-xs font-medium border ${category===k?'bg-gray-900 text-white':'bg-white text-gray-600 border-gray-200'}`}>{k.replace(/_/g,' ')}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>QTY Stok</Label><input className="input" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div><Label>Avg Cost (Rp)</Label><input className="input" type="number" value={avg} onChange={e => setAvg(e.target.value)} /></div>
        <div><Label>Harga Default (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
        <div><Label>Min. Stok</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}
'''

result = content[:start] + new_form + content[end:]
with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(result)
print('Done! Lines:', len(result.splitlines()))
