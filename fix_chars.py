with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

import re
# Fix tab header emoji - ganti semua karakter sebelum "Divisi Produksi" dan "Produksi Toko"
content = re.sub(r'[^\x00-\x7F\u00B7\u00D7]+ Divisi Produksi', '🏭 Divisi Produksi', content)
content = re.sub(r'[^\x00-\x7F\u00B7\u00D7]+ Produksi Toko', '🏪 Produksi Toko', content)
# Fix x karakter sebelum angka (× -> x)
content = re.sub(r'[^\x00-\x7F\u00B7]+(\d)', r'x \1', content)
# Fix · corrupt
content = content.replace('\u00b7', '·')

with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
