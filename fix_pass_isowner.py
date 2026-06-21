with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Pass isOwner ke StokProduksiView dan StokTokoView
old1 = "        {tab === 'produksi' && <StokProduksiView isOwnerManager={isOwnerManager} setHeaderActions={setHeaderActions} />}\n        {tab === 'toko' && <StokTokoView storeId={user?.store_id || ''} role={role} isOwnerManager={isOwnerManager} setHeaderActions={setHeaderActions} />}"
new1 = "        {tab === 'produksi' && <StokProduksiView isOwnerManager={isOwnerManager} isOwner={role === 'owner'} setHeaderActions={setHeaderActions} />}\n        {tab === 'toko' && <StokTokoView storeId={user?.store_id || ''} role={role} isOwner={role === 'owner'} isOwnerManager={isOwnerManager} setHeaderActions={setHeaderActions} />}"
content = content.replace(old1, new1)
print('1:', new1 in content)

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
