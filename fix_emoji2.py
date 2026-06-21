with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix semua karakter corrupt
replacements = {
    '\xc2\xb7': '\u00b7',  # Â· -> ·
    '\xc3\x97': '\u00d7',  # Ã— -> ×
    '\xe2\x80\x94': '\u2014',  # â€" -> —
    '\xe2\x80\x93': '\u2013',  # â€" -> –
    '\xe2\x86\x92': '\u2192',  # â†' -> →
}
for old, new in replacements.items():
    content = content.replace(old, new)

with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
