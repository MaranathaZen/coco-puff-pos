const fs = require('fs');
const path = require('path');

function fixDir(dir) {
  if (!fs.existsSync(dir)) { console.log('Skip (not found):', dir); return; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
  files.forEach(f => {
    const fp = path.join(dir, f);
    const c  = fs.readFileSync(fp, 'utf8');
    const n  = c.replace(/supabase\.from\(([^)]+)\)\.insert\(/g, 'supabase.from($1).upsert(');
    if (n !== c) { fs.writeFileSync(fp, n, 'utf8'); console.log('Fixed:', f); }
  });
}

[
  'src/pages/stok',
  'src/pages/accounting',
  'src/pages/produksi',
  'src/pages/resep',
  'src/pages/end-of-day',
  'src/pages/mutasi',
  'src/pages/pembelian',
  'src/pages/biaya',
  'src/lib',
].forEach(fixDir);

console.log('Done');
