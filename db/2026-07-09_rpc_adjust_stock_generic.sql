-- K1 Fase 1b: RPC generic untuk update stok atomic (delta) di server.
-- Dipakai push worker sync (operation 'rpc_delta') supaya update qty tak
-- last-write-wins antar-device. Whitelist tabel (hindari SQL injection).
-- JALANKAN INI DULU sebelum deploy kode (kalau kode duluan, rpc_delta error->retry).

CREATE OR REPLACE FUNCTION public.adjust_stock_generic(
  p_table text, p_id text, p_delta numeric
) RETURNS numeric
LANGUAGE plpgsql
AS $function$
DECLARE new_qty numeric;
BEGIN
  IF p_table NOT IN ('stock','production_stock','warehouse_stock','finished_goods_stock') THEN
    RAISE EXCEPTION 'tabel tak diizinkan: %', p_table;
  END IF;
  EXECUTE format(
    'UPDATE %I SET qty_on_hand = GREATEST(0, qty_on_hand + $1), last_updated = now()
     WHERE id = $2 RETURNING qty_on_hand', p_table)
  INTO new_qty USING p_delta, p_id;
  RETURN new_qty;  -- NULL kalau id tak ada -> klien retry
END $function$;

-- Test:
-- SELECT adjust_stock_generic('production_stock', '<id>', -5);
