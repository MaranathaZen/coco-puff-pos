# patch_sync_interval.ps1
$file = "src\lib\sync.ts"
$content = Get-Content $file -Raw

# Push interval: 30s -> 5s
$content = $content -replace "pushInterval = setInterval\(\(\) => \{ pushToSupabase\(\) \}, 30_000\)", "pushInterval = setInterval(() => { pushToSupabase() }, 5_000)"

# Pull interval: 60s -> 30s  
$content = $content -replace "pullInterval = setInterval\(\(\) => \{ pullFromSupabase\(storeId\) \}, 60_000\)", "pullInterval = setInterval(() => { pullFromSupabase(storeId) }, 30_000)"

Set-Content $file $content -NoNewline
Write-Host "OK: push=5s, pull=30s" -ForegroundColor Green

Write-Host ""
Write-Host "Juga patch CashierPage — push langsung setelah transaksi..." -ForegroundColor Cyan

$file2 = "src\pages\cashier\CashierPage.tsx"
$content2 = Get-Content $file2 -Raw

# Tambah import pushToSupabase
if ($content2 -notmatch 'pushToSupabase') {
  $content2 = $content2 -replace "import \{ db, generateId, now, addToSyncQueue \} from '@/lib/db'", "import { db, generateId, now, addToSyncQueue } from '@/lib/db'`nimport { pushToSupabase } from '@/lib/sync'"
  Write-Host "OK: import pushToSupabase ditambah" -ForegroundColor Green
} else {
  Write-Host "SKIP: pushToSupabase sudah diimport" -ForegroundColor Yellow
}

# Panggil pushToSupabase setelah addToSyncQueue selesai
$content2 = $content2 -replace "(await deductStockFromRecipes\(\[\.\.\.txItems, \.\.\.txPakets\], STORE_ID\))", "`$1`n      // Push langsung tanpa tunggu interval`n      pushToSupabase().catch(() => {})"

Set-Content $file2 $content2 -NoNewline
Write-Host "OK: push langsung setelah transaksi" -ForegroundColor Green
