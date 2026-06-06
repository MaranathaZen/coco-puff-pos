
# Run this in PowerShell from C:\coco_puff_pos folder:
$file = "src/pages/settings/SettingsPage.tsx"
$content = Get-Content $file -Raw

# Remove printer tab entry
$content = $content -replace "    \{ id: 'printer',     label: 'Printer'      \},`n", ""

# Remove printer render
$content = $content -replace "        \{tab === 'printer'     && <PrinterTab storeId=\{user\?\.store_id \|\| ''\} />\}`n", ""

# Remove 'printer' from Tab type
$content = $content -replace " \| 'printer'", ""

Set-Content $file $content
Write-Host "Done"
