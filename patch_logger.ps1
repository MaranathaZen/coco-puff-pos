# patch_logger.ps1
# Auto-install logger ke semua titik kritis Coco Puff POS
# Taruh file ini di C:\coco_puff_pos\ lalu jalankan:
# powershell -ExecutionPolicy Bypass -File patch_logger.ps1

$ErrorActionPreference = "Continue"
Write-Host "=== Installing Logger ===" -ForegroundColor Cyan

# ── Step 1: Copy logger.ts ────────────────────────────────────
Write-Host "1. Copying logger.ts..." -ForegroundColor Yellow
if (Test-Path "logger.ts") {
  Copy-Item "logger.ts" "src\lib\logger.ts" -Force
  Write-Host "   OK: src\lib\logger.ts" -ForegroundColor Green
} else {
  Write-Host "   ERROR: logger.ts tidak ditemukan di folder ini" -ForegroundColor Red
  exit 1
}

# ── Step 2: LogPage sudah ada, skip ──────────────────────────
Write-Host "2. LogPage.tsx sudah ada di src\pages\debug\" -ForegroundColor Green

# ── Step 3: Patch main.tsx — global error handler ─────────────
Write-Host "3. Patching main.tsx..." -ForegroundColor Yellow
$mainFile = "src\main.tsx"
$main = Get-Content $mainFile -Raw

if ($main -notlike "*unhandledrejection*") {
  $oldMain = "ReactDOM.createRoot"
  $newMain = "import { logger, setLoggerAuthStore } from '@/lib/logger'
import { useAuthStore } from '@/store/auth'
setLoggerAuthStore(useAuthStore)

window.addEventListener('unhandledrejection', (event) => {
  logger.error('global', 'Unhandled promise rejection', {
    reason: String(event.reason),
    stack: event.reason?.stack?.slice(0, 500),
  })
})
window.addEventListener('error', (event) => {
  logger.error('global', event.message, {
    filename: event.filename,
    lineno: event.lineno,
  })
})

ReactDOM.createRoot"
  $main = $main.Replace($oldMain, $newMain)
  Set-Content $mainFile $main -NoNewline
  Write-Host "   OK: global error handler dipasang" -ForegroundColor Green
} else {
  Write-Host "   SKIP: sudah ada" -ForegroundColor Gray
}

# ── Step 4: Patch sync.ts — log push/pull error ───────────────
Write-Host "4. Patching sync.ts..." -ForegroundColor Yellow
$syncFile = "src\lib\sync.ts"
$sync = Get-Content $syncFile -Raw

if ($sync -notlike "*from '@/lib/logger'*") {
  $sync = $sync.Replace(
    "import { supabase } from '@/lib/supabase'",
    "import { supabase } from '@/lib/supabase'`nimport { logger } from '@/lib/logger'"
  )
  $sync = $sync.Replace(
    "    console.warn('[SYNC] Pull gagal (offline?):', e)",
    "    console.warn('[SYNC] Pull gagal (offline?):', e)`n    if (navigator.onLine) logger.warn('sync', 'Pull gagal', { error: String(e) })"
  )
  $sync = $sync.Replace(
    "      console.warn(`[SYNC] Abandoned",
    "      logger.warn('sync', ``Abandoned ``+item.table_name, { record_id: item.record_id })`n      console.warn(`[SYNC] Abandoned"
  )
  Set-Content $syncFile $sync -NoNewline
  Write-Host "   OK: sync.ts dipatch" -ForegroundColor Green
} else {
  Write-Host "   SKIP: sudah ada" -ForegroundColor Gray
}

# ── Step 5: Patch DebugPage.tsx — tambah tab Log ──────────────
Write-Host "5. Patching DebugPage.tsx..." -ForegroundColor Yellow
$debugFile = "src\pages\debug\DebugPage.tsx"
$debug = Get-Content $debugFile -Raw

if ($debug -notlike "*LogPage*") {
  # Tambah import di baris pertama setelah imports yang ada
  $debug = $debug.Replace(
    "import { RefreshCw,",
    "import LogPage from '@/pages/debug/LogPage'`nimport { RefreshCw,"
  )

  # Tambah state tab di export default function (baris 80)
  $debug = $debug.Replace(
    "export default function DebugPage() {",
    "export default function DebugPage() {
  const [activeTab, setActiveTab] = useState<'diagnostik'|'log'>('diagnostik')"
  )

  # Wrap konten dengan tab — cari header div
  $debug = $debug.Replace(
    "  return (
    <div className=""flex flex-col h-full bg-gray-50"">",
    "  return (
    <div className=""flex flex-col h-full bg-gray-50"">
      {/* Tab switcher */}
      <div className=""bg-white border-b border-gray-100 flex flex-shrink-0 px-4"">
        <button onClick={() => setActiveTab('diagnostik')}
          className={`py-2.5 mr-5 text-sm font-medium border-b-2 transition-colors `+(activeTab==='diagnostik'?'border-gray-900 text-gray-900':'border-transparent text-gray-400')}>
          🔍 Diagnostik
        </button>
        <button onClick={() => setActiveTab('log')}
          className={`py-2.5 mr-5 text-sm font-medium border-b-2 transition-colors `+(activeTab==='log'?'border-gray-900 text-gray-900':'border-transparent text-gray-400')}>
          📋 Log Error
        </button>
      </div>
      {activeTab === 'log' && <LogPage />}
      {activeTab === 'diagnostik' && <div className=""flex flex-col h-full"">
"
  )

  # Tutup div tambahan di akhir return
  $debug = $debug.Replace(
    "    </div>
  )
}",
    "    </div></div>}
    </div>
  )
}"
  )

  Set-Content $debugFile $debug -NoNewline
  Write-Host "   OK: DebugPage tab Log ditambahkan" -ForegroundColor Green
} else {
  Write-Host "   SKIP: sudah ada" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Semua patch selesai! ===" -ForegroundColor Cyan
Write-Host "Jalankan: npm run build" -ForegroundColor White
