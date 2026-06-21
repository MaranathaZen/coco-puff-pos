with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

marker = "const existing2 = await db.finished_goods_stock.filter(f =>\n        f.product_name === productName.trim() || f.product_id === fgsProductId\n      ).first()"

idx = content.find(marker)

# Cari akhir blok (sampai penutup "}" setelah else block finished_goods_stock)
end_marker = "if (error) await supabase.from('finished_goods_stock').upsert(fgsData)\n      }"
end_idx = content.find(end_marker, idx) + len(end_marker)

old_block = content[idx:end_idx]
print('OLD BLOCK:')
print(old_block)
print('---END---')
