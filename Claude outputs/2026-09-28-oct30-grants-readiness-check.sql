-- 2026-09-28 -- Supabase Oct 30 2026 grant change: North readiness check (READ-ONLY)
-- Project: North (rcmocuubeajnqjltuwdv). Run in the SQL Editor. Changes nothing.
--
-- Q1: Which of the 15 tables created by earlier "Claude outputs" migrations actually exist?
--     exists=false  -> migration NOT yet run -> needs the grant block added before it's run after Oct 30.
-- Q2: Audit: any public table the app can't reach (missing authenticated/service_role grants).
--     Should return 0 rows today. Re-run after any new migration from Oct 30 onwards.

-- Q1 ------------------------------------------------------------------
SELECT t.tbl,
       to_regclass('public.' || t.tbl) IS NOT NULL AS exists,
       CASE WHEN to_regclass('public.' || t.tbl) IS NULL THEN NULL
            ELSE has_table_privilege('authenticated', 'public.' || t.tbl, 'select') END AS auth_can_read,
       CASE WHEN to_regclass('public.' || t.tbl) IS NULL THEN NULL
            ELSE has_table_privilege('service_role', 'public.' || t.tbl, 'select') END AS service_can_read
FROM (VALUES
  ('board_report_notes'),('board_report_snapshots'),('task_campaign_links'),
  ('prospectus_references'),('org_plans'),('org_plan_invoices'),('platform_admin_grants'),
  ('org_brand_settings'),('campaign_execution_status'),('profile_orgs'),('archived_seed_rows'),
  ('audit_log_archive'),('region_gate_rates'),('region_streams'),('custom_widgets')
) AS t(tbl)
ORDER BY exists, tbl;

-- Q2 ------------------------------------------------------------------
SELECT c.relname AS table_missing_grants,
       has_table_privilege('authenticated', c.oid, 'select') AS auth_can_read,
       has_table_privilege('service_role',  c.oid, 'select') AS service_can_read,
       c.relrowsecurity AS rls_on
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND (NOT has_table_privilege('authenticated', c.oid, 'select')
       OR NOT has_table_privilege('service_role', c.oid, 'select'))
ORDER BY 1;
