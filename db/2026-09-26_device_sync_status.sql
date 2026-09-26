-- ============================================================================
-- 2026-09-26  Status sync per perangkat (HP/PC kasir) dilaporkan ke server
--
-- Close order Mitra 22 & 25 Sep tertahan di perangkat kasir dan dari server
-- tidak ada cara melihat: berapa data belum terkirim, sejak kapan, error apa.
-- Tiap perangkat meng-upsert 1 baris miliknya (tiap 1 mnt kalau ada antrian,
-- tiap 10 mnt kalau kosong). Idempoten.
-- ============================================================================
CREATE TABLE IF NOT EXISTS device_sync_status (
  device_tag      text NOT NULL,          -- kode perangkat (akhiran no. struk, mis. TN0)
  store_id        text NOT NULL,
  user_id         text,
  username        text,
  pending         integer NOT NULL DEFAULT 0,   -- belum terkirim (pending + failed)
  oldest_pending  timestamptz,
  by_table        jsonb,                  -- {"close_order_reports": 1, "transactions": 3, ...}
  errors          jsonb,                  -- 5 error terakhir: [{table, record_id, op, retry, msg, at}]
  online          boolean,
  user_agent      text,
  last_seen       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_tag, store_id)
);
ALTER TABLE device_sync_status ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='device_sync_status' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON device_sync_status FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
