with open('src/pages/cashier/CashierPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Tambah state setelah showVoidModal
old1 = "  const [showVoidModal, setShowVoidModal] = useState(false)"
new1 = """  const [showVoidModal, setShowVoidModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [payTx, setPayTx] = useState<any>(null)
  const [changingPay, setChangingPay] = useState(false)"""
content = content.replace(old1, new1)

# 2. Tambah onClick di badge payment_method
old2 = """                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                            tx.payment_method === 'cash' ? 'bg-gray-100 text-gray-700' : tx.payment_method === 'qris' ? 'bg-blue-100 text-blue-700' :
                              tx.payment_method === 'transfer' ? 'bg-purple-100 text-purple-700' : tx.payment_method === 'gopay' ? 'bg-green-100 text-green-700' :
                                tx.payment_method === 'grab' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700')}>
                            {tx.payment_method === 'cash' ? 'Tunai' : tx.payment_method === 'qris' ? 'QRIS' : tx.payment_method === 'transfer' ? 'Transfer' : tx.payment_method === 'gopay' ? 'GoPay' : tx.payment_method === 'grab' ? 'GrabPay' : 'ShopeePay'}
                          </span>"""
new2 = """                          <button
                            onClick={e => { e.stopPropagation(); if ((tx as any).status === 'completed') { setPayTx(tx); setShowPayModal(true) } }}
                            disabled={(tx as any).status !== 'completed'}
                            className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                            tx.payment_method === 'cash' ? 'bg-gray-100 text-gray-700' : tx.payment_method === 'qris' ? 'bg-blue-100 text-blue-700' :
                              tx.payment_method === 'transfer' ? 'bg-purple-100 text-purple-700' : tx.payment_method === 'gopay' ? 'bg-green-100 text-green-700' :
                                tx.payment_method === 'grab' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700')}>
                            {tx.payment_method === 'cash' ? 'Tunai' : tx.payment_method === 'qris' ? 'QRIS' : tx.payment_method === 'transfer' ? 'Transfer' : tx.payment_method === 'gopay' ? 'GoPay' : tx.payment_method === 'grab' ? 'GrabPay' : 'ShopeePay'}
                          </button>"""
content = content.replace(old2, new2)

# 3. Tambah handler dan modal setelah modal Void
old3 = """      {showPrinterModal && (
        <PrinterMiniModal storeId={STORE_ID || userStoreId} onClose={() => { setShowPrinterModal(false); setPrinterConfigTs(Date.now()) }} />
      )}"""
new3 = """      {showPayModal && payTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Ganti Metode Bayar</h3>
              <button onClick={() => setShowPayModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
              <p className="text-sm font-medium text-gray-800 font-mono">{payTx.receipt_no}</p>
              <p className="text-sm text-gray-700">{formatRupiah(payTx.total)}</p>
              <p className="text-xs text-gray-400">Saat ini: {PAYMENT_LABELS[payTx.payment_method as PaymentMethod] || payTx.payment_method}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['cash','qris','transfer','gopay','grab','shopeefood'] as PaymentMethod[]).map(pm => (
                <button key={pm} disabled={changingPay || pm === payTx.payment_method}
                  onClick={async () => {
                    setChangingPay(true)
                    try {
                      await db.transactions.update(payTx.id, { payment_method: pm } as any)
                      await supabase.from('transactions').update({ payment_method: pm }).eq('id', payTx.id)
                      toast.success('Metode bayar diubah ke ' + PAYMENT_LABELS[pm])
                      setShowPayModal(false); setPayTx(null)
                    } catch (e) { toast.error('Gagal mengubah metode bayar') }
                    finally { setChangingPay(false) }
                  }}
                  className={`py-2.5 rounded-xl border text-sm font-medium disabled:opacity-40 ${pm === payTx.payment_method ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>
                  {PAYMENT_LABELS[pm]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {showPrinterModal && (
        <PrinterMiniModal storeId={STORE_ID || userStoreId} onClose={() => { setShowPrinterModal(false); setPrinterConfigTs(Date.now()) }} />
      )}"""
content = content.replace(old3, new3)

print('1:', old1 in content if False else (new1 in content))
print('2:', new2 in content)
print('3:', new3 in content)

with open('src/pages/cashier/CashierPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
