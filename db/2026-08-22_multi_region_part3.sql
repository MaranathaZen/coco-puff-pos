-- Fase 3b part 3 — region utk accounting_periods (tutup buku bulanan).
-- Tabel masih kosong -> aman. Mencegah periode Bali & Malang campur.
-- WAJIB jalan sebelum deploy (wrapper memfilter .in('region') tabel ini).

DROP TABLE IF EXISTS _mig3;
CREATE TEMP TABLE _mig3 (item text, status text);
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'malang';
    INSERT INTO _mig3 VALUES ('region.accounting_periods','OK');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _mig3 VALUES ('region.accounting_periods','GAGAL: '||SQLERRM); END;
END $$;
SELECT * FROM _mig3;
