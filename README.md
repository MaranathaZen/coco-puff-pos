# Coco Puff POS — React PWA

Point of Sale untuk toko kue Coco Puff.
Bisa dipakai di Windows (browser), Android (tambahkan ke home screen), dan HP owner.

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS (UI)
- Dexie.js (IndexedDB — offline storage)
- Zustand (state management)
- Supabase (cloud sync + owner dashboard)
- PWA (installable di Android tanpa app store)

## Cara Install & Jalankan

### Syarat
- Node.js versi 18 ke atas
- VS Code

### Langkah

1. **Buka folder project di VS Code**
   ```
   File → Open Folder → pilih folder coco_puff_pos
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Jalankan development server**
   ```bash
   npm run dev
   ```
   Buka browser: http://localhost:5173

4. **Login pertama kali**
   ```
   owner   / admin123   → Dashboard semua toko
   manager / admin123   → Laporan + produk
   kasir   / kasir123   → Layar POS
   gudang  / kasir123   → Stok bahan
   ```

## Deploy ke Vercel (hosting gratis)

1. Push ke GitHub
2. Buka vercel.com → Import project
3. Tambah Environment Variables:
   ```
   VITE_SUPABASE_URL=https://dvdhdmzjlontzdhsbxdo.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   VITE_STORE_ID=toko-a1
   VITE_STORE_NAME=Coco Puff Kota A Toko 1
   ```
4. Deploy → dapat URL seperti: https://coco-puff-a1.vercel.app

## Deploy per toko

Setiap toko dapat URL berbeda dengan STORE_ID berbeda:
- Toko A1: https://cocopuff-a1.vercel.app (VITE_STORE_ID=toko-a1)
- Toko A2: https://cocopuff-a2.vercel.app (VITE_STORE_ID=toko-a2)
- dst.

## Cara pakai di Android

1. Buka Chrome di Android
2. Buka URL toko (misal: https://cocopuff-a1.vercel.app)
3. Tap menu Chrome → "Add to Home Screen"
4. Aplikasi muncul di home screen seperti app biasa

## Struktur folder

```
src/
├── pages/
│   ├── auth/         LoginPage
│   ├── cashier/      CashierPage (POS utama)
│   ├── products/     ProductsPage
│   ├── stock/        StockPage
│   ├── reports/      ReportsPage
│   ├── settings/     SettingsPage
│   └── owner/        OwnerPage (dashboard semua toko)
├── store/
│   ├── auth.ts       State login
│   └── cart.ts       State keranjang belanja
├── lib/
│   ├── supabase.ts   Koneksi Supabase
│   ├── db.ts         Database lokal (Dexie/IndexedDB)
│   ├── sync.ts       Background sync offline→Supabase
│   ├── seed.ts       Data awal
│   └── utils.ts      Helper functions
└── types/
    └── index.ts      TypeScript types
```
