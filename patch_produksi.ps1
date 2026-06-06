$file = "src/pages/produksi/ProduksiPage.tsx"
$content = [System.IO.File]::ReadAllText((Resolve-Path $file), [System.Text.Encoding]::UTF8)

$old = "{new Date(l.created_at).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit',hour12:false})}" + "`r`n" + "                    {' " + [char]0x00B7 + " '}{l.batch_count} batch"

# Try simpler approach - just check and do node script
Write-Host "Checking file..."
if ($content.Contains("toLocaleTimeString")) {
    Write-Host "File found, applying patch..."
    node -e @"
const fs = require('fs');
const f = 'src/pages/produksi/ProduksiPage.tsx';
let c = fs.readFileSync(f, 'utf8');
const old = `{new Date(l.created_at).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit',hour12:false})}
                    {' · '}{l.batch_count} batch`;
const rep = `{new Date(l.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}
                    {', '}
                    {new Date(l.created_at).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit',hour12:false})}
                    {' · '}{l.batch_count} batch`;
const result = c.replace(old, rep);
if (result === c) { console.log('STRING NOT FOUND'); } else { fs.writeFileSync(f, result, 'utf8'); console.log('DONE'); }
"@
} else {
    Write-Host "File tidak ditemukan atau path salah"
}
