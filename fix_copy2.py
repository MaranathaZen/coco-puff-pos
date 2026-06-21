with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='latin-1') as f:
    content = f.read()

content = content.replace("'\xc3\xa2\xc2\x9c\xc2\x93'", "'\u2713'")  # ✓
content = content.replace("'\xc3\xa2\xc2\xa7\xc2\x89'", "'\u29c9'")  # ⧉

with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
