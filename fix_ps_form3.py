with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

marker = "<div><Label>Min. Stok (alert)</Label><input className=\"input\" type=\"number\" value={minStock} onChange={e => setMinStock(e.target.value)} /></div>\n      </div>"
idx = content.find(marker)
print('Found at:', idx)
if idx != -1:
    insert_pos = idx + len(marker)
    addon = """
      {isOwner && ps && (
        <div className="flex items-center justify-between py-2">
          <div><p className="text-sm font-medium text-gray-700">Aktif</p><p className="text-xs text-gray-400">Nonaktif tidak muncul di stok</p></div>
          <button onClick={() => setIsActive(!isActive)} className={`w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isActive ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      )}"""
    content = content[:insert_pos] + addon + content[insert_pos:]

# Tambah tombol Hapus di blok flex gap-3 PsEditForm (yang punya onClose dan Batal langsung setelah is_active block)
marker2 = "<div className=\"flex gap-3\">\n        <button onClick={onClose} className=\"flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700\">Batal</button>\n        <button onClick={handleSave} disabled={saving} className=\"flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50\">{saving ? 'Menyimpan...' : 'Simpan'}</button>\n      </div>"
idx2 = content.find(marker2)
print('Found marker2 at:', idx2)
if idx2 != -1:
    new2 = """<div className="flex gap-3">
        {isOwner && ps && (
          <button onClick={handleDelete} disabled={saving} className="px-4 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium flex items-center gap-1"><Trash2 size={14}/>Hapus</button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>"""
    content = content[:idx2] + new2 + content[idx2+len(marker2):]

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
