-- ============================================================================
-- 2026-09-25  Perubahan stok mutasi / pembelian / produksi dijalankan SERVER
--
-- Dulu: HP menghitung stok tujuan dari salinan lokal lalu MENIMPA angka server
-- (upsert qty_on_hand absolut) -> penjualan/perubahan sejak HP terakhir sync
-- tertimpa. Pengurangan dilewati kalau baris stok tak ada di salinan HP.
-- Sekarang: HP mengirim "tambah/kurangi X" -> server cari barisnya sendiri,
-- terapkan atomik & TEPAT SEKALI (buku besar stock_ops), catat masalah kalau
-- baris tak ada. Void tetap ditangani trigger rollback_* yang sudah ada.
--
-- Juga: rpc_delta lama dibuat tepat-sekali (adjust_stock_once) — dulu kalau
-- respons hilang lalu antrian mengulang, delta terterapkan dua kali.
-- Migrasi ini pasif sampai app versi baru memanggilnya. Idempoten.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_ops (
  op_id       text PRIMARY KEY,               -- id antrian sync HP (unik per operasi)
  table_name  text NOT NULL,
  row_id      text,                           -- baris stok yang diubah (NULL = dilewati)
  store_id    text,
  key_id      text,                           -- material_id / product_id
  delta       numeric NOT NULL,               -- permintaan
  applied     numeric,                        -- yang benar-benar diterapkan (stok tak bisa < 0)
  qty_after   numeric,
  source      text,                           -- 'mutasi' | 'pembelian' | 'produksi' | 'produksi_toko' | 'rpc_delta'
  ref_id      text,                           -- id mutasi / pembelian / log produksi
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_ops_ref_idx ON stock_ops (ref_id);
ALTER TABLE stock_ops ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock_ops' AND policyname='read_all') THEN
    CREATE POLICY read_all ON stock_ops FOR SELECT USING (true);
  END IF;
END $$;

ALTER TABLE stock_issues ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE stock_issues ADD COLUMN IF NOT EXISTS ref_id text;

-- ── Operasi stok berbasis kunci (store+material / material / product) ──────
-- p_cost_mode: 'none' (cost hanya dipakai saat membuat baris baru),
--              'weighted' (rata-rata tertimbang saat masuk), 'set' (timpa cost)
CREATE OR REPLACE FUNCTION apply_stock_op(
  p_op_id text, p_table text, p_store_id text, p_key text, p_delta numeric,
  p_cost numeric DEFAULT NULL, p_cost_mode text DEFAULT 'none', p_name text DEFAULT NULL,
  p_new_id text DEFAULT NULL, p_source text DEFAULT NULL, p_ref_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  op      stock_ops%ROWTYPE;
  rid     text;
  cur     numeric;
  oldcost numeric;
  newcost numeric;
  newq    numeric;
  applied numeric;
  costcol text := CASE WHEN p_table = 'finished_goods_stock' THEN 'hpp_per_unit' ELSE 'avg_cost' END;
  result  jsonb;
BEGIN
  IF p_table NOT IN ('stock','production_stock','warehouse_stock','finished_goods_stock') THEN
    RAISE EXCEPTION 'tabel tak diizinkan: %', p_table;
  END IF;
  IF p_table = 'stock' AND p_store_id IS NULL THEN RAISE EXCEPTION 'store_id wajib untuk tabel stock'; END IF;

  -- Kunci per (tabel, toko, barang): cegah dua operasi bersamaan membuat baris dobel
  PERFORM pg_advisory_xact_lock(hashtext(p_table || '|' || COALESCE(p_store_id, '') || '|' || p_key));

  -- Tepat sekali: operasi yang sama dikirim ulang -> jangan terapkan lagi
  SELECT * INTO op FROM stock_ops WHERE op_id = p_op_id;
  IF FOUND THEN
    IF op.row_id IS NULL THEN RETURN jsonb_build_object('skipped', true); END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', p_table) INTO result USING op.row_id;
    RETURN result;
  END IF;

  IF p_table = 'stock' THEN
    SELECT id, qty_on_hand, avg_cost INTO rid, cur, oldcost FROM stock
     WHERE store_id = p_store_id AND (material_id = p_key OR ingredient_id = p_key)
     ORDER BY (material_id = p_key) DESC, last_updated DESC NULLS LAST LIMIT 1 FOR UPDATE;
  ELSIF p_table = 'finished_goods_stock' THEN
    SELECT id, qty_on_hand, hpp_per_unit INTO rid, cur, oldcost FROM finished_goods_stock
     WHERE product_id = p_key OR (p_name IS NOT NULL AND product_name = p_name)
     ORDER BY (product_id = p_key) DESC, last_updated DESC NULLS LAST LIMIT 1 FOR UPDATE;
  ELSE
    EXECUTE format('SELECT id, qty_on_hand, avg_cost FROM %I WHERE material_id = $1
                    ORDER BY last_updated DESC NULLS LAST LIMIT 1 FOR UPDATE', p_table)
      INTO rid, cur, oldcost USING p_key;
  END IF;

  IF rid IS NULL THEN
    IF p_delta <= 0 THEN
      -- Mau mengurangi stok yang barisnya tidak ada: catat, jangan dilewati senyap
      INSERT INTO stock_ops (op_id, table_name, row_id, store_id, key_id, delta, applied, source, ref_id)
      VALUES (p_op_id, p_table, NULL, p_store_id, p_key, p_delta, 0, p_source, p_ref_id);
      INSERT INTO stock_issues (store_id, material_id, product_name, issue, qty_short, source, ref_id)
      VALUES (p_store_id, p_key, p_table, 'no_stock_row', -p_delta, p_source, p_ref_id);
      RETURN jsonb_build_object('skipped', true);
    END IF;
    rid := COALESCE(p_new_id, gen_random_uuid()::text);
    IF p_table = 'stock' THEN
      INSERT INTO stock (id, store_id, ingredient_id, material_id, qty_on_hand, avg_cost, last_updated)
      VALUES (rid, p_store_id, p_key, p_key, p_delta, COALESCE(p_cost, 0), now());
    ELSIF p_table = 'finished_goods_stock' THEN
      INSERT INTO finished_goods_stock (id, product_id, product_name, qty_on_hand, hpp_per_unit, last_updated)
      VALUES (rid, p_key, COALESCE(p_name, p_key), p_delta, COALESCE(p_cost, 0), now());
    ELSE
      EXECUTE format('INSERT INTO %I (id, material_id, qty_on_hand, avg_cost, last_updated) VALUES ($1, $2, $3, $4, now())', p_table)
        USING rid, p_key, p_delta, COALESCE(p_cost, 0);
    END IF;
    newq := p_delta; applied := p_delta;
  ELSE
    cur := GREATEST(0, COALESCE(cur, 0));
    IF p_delta >= 0 THEN
      applied := p_delta;
    ELSE
      applied := -LEAST(-p_delta, cur);           -- tak boleh di bawah 0
    END IF;
    newq := cur + applied;
    newcost := CASE
      WHEN p_cost IS NOT NULL AND p_cost_mode = 'weighted' AND p_delta > 0
        THEN CASE WHEN newq > 0 THEN (cur * COALESCE(oldcost, 0) + p_delta * p_cost) / newq ELSE p_cost END
      WHEN p_cost IS NOT NULL AND p_cost_mode = 'set' THEN p_cost
      ELSE oldcost END;
    EXECUTE format('UPDATE %I SET qty_on_hand = $1, %I = $2, last_updated = now() WHERE id = $3', p_table, costcol)
      USING newq, newcost, rid;
    IF applied > p_delta THEN
      INSERT INTO stock_issues (store_id, material_id, product_name, issue, qty_short, source, ref_id)
      VALUES (p_store_id, p_key, p_table, 'stock_short', applied - p_delta, p_source, p_ref_id);
    END IF;
  END IF;

  INSERT INTO stock_ops (op_id, table_name, row_id, store_id, key_id, delta, applied, qty_after, source, ref_id)
  VALUES (p_op_id, p_table, rid, p_store_id, p_key, p_delta, applied, newq, p_source, p_ref_id);
  EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', p_table) INTO result USING rid;
  RETURN result;
END $$;

-- ── Delta berbasis id baris (antrian rpc_delta lama), sekarang tepat sekali ──
CREATE OR REPLACE FUNCTION adjust_stock_once(p_op_id text, p_table text, p_id text, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_qty numeric; done_qty numeric;
BEGIN
  IF p_table NOT IN ('stock','production_stock','warehouse_stock','finished_goods_stock') THEN
    RAISE EXCEPTION 'tabel tak diizinkan: %', p_table;
  END IF;
  INSERT INTO stock_ops (op_id, table_name, row_id, delta, source)
  VALUES (p_op_id, p_table, p_id, p_delta, 'rpc_delta')
  ON CONFLICT (op_id) DO NOTHING;
  IF NOT FOUND THEN
    -- sudah pernah diterapkan: kembalikan qty sekarang saja
    EXECUTE format('SELECT qty_on_hand FROM %I WHERE id = $1', p_table) INTO done_qty USING p_id;
    RETURN done_qty;
  END IF;
  EXECUTE format('UPDATE %I SET qty_on_hand = GREATEST(0, qty_on_hand + $1), last_updated = now()
                  WHERE id = $2 RETURNING qty_on_hand', p_table) INTO new_qty USING p_delta, p_id;
  IF new_qty IS NULL THEN
    DELETE FROM stock_ops WHERE op_id = p_op_id;   -- baris belum ada di server -> antrian coba lagi
    RETURN NULL;
  END IF;
  UPDATE stock_ops SET applied = p_delta, qty_after = new_qty WHERE op_id = p_op_id;
  RETURN new_qty;
END $$;

-- ── Void PRODUKSI TOKO: kembalikan ke stok TOKO (dulu salah ke production_stock) ──
-- Log produksi toko punya store_id & recipe_id = store_recipes.id. Versi lama selalu
-- mengembalikan bahan ke production_stock (stok divisi produksi) dan tidak mengurangi
-- hasil di stok toko -> stok toko & stok produksi sama-sama salah setelah void.
CREATE OR REPLACE FUNCTION public.rollback_production_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_output_type  text;
  v_product_name text;
  v_product_id   text;
BEGIN
  IF NEW.status = 'voided' AND (OLD.status IS NULL OR OLD.status <> 'voided') THEN

    IF NEW.store_id IS NOT NULL THEN
      -- PRODUKSI TOKO
      UPDATE stock s
      SET qty_on_hand = s.qty_on_hand + plm.qty_used, last_updated = NOW()
      FROM production_log_materials plm
      WHERE plm.log_id = NEW.id
        AND s.store_id = NEW.store_id
        AND (s.material_id = plm.material_id OR s.ingredient_id = plm.material_id);

      SELECT sr.product_name INTO v_product_name FROM store_recipes sr WHERE sr.id = NEW.recipe_id;
      SELECT m.id INTO v_product_id FROM materials m WHERE LOWER(m.name) = LOWER(v_product_name) LIMIT 1;
      IF v_product_id IS NOT NULL THEN
        UPDATE stock s
        SET qty_on_hand = GREATEST(0, s.qty_on_hand - NEW.total_yield), last_updated = NOW()
        WHERE s.store_id = NEW.store_id
          AND (s.material_id = v_product_id OR s.ingredient_id = v_product_id);
      END IF;
      RETURN NEW;
    END IF;

    -- PRODUKSI DIVISI (tidak berubah)
    -- 1) Kembalikan bahan yang dikonsumsi ke production_stock
    UPDATE production_stock ps
    SET qty_on_hand = ps.qty_on_hand + plm.qty_used,
        last_updated = NOW()
    FROM production_log_materials plm
    WHERE plm.log_id = NEW.id
      AND ps.material_id = plm.material_id;

    -- 2) Ambil output_type & nama produk dari resep
    SELECT pr.output_type, COALESCE(pr.product_name, pr.name)
      INTO v_output_type, v_product_name
    FROM production_recipes pr
    WHERE pr.id = NEW.recipe_id;

    -- cari material id produk hasil (cocokkan via nama, sama seperti alur maju)
    SELECT m.id INTO v_product_id
    FROM materials m
    WHERE LOWER(m.name) = LOWER(v_product_name)
    LIMIT 1;

    -- 3) Kurangi hasil produksi dari tabel yang benar
    IF v_output_type = 'production_stock' THEN
      UPDATE production_stock ps
      SET qty_on_hand = GREATEST(0, ps.qty_on_hand - NEW.total_yield),
          last_updated = NOW()
      WHERE ps.material_id = v_product_id;
    ELSE
      UPDATE finished_goods_stock fgs
      SET qty_on_hand = GREATEST(0, fgs.qty_on_hand - NEW.total_yield),
          last_updated = NOW()
      WHERE fgs.product_id = v_product_id
         OR LOWER(fgs.product_name) = LOWER(v_product_name);
    END IF;

  END IF;
  RETURN NEW;
END;
$function$;
