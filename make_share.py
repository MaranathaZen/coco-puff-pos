content = """export function shareWaMutasi(m: any, mutNo: string, tcLabel: string, pengirim: string, penerima: string) {
  const tgl = new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const items = m.items.map((i: any) => `- ${i.name || i.material_id}: ${i.qty} ${i.unit || ''}`).join('\\n')
  const msg = `\U0001f4cb ${mutNo}\\n\U0001f4e6 Mutasi ${tcLabel}\\n\U0001f4c5 ${tgl}\\n${pengirim} -> ${penerima}\\n${items}`
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
}
"""
with open('src/lib/shareWa.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
