-- ============================================================================
-- 2026-10-13  Riwayat gerakan stok (kartu stok) — SETIAP perubahan qty tercatat
--
-- Tujuan: tidak ada lagi perubahan stok yang tak bisa dijelaskan. Trigger di 4
-- tabel stok mencatat angka sebelum/sesudah + SUMBER (penjualan, void, mutasi,
-- pembelian, produksi, opname, ...). Fungsi server yg sudah ada hanya ditambah
-- label sumber (set_config transaksi-lokal) — logikanya TIDAK berubah.
-- Perubahan dari jalur lain (app lama / tulis langsung) tercatat 'tulis_langsung'.
-- Tidak mengubah angka stok apa pun. Idempoten.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_movements (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  table_name  text NOT NULL,          -- stock | warehouse_stock | production_stock | finished_goods_stock
  row_id      text NOT NULL,
  store_id    text,
  key_id      text,                   -- material_id / product_id
  qty_before  numeric,
  qty_after   numeric,
  delta       numeric,
  source      text NOT NULL,          -- penjualan, void_penjualan, mutasi, pembelian, produksi, produksi_toko, opname, ...
  ref_id      text                    -- id transaksi / mutasi / pembelian / log produksi
);
CREATE INDEX IF NOT EXISTS stock_movements_row_idx ON stock_movements (table_name, row_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_time_idx ON stock_movements (created_at);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock_movements' AND policyname='read_all') THEN
    CREATE POLICY read_all ON stock_movements FOR SELECT USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION log_stock_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  src    text := NULLIF(current_setting('cocopuff.src', true), '');
  ref    text := NULLIF(current_setting('cocopuff.ref', true), '');
  j_new  jsonb;
  j_old  jsonb;
  j      jsonb;
  before numeric;
  after  numeric;
BEGIN
  -- Label hanya berlaku utk perintah (statement) yang sedang berjalan, jangan terbawa
  IF current_setting('cocopuff.stmt', true) IS DISTINCT FROM statement_timestamp()::text THEN
    src := NULL; ref := NULL;
  END IF;
  IF TG_OP <> 'DELETE' THEN j_new := to_jsonb(NEW); END IF;
  IF TG_OP <> 'INSERT' THEN j_old := to_jsonb(OLD); END IF;
  before := (j_old->>'qty_on_hand')::numeric;
  after  := (j_new->>'qty_on_hand')::numeric;
  IF TG_OP = 'UPDATE' AND before IS NOT DISTINCT FROM after THEN RETURN NULL; END IF;
  j := COALESCE(j_new, j_old);
  INSERT INTO stock_movements (table_name, row_id, store_id, key_id, qty_before, qty_after, delta, source, ref_id)
  VALUES (TG_TABLE_NAME, j->>'id', j->>'store_id',
          COALESCE(j->>'material_id', j->>'product_id', j->>'ingredient_id'),
          before, after, COALESCE(after, 0) - COALESCE(before, 0),
          COALESCE(src, CASE TG_OP WHEN 'INSERT' THEN 'baris_baru_langsung'
                                   WHEN 'DELETE' THEN 'hapus_langsung'
                                   ELSE 'tulis_langsung' END),
          ref);
  RETURN NULL;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['stock','warehouse_stock','production_stock','finished_goods_stock'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_log_stock_movement ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_log_stock_movement AFTER INSERT OR DELETE OR UPDATE OF qty_on_hand ON %I
                    FOR EACH ROW EXECUTE FUNCTION log_stock_movement()', t);
  END LOOP;
END $$;

-- ── Fungsi stok yang sudah ada: + label sumber ─────────────────────────────
-- adjust_stock_generic (isi tidak berubah; hanya ditambah label sumber)
CREATE OR REPLACE FUNCTION public.adjust_stock_generic(p_table text, p_id text, p_delta numeric)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE new_qty numeric;
BEGIN
  -- label sumber utk riwayat gerakan stok (stock_movements)
  PERFORM set_config('cocopuff.src', 'rpc_lama', true);
  PERFORM set_config('cocopuff.stmt', statement_timestamp()::text, true);
  PERFORM set_config('cocopuff.ref', COALESCE((NULL)::text, ''), true);
  IF p_table NOT IN ('stock','production_stock','warehouse_stock','finished_goods_stock') THEN
    RAISE EXCEPTION 'tabel tak diizinkan: %', p_table;
  END IF;
  EXECUTE format('UPDATE %I SET qty_on_hand = GREATEST(0, qty_on_hand + $1), last_updated = now()
     WHERE id = $2 RETURNING qty_on_hand', p_table) INTO new_qty USING p_delta, p_id;
  RETURN new_qty;
END $function$
;

-- adjust_stock_once (isi tidak berubah; hanya ditambah label sumber)
CREATE OR REPLACE FUNCTION public.adjust_stock_once(p_op_id text, p_table text, p_id text, p_delta numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_qty numeric; done_qty numeric;
BEGIN
  -- label sumber utk riwayat gerakan stok (stock_movements)
  PERFORM set_config('cocopuff.src', 'antrian_lama', true);
  PERFORM set_config('cocopuff.stmt', statement_timestamp()::text, true);
  PERFORM set_config('cocopuff.ref', COALESCE((p_op_id)::text, ''), true);
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
END $function$
;

-- apply_stock_op (isi tidak berubah; hanya ditambah label sumber)
CREATE OR REPLACE FUNCTION public.apply_stock_op(p_op_id text, p_table text, p_store_id text, p_key text, p_delta numeric, p_cost numeric DEFAULT NULL::numeric, p_cost_mode text DEFAULT 'none'::text, p_name text DEFAULT NULL::text, p_new_id text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_ref_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- label sumber utk riwayat gerakan stok (stock_movements)
  PERFORM set_config('cocopuff.src', COALESCE(p_source, 'operasi'), true);
  PERFORM set_config('cocopuff.stmt', statement_timestamp()::text, true);
  PERFORM set_config('cocopuff.ref', COALESCE((p_ref_id)::text, ''), true);
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
END $function$
;

-- deduct_stock_for_item (isi tidak berubah; hanya ditambah label sumber)
CREATE OR REPLACE FUNCTION public.deduct_stock_for_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tx      transactions%ROWTYPE;
  rec_id  text;
  pkg     numeric;
  total   numeric;
  ri      record;
  st_id   text;
  used    numeric;
  cur     numeric;
  actual  numeric;
BEGIN
  -- label sumber utk riwayat gerakan stok (stock_movements)
  PERFORM set_config('cocopuff.src', 'penjualan', true);
  PERFORM set_config('cocopuff.stmt', statement_timestamp()::text, true);
  PERFORM set_config('cocopuff.ref', COALESCE((NEW.transaction_id)::text, ''), true);
  SELECT * INTO tx FROM transactions WHERE id = NEW.transaction_id;
  IF NOT FOUND OR tx.stock_mode IS DISTINCT FROM 'server' OR tx.status = 'voided' THEN
    RETURN NEW;  -- app versi lama (potong sendiri) / sudah void sebelum item masuk
  END IF;

  SELECT COALESCE(NULLIF(pkg_qty, 0), 1) INTO pkg FROM products WHERE id = NEW.product_id;
  total := COALESCE(NEW.qty_eceran, 0) + COALESCE(NEW.qty_dus, 0) * COALESCE(pkg, 1);
  IF total <= 0 THEN RETURN NEW; END IF;

  -- Resep BOM toko (sama dgn logika kasir: bukan resep produksi toko)
  SELECT id INTO rec_id FROM store_recipes
   WHERE store_id = tx.store_id AND product_id = NEW.product_id AND is_active
     AND COALESCE(recipe_type, '') <> 'production' AND product_id NOT LIKE 'prod-toko-%'
   ORDER BY created_at LIMIT 1;
  IF rec_id IS NULL THEN
    INSERT INTO stock_issues (store_id, transaction_id, transaction_item_id, product_id, product_name, issue)
    VALUES (tx.store_id, tx.id, NEW.id, NEW.product_id, NEW.product_name, 'no_recipe');
    RETURN NEW;
  END IF;

  FOR ri IN SELECT material_id, qty_used FROM store_recipe_items
             WHERE recipe_id = rec_id AND COALESCE(source, '') <> 'production'
  LOOP
    used := COALESCE(ri.qty_used, 0) * total;
    IF used <= 0 THEN CONTINUE; END IF;

    SELECT id INTO st_id FROM stock
     WHERE store_id = tx.store_id AND (material_id = ri.material_id OR ingredient_id = ri.material_id)
     ORDER BY (material_id = ri.material_id) DESC, last_updated DESC NULLS LAST LIMIT 1;
    IF st_id IS NULL THEN
      INSERT INTO stock_issues (store_id, transaction_id, transaction_item_id, product_id, product_name, material_id, issue)
      VALUES (tx.store_id, tx.id, NEW.id, NEW.product_id, NEW.product_name, ri.material_id, 'no_stock_row');
      CONTINUE;
    END IF;

    -- Kunci baris stok; potong maksimal sebesar stok yang ada (tak boleh < 0)
    SELECT GREATEST(0, qty_on_hand) INTO cur FROM stock WHERE id = st_id FOR UPDATE;
    actual := LEAST(used, cur);

    -- Catat dulu di buku besar; kalau sudah pernah (kirim ulang), jangan potong lagi
    INSERT INTO stock_ledger (transaction_id, transaction_item_id, store_id, stock_id, material_id, qty, qty_required)
    VALUES (tx.id, NEW.id, tx.store_id, st_id, ri.material_id, actual, used)
    ON CONFLICT (transaction_item_id, material_id) DO NOTHING;
    IF FOUND THEN
      UPDATE stock SET qty_on_hand = cur - actual, last_updated = now() WHERE id = st_id;
      IF actual < used THEN
        INSERT INTO stock_issues (store_id, transaction_id, transaction_item_id, product_id, product_name, material_id, issue, qty_short)
        VALUES (tx.store_id, tx.id, NEW.id, NEW.product_id, NEW.product_name, ri.material_id, 'stock_short', used - actual);
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $function$
;

-- restore_stock_on_void (isi tidak berubah; hanya ditambah label sumber)
CREATE OR REPLACE FUNCTION public.restore_stock_on_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l record;
BEGIN
  -- label sumber utk riwayat gerakan stok (stock_movements)
  PERFORM set_config('cocopuff.src', 'void_penjualan', true);
  PERFORM set_config('cocopuff.stmt', statement_timestamp()::text, true);
  PERFORM set_config('cocopuff.ref', COALESCE((NEW.id)::text, ''), true);
  IF NEW.status = 'voided' AND OLD.status IS DISTINCT FROM 'voided' THEN
    FOR l IN UPDATE stock_ledger SET restored_at = now()
              WHERE transaction_id = NEW.id AND restored_at IS NULL
              RETURNING stock_id, qty
    LOOP
      UPDATE stock SET qty_on_hand = qty_on_hand + l.qty, last_updated = now() WHERE id = l.stock_id;
    END LOOP;
  END IF;
  RETURN NEW;
END $function$
;

-- rollback_mutation_stock (isi tidak berubah; hanya ditambah label sumber)
CREATE OR REPLACE FUNCTION public.rollback_mutation_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- label sumber utk riwayat gerakan stok (stock_movements)
  PERFORM set_config('cocopuff.src', 'void_mutasi', true);
  PERFORM set_config('cocopuff.stmt', statement_timestamp()::text, true);
  PERFORM set_config('cocopuff.ref', COALESCE((NEW.id)::text, ''), true);
  IF NEW.status = 'voided' AND (OLD.status IS NULL OR OLD.status != 'voided') THEN

    -- Kembalikan stok pengirim
    IF NEW.acting_store_id LIKE '%gudang%' THEN
      UPDATE warehouse_stock ws
      SET qty_on_hand = ws.qty_on_hand + wmi.qty
      FROM warehouse_mutation_items wmi
      WHERE wmi.mutation_id = NEW.id
      AND ws.material_id = wmi.material_id;

    ELSIF NEW.acting_store_id LIKE '%produksi%' THEN
      UPDATE production_stock ps
      SET qty_on_hand = ps.qty_on_hand + wmi.qty
      FROM warehouse_mutation_items wmi
      WHERE wmi.mutation_id = NEW.id
      AND ps.material_id = wmi.material_id;
      
      UPDATE finished_goods_stock fgs
      SET qty_on_hand = fgs.qty_on_hand + wmi.qty, last_updated = NOW()
      FROM warehouse_mutation_items wmi
      WHERE wmi.mutation_id = NEW.id
      AND fgs.product_id = wmi.material_id;

    ELSE
      UPDATE stock s
      SET qty_on_hand = s.qty_on_hand + wmi.qty
      FROM warehouse_mutation_items wmi
      WHERE wmi.mutation_id = NEW.id
      AND s.store_id = NEW.acting_store_id
      AND (s.material_id = wmi.material_id OR s.ingredient_id = wmi.material_id);
    END IF;

    -- Kurangi stok penerima
    IF NEW.mutation_type = 'to_production' THEN
      UPDATE production_stock ps
      SET qty_on_hand = GREATEST(0, ps.qty_on_hand - wmi.qty)
      FROM warehouse_mutation_items wmi
      WHERE wmi.mutation_id = NEW.id
      AND ps.material_id = wmi.material_id;

    ELSIF NEW.mutation_type = 'to_store' AND NEW.destination_id IS NOT NULL THEN
      -- FIX: hanya 1 UPDATE, pakai OR untuk cover material_id dan ingredient_id
      UPDATE stock s
      SET qty_on_hand = GREATEST(0, s.qty_on_hand - wmi.qty)
      FROM warehouse_mutation_items wmi
      WHERE wmi.mutation_id = NEW.id
      AND s.store_id = NEW.destination_id
      AND (s.material_id = wmi.material_id OR s.ingredient_id = wmi.material_id);
    END IF;

  END IF;
  RETURN NEW;
END;
$function$
;

-- rollback_production_stock (isi tidak berubah; hanya ditambah label sumber)
CREATE OR REPLACE FUNCTION public.rollback_production_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_output_type  text;
  v_product_name text;
  v_product_id   text;
BEGIN
  -- label sumber utk riwayat gerakan stok (stock_movements)
  PERFORM set_config('cocopuff.src', 'void_produksi', true);
  PERFORM set_config('cocopuff.stmt', statement_timestamp()::text, true);
  PERFORM set_config('cocopuff.ref', COALESCE((NEW.id)::text, ''), true);
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
$function$
;

-- rollback_purchase_stock (isi tidak berubah; hanya ditambah label sumber)
CREATE OR REPLACE FUNCTION public.rollback_purchase_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- label sumber utk riwayat gerakan stok (stock_movements)
  PERFORM set_config('cocopuff.src', 'void_pembelian', true);
  PERFORM set_config('cocopuff.stmt', statement_timestamp()::text, true);
  PERFORM set_config('cocopuff.ref', COALESCE((NEW.id)::text, ''), true);
  IF NEW.status = 'voided' AND (OLD.status IS NULL OR OLD.status != 'voided') THEN

    -- 1. Rollback qty stok (gudang / toko)
    IF NEW.store_id LIKE '%gudang%' THEN
      UPDATE warehouse_stock ws
      SET qty_on_hand = GREATEST(0, ws.qty_on_hand - pi.qty)
      FROM purchase_items pi
      WHERE pi.purchase_id = NEW.id
      AND ws.material_id = pi.material_id;
    ELSE
      UPDATE stock s
      SET qty_on_hand = GREATEST(0, s.qty_on_hand - pi.qty)
      FROM purchase_items pi
      WHERE pi.purchase_id = NEW.id
      AND s.store_id = NEW.store_id
      AND (s.material_id = pi.material_id OR s.ingredient_id = pi.material_id);
    END IF;

    -- 2. Reverse kontribusi avg_cost di materials (simetris create)
    UPDATE materials m
    SET total_qty_purchased  = GREATEST(0, COALESCE(m.total_qty_purchased, 0)  - agg.q),
        total_cost_purchased = GREATEST(0, COALESCE(m.total_cost_purchased, 0) - agg.c),
        unit_cost = CASE WHEN (COALESCE(m.total_qty_purchased, 0) - agg.q) > 0
                         THEN (COALESCE(m.total_cost_purchased, 0) - agg.c)
                              / (COALESCE(m.total_qty_purchased, 0) - agg.q)
                         ELSE m.unit_cost END,
        avg_cost  = CASE WHEN (COALESCE(m.total_qty_purchased, 0) - agg.q) > 0
                         THEN (COALESCE(m.total_cost_purchased, 0) - agg.c)
                              / (COALESCE(m.total_qty_purchased, 0) - agg.q)
                         ELSE m.avg_cost END
    FROM (
      SELECT material_id, SUM(qty) AS q, SUM(qty * unit_cost) AS c
      FROM purchase_items
      WHERE purchase_id = NEW.id
      GROUP BY material_id
    ) agg
    WHERE m.id = agg.material_id;

  END IF;
  RETURN NEW;
END;
$function$
;
