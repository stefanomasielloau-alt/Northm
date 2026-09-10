-- Item 68 -- v7: drop the Super Admin cross-org RLS bypass on every remaining table
-- from v1/v2's original grant, 2026-09-10
--
-- *** SUPERSEDES the v6 file of the same name already delivered/run today. ***
-- v6 had the exact same bug documented in claude/running-log.md for the original v1
-- migration: 'campaign_rollups' is a VIEW in this project, not a base table, and
-- Postgres refuses DROP POLICY/CREATE POLICY against a view. v6's existence check only
-- confirmed the name existed in information_schema.tables (which lists views too), so
-- it reached campaign_rollups and errored -- and because the whole thing runs as one
-- DO $$ block, that error would have rolled back EVERY table's DROP POLICY in the same
-- run, not just campaign_rollups's. If v6 errored when you ran it, NONE of the ~42
-- tables actually had their bypass dropped, even though the run looked like it
-- "happened." Fixed here the same way v1 was fixed as v2: the existence check now also
-- requires table_type='BASE TABLE', so campaign_rollups (and anything else that turns
-- out to be a view) is skipped quietly with a RAISE NOTICE instead of aborting the run.
--
-- Run this file, not v6. The verification SELECT at the bottom tells you definitively
-- whether it's clean either way.
--
-- CONTEXT: today's Bodgit&Scarpa data-recovery investigation found that item 68's
-- original v1/v2 migration gave Super Admins an unfiltered cross-org read+write bypass
-- across ~50 tables. v3 rolled that back for audit_log; v4 rolled it back for the 6
-- other tables Cursus's own boot reads (programmes, campaigns, tasks, templates,
-- partners, campaign_partner_allocations) to fix a query-planner timeout. Every other
-- table was left with the bypass still active -- and it's now confirmed that a Super
-- Admin cross-org session earlier today silently reassigned Bodgit&Scarpa's real data
-- in 31 different tables to a leftover test org, exploiting exactly that still-open
-- bypass. All 31 have been found and repaired (see
-- Claude outputs/2026-09-10-bodgit-scarpa-recover-reassigned-seed-rows.sql and
-- Claude outputs/2026-09-10-bodgit-scarpa-full-table-audit.sql).
--
-- The app-level bug that exploited this (upsertRows() blindly stamping the viewer's own
-- org_id onto every row on save) is now fixed in the 7 modules that have item 68's "view
-- as" toolbar wired in (Cursus, Custodia, Schema, Prospectus, Eventus, Augur, Ordo) --
-- shared/superAdminView.js's stampOrgId() always prefers a row's own recorded org id,
-- and cross-org viewing defaults to read-only until editing is explicitly enabled.
--
-- But that is an APPLICATION-level fix. The DATABASE itself still grants the bypass
-- permission on every table below -- meaning any other code path (direct SQL, a future
-- bug, a module that hasn't been wired in, Norma.html's own separate mechanism) could
-- still exploit it the same way. This migration closes that at the source, the same
-- proven, low-risk way v4 already did for Cursus's tables: just drops the bypass POLICY,
-- doesn't touch any data.
--
-- TRADE-OFF, please read (same shape as v4's): for the 6 modules wired in today
-- (Custodia, Schema, Prospectus, Eventus, Augur, Ordo) plus gates (Ordo), selecting
-- "All organizations" or a specific other org in the Super Admin bar will STOP actually
-- returning that other org's data -- the database will keep returning your own org's
-- rows regardless of what's selected, exactly like Cursus before v5's RPC fix. Cursus
-- itself is unaffected (its bypass was already dropped by v4; it already uses the v5
-- RPCs for audit_log). "My organization" (the default, and what everyone uses almost all
-- the time) is completely unaffected everywhere. Nothing here touches any data.
--
-- To fully restore cross-org viewing for those 6 modules without reopening this hole,
-- each would need its own SECURITY DEFINER RPC (same pattern as v5's
-- admin_cross_org_audit_log and admin_cross_org_<table> for Cursus/Reportus) -- a real
-- but separate follow-up task, not done here. Recommend treating that as backlog, scoped
-- to whichever modules Stef actually wants cross-org viewing to work on, rather than
-- building ~40 RPCs speculatively.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'activities','assets','asset_references','asset_transactions',
    'audit_log_archive',
    'augur_deals','augur_scoring_factors','augur_tiers',
    'board_report_notes','board_report_snapshots',
    'campaign_execution_status','campaign_pod_allocations',
    'campaign_rollups',
    'cost_buckets',
    'crm_activities','crm_contacts',
    'eventus_checklist','eventus_cost_lines','eventus_event_venues','eventus_events','eventus_speakers',
    'feedback_items',
    'gates',
    'llm_providers',
    'org_brand_settings','org_settings','org_unit_access','org_units',
    'prospectus_filters','prospectus_leads','prospectus_references','prospectus_reports',
    'routes',
    'segments','snapshots','streams',
    'task_campaign_links','teams','versions',
    'agent_destinations','agent_dispatches',
    'schema_automations','schema_workflows'
    -- NOT included -- already rolled back by v3/v4: audit_log, programmes, campaigns,
    -- tasks, templates, partners, campaign_partner_allocations.
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip quietly if this table doesn't exist yet in this Supabase project (some of the
    -- above are gated behind their own feature migrations), same defensive shape v1/v2/v4
    -- already used.
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl AND table_type='BASE TABLE') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_super_admin_all', tbl);
      RAISE NOTICE 'Dropped (if it existed): %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table does not exist yet): %', tbl;
    END IF;
  END LOOP;
END $$;

-- Verification -- should return ONLY policies for tables NOT in the list above, i.e.
-- nothing should show up here at all once this runs (v3/v4 already dropped the other 7):
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE policyname LIKE '%_super_admin_all'
ORDER BY tablename;
