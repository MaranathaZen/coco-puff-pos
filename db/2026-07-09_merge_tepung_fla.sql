-- Merge duplikat "Tepung Fla" di production_stock.
-- CANON material  = mat-f251f9f4                          (aktif)
--   production_stock b08fddbc-38fc-4120-b6e2-63ffa21026d6 qty 1272 avg_cost 483.45
-- DUP   material  = 770ae6d6-7391-4931-8255-8f76ec54a349  (inactive)
--   production_stock af54a955-457e-414b-9697-0849d3bfd1e9 qty 532  avg_cost 83
-- Hasil: qty 1804, avg_cost = weighted.
--
-- material_id dirujuk 9 tabel. WAJIB jalankan B0 (ref-check id PENUH) dulu,
-- baru FASE B (irreversible). Backup dulu kalau ragu.

-- ============================================================
-- FASE A — INSPECT (read-only, jalankan & baca hasil dulu)
-- ============================================================

-- A1. Kedua id itu material atau bukan? Nama harus sama "Tepung Fla".
SELECT id, name, category, unit, unit_cost
FROM materials
WHERE id IN ('mat-f251f9f4', '770ae6d6');

-- A2. Baris production_stock kedua id.
SELECT id, material_id, qty_on_hand, avg_cost, last_updated
FROM production_stock
WHERE material_id IN ('mat-f251f9f4', '770ae6d6');

-- A3. Berapa referensi ke DUP (770ae6d6) di tiap tabel?
SELECT 'production_stock'         AS tbl, count(*) FROM production_stock         WHERE material_id = '770ae6d6'
UNION ALL SELECT 'warehouse_stock',           count(*) FROM warehouse_stock          WHERE material_id = '770ae6d6'
UNION ALL SELECT 'stock.material_id',         count(*) FROM stock                    WHERE material_id = '770ae6d6'
UNION ALL SELECT 'stock.ingredient_id',       count(*) FROM stock                    WHERE ingredient_id = '770ae6d6'
UNION ALL SELECT 'purchase_items',            count(*) FROM purchase_items           WHERE material_id = '770ae6d6'
UNION ALL SELECT 'purchase_returns',          count(*) FROM purchase_returns         WHERE material_id = '770ae6d6'
UNION ALL SELECT 'warehouse_mutation_items',  count(*) FROM warehouse_mutation_items WHERE material_id = '770ae6d6'
UNION ALL SELECT 'production_recipe_items',   count(*) FROM production_recipe_items  WHERE material_id = '770ae6d6'
UNION ALL SELECT 'production_log_materials',  count(*) FROM production_log_materials WHERE material_id = '770ae6d6'
UNION ALL SELECT 'store_recipe_items',        count(*) FROM store_recipe_items       WHERE material_id = '770ae6d6';

-- Kalau A1 kosong utk 770ae6d6 → dia BUKAN material_id, mungkin production_stock.id.
-- STOP & lapor hasil sebelum FASE B.

-- ============================================================
-- B0 — RE-CHECK ref pakai id PENUH (read-only). Hasil 2026-07-09:
--   cuma warehouse_mutation_items = 1, sisanya 0.
-- ============================================================
-- (lihat query B0 di histori; jalankan ulang kalau data berubah)

-- ============================================================
-- FASE B — MERGE (irreversible). Jalankan satu blok.
-- ============================================================
BEGIN;

-- B1. Repoint 1 ref historis DUP -> CANON.
UPDATE warehouse_mutation_items
SET material_id = 'mat-f251f9f4'
WHERE material_id = '770ae6d6-7391-4931-8255-8f76ec54a349';

-- B2. Merge qty + weighted avg_cost ke CANON (baca DUP sebelum dihapus).
UPDATE production_stock canon
SET qty_on_hand  = canon.qty_on_hand + dup.qty_on_hand,
    avg_cost     = (canon.qty_on_hand*canon.avg_cost + dup.qty_on_hand*dup.avg_cost)
                   / NULLIF(canon.qty_on_hand + dup.qty_on_hand, 0),
    last_updated = now()
FROM production_stock dup
WHERE canon.id = 'b08fddbc-38fc-4120-b6e2-63ffa21026d6'
  AND dup.id   = 'af54a955-457e-414b-9697-0849d3bfd1e9';

-- B3. Hapus baris production_stock DUP.
DELETE FROM production_stock WHERE id = 'af54a955-457e-414b-9697-0849d3bfd1e9';

-- B4. Pastikan material DUP inactive.
UPDATE materials SET is_active = false WHERE id = '770ae6d6-7391-4931-8255-8f76ec54a349';

COMMIT;

-- Verify: harus 1 baris, qty 1804, avg_cost ~365.36.
-- SELECT ps.id, m.name, ps.qty_on_hand, ps.avg_cost
-- FROM production_stock ps JOIN materials m ON m.id = ps.material_id
-- WHERE m.name ILIKE '%tepung fla%';
