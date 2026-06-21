with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='latin-1') as f:
    content = f.read()

# Cek bytes aktual
idx = content.find("copied ?")
print(repr(content[idx:idx+30]))
