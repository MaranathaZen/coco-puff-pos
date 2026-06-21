with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

import re
content = re.sub(r"\{copied \? '[^']*' : '[^']*'\}", "{copied ? 'OK' : 'Copy'}", content)

with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
