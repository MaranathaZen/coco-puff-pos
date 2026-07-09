-- Void pembelian: selain rollback qty_on_hand, balikin juga avg_cost material.
-- Create pembelian nambah materials.total_qty_purchased/total_cost_purchased lalu
-- avg_cost = total_cost/total_qty. Void harus kurangi kontribusi purchase itu
-- (simetris) supaya avg_cost & unit_cost benar.
-- Aggregate per material_id (satu purchase bisa banyak item material sama).

CREATE OR REPLACE FUNCTION public.rollback_purchase_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
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

    -- 2. Reverse kontribusi avg_cost di materials (simetris dengan create)
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
$function$;
