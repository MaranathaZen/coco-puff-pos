-- Fase 0 — Multi-region (cabang Bali/franchise).
-- Tambah kolom `region` ke tabel data + `all_regions` ke users.
-- JALANKAN INI DULU sebelum deploy kode multi-region (kode memfilter .in('region', ...)).
--
-- ROBUST: pakai to_regclass guard — tabel yang tidak ada dilewati (RAISE NOTICE),
-- tidak membatalkan yang lain. Aman dijalankan berulang (idempotent).
--
-- Prinsip: pertahankan perilaku sekarang.
--  - Semua baris lama otomatis region='malang' (DEFAULT mengisi baris existing).
--  - Semua user lama all_regions=true (semua = HQ Malang, jangan sampai hilang akses).
--  - User Bali nanti dibuat eksplisit region='bali', all_regions=false (Fase 5).

-- 1) Tambah kolom region ke semua tabel data yang ada
DO $$
DECLARE
  t text;
  region_tables text[] := ARRAY[
    -- master / katalog (di-clone independen per region di Fase 5)
    'products','materials','categories','suppliers','partners','packages',
    'production_recipes','production_recipe_items','store_recipes','store_recipe_items',
    -- stok gudang/produksi (dulu GLOBAL — alasan utama butuh region)
    'warehouse_stock','production_stock','finished_goods_stock',
    -- struktur toko & user
    'stores','users',
    -- tabel ber-store_id (denormalisasi region utk mempermudah filter sync)
    'transactions','stock','shifts','warehouse_mutations','production_mutations',
    'purchases','warehouse_expenses','store_product_prices','promotions','close_order_reports'
  ];
BEGIN
  FOREACH t IN ARRAY region_tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT ''malang''', t);
      RAISE NOTICE 'ok: region ditambahkan ke %', t;
    ELSE
      RAISE NOTICE 'SKIP: tabel % tidak ada', t;
    END IF;
  END LOOP;

  -- users.all_regions + jaga akses user existing (semua = HQ Malang)
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS all_regions boolean NOT NULL DEFAULT false;
    UPDATE public.users SET all_regions = true WHERE all_regions = false;
    RAISE NOTICE 'ok: all_regions ditambahkan + user existing di-set true';
  END IF;
END $$;

-- 2) Index region utk tabel yang sering difilter (guarded)
DO $$
DECLARE
  t text;
  idx_tables text[] := ARRAY[
    'warehouse_stock','production_stock','finished_goods_stock',
    'products','materials','stores','users'
  ];
BEGIN
  FOREACH t IN ARRAY idx_tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_region ON public.%I (region)', t, t);
    END IF;
  END LOOP;
END $$;

-- 3) Verifikasi (jalankan setelah blok di atas):
-- Tabel mana saja yang sudah punya kolom region:
--   SELECT table_name FROM information_schema.columns
--   WHERE column_name='region' AND table_schema='public' ORDER BY table_name;
-- Cek user:
--   SELECT username, region, all_regions FROM public.users ORDER BY all_regions DESC;
