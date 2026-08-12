-- Fase 0 — Multi-region (cabang Bali/franchise).
-- ALTER polos, idempoten (ADD COLUMN IF NOT EXISTS), TANPA transaksi/DO block.
-- Di Supabase tiap statement auto-commit → satu error tak membatalkan yang lain.
-- Tabel kritis di ATAS supaya dijamin masuk duluan.
--
-- Prinsip: pertahankan perilaku sekarang (semua data lama = 'malang',
-- semua user lama all_regions=true). User Bali dibuat eksplisit di Fase 5.

-- === KRITIS (wajib berhasil) ===
ALTER TABLE public.warehouse_stock      ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.production_stock     ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.finished_goods_stock ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.products             ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.materials            ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.stores               ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.users                ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.transactions         ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';

-- users.all_regions + jaga akses user existing (semua = HQ Malang)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS all_regions boolean NOT NULL DEFAULT false;
UPDATE public.users SET all_regions = true WHERE all_regions = false;

-- === KATALOG ===
ALTER TABLE public.categories               ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.suppliers                ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.partners                 ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.packages                 ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.production_recipes       ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.production_recipe_items  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.store_recipes            ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.store_recipe_items       ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';

-- === TABEL ber-store_id (denormalisasi region utk filter sync) ===
ALTER TABLE public.stock                    ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.shifts                   ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.warehouse_mutations      ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.production_mutations     ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.purchases                ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.warehouse_expenses       ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.store_product_prices     ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.promotions               ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
ALTER TABLE public.close_order_reports      ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';

-- === INDEX region ===
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_region      ON public.warehouse_stock (region);
CREATE INDEX IF NOT EXISTS idx_production_stock_region      ON public.production_stock (region);
CREATE INDEX IF NOT EXISTS idx_finished_goods_stock_region  ON public.finished_goods_stock (region);
CREATE INDEX IF NOT EXISTS idx_products_region              ON public.products (region);
CREATE INDEX IF NOT EXISTS idx_materials_region             ON public.materials (region);

-- Verifikasi:
-- SELECT table_name FROM information_schema.columns
-- WHERE column_name='region' AND table_schema='public' ORDER BY table_name;
