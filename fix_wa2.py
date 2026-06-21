with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Hapus tombol WA dari produksi
start = content.find('{!isVoided && <button onClick={() => {\n                            const tgl = new Date')
end = content.find('</button>}', start) + len('</button>}')
old = content[start:end]
print('Found:', len(old), 'chars')

result = content.replace(old, '')
with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(result)
print('Done')
