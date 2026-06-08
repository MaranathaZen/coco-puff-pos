// ═══════════════════════════════════════════════════════════
// PATCH: CashierPage.tsx — Fix receipt print
// 1. buildReceiptLines: pindahkan W/SEP/sep ke dalam fungsi
// 2. Auto-print di handleCheckout: tambah baris diskon
// ═══════════════════════════════════════════════════════════

// ── REPLACE: ReceiptModal — function buildReceiptLines ──────
// Temukan baris ini di ReceiptModal:
//   const W   = overrideW ?? 32
//   const SEP = '='.repeat(W)
// dan HAPUS keempat baris itu (W, SEP, sep, center38, row38)
// karena sekarang dipindah ke DALAM buildReceiptLines.
//
// Lalu REPLACE seluruh function buildReceiptLines dengan ini:

function buildReceiptLines(overrideW?: number): string[] {
  // ── Lebar karakter sesuai mode printer ──
  // browser: 32, server: 35, rawbt: 28
  const W   = overrideW ?? 32
  const SEP = '='.repeat(W)
  const sep = '-'.repeat(W)

  function center(s: string): string {
    const str = s.substring(0, W)
    return str.padStart(Math.floor((W + str.length) / 2)).padEnd(W)
  }
  function row(l: string, r: string): string {
    const sp = W - l.length - r.length
    return l + (sp > 0 ? ' '.repeat(sp) : ' ') + r
  }
  function fmtRp(n: number): string {
    const s = String(Math.round(n))
    let result = ''
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) result += '.'
      result += s[i]
    }
    return 'Rp ' + result
  }

  const lines: string[] = []
  const now2 = new Date()
  const tgl  = now2.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const jam  = now2.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
  const payLabel2: Record<string, string> = {
    cash: 'Cash', qris: 'QRIS', transfer: 'Transfer',
    gopay: 'GoPay', grab: 'GrabFood', shopeefood: 'ShopeeFood',
  }
  const tipeLabel: Record<string, string> = {
    dine_in: 'Dine In', take_away: 'Take Away', online: 'Online',
  }

  // HEADER
  lines.push(SEP)
  lines.push(center('Coco Puff'))
  lines.push(center(data.storeName))
  lines.push(SEP)
  lines.push(row('No    :', data.receiptNo.substring(0, W - 8)))
  lines.push(row('Tgl   :', tgl.substring(0, W - 8)))
  lines.push(row('Jam   :', jam))
  lines.push(row('Tipe  :', tipeLabel[data.orderType] || data.orderType))
  if (data.onlineOrderNo) lines.push(row('Order :', '#' + data.onlineOrderNo))
  lines.push(sep)

  // ITEMS
  for (const item of (data.items || [])) {
    const totalFmt = fmtRp(item.subtotal)
    const leftPart = `${item.qty}x ${item.name}`.substring(0, W - totalFmt.length - 1)
    lines.push(leftPart.padEnd(W - totalFmt.length) + totalFmt)

    // ✅ FIX: tampilkan diskon per item
    if (item.promoDiscount > 0) {
      const discFmt   = '-' + fmtRp(item.promoDiscount)
      const discLabel = `  ${item.promoName || 'Diskon'}`
      lines.push(discLabel.substring(0, W - discFmt.length).padEnd(W - discFmt.length) + discFmt)
    }
  }

  // Paket di cart (dari cartPakets)
  for (const p of (data.pakets || [])) {
    const totalFmt = fmtRp(p.subtotal)
    const leftPart = `1x ${p.name}`.substring(0, W - totalFmt.length - 1)
    lines.push(leftPart.padEnd(W - totalFmt.length) + totalFmt)
  }

  lines.push(sep)

  // SUBTOTAL & DISKON
  lines.push(row('Subtotal', fmtRp(data.rawSubtotal)))
  if ((data.buy1get1Discount || 0) > 0)
    lines.push(row('Diskon B1G1', '-' + fmtRp(data.buy1get1Discount)))
  if ((data.paketDiscount || 0) > 0)
    lines.push(row('Diskon Paket', '-' + fmtRp(data.paketDiscount)))
  const promoOnlyDisc = (data.rawDiscount || 0) - (data.buy1get1Discount || 0) - (data.paketDiscount || 0)
  if (promoOnlyDisc > 0)
    lines.push(row('Diskon Promo', '-' + fmtRp(promoOnlyDisc)))
  if (data.ppnAmount > 0)
    lines.push(row(`PPN ${data.ppnPct}%`, '+' + fmtRp(data.ppnAmount)))

  lines.push(SEP)
  lines.push(row('TOTAL', fmtRp(data.grandTotal)))
  lines.push(SEP)

  // PEMBAYARAN
  const metode = payLabel2[data.payMethod] || data.payMethod
  if (data.payMethod === 'cash') {
    lines.push(row('Bayar (Cash)', fmtRp(data.cashPaid)))
    if (data.change > 0) lines.push(row('Kembali', fmtRp(data.change)))
  } else {
    lines.push(row(`Bayar (${metode})`, fmtRp(data.cashPaid)))
  }

  lines.push('')
  lines.push(center('Terima kasih atas kunjungan Anda'))
  lines.push('')
  lines.push('')
  lines.push('')
  lines.push('')

  // Strip non-ASCII untuk kompatibilitas printer dot matrix & RawBT
  return lines.map(l => l.replace(/[^\x00-\x7F]/g, ''))
}


// ═══════════════════════════════════════════════════════════
// PATCH 2: handleCheckout — auto-print section
// Temukan blok auto-print di handleCheckout (setTimeout(() => {...}, 200))
// REPLACE seluruh blok itu dengan ini:
// ═══════════════════════════════════════════════════════════

