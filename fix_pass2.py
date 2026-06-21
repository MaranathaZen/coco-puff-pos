with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update signature StokProduksiView
old = """function StokProduksiView({ isOwnerManager, setHeaderActions }: {
  isOwnerManager: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {"""
new = """function StokProduksiView({ isOwnerManager, isOwner, setHeaderActions }: {
  isOwnerManager: boolean; isOwner?: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {"""
content = content.replace(old, new)
print('1 sig produksi:', new in content)

# 2. Update signature StokTokoView
old = """function StokTokoView({ storeId, role, isOwnerManager, setHeaderActions }: {
  storeId: string; role: string; isOwnerManager: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {"""
new = """function StokTokoView({ storeId, role, isOwner, isOwnerManager, setHeaderActions }: {
  storeId: string; role: string; isOwner?: boolean; isOwnerManager: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {"""
content = content.replace(old, new)
print('2 sig toko:', new in content)

# 3. Teruskan isOwner ke PsEditForm
old = "{showPsForm && isOwnerManager && <PsEditForm ps={editPs} onClose={() => { setShowPsForm(false); setEditPs(null) }} />}"
new = "{showPsForm && isOwnerManager && <PsEditForm ps={editPs} isOwner={isOwner} onClose={() => { setShowPsForm(false); setEditPs(null) }} />}"
content = content.replace(old, new)
print('3 pass produksi:', new in content)

# 4. Teruskan isOwner ke EditStokTokoForm
old = "{editStock && isOwnerManager && <EditStokTokoForm stock={editStock} onClose={() => setEditStock(null)} />}"
new = "{editStock && isOwnerManager && <EditStokTokoForm stock={editStock} isOwner={isOwner} onClose={() => setEditStock(null)} />}"
content = content.replace(old, new)
print('4 pass toko:', new in content)

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
