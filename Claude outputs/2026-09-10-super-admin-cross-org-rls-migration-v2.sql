-- Item 68 -- Super Admin cross-org "view as" -- RLS migration, 2026-09-10
--
-- Context: Stef, live testing -- "AS Super Admin regardless of Module i should be able
-- to view data as ALL or as a selected organisation .. shouldnt I?", then clarified:
-- "be that level zero or level one. I should be able to see everything ... across all
-- organizations, all users. But, equally, I should have a drop down that allows me to
-- select the organization and potentially even select the user within that organization
-- ... we need to be able to fully edit ... but when first converting or selecting it
-- should be read only -- a conscious decision by the super admin to open up to editing."
--
-- WHAT THIS DOES: adds one new, purely ADDITIVE permissive RLS policy to every
-- operational (campaign/contact/deal/asset/event/task/automation-type) table across
-- North's 8 modules, granting full read+write to a genuine Super Admin (platform_admin_
-- level() L0 or L1 -- both tiers, per Stef's "level zero or level one" instruction).
--
-- WHY THIS IS SAFE TO RUN: Postgres combines multiple PERMISSIVE policies for the same
-- command with OR. This migration never touches, replaces, or even reads any existing
-- policy on these tables -- it only ADDS a new one. For every existing user and every
-- existing policy, nothing changes: their own policies still apply exactly as before.
-- The only new thing this makes possible is a Super Admin (L0/L1) additionally being
-- allowed through, on top of whatever access they already had. It cannot narrow access
-- for anyone, and it cannot be bypassed by a non-Super-Admin.
--
-- WHAT THIS DOES NOT DO: it does not touch org_plans / org_plan_invoices (licensing and
-- billing config) -- item 38 deliberately keeps those L0-only ("will gate the Licensing
-- admin panel ... L1 shouldn't get"), so this migration leaves them alone rather than
-- accidentally opening billing data to L1. It also does not touch the tables that
-- Norma.html's own cross-org admin views already query successfully today without any
-- org filter at all (organizations, regions, pods, reps, roles, profiles, org_invites,
-- profile_orgs, business_units, org_relations) -- if those already return cross-org rows
-- for a Super Admin with a bare unfiltered SELECT, their RLS must already carry an
-- equivalent bypass, so adding a second one here would be redundant, not wrong, but is
-- skipped to keep this migration's diff minimal and easy to review.
--
-- WHAT THIS DOES NOT DECIDE FOR YOU: whether editing is actually exposed in North's UI
-- is a separate, client-side gate (shared/superAdminView.js -- read-only by default,
-- an explicit "Enable editing" click required every time the viewed org/user changes,
-- and "All organizations" mode is always read-only regardless, since a merged view has
-- no single correct org to attribute a write to). This migration only raises the DB-level
-- ceiling of what's POSSIBLE for a genuine Super Admin -- it does not turn editing on by
-- itself, and it has no effect at all on anyone who isn't platform_admin_level() L0/L1.
--
-- Safe to run any time; safe to re-run (each policy is dropped and recreated by name).
-- v2 (2026-09-10): v1 failed outright on campaign_rollups ("is not a table" -- it's a
-- view in this project, not a base table; RLS policies only attach to real tables) and,
-- because the whole thing runs as one DO block, that single error rolled back the
-- entire migration -- nothing from v1 was ever actually created. v2 only changes the
-- existence check to also require table_type='BASE TABLE', so a view is skipped
-- quietly (with a RAISE NOTICE) instead of erroring the whole run. No other tables in
-- the list have been checked against this project's real schema beyond that one
-- failure, so it's possible (not confirmed) that one or two more of the ~50 names below
-- turn out to be views too -- if so, this same fix skips them the same safe way and
-- the NOTICE output will say which.
-- Requires 2026-09-07-item38-platform-admin-l1-migration.sql to already be in place
-- (platform_admin_level() must exist) -- if it isn't, this migration's DO block will
-- fail loudly on the first table with "function platform_admin_level() does not exist"
-- rather than silently doing something wrong.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'activities','assets','asset_references','asset_transactions',
    'audit_log','audit_log_archive',
    'augur_deals','augur_scoring_factors','augur_tiers',
    'board_report_notes','board_report_snapshots',
    'campaign_execution_status','campaign_partner_allocations','campaign_pod_allocations',
    'campaign_rollups','campaigns',
    'cost_buckets',
    'crm_activities','crm_contacts',
    'eventus_checklist','eventus_cost_lines','eventus_event_venues','eventus_events','eventus_speakers',
    'feedback_items',
    'gates',
    'llm_providers',
    'org_brand_settings','org_settings','org_unit_access','org_units',
    'partners','programmes',
    'prospectus_filters','prospectus_leads','prospectus_references','prospectus_reports',
    'routes',
    'segments','snapshots','streams',
    'task_campaign_links','tasks','teams','templates',
    'versions',
    'agent_destinations','agent_dispatches',
    'schema_automations','schema_workflows'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip quietly if this name doesn't exist as a real TABLE in this Supabase project --
    -- either because it's not created yet (some of the above only exist once their own
    -- feature's migration has run), or because it turned out to be a VIEW, not a table
    -- (v1 of this migration hit exactly this on campaign_rollups: Postgres refuses
    -- "CREATE POLICY ... ON a_view" with "is not a table", which is a real, permanent
    -- fact about that name, not a missing-migration situation -- so it's skipped the
    -- same quiet way, not treated as an error).
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl AND table_type='BASE TABLE') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_super_admin_all', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (is_platform_admin() OR platform_admin_level() IS NOT NULL) WITH CHECK (is_platform_admin() OR platform_admin_level() IS NOT NULL)',
        tbl || '_super_admin_all', tbl
      );
      RAISE NOTICE 'Super Admin bypass policy added: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table does not exist yet): %', tbl;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- VERIFICATION -- run as yourself (a real Super Admin) in Supabase's SQL editor.
-- Lists every policy this migration created, so you can see exactly what was added:

SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE policyname LIKE '%_super_admin_all'
ORDER BY tablename;

-- ---------------------------------------------------------------------------
-- ROLLBACK -- if you ever want to remove this bypass entirely, run (adjust the table
-- list to match whatever the SELECT above actually returned on your project):
--
-- DO $$
-- DECLARE tbl text;
-- BEGIN
--   FOR tbl IN SELECT tablename FROM pg_policies WHERE policyname LIKE '%_super_admin_all' LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_super_admin_all', tbl);
--   END LOOP;
-- END $$;
