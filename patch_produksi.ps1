# Jalankan di: C:\coco_puff_pos
# PowerShell: .\patch_produksi.ps1

$file = "src\pages\produksi\ProduksiPage.tsx"
$content = Get-Content $file -Raw

# Cari string yang akan di-replace
$oldText = '  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)'

$newText = '  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)

  // FIX: auto-sync saat mount
  useEffect(() => { syncData() }, [])'

if ($content -notmatch [regex]::Escape($oldText)) {
    Write-Host "ERROR: Target string tidak ditemukan di file!" -ForegroundColor Red
    exit 1
}

if ($content -match 'FIX: auto-sync saat mount') {
    Write-Host "SKIP: Patch sudah diterapkan sebelumnya." -ForegroundColor Yellow
    exit 0
}

$newContent = $content.Replace($oldText, $newText)
Set-Content $file $newContent -NoNewline
Write-Host "OK: patch_produksi berhasil diterapkan." -ForegroundColor Green