// Di dalam handleCheckout, setelah setLastTxData({...}):
// GANTI blok setTimeout auto-print yang lama dengan:

if (autoPrintNow) {
  setTimeout(() => {
    function fmtA(n: number): string {
      const s = String(Math.round(n))
      let r = ''
      for (let i = 0; i < s.length; i++) {
        if (i > 0 && (s.length - i) % 3 === 0) r += '.'
        r += s[i]
      }
      return 'Rp ' + r
    }

    // Lebar sesuai mode printer
    const AW   = printModeNow === 'rawbt' ? 28 : printModeNow === 'server' ? 35 : 32
    const ASEP = '='.repeat(AW)
    const asep = '-'.repeat(AW)
    const actr = (s: string) => s.padStart(Math.floor((AW + Math.min(s.length, AW)) / 2)).padEnd(AW)
    const arow = (l: string, r: string) => {
      const sp = AW - l.length - r.length
      return l + (sp > 0 ? ' '.repeat(sp) : ' ') + r
    }
    const now2 = new Date()
    const storeNameForPrint = allStores?.find(s => s.id === STORE_ID)?.name || STORE_ID

    const aLines: string[] = [
      ASEP,
      actr('Coco Puff'),
      actr(storeNameForPrint),
      ASEP,
      arow('No    :', receiptNo.substring(0, AW - 8)),
      arow('Tgl   :', now2.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).substring(0, AW - 8)),
      arow('Jam   :', now2.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })),
      asep,
    ]

    // Items
    for (const item of txItems) {
      const qty      = (item.qty_eceran || 0) + (item.qty_dus || 0)
      const totalFmt = fmtA(item.unit_price * qty)
      const leftPart = `${qty}x ${item.product_name}`.substring(0, AW - totalFmt.length - 1)
      aLines.push(leftPart.padEnd(AW - totalFmt.length) + totalFmt)

      // ✅ FIX: tampilkan diskon per item di auto-print
      if ((item.promo_discount || 0) > 0) {
        const discFmt = '-' + fmtA(item.promo_discount)
        // Cari promo name dari items cart
        const cartItem = items.find(i => i.product.id === item.product_id)
        const promoLabel = (cartItem?.product as any)?.promo_name || 'Diskon Promo'
        const discLabel  = `  ${promoLabel}`.substring(0, AW - discFmt.length)
        aLines.push(discLabel.padEnd(AW - discFmt.length) + discFmt)
      }
    }

    aLines.push(asep)

    // Subtotal & diskon
    aLines.push(arow('Subtotal', fmtA(rawSubtotal)))
    if (buy1get1Discount > 0) aLines.push(arow('Diskon B1G1', '-' + fmtA(buy1get1Discount)))
    if (paketDiscount    > 0) aLines.push(arow('Diskon Paket', '-' + fmtA(paketDiscount)))
    const promoOnly = rawDiscount - buy1get1Discount - paketDiscount
    if (promoOnly > 0) aLines.push(arow('Diskon Promo', '-' + fmtA(promoOnly)))
    if (ppnAmount  > 0) aLines.push(arow(`PPN ${ppnPct}%`, '+' + fmtA(ppnAmount)))

    aLines.push(ASEP)
    aLines.push(arow('TOTAL', fmtA(grandTotal)))
    aLines.push(ASEP)

    const metodeLabel = { cash: 'Cash', qris: 'QRIS', transfer: 'Transfer', gopay: 'GoPay', grab: 'GrabFood', shopeefood: 'ShopeeFood' }
    const mLabel = (metodeLabel as any)[finalPay] || finalPay
    if (finalPay === 'cash') {
      aLines.push(arow('Bayar (Cash)', fmtA(paidAmt)))
      if (paidAmt > grandTotal) aLines.push(arow('Kembali', fmtA(paidAmt - grandTotal)))
    } else {
      aLines.push(arow(`Bayar (${mLabel})`, fmtA(paidAmt)))
    }

    aLines.push('')
    aLines.push(actr('Terima kasih atas kunjungan Anda'))
    aLines.push('')
    aLines.push('')
    aLines.push('')
    aLines.push('')

    // Strip non-ASCII
    const cleanLines = aLines.map(l => l.replace(/[^\x00-\x7F]/g, ''))
    const txt = cleanLines.join('\n')

    if (printModeNow === 'rawbt') {
      window.location.href = `rawbt://${encodeURIComponent(txt)}`
    } else if (printModeNow === 'server') {
      const url = (() => {
        try {
          const cfg = JSON.parse(localStorage.getItem(`printer_config_${STORE_ID}`) || '{}')
          return cfg.serverUrl || 'https://localhost:5000'
        } catch { return 'https://localhost:5000' }
      })()
      fetch(`${url}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt }),
      }).then(r => r.json()).then(d => {
        if (!d.ok) toast.error('Print gagal: ' + d.error)
      }).catch(() => toast.error('Print server tidak merespons'))
    } else {
      // Browser print (desktop)
      const html = `<html><head><style>
*{margin:0;padding:0;}
body{margin:0;padding:1mm 0;}
pre{font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.4;white-space:pre;}
@page{margin:0mm;size:76mm auto;}
@media print{pre{width:56mm;}}
</style></head><body><pre>${cleanLines.join('\n')}</pre></body></html>`
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;'
      document.body.appendChild(iframe)
      const doc = iframe.contentWindow?.document
      if (doc) { doc.open(); doc.write(html); doc.close() }
      setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => { try { document.body.removeChild(iframe) } catch {} }, 2000)
      }, 300)
    }
  }, 200)
  toast.success(`Transaksi ${receiptNo} berhasil! ✓ Auto-print`)
} else {
  setShowReceipt(true)
  toast.success(`Transaksi ${receiptNo} berhasil!`)
}
