-- Rollback of 2026-10-16-migration-deal-campaign-touches.sql. Removes the multi-touch rows (influenced campaigns and
-- weights) -- export them first if you may want them back. Deals keep their own campaign link.
DROP TABLE IF EXISTS public.deal_campaign_touches;
ALTER TABLE public.org_settings DROP CONSTRAINT IF EXISTS org_settings_attribution_model_chk;
ALTER TABLE public.org_settings DROP COLUMN IF EXISTS attribution_model;
NOTIFY pgrst, 'reload schema';
