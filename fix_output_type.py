with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """      const existingMat = await db.materials.filter(m =>
        m.name.toLowerCase() === productName.trim().toLowerCase()
      ).first()
      let fgsProductId: string
      if (existingMat) {
        fgsProductId = existingMat.id
      } else {
        const newMatId = `mat-${generateId().slice(0, 8)}`
        const newMat: any = {
          id: newMatId, name: productName.trim(), unit: selectedRecipe?.yield_unit || 'pcs',
          unit_cost: hppPerUnit, min_stock: 0, category: 'bahan_setengah_jadi',
          is_active: true, created_at: now(), updated_at: now(),
        }
        await db.materials.put(newMat)
        await supabase.from('materials').upsert(newMat)
        fgsProductId = newMatId
      }
      if (hppPerUnit > 0) {
        await db.materials.update(fgsProductId, { unit_cost: hppPerUnit, avg_cost: hppPerUnit, updated_at: now() } as any)
        await supabase.from('materials').update({ unit_cost: hppPerUnit, avg_cost: hppPerUnit }).eq('id', fgsProductId)
      }
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
      }"""

new = """      const existingMat = await db.materials.filter(m =>
        m.name.toLowerCase() === productName.trim().toLowerCase()
      ).first()
      let fgsProductId: string
      if (existingMat) {
        fgsProductId = existingMat.id
      } else {
        const newMatId = `mat-${generateId().slice(0, 8)}`
        const newMat: any = {
          id: newMatId, name: productName.trim(), unit: selectedRecipe?.yield_unit || 'pcs',
          unit_cost: hppPerUnit, min_stock: 0, category: 'bahan_setengah_jadi',
          is_active: true, created_at: now(), updated_at: now(),
        }
        await db.materials.put(newMat)
        await supabase.from('materials').upsert(newMat)
        fgsProductId = newMatId
      }
      if (hppPerUnit > 0) {
        await db.materials.update(fgsProductId, { unit_cost: hppPerUnit, avg_cost: hppPerUnit, updated_at: now() } as any)
        await supabase.from('materials').update({ unit_cost: hppPerUnit, avg_cost: hppPerUnit }).eq('id', fgsProductId)
      }
      // FIX: cek output_type resep - bahan antara (Premix, Butter Mix) masuk production_stock, produk jadi masuk finished_goods_stock
      const outputType = (selectedRecipe as any)?.output_type || 'finished_goods'
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

result = content.replace(old, new)
print('Changed:', content != result)
with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(result)
