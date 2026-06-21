with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Hapus baris index 438, 439, 440 (yaitu baris 439, 440, 441)
del lines[438:441]

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('Done, new total lines:', len(lines))
