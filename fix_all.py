with open('src/pages/produksi/ProduksiPage.tsx', 'r', encoding='latin-1') as f:
    content = f.read()

# Fix semua double-encoded UTF-8 characters
import re

def fix_encoding(text):
    result = []
    i = 0
    while i < len(text):
        c = ord(text[i])
        if c == 0xc3 and i+1 < len(text):
            c2 = ord(text[i+1])
            if 0x80 <= c2 <= 0xbf:
                # 2-byte sequence
                try:
                    fixed = bytes([c, c2]).decode('utf-8')
                    result.append(fixed)
                    i += 2
                    continue
                except:
                    pass
        result.append(text[i])
        i += 1
    return ''.join(result)

# Fix triple-encoded
content = fix_encoding(content)
content = fix_encoding(content)

with open('src/pages/produksi/ProduksiPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
