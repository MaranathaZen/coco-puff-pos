with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\xc3\xa2\xc2\x9c\xc2\x94', '\u2714')  # ✔
content = content.replace('\xc3\xa2\xc2\xa7\xc2\x89', '\u29c9')  # ⧉

with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
