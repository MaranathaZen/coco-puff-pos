# patch_pembelian_debug.ps1
# Fix 1: PembelianForm — filter bahan per toko
# Fix 2: DebugPage — TypeError catch is not a function

$ErrorActionPreference = "Continue"
Write-Host "Patching..." -ForegroundColor Cyan

# ── FIX 1: UnifiedPembelianPage.tsx ──────────────────────────
$pemFile = "src\pages\pembelian\UnifiedPembelianPage.tsx"
$pem = Get-Content $pemFile -Raw

$oldMat = "  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])"
$newMat = "  const materials = useLiveQuery(async () => {
    if (!activeStoreId || activeStoreId.includes('gudang') || role === 'gudang') {
      return db.materials.filter(m => m.is_active).toArray()
    }
    const stokToko = await db.stock.where('store_id').equals(activeStoreId).toArray()
    const matIds = new Set(stokToko.map((s: any) => s.ingredient_id || s.material_id).filter(Boolean))
    if (matIds.size === 0) return db.materials.filter(m => m.is_active).toArray()
    return db.materials.filter(m => m.is_active && matIds.has(m.id)).toArray()
  }, [activeStoreId, role])"

if ($pem -like "*useLiveQuery(() => db.materials.filter*") {
  $pem = $pem.Replace($oldMat, $newMat)
  Set-Content $pemFile $pem -NoNewline
  Write-Host "OK: PembelianForm filter bahan per toko" -ForegroundColor Green
} else {
  Write-Host "SKIP: PembelianForm sudah dipatch atau beda struktur" -ForegroundColor Yellow
}

# ── FIX 2: DebugPage.tsx — catch is not a function ───────────
$debugFile = "src\pages\debug\DebugPage.tsx"
$debug = Get-Content $debugFile -Raw

$oldCatch = "supabase.from('package_items').select('*').catch(()=>({data:[]})) as any"
$newCatch = "supabase.from('package_items').select('*')"

if ($debug -like "*select('*').catch*") {
  $debug = $debug.Replace($oldCatch, $newCatch)
  Set-Content $debugFile $debug -NoNewline
  Write-Host "OK: DebugPage catch dipatch" -ForegroundColor Green
} else {
  Write-Host "SKIP: DebugPage sudah dipatch" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done! Jalankan: npm run build" -ForegroundColor Cyan
