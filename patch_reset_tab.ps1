# patch_reset_tab.ps1
# Replace function ResetDataTab() di SettingsPage.tsx

$file = "src\pages\settings\SettingsPage.tsx"
$content = Get-Content $file -Raw

# Cari posisi function ResetDataTab dan tutupnya
$startMarker = "function ResetDataTab() {"
$startIdx = $content.IndexOf($startMarker)

if ($startIdx -eq -1) {
    Write-Host "ERROR: function ResetDataTab tidak ditemukan!" -ForegroundColor Red
    exit 1
}

# Cari penutup function dengan hitung brace
$braceCount = 0
$endIdx = $startIdx
$started = $false

for ($i = $startIdx; $i -lt $content.Length; $i++) {
    if ($content[$i] -eq '{') { $braceCount++; $started = $true }
    if ($content[$i] -eq '}') { $braceCount-- }
    if ($started -and $braceCount -eq 0) { $endIdx = $i; break }
}

if ($endIdx -eq $startIdx) {
    Write-Host "ERROR: Tidak bisa menemukan akhir function!" -ForegroundColor Red
    exit 1
}

Write-Host "Found ResetDataTab: char $startIdx to $endIdx" -ForegroundColor Cyan

# Baca isi pengganti dari file
$newFunction = Get-Content "src\pages\settings\ResetDataTab_new.tsx" -Raw

# Replace
$before = $content.Substring(0, $startIdx)
$after  = $content.Substring($endIdx + 1)
$newContent = $before + $newFunction + $after

Set-Content $file $newContent -NoNewline
Write-Host "OK: ResetDataTab berhasil diganti" -ForegroundColor Green
