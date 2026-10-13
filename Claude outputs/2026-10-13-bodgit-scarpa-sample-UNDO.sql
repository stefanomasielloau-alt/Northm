-- UNDO for 2026-10-13-bodgit-scarpa-sample-targets-ledby-agreements.sql (Bodgit&Scarpa only).
-- Puts every touched field back exactly as it was before the sample script ran, then drops the backup.
BEGIN;
UPDATE public.campaigns c SET led_by = b.data->>'led_by',
       target_leads = (b.data->>'target_leads')::numeric, target_pipeline = (b.data->>'target_pipeline')::numeric,
       actual_leads = (b.data->>'actual_leads')::numeric
  FROM public._sample_backup_20261013 b WHERE b.kind='campaign' AND b.row_id=c.id;
UPDATE public.partners p SET contact_terms = b.data->'contact_terms',
       acv_targets_by_fy = CASE WHEN jsonb_typeof(b.data->'acv_targets_by_fy')='null' THEN NULL ELSE b.data->'acv_targets_by_fy' END,
       acv_target = (b.data->>'acv_target')::numeric
  FROM public._sample_backup_20261013 b WHERE b.kind='partner' AND b.row_id=p.id;
UPDATE public.augur_deals d SET campaign_id = (b.data->>'campaign_id')::uuid
  FROM public._sample_backup_20261013 b WHERE b.kind='deal' AND b.row_id=d.id;
DROP TABLE public._sample_backup_20261013;
COMMIT;
