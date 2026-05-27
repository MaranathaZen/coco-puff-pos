// src/components/PrintReceipt.tsx
import { useRef } from 'react'
import { formatRupiah } from '@/lib/utils'
import { Printer } from 'lucide-react'

interface ReceiptItem {
  product_name: string
  qty_eceran:   number
  qty_dus:      number
  unit_price:   number
  discount:     number
  subtotal:     number
}

interface ReceiptData {
  receipt_no:      string
  store_name:      string
  cashier_name:    string
  created_at:      string
  items:           ReceiptItem[]
  subtotal:        number
  discount:        number
  total:           number
  payment_method:  string
  cash_paid:       number
  change_given:    number
}

export function PrintReceipt({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null)

  function handlePrint() {
    const content = printRef.current?.innerHTML
    if (!content) return

    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Struk ${data.receipt_no}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 11px;
            width: 58mm;
            margin: 0 auto;
            padding: 3mm;
            color: #000;
          }
          .center { text-align: center; }
          .right   { text-align: right; }
          .bold    { font-weight: bold; }
          .lg      { font-size: 14px; }
          .sm      { font-size: 10px; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .divider-solid { border-top: 1px solid #000; margin: 4px 0; }
          .row { display: flex; justify-content: space-between; }
          .item-name { flex: 1; }
          .item-price { text-align: right; min-width: 60px; }
          .total-row { display: flex; justify-content: space-between; font-weight: bold; }
          @media print {
            body { width: 58mm; }
            @page { size: 58mm auto; margin: 0; }
          }
        </style>
      </head>
      <body>
        ${content}
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

  const dateStr = new Date(data.created_at).toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const payLabel: Record<string, string> = {
    cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer'
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-lg overflow-hidden">
        {/* Header modal */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Preview Struk</h3>
          <button onClick={onClose} className="text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg">Tutup</button>
        </div>

        {/* Preview struk */}
        <div className="p-4 bg-gray-50 overflow-auto max-h-96">
          <div ref={printRef} style={{ fontFamily: 'Courier New, monospace', fontSize: '11px', width: '200px', margin: '0 auto', color: '#000' }}>
            {/* Header toko */}
            <div className="center bold lg" style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>
              {data.store_name}
            </div>
            <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '4px' }}>
              {dateStr}
            </div>
            <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '2px' }}>
              Kasir: {data.cashier_name}
            </div>
            <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '4px' }}>
              No: {data.receipt_no}
            </div>

            <div className="divider" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

            {/* Items */}
            {data.items.map((item, i) => (
              <div key={i} style={{ marginBottom: '3px' }}>
                <div style={{ fontSize: '10px' }}>{item.product_name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span>
                    {item.qty_dus > 0 ? `${item.qty_dus} dus` : ''}
                    {item.qty_dus > 0 && item.qty_eceran > 0 ? ' + ' : ''}
                    {item.qty_eceran > 0 ? `${item.qty_eceran} pcs` : ''}
                    {' x '}{formatRupiah(item.unit_price)}
                  </span>
                  <span>{formatRupiah(item.subtotal)}</span>
                </div>
                {item.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555' }}>
                    <span>  Diskon</span>
                    <span>-{formatRupiah(item.discount)}</span>
                  </div>
                )}
              </div>
            ))}

            <div className="divider" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

            {/* Total */}
            {data.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span>Subtotal</span><span>{formatRupiah(data.subtotal)}</span>
              </div>
            )}
            {data.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span>Diskon</span><span>-{formatRupiah(data.discount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', margin: '2px 0' }}>
              <span>TOTAL</span><span>{formatRupiah(data.total)}</span>
            </div>

            <div className="divider" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

            {/* Pembayaran */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>{payLabel[data.payment_method] || data.payment_method}</span>
              <span>{formatRupiah(data.cash_paid)}</span>
            </div>
            {data.payment_method === 'cash' && data.change_given >= 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span>Kembali</span><span>{formatRupiah(data.change_given)}</span>
              </div>
            )}

            <div className="divider" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

            {/* Footer */}
            <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '4px' }}>
              Terima kasih atas kunjungan Anda
            </div>
            <div style={{ textAlign: 'center', fontSize: '10px' }}>
              Selamat menikmati!
            </div>
            <div style={{ marginTop: '8px' }} />
          </div>
        </div>

        {/* Tombol cetak */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={handlePrint}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
            <Printer size={16} /> Cetak Struk
          </button>
        </div>
      </div>
    </div>
  )
}
