with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''  const CATS = ['bahan_baku','bahan_setengah_jadi','packaging','non_produksi']
  return (
    <Modal title="Edit: Bahan" onClose={onClose}>
      <div><Label required>Nama Bahan</Label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
      <div><Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {CATS.map(k => <button key={k} onClick={() => setCategory(k)} className={`py-2 px-3 rounded-xl text-xs font-medium border ${category===k?\'bg-gray-900 text-white\':\'bg-white text-gray-600 border-gray-200\'}`}>{k.replace(/_/g,\' \')}</button>)}
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
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? \'Menyimpan...\' : \'Simpan\'}</button>
      </div>
    </Modal>
  )
}'''

new = '''  const CATS = [\'bahan_baku\',\'bahan_setengah_jadi\',\'packaging\',\'non_produksi\']
  const SATUAN_LIST = [\'Gram\',\'Ml\',\'Pcs\',\'Kg\',\'Liter\',\'Pack\',\'Lembar\',\'Roll\']
  const [isActive, setIsActive] = useState(item.is_active ?? true)
  const [customUnit, setCustom] = useState(!SATUAN_LIST.map(s => s.toLowerCase()).includes((item.unit||\'\'). toLowerCase()))
  async function handleDelete() {
    if (!confirm(`Hapus "${name}" permanen?`)) return
    try {
      await supabase.from(\'warehouse_stock\').delete().eq(\'material_id\', item.id)
      await supabase.from(\'materials\').delete().eq(\'id\', item.id)
      await db.warehouse_stock.where(\'material_id\').equals(item.id).delete()
      await db.materials.delete(item.id)
      toast.success(`"${name}" dihapus`)
      onClose()
    } catch (e) { toast.error(\'Gagal hapus\') }
  }
  return (
    <Modal title="Edit Bahan" onClose={onClose}>
      <div><Label required>Nama Bahan</Label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
      <div><Label required>Kategori</Label>
        <div className="grid grid-cols-2 gap-2">
          {CATS.map(k => <button key={k} onClick={() => setCategory(k)} className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${category===k?\'bg-gray-900 text-white border-gray-900\':\'bg-white text-gray-600 border-gray-200\'}`}>{k.replace(/_/g,\' \').replace(/\\b\\w/g,c=>c.toUpperCase())}</button>)}
        </div>
      </div>
      <div><Label required>Satuan</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {SATUAN_LIST.map(s => <button key={s} onClick={() => { setUnit(s); setCustom(false) }} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${unit===s&&!customUnit?\'bg-gray-900 text-white border-gray-900\':\'bg-white text-gray-600 border-gray-200\'}`}>{s}</button>)}
          <button onClick={() => setCustom(true)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${customUnit?\'bg-gray-900 text-white border-gray-900\':\'bg-white text-gray-600 border-gray-200\'}`}>Lainnya</button>
        </div>
        {customUnit && <input className="input" placeholder="Satuan custom" value={unit} onChange={e => setUnit(e.target.value)} />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label required>QTY Stok</Label><input className="input" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div><Label>Avg Cost (Rp)</Label><input className="input" type="number" value={avg} onChange={e => setAvg(e.target.value)} /></div>
        <div><Label>Harga Default (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
        <div><Label>Min. Stok</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between py-2">
        <div><p className="text-sm font-medium text-gray-700">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di stok</p></div>
        <button onClick={() => setIsActive(!isActive)} className={`w-12 h-6 rounded-full transition-colors ${isActive?\'bg-gray-900\':\'bg-gray-200\'}`}>
          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isActive?\'translate-x-6\':\'translate-x-0\'}`} />
        </button>
      </div>
      <div className="flex gap-3">
        <button onClick={handleDelete} className="px-4 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium flex items-center gap-1"><Trash2 size={14}/>Hapus</button>
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? \'Menyimpan...\' : \'Simpan\'}</button>
      </div>
    </Modal>
  )
}'''

result = content.replace(old, new)
print('Changed:', content != result)
with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(result)
