-- 2026-10-08 -- ROLLBACK for 2026-10-08-migration-connectors.sql
-- WARNING: drops every organisation's saved connector credentials AND stored connections. Admins would have to re-enter
-- credentials and sign in again. Then also delete the "connectors" Edge Function in the Supabase dashboard.
BEGIN;
DROP TABLE IF EXISTS public.connector_tokens;
DROP TABLE IF EXISTS public.connector_app_secrets;
DROP TABLE IF EXISTS public.connector_apps;
COMMIT;
NOTIFY pgrst, 'reload schema';
