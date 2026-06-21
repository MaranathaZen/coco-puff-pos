with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Update handleSave include is_active
old1 = """        await db.materials.update(mat.id, { name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgToko, min_stock: Number(minStock), updated_at: now() } as any)
        await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgToko, min_stock: Number(minStock) }).eq('id', mat.id)"""
new1 = """        await db.materials.update(mat.id, { name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgToko, min_stock: Number(minStock), is_active: isActive, updated_at: now() } as any)
        await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgToko, min_stock: Number(minStock), is_active: isActive }).eq('id', mat.id)"""
content = content.replace(old1, new1)
print('1:', new1 in content)

# Tambah toggle Aktif + tombol Hapus di akhir blok !stock.isProduk, sebelum tutup </>
old2 = """            {customUnit && <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ketik satuan..." />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Harga Default (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
            <div><Label>Min. Stok</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
          </div>
        </>
      )}"""
new2 = """            {customUnit && <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ketik satuan..." />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Harga Default (Rp)</Label><input className="input" type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
            <div><Label>Min. Stok</Label><input className="input" type="number" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>
          </div>
          {isOwner && (
            <div className="flex items-center justify-between py-2">
              <div><p className="text-sm font-medium text-gray-700">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di stok</p></div>
              <button onClick={() => setIsActive(!isActive)} className={`w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isActive ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          )}
        </>
      )}"""
content = content.replace(old2, new2)
print('2:', new2 in content)

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
