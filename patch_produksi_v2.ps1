# patch_produksi_v2.ps1
# Jalankan di: C:\coco_puff_pos
# powershell -ExecutionPolicy Bypass -File .\patch_produksi_v2.ps1

$file = "src\pages\produksi\ProduksiPage.tsx"
$content = Get-Content $file -Raw

# 1. Hapus useEffect duplikat (yang pertama, sebelum toolbarActions)
$content = $content -replace "  useEffect\(\(\) => \{ syncData\(\) \}, \[\]\)\r?\n  const \[toolbarActions", "  const [toolbarActions"

# 2. Hapus blok komentar + useEffect kedua
$content = $content -replace "\r?\n  // FIX: auto-sync saat mount\r?\n  useEffect\(\(\) => \{ syncData\(\) \}, \[\]\)\r?\n", "`n"

# 3. Ganti signature syncData agar terima parameter showToast
$content = $content -replace "  async function syncData\(\) \{", "  async function syncData(showToast = true) {"

# 4. Ganti toast.success agar hanya muncul kalau showToast = true
$content = $content -replace "      toast\.success\('Data produksi diperbarui'\)", "      if (showToast) toast.success('Data produksi diperbarui')"

# 5. Ganti toast.error sync agar juga kondisional
$content = $content -replace "      toast\.error\('Gagal sync data'\)", "      if (showToast) toast.error('Gagal sync data')"

# 6. Tambah useEffect mount yang benar (tanpa toast) setelah toolbarActions useState
$oldText = "  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)"
$newText = "  const [toolbarActions, setToolbarActions] = useState<React.ReactNode>(null)`n`n  // auto-sync saat mount tanpa toast`n  useEffect(() => { syncData(false) }, [])"

$content = $content.Replace($oldText, $newText)

Set-Content $file $content -NoNewline
Write-Host "OK: patch_produksi_v2 berhasil." -ForegroundColor Green
