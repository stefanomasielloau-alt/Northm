-- ROLLBACK for 2026-10-14-migration-advanced-reports-and-map-views.sql
-- Removes: saved map views (ALL saved views are lost), the advanced-report guard, entitlement functions,
-- the creators setting and the Licensing add-on columns. Saved reports themselves are kept; any chart-library
-- elements stored inside their definitions are simply ignored by the older app version.
BEGIN;
DROP TABLE IF EXISTS public.relationship_views;
DROP FUNCTION IF EXISTS public.relationship_views_guard();
DROP TRIGGER IF EXISTS saved_reports_advanced_guard_trg ON public.saved_reports;
DROP FUNCTION IF EXISTS public.saved_reports_advanced_guard();
DROP FUNCTION IF EXISTS public.advanced_reports_can_create();
DROP FUNCTION IF EXISTS public.advanced_reports_enabled();
ALTER TABLE public.org_settings DROP COLUMN IF EXISTS advanced_reports_creators;
ALTER TABLE public.org_plans DROP COLUMN IF EXISTS advanced_reports_price;
ALTER TABLE public.org_plans DROP COLUMN IF EXISTS advanced_reports_addon;
COMMIT;
NOTIFY pgrst, 'reload schema';
