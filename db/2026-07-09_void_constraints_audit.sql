-- Audit constraint status semua tabel void-able (2026-07-09).
-- Hasil: transactions/purchases/warehouse_mutations sudah punya 'voided'.
-- production_logs tak ada constraint status (aman).
-- GAP: production_mutations kurang 'voided' -> void bakal 400 (seperti purchases).
-- Fix name-agnostic:

DO $$
DECLARE cn text;
BEGIN
  SELECT conname INTO cn FROM pg_constraint
  WHERE conrelid = 'production_mutations'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%' LIMIT 1;
  IF cn IS NOT NULL THEN
    EXECUTE format('ALTER TABLE production_mutations DROP CONSTRAINT %I', cn);
  END IF;
  ALTER TABLE production_mutations
    ADD CONSTRAINT production_mutations_status_check
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'voided'));
END $$;

-- Verify: harus memuat 'voided'.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='production_mutations'::regclass AND contype='c'
--   AND pg_get_constraintdef(oid) ILIKE '%status%';
