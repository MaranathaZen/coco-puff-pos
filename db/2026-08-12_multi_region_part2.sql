-- Fase 3b — Multi-region part 2: kolom region utk 2 tabel yang tadi terlewat.
-- cash_deposits (Accounting) & production_logs (Produksi) — sumber "data Malang nyangkut".
-- WAJIB dijalankan SEBELUM deploy wrapper region (supabase.ts memfilter .in('region') tabel ini).
-- Anti-gagal per-tabel (BEGIN/EXCEPTION), idempoten.

DROP TABLE IF EXISTS _mig2;
CREATE TEMP TABLE _mig2 (item text, status text);

DO $$
DECLARE t text; tables text[] := ARRAY['cash_deposits','production_logs'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT ''malang''', t);
      INSERT INTO _mig2 VALUES ('region.'||t, 'OK');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _mig2 VALUES ('region.'||t, 'GAGAL: '||SQLERRM);
    END;
  END LOOP;
END $$;

SELECT * FROM _mig2 ORDER BY item;
