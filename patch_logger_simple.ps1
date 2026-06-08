# patch_logger_simple.ps1
# Patch main.tsx + sync.ts + copy logger.ts
# Jalankan: powershell -ExecutionPolicy Bypass -File patch_logger_simple.ps1

$ErrorActionPreference = "Continue"
Write-Host "Installing logger..." -ForegroundColor Cyan

# Step 1: Copy logger.ts
if (Test-Path "logger.ts") {
  Copy-Item "logger.ts" "src\lib\logger.ts" -Force
  Write-Host "OK: src\lib\logger.ts" -ForegroundColor Green
} else {
  Write-Host "ERROR: logger.ts tidak ada di folder ini" -ForegroundColor Red
  exit 1
}

# Step 2: Patch main.tsx
$mainFile = "src\main.tsx"
$main = Get-Content $mainFile -Raw
if ($main -notlike "*unhandledrejection*") {
  $insert = "import { logger, setLoggerAuthStore } from '@/lib/logger'" + [char]10
  $insert += "import { useAuthStore } from '@/store/auth'" + [char]10
  $insert += "setLoggerAuthStore(useAuthStore)" + [char]10 + [char]10
  $insert += "window.addEventListener('unhandledrejection', (event) => {" + [char]10
  $insert += "  logger.error('global', 'Unhandled rejection', { reason: String(event.reason) })" + [char]10
  $insert += "})" + [char]10
  $insert += "window.addEventListener('error', (event) => {" + [char]10
  $insert += "  logger.error('global', event.message, { filename: event.filename, lineno: event.lineno })" + [char]10
  $insert += "})" + [char]10 + [char]10
  $insert += "ReactDOM.createRoot"
  $main = $main.Replace("ReactDOM.createRoot", $insert)
  Set-Content $mainFile $main -NoNewline
  Write-Host "OK: main.tsx global error handler" -ForegroundColor Green
} else {
  Write-Host "SKIP: main.tsx sudah ada" -ForegroundColor Gray
}

# Step 3: Patch sync.ts
$syncFile = "src\lib\sync.ts"
$sync = Get-Content $syncFile -Raw
if ($sync -notlike "*from '@/lib/logger'*") {
  $sync = $sync.Replace(
    "import { supabase } from '@/lib/supabase'",
    ("import { supabase } from '@/lib/supabase'" + [char]10 + "import { logger } from '@/lib/logger'")
  )
  $sync = $sync.Replace(
    "    console.warn('[SYNC] Pull gagal (offline?):', e)",
    ("    console.warn('[SYNC] Pull gagal (offline?):', e)" + [char]10 + "    if (navigator.onLine) logger.warn('sync', 'Pull gagal', { error: String(e) })")
  )
  $sync = $sync.Replace(
    "      console.warn(`[SYNC] Abandoned",
    ("      logger.warn('sync', `Abandoned " + '${item.table_name}' + "`, { record_id: item.record_id })" + [char]10 + "      console.warn(`[SYNC] Abandoned")
  )
  Set-Content $syncFile $sync -NoNewline
  Write-Host "OK: sync.ts logger" -ForegroundColor Green
} else {
  Write-Host "SKIP: sync.ts sudah ada" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Done! Sekarang jalankan: npm run build" -ForegroundColor Cyan
Write-Host "Untuk tab Log di DebugPage, edit manual di VS Code" -ForegroundColor Yellow
