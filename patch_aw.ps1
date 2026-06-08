# patch_aw.ps1 — kembalikan AW server ke 38
cd $PSScriptRoot
$file = "src\pages\cashier\CashierPage.tsx"
$content = Get-Content $file -Raw

# Kembalikan 42 -> 38
$content = $content -replace "printModeNow === 'rawbt' \? 28 : printModeNow === 'server' \? 42 : 32", "printModeNow === 'rawbt' ? 28 : printModeNow === 'server' ? 38 : 32"

Set-Content $file $content -NoNewline
Write-Host "OK: AW server = 38" -ForegroundColor Green
