with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(' \xc2\xb7 ', ' \u00b7 ')
with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
