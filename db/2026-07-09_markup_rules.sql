-- Markup mutasi: kolom aturan markup di app_settings (single row id='default').
-- Dipakai UnifiedMutasiPage (getMarkupPercent) & AppSettingsPage (editor owner).
-- Jalankan di Supabase SQL editor SETELAH billing/quota pulih.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS markup_rules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Set default: gudang/produksi -> franchise (to_partner) +15%.
UPDATE app_settings
SET markup_rules = '[{"mutation_type":"to_partner","percent":15,"enabled":true}]'::jsonb
WHERE id = 'default'
  AND (markup_rules IS NULL OR markup_rules = '[]'::jsonb);
