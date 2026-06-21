with open('src/pages/mutasi/UnifiedMutasiPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
idx = content.find('CopyBtn text={mutNo}')
print(repr(content[idx-20:idx+50]))
