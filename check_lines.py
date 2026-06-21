with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Baris 438-441 (index 437-440, 0-based) berisi block isOwner && ps yang salah
print('Line 438:', repr(lines[437]))
print('Line 439:', repr(lines[438]))
print('Line 440:', repr(lines[439]))
print('Line 441:', repr(lines[440]))
