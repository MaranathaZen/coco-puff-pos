-- ============================================================================
-- 2026-09-24  Potong stok penjualan di SERVER (bukan di HP kasir)
--
-- Dulu: HP kasir menghitung BOM & mengirim delta stok -> bisa hilang/terlewat
-- (antrian abandoned, resep belum ter-sync di HP, bahan tak ketemu = dilewati senyap).
-- Sekarang: begitu transaction_items masuk server, trigger memotong stok sesuai
-- resep BOM toko. Void -> dikembalikan persis dari buku besar (tepat sekali).
--
-- Transisi aman: hanya transaksi ber-stock_mode='server' (app versi baru) yang
-- dipotong server. App versi lama (stock_mode NULL) tetap potong sendiri -> tak dobel.
-- Migrasi ini TIDAK mengubah perilaku apa pun sampai app baru mengirim stock_mode.
-- Idempoten: aman dijalankan ulang.
-- ============================================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stock_mode text;

-- Buku besar: 1 baris per (item transaksi, bahan) yang dipotong server
CREATE TABLE IF NOT EXISTS stock_ledger (
  id                  bigserial PRIMARY KEY,
  transaction_id      text NOT NULL,
  transaction_item_id text NOT NULL,
  store_id            text NOT NULL,
  stock_id            text NOT NULL,
  material_id         text NOT NULL,
  qty                 numeric NOT NULL,          -- jumlah yang BENAR-BENAR dipotong (stok tak bisa < 0)
  qty_required        numeric NOT NULL,          -- kebutuhan resep; > qty berarti stok tercatat kurang
  created_at          timestamptz NOT NULL DEFAULT now(),
  restored_at         timestamptz,               -- terisi saat dikembalikan (void)
  UNIQUE (transaction_item_id, material_id)
);
CREATE INDEX IF NOT EXISTS stock_ledger_tx_idx ON stock_ledger (transaction_id);

-- Masalah setup yang dulu dilewati senyap -> sekarang tercatat
CREATE TABLE IF NOT EXISTS stock_issues (
  id                  bigserial PRIMARY KEY,
  created_at          timestamptz NOT NULL DEFAULT now(),
  store_id            text,
  transaction_id      text,
  transaction_item_id text,
  product_id          text,
  product_name        text,
  material_id         text,
  issue               text NOT NULL,            -- 'no_recipe' | 'no_stock_row' | 'stock_short'
  qty_short           numeric                   -- stock_short: kebutuhan yang tak tertutup stok tercatat
);
ALTER TABLE stock_issues ADD COLUMN IF NOT EXISTS qty_short numeric;
CREATE INDEX IF NOT EXISTS stock_issues_store_idx ON stock_issues (store_id, created_at);

ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_issues ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock_ledger' AND policyname='read_all') THEN
    CREATE POLICY read_all ON stock_ledger FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock_issues' AND policyname='read_all') THEN
    CREATE POLICY read_all ON stock_issues FOR SELECT USING (true);
  END IF;
END $$;

-- ── Potong stok saat item transaksi masuk ─────────────────────────────────
CREATE OR REPLACE FUNCTION deduct_stock_for_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_deduct_stock_for_item ON transaction_items;
CREATE TRIGGER trg_deduct_stock_for_item AFTER INSERT ON transaction_items
  FOR EACH ROW EXECUTE FUNCTION deduct_stock_for_item();

-- ── Kembalikan stok saat transaksi di-void ────────────────────────────────
CREATE OR REPLACE FUNCTION restore_stock_on_void() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record;
BEGIN
  IF NEW.status = 'voided' AND OLD.status IS DISTINCT FROM 'voided' THEN
    FOR l IN UPDATE stock_ledger SET restored_at = now()
              WHERE transaction_id = NEW.id AND restored_at IS NULL
              RETURNING stock_id, qty
    LOOP
      UPDATE stock SET qty_on_hand = qty_on_hand + l.qty, last_updated = now() WHERE id = l.stock_id;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_void ON transactions;
CREATE TRIGGER trg_restore_stock_on_void AFTER UPDATE OF status ON transactions
  FOR EACH ROW EXECUTE FUNCTION restore_stock_on_void();
