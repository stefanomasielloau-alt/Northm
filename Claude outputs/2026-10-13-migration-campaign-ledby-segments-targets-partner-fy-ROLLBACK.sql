-- ROLLBACK for 2026-10-13-migration-campaign-ledby-segments-targets-partner-fy.sql
-- Removes ONLY what that migration added. Any Led by / target / segment-split / per-FY partner
-- values entered since will be lost, so export first if any were entered:
--   SELECT id, name, led_by, target_leads, target_pipeline, actual_leads FROM campaigns;
--   SELECT * FROM campaign_segment_allocations;
--   SELECT id, name, acv_targets_by_fy FROM partners;
-- campaigns.segment_id and partners.acv_target were never changed, so they are as before.
-- audit_log.who / role are NOT dropped (Strategy used them before this migration).
-- Push the archived HTML files back first (archive/2026-10-13-pre-campaign-admin-partners-audit-*.html),
-- or the app shows the "run the migration" banner again (it keeps working).
BEGIN;
DROP TABLE IF EXISTS public.campaign_segment_allocations;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS led_by;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS target_leads;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS target_pipeline;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS actual_leads;
ALTER TABLE public.org_settings DROP COLUMN IF EXISTS led_by_presets;
ALTER TABLE public.partners DROP COLUMN IF EXISTS acv_targets_by_fy;
COMMIT;
NOTIFY pgrst, 'reload schema';
