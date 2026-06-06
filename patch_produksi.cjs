const fs = require('fs');
const f = 'src/pages/produksi/ProduksiPage.tsx';
let c = fs.readFileSync(f, 'utf8');

const old = `{new Date(l.created_at).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit',hour12:false})}
                    {' \u00B7 '}{l.batch_count} batch`;

const rep = `{new Date(l.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}
                    {', '}
                    {new Date(l.created_at).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit',hour12:false})}
                    {' \u00B7 '}{l.batch_count} batch`;

const result = c.replace(old, rep);
if (result === c) {
  console.log('STRING NOT FOUND - cek manual');
} else {
  fs.writeFileSync(f, result, 'utf8');
  console.log('DONE');
}
