# ============================================================
# Coco Puff POS Patch Script
# Fix 1: sync.ts v9 -> v10 (stock replace per store_id)
# Fix 2: CashierPage syncProducts stock replace
# Fix 3: CashierPage deductStockFromRecipes compound index
# ============================================================

$projectPath = "C:\coco_puff_pos"
Write-Host "=== Coco Puff POS Patch ===" -ForegroundColor Cyan

# ── FIX 1: sync.ts ───────────────────────────────────────────
Write-Host "`n[1/3] Patching sync.ts..." -ForegroundColor Yellow
$syncPath = "$projectPath\src\lib\sync.ts"
$syncContent = Get-Content $syncPath -Raw

if ($syncContent.Contains("await db.stock.where('store_id').equals(sid).delete()")) {
    Write-Host "  sync.ts sudah v10 - skip" -ForegroundColor Green
} elseif ($syncContent.Contains("if (stock.data?.length) await db.stock.bulkPut(stock.data)")) {
    $old1 = "    // stock, prices, promotions: bulkPut saja (pull per store_id, orphan cleanup tidak relevan)`n    if (prices.data?.length) await db.store_product_prices.bulkPut(prices.data)`n    if (promos.data?.length) await db.promotions.bulkPut(promos.data)`n    if (stock.data?.length) await db.stock.bulkPut(stock.data)"
    $new1 = "    // FIX v10: stock replace per store_id - hindari stale data toko lain`n    if (prices.data?.length) await db.store_product_prices.bulkPut(prices.data)`n    if (promos.data?.length) await db.promotions.bulkPut(promos.data)`n    if (stock.data) {`n      await db.stock.where('store_id').equals(sid).delete()`n      if (stock.data.length) await db.stock.bulkPut(stock.data)`n    }"
    $syncContent = $syncContent.Replace($old1, $new1)
    $syncContent = $syncContent.Replace(" * Sync offline-first — v9", " * Sync offline-first — v10")
    Set-Content $syncPath -Value $syncContent -NoNewline
    Write-Host "  sync.ts patched -> v10 OK" -ForegroundColor Green
} else {
    Write-Host "  WARN: Pattern tidak ditemukan di sync.ts" -ForegroundColor Red
}

# ── FIX 2: CashierPage syncProducts ──────────────────────────
Write-Host "`n[2/3] Patching CashierPage syncProducts..." -ForegroundColor Yellow
$cashierPath = "$projectPath\src\pages\cashier\CashierPage.tsx"
$cashierContent = Get-Content $cashierPath -Raw

if ($cashierContent.Contains("replace stock per store_id, hindari akumulasi")) {
    Write-Host "  syncProducts sudah difix - skip" -ForegroundColor Green
} elseif ($cashierContent.Contains("if (stockRes.data?.length) await db.stock.bulkPut(stockRes.data)")) {
    $old2 = "      if (stockRes.data?.length) await db.stock.bulkPut(stockRes.data)"
    $new2 = "      // FIX: replace stock per store_id, hindari akumulasi stok toko lain`n      if (stockRes.data) {`n        await db.stock.where('store_id').equals(STORE_ID).delete()`n        if (stockRes.data.length) await db.stock.bulkPut(stockRes.data)`n      }"
    $cashierContent = $cashierContent.Replace($old2, $new2)
    Write-Host "  syncProducts patched OK" -ForegroundColor Green
} else {
    Write-Host "  WARN: Pattern tidak ditemukan di syncProducts" -ForegroundColor Red
}

# ── FIX 3: deductStockFromRecipes compound index ─────────────
Write-Host "`n[3/3] Patching deductStockFromRecipes..." -ForegroundColor Yellow

if ($cashierContent.Contains("fallback pakai compound index")) {
    Write-Host "  deductStockFromRecipes sudah difix - skip" -ForegroundColor Green
} elseif ($cashierContent.Contains("const matName = matMap[ri.material_id]?.name?.toLowerCase()")) {
    $old3 = "            if (!storeStock) {
              const matName = matMap[ri.material_id]?.name?.toLowerCase()
              if (matName) {
                const allStocks = await db.stock.where('store_id').equals(storeId).toArray()
                for (const s of allStocks) {
                  const sMatId = s.ingredient_id || (s as any).material_id || ''
                  const sMat = matMap[sMatId]
                  if (sMat?.name?.toLowerCase() === matName) { storeStock = s; break }
                }
              }
            }"
    $new3 = "            // FIX: fallback pakai compound index [store_id+material_id]
            if (!storeStock) {
              storeStock = await (db.stock as any)
                .where('[store_id+material_id]')
                .equals([storeId, ri.material_id])
                .first()
            }"
    $cashierContent = $cashierContent.Replace($old3, $new3)
    Write-Host "  deductStockFromRecipes patched OK" -ForegroundColor Green
} else {
    Write-Host "  WARN: Pattern tidak ditemukan di deductStockFromRecipes" -ForegroundColor Red
}

# Sama untuk restoreStockFromVoid
if ($cashierContent.Contains("const matName = matMap[ri.material_id]?.name?.toLowerCase()")) {
    $old4 = "            if (!storeStock) {
              const matName = matMap[ri.material_id]?.name?.toLowerCase()
              if (matName) {
                const allStocks = await db.stock.where('store_id').equals(storeId).toArray()
                for (const s of allStocks) {
                  const sMatId = s.ingredient_id || (s as any).material_id || ''
                  const sMat = matMap[sMatId]
                  if (sMat?.name?.toLowerCase() === matName) { storeStock = s; break }
                }
              }
            }"
    $new4 = "            // FIX: fallback pakai compound index [store_id+material_id]
            if (!storeStock) {
              storeStock = await (db.stock as any)
                .where('[store_id+material_id]')
                .equals([storeId, ri.material_id])
                .first()
            }"
    $cashierContent = $cashierContent.Replace($old4, $new4)
    Write-Host "  restoreStockFromVoid patched OK" -ForegroundColor Green
}

Set-Content $cashierPath -Value $cashierContent -NoNewline

Write-Host "`n=== Patch selesai! ===" -ForegroundColor Cyan
Write-Host "Jalankan git add . && git commit -m 'fix: sync v10 + stock replace + BOM compound index' && git push" -ForegroundColor Gray
