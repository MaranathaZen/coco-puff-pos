with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

marker = """      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}
function StokTokoView"""

new = """      <div className="flex gap-3">
        {isOwner && ps && (
          <button onClick={handleDelete} disabled={saving} className="px-4 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium flex items-center gap-1"><Trash2 size={14}/>Hapus</button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}
function StokTokoView"""

content = content.replace(marker, new)
print('Changed:', marker not in content)

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
