# ============================================================
# Patch ProduksiTokoForm.handleSave
# Fix 1: await semua supabase update (bukan fire-and-forget)
# Fix 2: refresh stok dari server sebelum produksi
# ============================================================

$f = "src\pages\produksi\ProduksiPage.tsx"
$c = Get-Content $f -Raw

# Fix 1: ganti fire-and-forget jadi await untuk update stok bahan
$old1 = "        if (existing) {
          const newQty = Math.max(0, existing.qty_on_hand - used)
          await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
          supabase.from('stock').update({ qty_on_hand: newQty }).eq('id', existing.id).then(() => { })
        }"
$new1 = "        if (existing) {
          const newQty = Math.max(0, existing.qty_on_hand - used)
          await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
          // FIX: await supaya server update tidak fire-and-forget
          await supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', existing.id)
        } else {
          // FIX: kalau tidak ada di Dexie, cek langsung ke server
          const { data: serverStock } = await supabase.from('stock')
            .select('id, qty_on_hand')
            .eq('store_id', storeId)
            .eq('material_id', ri.material_id)
            .maybeSingle()
          if (serverStock) {
            const newQty = Math.max(0, serverStock.qty_on_hand - used)
            await supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', serverStock.id)
            await db.stock.put({ ...serverStock, store_id: storeId, ingredient_id: ri.material_id, material_id: ri.material_id, qty_on_hand: newQty, last_updated: now() })
          } else {
            console.warn('[PTOKO] Stok tidak ditemukan untuk:', ri.material_id)
          }
        }"

# Fix 2: ganti fire-and-forget untuk update stok hasil produksi
$old2 = "          if (existing) {
            await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
            supabase.from('stock').update({ qty_on_hand: newQty }).eq('id', existing.id).then(() => { })
          } else {
            const newStock: any = { id: generateId(), store_id: storeId, ingredient_id: mat.id, material_id: mat.id, qty_on_hand: newQty, avg_cost: 0, last_updated: now() }
            await db.stock.add(newStock)
            supabase.from('stock').upsert(newStock).then(() => { })
          }"
$new2 = "          if (existing) {
            await db.stock.update(existing.id, { qty_on_hand: newQty, last_updated: now() })
            // FIX: await supaya server update tidak fire-and-forget
            await supabase.from('stock').update({ qty_on_hand: newQty, last_updated: now() }).eq('id', existing.id)
          } else {
            const newStock: any = { id: generateId(), store_id: storeId, ingredient_id: mat.id, material_id: mat.id, qty_on_hand: newQty, avg_cost: 0, last_updated: now() }
            await db.stock.add(newStock)
            // FIX: await supaya server upsert tidak fire-and-forget
            await supabase.from('stock').upsert(newStock, { onConflict: 'store_id,ingredient_id' })
          }"

# Fix 3: tambah refresh stok dari server sebelum produksi di handleSave
$old3 = "    setSaving(true)
    try {
      const logId = generateId()"
$new3 = "    setSaving(true)
    try {
      // FIX: refresh stok dari server sebelum produksi supaya data terbaru
      const { data: freshStocks } = await supabase.from('stock').select('*').eq('store_id', storeId)
      if (freshStocks?.length) await db.stock.bulkPut(freshStocks)

      const logId = generateId()"

$c = $c.Replace($old1, $new1)
$c = $c.Replace($old2, $new2)
$c = $c.Replace($old3, $new3)

Set-Content $f $c -NoNewline -Encoding UTF8
Write-Host "Patch applied"

# Verifikasi
Select-String -Path $f -Pattern "FIX: refresh stok" | Select-Object -First 1
Select-String -Path $f -Pattern "FIX: await supaya server update" | Select-Object -First 2
