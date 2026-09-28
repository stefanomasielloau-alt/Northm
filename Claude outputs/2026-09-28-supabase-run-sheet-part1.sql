-- =====================================================================================
-- 2026-09-28 -- NORTH SUPABASE RUN SHEET, PART 1 (project rcmocuubeajnqjltuwdv -- NORTH, not Hub-Control)
-- =====================================================================================
-- Run each STEP separately in the Supabase SQL Editor, top to bottom. Select the step's lines,
-- click Run, check the result matches "EXPECT", then move on. If anything doesn't match: STOP
-- and paste the result to Claude. Every step that removes rows first COPIES them into the
-- `archive` schema (not reachable from the app/API), and every delete is guarded -- if the data
-- has changed since it was checked on 23/24 Sep, the step aborts and nothing is removed.
-- Prepared by Claude, NOT run by Claude.
-- =====================================================================================


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 0 -- PRE-CHECK (read-only, changes nothing)
-- EXPECT: a table of 9 checks. Note the values; Step 6 re-runs the same checks.
-- ─────────────────────────────────────────────────────────────────────────────────────
SELECT 'super_admin_all policies still present' AS chk,
       (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_super\_admin\_all')::text AS val
UNION ALL SELECT 'duplicate Unassigned region 4c634bb2 present',
       (SELECT count(*) FROM regions WHERE id='4c634bb2-bb0d-4a70-a3ea-ef138bccf753')::text
UNION ALL SELECT 'duplicate activities present (of 3)',
       (SELECT count(*) FROM activities WHERE id IN ('2a4406de-6991-48a7-a01b-4caf733e212a','ddf10304-186d-4f0b-bca1-bace573b37e3','7522c91b-d463-4b8f-a9ae-199374e41b6d'))::text
UNION ALL SELECT 'duplicate routes present (of 3)',
       (SELECT count(*) FROM routes WHERE id IN ('fb4f23ad-52b0-445b-aa88-29249cd240f5','a5e86f35-8cbe-4009-b40d-9f121f4021af','102b26d8-a834-4b6f-8d03-64ae69fdb8d3'))::text
UNION ALL SELECT 'routes total (Tac-Tik)',     (SELECT count(*) FROM routes     WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda')::text
UNION ALL SELECT 'activities total (Tac-Tik)', (SELECT count(*) FROM activities WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda')::text
UNION ALL SELECT 'custom_widgets columns present (of 3: webhook_token, latest_payload, body)',
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='custom_widgets' AND column_name IN ('webhook_token','latest_payload','body'))::text
UNION ALL SELECT 'pods named New Caledonia / test flagged unassigned',
       (SELECT string_agg(name||' ('||org_id||')', '; ') FROM pods WHERE unassigned AND name IN ('New Caledonia','test'))
UNION ALL SELECT 'pods.archived column exists',
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pods' AND column_name='archived')::text;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 1 -- v7: CLOSE THE SUPER ADMIN CROSS-ORG BYPASS  (the most important one)
-- What it does: drops the "<table>_super_admin_all" RLS policy on ~42 tables. Touches NO data.
-- Trade-off you are accepting: in Assets, Process Maps, Targets, Events, Scoring and Strategy,
-- the Super Admin "view as another org / All orgs" bar will show only YOUR org's data until
-- per-module cross-org functions are built (Reporting already uses those functions and keeps
-- working; Campaign Planning was already switched). Normal users see no difference at all.
-- Also covers backlog item 73 (the 5 Reporting tables are in this list).
-- EXPECT: "Success. No rows returned" (the NOTICE lines list each table). If you get an ERROR,
--         nothing was applied -- paste it to Claude.
-- ─────────────────────────────────────────────────────────────────────────────────────
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

-- STEP 1 CHECK -- EXPECT: 0 rows.
SELECT tablename, policyname FROM pg_policies WHERE policyname LIKE '%\_super\_admin\_all' ORDER BY 1;
-- If this returns rows: they are tables not in v7's list. Paste the result to Claude -- do not
-- drop them by hand, some may be needed by Reporting's cross-org functions.


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 2 -- REMOVE THE DUPLICATE "Unassigned" REGION (Tac-Tik)
-- Keeps the real one (9375b5c7...). Archives the duplicate first. Aborts if anything now
-- references the duplicate.
-- EXPECT: "Success" and the check below shows archived=1, remaining=0 (or 0/0 if it was
--         already gone -- that's fine too).
-- ─────────────────────────────────────────────────────────────────────────────────────
BEGIN;
CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated;

DO $$
DECLARE dup text := '4c634bb2-bb0d-4a70-a3ea-ef138bccf753';
BEGIN
  IF EXISTS (SELECT 1 FROM pods WHERE region_id::text=dup)
  OR EXISTS (SELECT 1 FROM campaigns WHERE region_id::text=dup)
  OR EXISTS (SELECT 1 FROM profiles WHERE region_ids::text LIKE '%'||dup||'%') THEN
    RAISE EXCEPTION 'ABORTED: something references the duplicate region now -- nothing removed. Paste this to Claude.';
  END IF;
  IF to_regclass('public.region_gate_rates') IS NOT NULL AND EXISTS (SELECT 1 FROM region_gate_rates WHERE region_id::text=dup) THEN
    RAISE EXCEPTION 'ABORTED: region_gate_rates references the duplicate region -- nothing removed.';
  END IF;
  IF to_regclass('public.region_streams') IS NOT NULL AND EXISTS (SELECT 1 FROM region_streams WHERE region_id::text=dup) THEN
    RAISE EXCEPTION 'ABORTED: region_streams references the duplicate region -- nothing removed.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS archive."2026_09_28_regions_dedup" AS
  SELECT *, now() AS archived_at FROM regions WHERE false;
INSERT INTO archive."2026_09_28_regions_dedup"
  SELECT *, now() FROM regions
  WHERE id='4c634bb2-bb0d-4a70-a3ea-ef138bccf753' AND unassigned = true;

DELETE FROM regions
  WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id='4c634bb2-bb0d-4a70-a3ea-ef138bccf753'
    AND unassigned = true;
COMMIT;

SELECT (SELECT count(*) FROM archive."2026_09_28_regions_dedup") AS archived,
       (SELECT count(*) FROM regions WHERE id='4c634bb2-bb0d-4a70-a3ea-ef138bccf753') AS remaining,
       (SELECT count(*) FROM regions WHERE id='9375b5c7-0d6b-4497-a3f8-f693c345490e') AS real_unassigned_kept_expect_1;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 3 -- ACTIVITY + ROUTE DEDUP v2 (Tac-Tik) -- your 24 Sep answers applied
-- Removes 3 duplicate activities (Unassigned copy, Web/Organic orphan, BDM Self-gen winTarget-4)
-- then the 3 duplicate routes left empty. Archives all 6 first. Aborts if any campaign or any
-- other activity now points at them.
-- EXPECT: check shows activities_archived=3, routes_archived=3, routes_total=3, activities_total=9
--         (totals may differ by any activities/routes you've added since 24 Sep).
-- ─────────────────────────────────────────────────────────────────────────────────────
BEGIN;
CREATE SCHEMA IF NOT EXISTS archive;

DO $$
DECLARE
  acts text[] := ARRAY['2a4406de-6991-48a7-a01b-4caf733e212a','ddf10304-186d-4f0b-bca1-bace573b37e3','7522c91b-d463-4b8f-a9ae-199374e41b6d']::text[];
  rts  text[] := ARRAY['fb4f23ad-52b0-445b-aa88-29249cd240f5','a5e86f35-8cbe-4009-b40d-9f121f4021af','102b26d8-a834-4b6f-8d03-64ae69fdb8d3']::text[];
  a text;
BEGIN
  IF EXISTS (SELECT 1 FROM campaigns WHERE activity_id::text = ANY(acts)) THEN
    RAISE EXCEPTION 'ABORTED: a campaign points at one of the activities being removed -- nothing removed.';
  END IF;
  FOREACH a IN ARRAY acts LOOP
    IF EXISTS (SELECT 1 FROM activities WHERE id::text <> ALL(acts) AND pre_chain::text LIKE '%'||a||'%') THEN
      RAISE EXCEPTION 'ABORTED: another activity''s pre-chain references % -- nothing removed.', a;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM activities WHERE route_id::text = ANY(rts) AND id::text <> ALL(acts)) THEN
    RAISE EXCEPTION 'ABORTED: a kept activity still sits on one of the routes being removed -- nothing removed.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS archive."2026_09_28_activities_dedup" AS SELECT *, now() AS archived_at FROM activities WHERE false;
CREATE TABLE IF NOT EXISTS archive."2026_09_28_routes_dedup"     AS SELECT *, now() AS archived_at FROM routes     WHERE false;
INSERT INTO archive."2026_09_28_activities_dedup" SELECT *, now() FROM activities
  WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda' AND id IN ('2a4406de-6991-48a7-a01b-4caf733e212a','ddf10304-186d-4f0b-bca1-bace573b37e3','7522c91b-d463-4b8f-a9ae-199374e41b6d');
INSERT INTO archive."2026_09_28_routes_dedup" SELECT *, now() FROM routes
  WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda' AND id IN ('fb4f23ad-52b0-445b-aa88-29249cd240f5','a5e86f35-8cbe-4009-b40d-9f121f4021af','102b26d8-a834-4b6f-8d03-64ae69fdb8d3');

DELETE FROM activities WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda'
  AND id IN ('2a4406de-6991-48a7-a01b-4caf733e212a','ddf10304-186d-4f0b-bca1-bace573b37e3','7522c91b-d463-4b8f-a9ae-199374e41b6d');
DELETE FROM routes WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda'
  AND id IN ('fb4f23ad-52b0-445b-aa88-29249cd240f5','a5e86f35-8cbe-4009-b40d-9f121f4021af','102b26d8-a834-4b6f-8d03-64ae69fdb8d3');
COMMIT;

SELECT (SELECT count(*) FROM archive."2026_09_28_activities_dedup") AS activities_archived,
       (SELECT count(*) FROM archive."2026_09_28_routes_dedup")     AS routes_archived,
       (SELECT count(*) FROM routes     WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda') AS routes_total,
       (SELECT count(*) FROM activities WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda') AS activities_total,
       (SELECT string_agg(name, ', ' ORDER BY name) FROM routes WHERE org_id='6373bb04-fc25-4a72-b43b-ccd8bb110cda') AS routes_now;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 4 -- CUSTOM WIDGETS: the 2 missing columns (additive, safe, re-runnable)
-- Enables webhook widgets (webhook_token, latest_payload) and Note widget text (body).
-- EXPECT: check returns 3.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE custom_widgets ADD COLUMN IF NOT EXISTS webhook_token text;
ALTER TABLE custom_widgets ADD COLUMN IF NOT EXISTS latest_payload jsonb;
ALTER TABLE custom_widgets ADD COLUMN IF NOT EXISTS body text;
NOTIFY pgrst, 'reload schema';
SELECT count(*) AS cols_present_expect_3 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='custom_widgets' AND column_name IN ('webhook_token','latest_payload','body');


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 5 -- PODS: unhide "New Caledonia", soft-archive "test"
-- Adds pods.archived (additive). New Caledonia becomes a normal pod again. "test" is kept in
-- the database but hidden everywhere (the app update filters archived pods out). Nothing deleted.
-- Aborts if either name matches more than one pod, so the wrong pod can't be changed.
-- EXPECT: the check shows New Caledonia unassigned=false archived=false; test archived=true.
-- NOTE: New Caledonia will re-appear with whatever share % it had. Check the Geography pod
--       allocation still totals 100% for its region afterwards (the page flags it red if not).
-- ─────────────────────────────────────────────────────────────────────────────────────
BEGIN;
ALTER TABLE pods ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF (SELECT count(*) FROM pods WHERE name='New Caledonia' AND unassigned) > 1
  OR (SELECT count(*) FROM pods WHERE name='test' AND unassigned) > 1 THEN
    RAISE EXCEPTION 'ABORTED: more than one pod matches -- nothing changed. Paste Step 0 output to Claude.';
  END IF;
END $$;
UPDATE pods SET unassigned=false                 WHERE name='New Caledonia' AND unassigned;
UPDATE pods SET unassigned=false, archived=true  WHERE name='test' AND unassigned;
COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT name, org_id, region_id, share, unassigned, archived FROM pods WHERE name IN ('New Caledonia','test');


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 6 -- FINAL CHECK: re-run STEP 0 and paste the output to Claude.
-- EXPECT: policies 0; duplicate region 0; duplicate activities 0; duplicate routes 0;
--         custom_widgets columns 3; New Caledonia/test no longer listed; archived column 1.
-- ─────────────────────────────────────────────────────────────────────────────────────
