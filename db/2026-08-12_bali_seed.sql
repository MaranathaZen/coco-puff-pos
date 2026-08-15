-- Fase 5 langkah 1 — Buat cabang Bali: 3 toko (toko/gudang/produksi) + owner02.
-- Meniru struktur Malang (gudang & produksi = store is_virtual=true).
-- Idempoten (ON CONFLICT id DO NOTHING). Jalankan di Supabase SQL Editor.
--
-- PASSWORD SEMENTARA owner02 = "CocoPuffBali2026"  (hash SHA-256 legacy di bawah).
-- WAJIB GANTI setelah login pertama (Setting -> Ganti Password). Auto-upgrade ke PBKDF2 saat login.
--
-- TES ISOLASI: login owner02 di URL PREVIEW (branch feat/multi-region-bali),
-- BUKAN produksi. owner02 harus lihat Bali saja (kosong), TIDAK lihat Malang.
-- (Di produksi/main kode lama belum filter region → owner02 malah lihat semua.)

-- 1) Toko Bali (toko real + gudang/produksi virtual)
INSERT INTO public.stores (id, name, city, is_active, is_virtual, region) VALUES
  ('store-bali-01',       'Coco Puff Bali', 'Bali', true, false, 'bali'),
  ('store-gudang-bali',   'Gudang Bali',    'Bali', true, true,  'bali'),
  ('store-produksi-bali', 'Produksi Bali',  'Bali', true, true,  'bali')
ON CONFLICT (id) DO NOTHING;

-- 2) owner02 — owner Bali, HANYA lihat Bali (all_regions=false)
INSERT INTO public.users (id, store_id, name, username, password_hash, role, is_active, region, all_regions) VALUES
  ('user-owner-bali-01', 'store-bali-01', 'Owner Bali', 'owner02',
   'd4ed4b884ad2d0622c0d048f9f041812f4d688a81dfb60b1461cc769e9d6e19c',  -- SHA-256("CocoPuffBali2026")
   'owner', true, 'bali', false)
ON CONFLICT (id) DO NOTHING;

-- 3) (OPSIONAL) Staf Bali lain — uncomment kalau mau. Password sementara sama.
-- INSERT INTO public.users (id, store_id, name, username, password_hash, role, is_active, region, all_regions) VALUES
--   ('user-kasir-bali-01',    'store-bali-01',       'Kasir Bali',         'kasirbali',    'd4ed4b884ad2d0622c0d048f9f041812f4d688a81dfb60b1461cc769e9d6e19c', 'kasir',    true, 'bali', false),
--   ('user-gudang-bali-01',   'store-gudang-bali',   'Admin Gudang Bali',  'gudangbali',   'd4ed4b884ad2d0622c0d048f9f041812f4d688a81dfb60b1461cc769e9d6e19c', 'gudang',   true, 'bali', false),
--   ('user-produksi-bali-01', 'store-produksi-bali', 'Admin Produksi Bali','produksibali', 'd4ed4b884ad2d0622c0d048f9f041812f4d688a81dfb60b1461cc769e9d6e19c', 'produksi', true, 'bali', false)
-- ON CONFLICT (id) DO NOTHING;

-- 4) (OPSIONAL, disarankan) Kunci kasir Malang ke region-nya saja supaya tak ikut
--    menarik data Bali (hemat egress). Owner/gudang/produksi Malang tetap all_regions=true
--    karena admin Malang juga pegang Bali.
-- UPDATE public.users SET all_regions = false WHERE role = 'kasir' AND region = 'malang';

-- Verifikasi:
-- SELECT id, name, region, is_virtual FROM public.stores WHERE region='bali';
-- SELECT username, role, region, all_regions FROM public.users WHERE region='bali';
