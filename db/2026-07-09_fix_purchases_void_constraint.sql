-- Fix "void pembelian tidak bisa".
-- Root cause: check constraint purchases_status_check tak izinkan 'voided'
--   -> UPDATE status='voided' balik 400 Bad Request (bukan bug klien/RLS).
-- voided_at & voided_by column sudah ada. Cuma constraint yang kurang 'voided'.

ALTER TABLE purchases DROP CONSTRAINT purchases_status_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
  CHECK (status IN ('received', 'partial', 'returned', 'voided'));

-- Verify: harus memuat 'voided'.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'purchases_status_check';
