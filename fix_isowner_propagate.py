with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Tambah isOwner ke pemanggilan StokTokoContent
old1 = """        <StokTokoContent
          key={activeStoreId}
          storeId={activeStoreId}
          isOwnerManager={isOwnerManager}
          setHeaderActions={setHeaderActions}
        />"""
new1 = """        <StokTokoContent
          key={activeStoreId}
          storeId={activeStoreId}
          isOwnerManager={isOwnerManager}
          isOwner={isOwner}
          setHeaderActions={setHeaderActions}
        />"""
content = content.replace(old1, new1)
print('1:', new1 in content)

# 2. Update signature StokTokoContent
old2 = """function StokTokoContent({ storeId, isOwnerManager, setHeaderActions }: {
  storeId: string; isOwnerManager: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {"""
new2 = """function StokTokoContent({ storeId, isOwnerManager, isOwner, setHeaderActions }: {
  storeId: string; isOwnerManager: boolean; isOwner?: boolean; setHeaderActions: (n: React.ReactNode) => void
}) {"""
content = content.replace(old2, new2)
print('2:', new2 in content)

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
