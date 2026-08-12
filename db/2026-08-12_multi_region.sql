-- Fase 0 — Multi-region (cabang Bali/franchise).
-- Tambah kolom `region` ke tabel data + `all_regions` ke users.
-- JALANKAN INI DULU sebelum deploy kode multi-region (kode memfilter .in('region', ...)).
--
-- Prinsip: pertahankan perilaku sekarang.
--  - Semua baris lama otomatis region='malang' (DEFAULT mengisi baris existing).
--  - Semua user lama all_regions=true (semua = HQ Malang, jangan sampai hilang akses).
--  - User Bali nanti dibuat eksplisit region='bali', all_regions=false (Fase 5).

BEGIN;

-- 1) Master / katalog (di-clone independen per region di Fase 5)
ALTER TABLE public.products                 ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.materials                ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.categories               ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.suppliers                ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.partners                 ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.packages                 ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.production_recipes       ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.production_recipe_items  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.store_recipes            ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.store_recipe_items       ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';

-- 2) Stok gudang/produksi (dulu GLOBAL — inilah alasan utama butuh region)
ALTER TABLE public.warehouse_stock          ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.production_stock         ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.finished_goods_stock     ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';

-- 3) Struktur toko & user
ALTER TABLE public.stores                   ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.users                    ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.users                    ADD COLUMN IF NOT EXISTS all_regions boolean NOT NULL DEFAULT false;

-- 4) Tabel ber-store_id (denormalisasi region utk mempermudah filter sync)
ALTER TABLE public.transactions             ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.stock                    ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.shifts                   ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.warehouse_mutations      ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.production_mutations     ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.purchases                ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.warehouse_expenses       ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.store_product_prices     ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.promotions               ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.close_order_reports      ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';

-- 5) Pertahankan akses: semua user existing = HQ Malang → lihat semua region.
--    (User Bali di Fase 5 dibuat eksplisit all_regions=false.)
UPDATE public.users SET all_regions = true WHERE all_regions = false;

-- 6) Index region utk tabel yang sering difilter
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_region      ON public.warehouse_stock (region);
CREATE INDEX IF NOT EXISTS idx_production_stock_region      ON public.production_stock (region);
CREATE INDEX IF NOT EXISTS idx_finished_goods_stock_region  ON public.finished_goods_stock (region);
CREATE INDEX IF NOT EXISTS idx_products_region              ON public.products (region);
CREATE INDEX IF NOT EXISTS idx_materials_region             ON public.materials (region);
CREATE INDEX IF NOT EXISTS idx_stores_region                ON public.stores (region);
CREATE INDEX IF NOT EXISTS idx_users_region                 ON public.users (region);

COMMIT;

-- Verifikasi cepat:
-- SELECT region, count(*) FROM public.warehouse_stock GROUP BY region;
-- SELECT username, region, all_regions FROM public.users ORDER BY all_regions DESC;
