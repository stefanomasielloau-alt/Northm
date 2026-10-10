-- ROLLBACK for 2026-10-10-migration-saved-reports.sql
-- This REMOVES the saved_reports table and every report people saved in it. If anyone has saved reports you want to keep,
-- back them up first (run this on its own, copy the result):
--   select id, org_id, owner_name, name, description, visibility, definition, created_at from public.saved_reports order by created_at;
-- The Reporting page copes with the table being missing (it shows "Saved reports need a one-time database setup").

BEGIN;
DROP TABLE IF EXISTS public.saved_reports CASCADE;            -- takes its policies, indexes and trigger with it
DROP FUNCTION IF EXISTS public.saved_reports_guard();
DROP FUNCTION IF EXISTS public.saved_reports_can_publish();
DROP FUNCTION IF EXISTS public.saved_reports_can_moderate();
COMMIT;
NOTIFY pgrst, 'reload schema';
