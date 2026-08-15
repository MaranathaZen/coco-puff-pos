-- Fase 5 — ubah unique constraint katalog jadi PER-REGION supaya nama/sku sama
-- boleh ada di Malang & Bali. AMAN: lebih longgar, baris Malang tetap valid
-- (semua region='malang' dgn nama/sku unik). Tak menyentuh data, hanya constraint.

-- categories: unik (name) -> (name, region)
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_region_key ON public.categories (name, region);

-- products: unik (sku) -> (sku, region)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_region_key ON public.products (sku, region);

-- Verifikasi:
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('categories','products')
--   AND indexname LIKE '%region%';
