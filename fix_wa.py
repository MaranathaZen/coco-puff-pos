with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='latin-1') as f:
    content = f.read()

old = content[content.find("{!isVoided && <button onClick={() => {"):content.find("window.open('https://wa.me/?text='") + len("window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')")]

new = """                          {!isVoided && <button onClick={() => {
                            const tgl = new Date(l.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                            const bahan = (l.materials || []).map((m: any) => `${m.name}: ${m.qty_used * l.batch_count} ${m.unit || ''}`).join('\\n')
                            const msg = `\U0001f4cb ${(l as any).log_number}\\n\U0001f3ed Divisi Produksi\\n\U0001f4c5 ${tgl}\\n${(l.recipe as any)?.product_name} x ${l.batch_count} batch -> ${l.total_yield} ${(l.recipe as any)?.yield_unit || 'pcs'}\\n${bahan}`
                            window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')"""

result = content.replace(old, new)
print('Changed:', content != result)
with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(result)
