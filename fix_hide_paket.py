with open('src/pages/cashier/CashierPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """            {pakets.length > 0 && (
              <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0">
                <span className="text-xs font-medium text-gray-500 self-center mr-1 flex-shrink-0">Paket:</span>
                {pakets.map(p => (
                  <button key={p.id} onClick={() => openPaketModal(p)}
                    className="flex items-center gap-1.5 bg-gray-900 text-white px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                    <Package size={12} />{p.name} \u2014 {formatRupiah(p.price)}
                  </button>
                ))}
              </div>
            )}"""

result = content.replace(old, '')
print('Changed:', content != result)
with open('src/pages/cashier/CashierPage.tsx', 'w', encoding='utf-8') as f:
    f.write(result)
