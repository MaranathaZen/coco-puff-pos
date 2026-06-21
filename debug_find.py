with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Cari posisi tepat untuk insert kondisi output_type
marker = "const existing2 = await db.finished_goods_stock.filter(f =>\n        f.product_name === productName.trim() || f.product_id === fgsProductId\n      ).first()"

idx = content.find(marker)
print('Found at index:', idx)
if idx == -1:
    print('NOT FOUND - checking similar text')
    idx2 = content.find("const existing2 = await db.finished_goods_stock.filter")
    print('Similar found at:', idx2)
    if idx2 != -1:
        print(repr(content[idx2:idx2+200]))
