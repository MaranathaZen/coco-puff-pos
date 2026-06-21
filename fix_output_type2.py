with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

marker = "const existing2 = await db.finished_goods_stock.filter(f =>\n        f.product_name === productName.trim() || f.product_id === fgsProductId\n      ).first()"
idx = content.find(marker)
end_marker = "if (error) await supabase.from('finished_goods_stock').upsert(fgsData)\n      }"
end_idx = content.find(end_marker, idx) + len(end_marker)

old_block = content[idx:end_idx]

new_block = """const outputType = (selectedRecipe as any)?.output_type || 'finished_goods'
      if (outputType === 'production_stock') {
        const existingPs = await db.production_stock.where('material_id').equals(fgsProductId).first()
        const newPsQty = (existingPs?.qty_on_hand || 0) + finalYield
        const psData: any = { id: existingPs?.id || generateId(), material_id: fgsProductId, qty_on_hand: newPsQty, avg_cost: hppPerUnit, last_updated: now() }
        await db.production_stock.put(psData)
        await supabase.from('production_stock').upsert(psData)
      } else {
        const existing2 = await db.finished_goods_stock.filter(f =>
          f.product_name === productName.trim() || f.product_id === fgsProductId
        ).first()
        const fgsId = existing2?.id || generateId()
        const newFgsQty = (existing2?.qty_on_hand || 0) + finalYield
        const fgsData: any = { id: fgsId, product_id: fgsProductId, product_name: productName.trim(), qty_on_hand: newFgsQty, hpp_per_unit: hppPerUnit, last_updated: now() }
        await db.finished_goods_stock.put(fgsData)
        if (existing2) {
          await supabase.from('finished_goods_stock').update({ qty_on_hand: newFgsQty, hpp_per_unit: hppPerUnit, last_updated: now() }).eq('id', fgsId)
        } else {
          const { error } = await supabase.from('finished_goods_stock').upsert(fgsData)
          if (error) await supabase.from('finished_goods_stock').upsert(fgsData)
        }
      }"""

result = content[:idx] + new_block + content[end_idx:]
print('Length diff:', len(result) - len(content))
with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(result)
print('Done')
