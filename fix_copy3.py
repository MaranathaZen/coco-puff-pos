with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='latin-1') as f:
    content = f.read()

# Cari dan ganti bagian copied ? ... : ...
import re
content = re.sub(r"\{copied \? '.*?' : '.*?'\}", "{copied ? 'OK' : 'Copy'}", content)

with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
