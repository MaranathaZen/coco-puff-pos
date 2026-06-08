# patch_clearsyncqueue.ps1
# 1. Banner kasir — tambah tombol "Bersihkan" kalau semua item abandoned
# 2. DebugPage — tambah tombol "Bersihkan Antrian Stuck" di Quick Fix

$ErrorActionPreference = "Continue"
Write-Host "Patching sync queue cleanup..." -ForegroundColor Cyan

# ── FIX 1: CashierPage — update checkPending + tambah tombol di banner ────
$cashierFile = "src\pages\cashier\CashierPage.tsx"
$cashier = Get-Content $cashierFile -Raw

# Update checkPending untuk juga cek abandoned count
$old1 = @'
    async function checkPending() {
      try {
        const count = await db.sync_queue.where('status').anyOf(['pending','failed']).count()
        setPendingSync(count)
      } catch {}
    }
'@
$new1 = @'
    async function checkPending() {
      try {
        const count = await db.sync_queue.where('status').anyOf(['pending','failed']).count()
        // Auto-abandon items yang retry >= 5
        const stuckItems = await db.sync_queue
          .where('status').anyOf(['pending','failed'])
          .filter((q: any) => (q.retry_count || 0) >= 5)
          .toArray()
        for (const item of stuckItems) {
          await db.sync_queue.update(item.id, { status: 'abandoned' })
        }
        const realPending = await db.sync_queue.where('status').anyOf(['pending','failed']).count()
        setPendingSync(realPending)
      } catch {}
    }
'@
$cashier = $cashier.Replace($old1, $new1)

# Update banner — tambah tombol Bersihkan
$old2 = '      {!isOffline && pendingSync > 0 && (
        <div className="bg-orange-500 text-white text-xs font-medium px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <RefreshCw size={13} className="animate-spin" />
          {pendingSync} transaksi belum tersync ke server â€" jangan tutup browser
        </div>
      )}'
$new2 = '      {!isOffline && pendingSync > 0 && (
        <div className="bg-orange-500 text-white text-xs font-medium px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <RefreshCw size={13} className="animate-spin" />
            {pendingSync} transaksi belum tersync ke server
          </div>
          <button
            onClick={async () => {
              try {
                await db.sync_queue.where(' + "'" + 'status' + "'" + ').anyOf([' + "'" + 'abandoned' + "'" + ',' + "'" + 'failed' + "'" + ']).delete()
                await db.sync_queue.where(' + "'" + 'retry_count' + "'" + ').aboveOrEqual(5).delete()
                setPendingSync(0)
              } catch {}
            }}
            className="text-white underline text-xs opacity-80 hover:opacity-100 flex-shrink-0">
            Bersihkan
          </button>
        </div>
      )}'

if ($cashier -notlike "*Bersihkan*") {
  $cashier = $cashier.Replace($old2, $new2)
  Write-Host "OK: Banner kasir dipatch" -ForegroundColor Green
} else {
  Write-Host "SKIP: Banner sudah ada tombol Bersihkan" -ForegroundColor Gray
}

Set-Content $cashierFile $cashier -NoNewline

# ── FIX 2: DebugPage — tambah tombol di Quick Fix ─────────────
$debugFile = "src\pages\debug\DebugPage.tsx"
$debug = Get-Content $debugFile -Raw

$oldDebug = '                <button onClick={() => {
                  const info = '
$newDebug = '                <button onClick={async () => {
                  try {
                    const before = await (db as any).sync_queue?.count() ?? 0
                    await (db as any).sync_queue?.where(' + "'" + 'status' + "'" + ').anyOf([' + "'" + 'abandoned' + "'" + ',' + "'" + 'failed' + "'" + ']).delete()
                    const stuck = await (db as any).sync_queue?.filter((q: any) => (q.retry_count||0) >= 5).toArray() ?? []
                    for (const item of stuck) { await (db as any).sync_queue?.update(item.id, { status: ' + "'" + 'abandoned' + "'" + ' }) }
                    const after = await (db as any).sync_queue?.count() ?? 0
                    alert(' + "'" + 'Berhasil! ' + "'" + ' + (before - after) + ' + "'" + ' item stuck dihapus dari antrian.' + "'" + ')
                    runChecks()
                  } catch(e) { alert(' + "'" + 'Gagal: ' + "'" + ' + String(e)) }
                }} className="w-full py-2 text-sm text-left px-3 bg-red-50 text-red-700 rounded-lg border border-red-100">
                  Bersihkan antrian sync yang stuck (retry berlebihan)
                </button>
                <button onClick={() => {
                  const info = '

if ($debug -notlike "*Bersihkan antrian sync*") {
  $debug = $debug.Replace($oldDebug, $newDebug)
  Set-Content $debugFile $debug -NoNewline
  Write-Host "OK: DebugPage Quick Fix dipatch" -ForegroundColor Green
} else {
  Write-Host "SKIP: DebugPage sudah ada" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Done! Jalankan: npm run build" -ForegroundColor Cyan
