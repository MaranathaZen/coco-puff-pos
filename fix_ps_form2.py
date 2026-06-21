with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 3. Update handleSave untuk include is_active
old = """      const matData: any = {
        id: matId, name: name.trim(), category, unit,
        unit_cost: Number(unitCost), min_stock: Number(minStock),
        is_active: true, updated_at: now(),
      }
      await db.materials.update(matId, matData)
      const hasHistoryPs = (mat as any)?.total_qty_purchased > 0
      const newAvgPs = hasHistoryPs ? (mat as any)?.avg_cost : Number(unitCost)
      await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgPs, min_stock: Number(minStock) }).eq('id', matId)"""
new = """      const matData: any = {
        id: matId, name: name.trim(), category, unit,
        unit_cost: Number(unitCost), min_stock: Number(minStock),
        is_active: isActive, updated_at: now(),
      }
      await db.materials.update(matId, matData)
      const hasHistoryPs = (mat as any)?.total_qty_purchased > 0
      const newAvgPs = hasHistoryPs ? (mat as any)?.avg_cost : Number(unitCost)
      await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgPs, min_stock: Number(minStock), is_active: isActive }).eq('id', matId)"""
content = content.replace(old, new)
print('3:', new in content)

# 4. Tambah UI toggle Aktif + tombol Hapus sebelum tombol Batal/Simpan di PsEditForm
old = """      <div className="grid grid-cols-2 gap-3">
        <div><Label>Harga Default/Satuan (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
        <div><Label>Min. Stok (alert)</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

function MaterialForm"""
new = """      <div className="grid grid-cols-2 gap-3">
        <div><Label>Harga Default/Satuan (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
        <div><Label>Min. Stok (alert)</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
      </div>
      {isOwner && ps && (
        <div className="flex items-center justify-between py-2">
          <div><p className="text-sm font-medium text-gray-700">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di stok</p></div>
          <button onClick={() => setIsActive(!isActive)} className={`w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isActive ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      )}
      <div className="flex gap-3">
        {isOwner && ps && (
          <button onClick={handleDelete} disabled={saving} className="px-4 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium flex items-center gap-1"><Trash2 size={14}/>Hapus</button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

function MaterialForm"""
content = content.replace(old, new)
print('4:', new in content)

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
