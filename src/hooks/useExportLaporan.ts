// src/hooks/useExportLaporan.ts
// Export laporan ke Excel (.xlsx) dan PDF (print browser)
// Tidak butuh library tambahan — Excel pakai SheetJS (sudah ada di bundle), PDF pakai print window

import * as XLSX from 'xlsx'

export interface LaporanData {
  periode: string
  // Ringkasan
  totalOmzet:     number
  totalTrx:       number
  totalBeli:      number
  totalBiaya:     number
  nilaiStok:      number
  labaKotor:      number
  // Per toko
  storeStats: { nama: string; kota: string; omzet: number; count: number }[]
  // Per metode bayar
  byMethod: Record<string, number>
  // Per kategori biaya
  byExpenseCat: [string, number][]
  // Detail biaya
  expenses: { nama: string; kategori: string; tanggal: string; jumlah: number; store?: string }[]
  // Stok gudang
  stokGudang: { nama: string; qty: number; unit: string; avgCost: number; nilai: number }[]
  // Produksi
  totalProduksi: number
  stokProdukJadi: { nama: string; qty: number; hppPerUnit: number }[]
}

const RUPIAH = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

// ── EXPORT EXCEL ──────────────────────────────────────────────
export function exportExcel(data: LaporanData) {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Ringkasan ──────────────────────────────────
  const ringkasan = [
    ['LAPORAN COCO PUFF POS'],
    ['Periode:', data.periode],
    [],
    ['RINGKASAN KEUANGAN'],
    ['Keterangan', 'Nilai'],
    ['Total Omzet',      RUPIAH(data.totalOmzet)],
    ['Jumlah Transaksi', data.totalTrx],
    ['Total Pembelian',  RUPIAH(data.totalBeli)],
    ['Total Biaya',      RUPIAH(data.totalBiaya)],
    ['Nilai Stok Gudang',RUPIAH(data.nilaiStok)],
    ['Laba Kotor',       RUPIAH(data.labaKotor)],
    [],
    ['OMZET PER TOKO'],
    ['Nama Toko', 'Kota', 'Jumlah Transaksi', 'Omzet'],
    ...data.storeStats.map(s => [s.nama, s.kota, s.count, RUPIAH(s.omzet)]),
    [],
    ['PENJUALAN PER METODE BAYAR'],
    ['Metode', 'Total'],
    ...Object.entries(data.byMethod).map(([k, v]) => [k, RUPIAH(v)]),
  ]
  const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasan)
  wsRingkasan['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Ringkasan')

  // ── Sheet 2: Detail Biaya ───────────────────────────────
  const biayaRows = [
    ['DETAIL BIAYA OPERASIONAL'],
    ['Periode:', data.periode],
    [],
    ['Nama', 'Kategori', 'Tanggal', 'Jumlah'],
    ...data.expenses.map(e => [e.nama, e.kategori, e.tanggal, RUPIAH(e.jumlah)]),
    [],
    ['TOTAL', '', '', RUPIAH(data.totalBiaya)],
    [],
    ['PER KATEGORI'],
    ['Kategori', 'Total'],
    ...data.byExpenseCat.map(([k, v]) => [k, RUPIAH(v)]),
  ]
  const wsBiaya = XLSX.utils.aoa_to_sheet(biayaRows)
  wsBiaya['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, wsBiaya, 'Biaya Operasional')

  // ── Sheet 3: Stok Gudang ────────────────────────────────
  const stokRows = [
    ['STOK GUDANG'],
    ['Periode:', data.periode],
    [],
    ['Nama Bahan', 'Qty', 'Satuan', 'Avg Cost', 'Nilai'],
    ...data.stokGudang.map(s => [s.nama, s.qty, s.unit, RUPIAH(s.avgCost), RUPIAH(s.nilai)]),
    [],
    ['TOTAL NILAI', '', '', '', RUPIAH(data.nilaiStok)],
  ]
  const wsStok = XLSX.utils.aoa_to_sheet(stokRows)
  wsStok['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, wsStok, 'Stok Gudang')

  // ── Sheet 4: Produksi ───────────────────────────────────
  const prodRows = [
    ['LAPORAN PRODUKSI'],
    ['Periode:', data.periode],
    [],
    ['Total Produksi:', `${data.totalProduksi} pcs`],
    [],
    ['STOK PRODUK JADI'],
    ['Nama Produk', 'Stok (pcs)', 'HPP/pcs', 'Total Nilai'],
    ...data.stokProdukJadi.map(p => [
      p.nama, p.qty, RUPIAH(p.hppPerUnit),
      RUPIAH(p.qty * p.hppPerUnit)
    ]),
  ]
  const wsProd = XLSX.utils.aoa_to_sheet(prodRows)
  wsProd['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, wsProd, 'Produksi')

  // Download
  const filename = `Laporan-CocoPuff-${data.periode.replace(/\s/g, '-')}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ── EXPORT PDF (print window) ─────────────────────────────────
export function exportPDF(data: LaporanData) {
  const methodLabels: Record<string, string> = {
    cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer',
    gopay: 'GoPay/GoFood', grab: 'GrabFood', shopeefood: 'ShopeeFood',
  }
  const katLabel: Record<string, string> = {
    beban_bahan_baku: 'Bahan Baku', beban_tenaga_kerja: 'Tenaga Kerja',
    beban_sewa: 'Sewa', beban_utilitas: 'Utilitas', beban_packaging: 'Packaging',
    beban_transport: 'Transport', beban_pemasaran: 'Pemasaran', beban_lainnya: 'Lainnya',
  }

  const rows = (items: [string, string][]) =>
    items.map(([l, r]) => `
      <tr>
        <td style="padding:5px 8px;color:#555;font-size:12px;">${l}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:500;font-size:12px;">${r}</td>
      </tr>`).join('')

  const section = (title: string, content: string) => `
    <div style="margin-bottom:20px;">
      <div style="background:#f3f4f6;padding:6px 10px;border-radius:6px;margin-bottom:8px;">
        <strong style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#374151;">${title}</strong>
      </div>
      ${content}
    </div>`

  const table = (headers: string[], rowsData: string[][], tfoot?: string) => `
    <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
      <thead>
        <tr style="background:#f9fafb;">
          ${headers.map(h => `<th style="padding:5px 8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rowsData.map(row => `<tr style="border-bottom:0.5px solid #f3f4f6;">
          ${row.map((cell, i) => `<td style="padding:5px 8px;font-size:12px;color:#111827;${i > 0 ? 'text-align:right;' : ''}">${cell}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
      ${tfoot ? `<tfoot>${tfoot}</tfoot>` : ''}
    </table>`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Laporan Coco Puff POS — ${data.periode}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#fff;padding:24px;}
    h1{font-size:20px;font-weight:700;margin-bottom:2px;}
    .sub{font-size:13px;color:#6b7280;margin-bottom:20px;}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
    .kpi{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;}
    .kpi .label{font-size:11px;color:#6b7280;margin-bottom:4px;}
    .kpi .val{font-size:18px;font-weight:700;}
    .kpi.green{background:#f0fdf4;border-color:#bbf7d0;}.kpi.green .val{color:#16a34a;}
    .kpi.red{background:#fef2f2;border-color:#fecaca;}.kpi.red .val{color:#dc2626;}
    @media print{
      body{padding:16px;}
      .no-print{display:none;}
      @page{margin:15mm;size:A4;}
    }
  </style>
</head>
<body>
  <h1>Laporan Coco Puff POS</h1>
  <div class="sub">Periode: ${data.periode} · Dicetak: ${new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>

  <!-- KPI -->
  <div class="grid2">
    <div class="kpi"><div class="label">Total Omzet</div><div class="val">${RUPIAH(data.totalOmzet)}</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">${data.totalTrx} transaksi</div></div>
    <div class="kpi"><div class="label">Total Pembelian</div><div class="val">${RUPIAH(data.totalBeli)}</div></div>
    <div class="kpi"><div class="label">Total Biaya Operasional</div><div class="val">${RUPIAH(data.totalBiaya)}</div></div>
    <div class="kpi"><div class="label">Nilai Stok Gudang</div><div class="val">${RUPIAH(data.nilaiStok)}</div></div>
    <div class="kpi ${data.labaKotor >= 0 ? 'green' : 'red'}" style="grid-column:span 2;">
      <div class="label">Laba Kotor (Omzet - Pembelian - Biaya)</div>
      <div class="val">${RUPIAH(data.labaKotor)}</div>
    </div>
  </div>

  ${section('Omzet Per Toko', table(
    ['Toko', 'Kota', 'Transaksi', 'Omzet'],
    data.storeStats.map(s => [s.nama, s.kota, String(s.count), RUPIAH(s.omzet)])
  ))}

  ${section('Penjualan Per Metode Bayar', table(
    ['Metode', 'Total', '%'],
    Object.entries(data.byMethod)
      .filter(([,v]) => v > 0)
      .sort((a,b) => b[1]-a[1])
      .map(([k,v]) => [
        methodLabels[k] || k,
        RUPIAH(v),
        data.totalOmzet > 0 ? ((v/data.totalOmzet)*100).toFixed(1)+'%' : '0%'
      ])
  ))}

  ${section('Biaya Operasional Per Kategori', table(
    ['Kategori', 'Total', '%'],
    data.byExpenseCat.map(([k,v]) => [
      katLabel[k] || k,
      RUPIAH(v),
      data.totalBiaya > 0 ? ((v/data.totalBiaya)*100).toFixed(1)+'%' : '0%'
    ]),
    `<tr style="background:#f9fafb;border-top:2px solid #e5e7eb;">
      <td style="padding:6px 8px;font-size:12px;font-weight:700;">Total</td>
      <td style="padding:6px 8px;text-align:right;font-size:12px;font-weight:700;">${RUPIAH(data.totalBiaya)}</td>
      <td></td>
    </tr>`
  ))}

  ${section('Stok Gudang Saat Ini', table(
    ['Bahan', 'Qty', 'Satuan', 'Avg Cost', 'Nilai'],
    data.stokGudang.map(s => [s.nama, String(s.qty), s.unit, RUPIAH(s.avgCost), RUPIAH(s.nilai)]),
    `<tr style="background:#f9fafb;border-top:2px solid #e5e7eb;">
      <td colspan="4" style="padding:6px 8px;font-size:12px;font-weight:700;">Total Nilai Stok</td>
      <td style="padding:6px 8px;text-align:right;font-size:12px;font-weight:700;">${RUPIAH(data.nilaiStok)}</td>
    </tr>`
  ))}

  ${section('Stok Produk Jadi', table(
    ['Produk', 'Stok (pcs)', 'HPP/pcs', 'Total Nilai'],
    data.stokProdukJadi.map(p => [p.nama, String(p.qty), RUPIAH(p.hppPerUnit), RUPIAH(p.qty * p.hppPerUnit)])
  ))}

  <div class="no-print" style="margin-top:24px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 24px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-right:8px;">🖨️ Print / Save PDF</button>
    <button onclick="window.close()" style="padding:10px 24px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Tutup</button>
  </div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) { alert('Pop-up diblokir browser. Izinkan pop-up untuk export PDF.'); return }
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.focus(), 300)
}
