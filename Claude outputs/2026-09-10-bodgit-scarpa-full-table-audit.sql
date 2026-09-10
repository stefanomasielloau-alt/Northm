-- 2026-09-10: Bodgit&Scarpa -- full audit across item 68 v1/v2's original bypass table list
--
-- CONTEXT: 10 tables have now been confirmed corrupted and repaired (regions, cost_buckets,
-- pods, programmes, campaigns, tasks, augur_deals, eventus_events, prospectus_filters, gates)
-- -- all of Bodgit&Scarpa's rows in those tables were silently reassigned to org_id
-- 6373bb04-fc25-4a72-b43b-ccd8bb110cda ("RLS Test Org") during a Super Admin cross-org
-- read/save cycle while item 68's early migration (v1/v2) briefly gave Super Admins an
-- unfiltered cross-org RLS bypass. That bypass covered a much broader list of ~50 tables
-- (confirmed by reading Claude outputs/2026-09-10-super-admin-cross-org-rls-migration.sql
-- and -v2.sql directly), not just the 10 found so far -- those 10 were only found because
-- Stef happened to notice missing data in Cursus and Strategy specifically.
--
-- WHAT THIS DOES: 100% read-only. For every table in v1/v2's original bypass list that
-- ALSO has an org_id column, counts how many rows sit under Bodgit&Scarpa's real org_id
-- vs the RLS Test Org's org_id. Skips any table that doesn't exist yet in this Supabase
-- project (some are gated behind their own feature migrations) or has no org_id column,
-- rather than erroring out.
--
-- HOW TO READ THE RESULT: any row where rls_test_org_count > 0 is a candidate for the
-- same repair pattern used for the 10 tables already fixed -- share those rows back and
-- I'll build a scoped, id-specific repair the same way (never a bare org_id swap).
-- A table with bodgit_scarpa_count > 0 and rls_test_org_count = 0 is untouched/fine.

DO $$
DECLARE
  tbl text;
  has_org_id boolean;
  bg_count bigint;
  rls_count bigint;
  tables text[] := ARRAY[
    'activities','assets','asset_references','asset_transactions',
    'audit_log','audit_log_archive',
    'augur_scoring_factors','augur_tiers',
    'board_report_notes','board_report_snapshots',
    'campaign_execution_status','campaign_pod_allocations',
    'campaign_rollups',
    'crm_activities','crm_contacts',
    'eventus_checklist','eventus_cost_lines','eventus_event_venues','eventus_speakers',
    'feedback_items',
    'llm_providers',
    'org_brand_settings','org_settings','org_unit_access','org_units',
    'partners',
    'prospectus_leads','prospectus_references','prospectus_reports',
    'routes',
    'segments','snapshots','streams',
    'task_campaign_links','teams','templates',
    'versions',
    'agent_destinations','agent_dispatches',
    'schema_automations','schema_workflows'
    -- deliberately excluded here: regions, cost_buckets, pods, programmes, campaigns, tasks,
    -- augur_deals, eventus_events, prospectus_filters, gates -- already confirmed + repaired.
    -- also excluded: campaign_partner_allocations (junction table, no direct org_id of its own
    -- in this schema -- would need a join to be meaningful; check separately if needed).
  ];
BEGIN
  DROP TABLE IF EXISTS _bg_audit_result;
  CREATE TEMP TABLE _bg_audit_result (table_name text, bodgit_scarpa_count bigint, rls_test_org_count bigint, note text);

  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=tbl
    ) THEN
      INSERT INTO _bg_audit_result VALUES (tbl, NULL, NULL, 'table does not exist yet');
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tbl AND column_name='org_id'
    ) INTO has_org_id;

    IF NOT has_org_id THEN
      INSERT INTO _bg_audit_result VALUES (tbl, NULL, NULL, 'no org_id column');
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FILTER (WHERE org_id = %L), count(*) FILTER (WHERE org_id = %L) FROM public.%I',
      '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', '6373bb04-fc25-4a72-b43b-ccd8bb110cda', tbl
    ) INTO bg_count, rls_count;

    INSERT INTO _bg_audit_result VALUES (tbl, bg_count, rls_count, CASE WHEN rls_count > 0 THEN 'CHECK THIS ONE' ELSE '' END);
  END LOOP;
END $$;

SELECT * FROM _bg_audit_result ORDER BY (rls_test_org_count > 0) DESC NULLS LAST, table_name;
