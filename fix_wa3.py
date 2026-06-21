with open('src/pages/mutasi/UnifiedMutasiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = content[content.find("const items = m.items.map"):content.find("window.open('https://wa.me/?text='") + len("window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')")]

new = """const items = m.items.map((i: any) => `- ${i.name || i.material_id}: ${i.qty} ${i.unit || ''}`).join('\\n')
                    const msg = `\U0001f4cb ${mutNo}\\n\U0001f4e6 Mutasi ${tc.label}\\n\U0001f4c5 ${tgl}\\n${pengirim} -> ${penerima}\\n${items}`
                    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')"""

result = content.replace(old, new)
print('Changed:', content != result)
with open('src/pages/mutasi/UnifiedMutasiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(result)
