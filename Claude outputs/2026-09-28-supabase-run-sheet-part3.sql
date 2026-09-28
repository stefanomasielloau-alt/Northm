-- =====================================================================================
-- 2026-09-28 -- NORTH SUPABASE RUN SHEET, PART 3 (project rcmocuubeajnqjltuwdv -- NORTH)
-- L2/L3 client-group tiers, widget settings column, and the Tac-Tik orphaned-roles cleanup.
-- Run AFTER parts 1 and 2. Each step separately; check EXPECT. Prepared by Claude, NOT run by Claude.
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 1 -- L2 / L3 CLIENT-GROUP TIERS
-- Adds the grants table, 3 helper functions and, on each business table, two extra
-- row-level-security policies that ONLY apply to people holding a grant:
--   <table>_client_read  : L2 and L3 can read rows of orgs in their client group
--   <table>_client_write : L2 can add/edit/remove rows of orgs in their client group
-- Nobody without a grant is affected (the helper returns an empty list for them).
-- Client group = the granted org + every org beneath it via organizations.parent_org_id.
-- EXPECT: last query shows client_policies > 0 and functions = 3.
-- ─────────────────────────────────────────────────────────────────────────────────────
BEGIN;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS parent_org_id uuid REFERENCES organizations(id);

CREATE TABLE IF NOT EXISTS public.client_admin_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  root_org_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  level        text NOT NULL CHECK (level IN ('L2','L3')),
  granted_by   uuid,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, root_org_id)
);
ALTER TABLE public.client_admin_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_admin_grants_platform_admin ON public.client_admin_grants;
CREATE POLICY client_admin_grants_platform_admin ON public.client_admin_grants
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
REVOKE ALL ON public.client_admin_grants FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_admin_grants TO authenticated, service_role;

-- orgs in the caller's client group(s); p_min 'L3' = any grant, 'L2' = edit grants only
CREATE OR REPLACE FUNCTION public.client_admin_org_ids(p_min text DEFAULT 'L3')
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE g AS (
    SELECT root_org_id AS id FROM client_admin_grants
     WHERE profile_id = auth.uid() AND (p_min = 'L3' OR level = 'L2')
    UNION
    SELECT o.id FROM organizations o JOIN g ON o.parent_org_id = g.id
  )
  SELECT coalesce(array_agg(id), '{}'::uuid[]) FROM g
$$;
CREATE OR REPLACE FUNCTION public.client_admin_level()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN bool_or(level='L2') THEN 'L2' WHEN count(*)>0 THEN 'L3' END
    FROM client_admin_grants WHERE profile_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.client_admin_org_list()
RETURNS TABLE(id uuid, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name FROM organizations o WHERE o.id = ANY(client_admin_org_ids('L3')) ORDER BY o.name
$$;
REVOKE ALL ON FUNCTION public.client_admin_org_ids(text), public.client_admin_level(), public.client_admin_org_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.client_admin_org_ids(text), public.client_admin_level(), public.client_admin_org_list() TO authenticated;

DO $$
DECLARE
  t text;
  rw text[] := ARRAY['activities','assets','asset_references','asset_transactions','augur_deals','augur_scoring_factors','augur_tiers',
    'board_report_notes','board_report_snapshots','campaign_execution_status','campaign_pod_allocations','campaign_partner_allocations',
    'campaigns','cost_buckets','crm_activities','crm_contacts','custom_widgets','eventus_checklist','eventus_cost_lines','eventus_event_venues',
    'eventus_events','eventus_speakers','gates','partners','pod_gate_rates','pod_streams','pods','programmes','prospectus_filters',
    'prospectus_leads','prospectus_references','prospectus_reports','region_gate_rates','region_streams','regions','reps','routes',
    'schema_automations','schema_workflows','segments','snapshots','streams','task_campaign_links','tasks','teams','templates','versions'];
  ro text[] := ARRAY['audit_log','profiles','roles','org_settings'];
BEGIN
  FOREACH t IN ARRAY rw || ro LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c JOIN information_schema.tables tb
                 ON tb.table_schema=c.table_schema AND tb.table_name=c.table_name AND tb.table_type='BASE TABLE'
               WHERE c.table_schema='public' AND c.table_name=t AND c.column_name='org_id') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_client_read', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.client_admin_org_ids(''L3'')) @> ARRAY[org_id])', t||'_client_read', t);
      IF t = ANY(rw) THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_client_write', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT public.client_admin_org_ids(''L2'')) @> ARRAY[org_id]) WITH CHECK ((SELECT public.client_admin_org_ids(''L2'')) @> ARRAY[org_id])', t||'_client_write', t);
      END IF;
      RAISE NOTICE 'client policies on %', t;
    ELSE
      RAISE NOTICE 'skipped (no such table with org_id): %', t;
    END IF;
  END LOOP;
END $$;
COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_client\_read' OR policyname LIKE '%\_client\_write') AS client_policies,
       (SELECT count(*) FROM pg_proc WHERE proname IN ('client_admin_org_ids','client_admin_level','client_admin_org_list')) AS functions;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 2 -- WIDGET SETTINGS (custom_widgets.config): Google Sheet range + Live API refresh
-- EXPECT: 1
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE custom_widgets ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;
NOTIFY pgrst, 'reload schema';
SELECT count(*) AS col_expect_1 FROM information_schema.columns WHERE table_schema='public' AND table_name='custom_widgets' AND column_name='config';


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 3 -- ROLES & USERS CLEANUP, STEP 2 (the 2 orphaned Tac-Tik roles you confirmed on 3 Sep)
-- Only the Manager (3f5058c3…) and Planner (3b3a7805…) roles, and only if STILL unused by any
-- person or invite. Archived first; aborts if more than those 2 would be touched.
-- EXPECT: preview lists at most 2 rows; after running, archived = removed, remaining = 0.
-- ─────────────────────────────────────────────────────────────────────────────────────
-- 3a. PREVIEW (read-only)
SELECT r.id, r.name FROM roles r
 WHERE r.org_id = (SELECT id FROM organizations WHERE name = 'Tac-Tik')
   AND (r.id::text LIKE '3f5058c3%' OR r.id::text LIKE '3b3a7805%')
   AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM org_invites i WHERE i.role_id = r.id);

-- 3b. ARCHIVE + REMOVE
BEGIN;
CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS archive."2026_09_28_tactik_orphaned_roles" AS SELECT *, now() AS archived_at FROM roles WHERE false;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM roles r
   WHERE r.org_id = (SELECT id FROM organizations WHERE name = 'Tac-Tik')
     AND (r.id::text LIKE '3f5058c3%' OR r.id::text LIKE '3b3a7805%')
     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM org_invites i WHERE i.role_id = r.id);
  IF n > 2 THEN RAISE EXCEPTION 'ABORTED: % roles matched (expected at most 2) -- nothing removed.', n; END IF;
END $$;
INSERT INTO archive."2026_09_28_tactik_orphaned_roles"
  SELECT r.*, now() FROM roles r
   WHERE r.org_id = (SELECT id FROM organizations WHERE name = 'Tac-Tik')
     AND (r.id::text LIKE '3f5058c3%' OR r.id::text LIKE '3b3a7805%')
     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM org_invites i WHERE i.role_id = r.id);
DELETE FROM roles r USING archive."2026_09_28_tactik_orphaned_roles" a WHERE r.id = a.id;
COMMIT;
SELECT (SELECT count(*) FROM archive."2026_09_28_tactik_orphaned_roles") AS archived,
       (SELECT count(*) FROM roles WHERE id::text LIKE '3f5058c3%' OR id::text LIKE '3b3a7805%') AS remaining;
