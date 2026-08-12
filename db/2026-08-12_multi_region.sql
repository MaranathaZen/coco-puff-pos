-- Fase 0 — Multi-region (cabang Bali/franchise).
-- Versi ANTI-GAGAL + DIAGNOSTIK: tiap ALTER dibungkus BEGIN/EXCEPTION per tabel,
-- jadi error di satu tabel TIDAK membatalkan yang lain, dan alasannya dicatat.
-- Hasil akhir: tabel OK/GAGAL per item (paste hasilnya kalau ada yang GAGAL).
--
-- Aman diulang (idempoten). Prinsip: data lama = 'malang', user lama all_regions=true.

DROP TABLE IF EXISTS _mig;
CREATE TEMP TABLE _mig (item text, status text);

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'warehouse_stock','production_stock','finished_goods_stock','products','materials',
    'stores','users','transactions','categories','suppliers','partners','packages',
    'production_recipes','production_recipe_items','store_recipes','store_recipe_items',
    'stock','shifts','warehouse_mutations','production_mutations','purchases',
    'warehouse_expenses','store_product_prices','promotions','close_order_reports'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT ''malang''', t);
      INSERT INTO _mig VALUES ('region.'||t, 'OK');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _mig VALUES ('region.'||t, 'GAGAL: '||SQLERRM);
    END;
  END LOOP;

  -- users.all_regions + jaga akses user existing (semua = HQ Malang)
  BEGIN
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS all_regions boolean NOT NULL DEFAULT false;
    UPDATE public.users SET all_regions = true WHERE all_regions = false;
    INSERT INTO _mig VALUES ('users.all_regions', 'OK');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _mig VALUES ('users.all_regions', 'GAGAL: '||SQLERRM);
  END;

  -- Index region (opsional, guarded)
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_warehouse_stock_region  ON public.warehouse_stock (region);
    CREATE INDEX IF NOT EXISTS idx_production_stock_region  ON public.production_stock (region);
    CREATE INDEX IF NOT EXISTS idx_finished_goods_stock_region ON public.finished_goods_stock (region);
    CREATE INDEX IF NOT EXISTS idx_products_region          ON public.products (region);
    CREATE INDEX IF NOT EXISTS idx_materials_region         ON public.materials (region);
    INSERT INTO _mig VALUES ('index.region', 'OK');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _mig VALUES ('index.region', 'GAGAL: '||SQLERRM);
  END;
END $$;

SELECT * FROM _mig ORDER BY status DESC, item;
