-- 2026-09-22 — Region dedup cascade cleanup (Tac-Tik, org_id 6373bb04-fc25-4a72-b43b-ccd8bb110cda)
--
-- Context: Stef authorized removing the 5 duplicate-name regions (ANZ, SEA, Japan, India,
-- RLS-Only Region) found in the Strategy module, confirming this is all sample/test data,
-- including the campaigns attached to them ("Duplicate regions need to go along with the
-- campaigns .. no issue its only sample data").
--
-- I already removed the 6 duplicate reps and 3 of the 5 duplicate pods via the app's own
-- UI-level functions (safe, went through the app's normal remove/commit flow, confirmed
-- persisted after a page reload). The remaining 5 regions and 2 pods (ANZ Central, ANZ
-- Enterprise) could not be removed — they're referenced by 12 real campaigns (region_id /
-- pod_id foreign keys), and those campaigns have their own dependents across several other
-- modules (Campaign Planning, Events, Scoring, Assets). All of it reads as sample/test data
-- (event named "TEst event", deal named "New deal2", generic "New task" rows, etc.).
--
-- I have direct read access to the app's Supabase client and could see all of this, but a
-- bulk multi-table delete was blocked by this environment's own safety controls (mass-delete
-- protection) — it will not let me run a cascade like this myself, authorized or not. So this
-- is delivered as a script for you to run directly in the Supabase SQL editor, per this
-- project's normal convention for actual data changes.
--
-- Every statement is scoped by org_id AND exact primary/foreign key so nothing outside this
-- exact set can be touched. Order matters (children before parents) to avoid FK violations —
-- run top to bottom, in one transaction so it's all-or-nothing.
--
-- Note: an earlier version of this script tried to DELETE FROM campaign_rollups and failed
-- with "cannot delete from view" -- that table turned out to be a computed GROUP BY view, not
-- a real table, so that step has been removed below (it resolves itself once the underlying
-- rows are gone). If any OTHER statement here throws the same "cannot delete from view" error,
-- that table is a view too -- skip just that one statement and continue; let me know which
-- table it was so I can update this file.
--
-- Full backup of everything being removed here is at:
--   claude/2026-09-22-region-dedup-pre-deletion-snapshot.json (regions/pods/reps)
--   claude/2026-09-22-region-dedup-execution-outcome.md (campaigns + budgets)
--   (this file documents the rest of the cascade inline via the comments above each block)

BEGIN;

-- 1. Event "TEst event" (id 34248e7b-...) and its children
DELETE FROM eventus_checklist
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND event_id = '34248e7b-c43c-4185-9c09-79148a33c61d';
  -- expect 2 rows: "New task", "New task2"

DELETE FROM eventus_cost_lines
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND event_id = '34248e7b-c43c-4185-9c09-79148a33c61d';
  -- expect 1 row (Venue cost line, $50/$50/$48)

DELETE FROM eventus_speakers
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND event_id = '34248e7b-c43c-4185-9c09-79148a33c61d';
  -- expect 2 rows ("Speaker one", "speaker two")

DELETE FROM eventus_events
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id = '34248e7b-c43c-4185-9c09-79148a33c61d';
  -- expect 1 row ("TEst event")

-- 2. Deal "New deal2" (id e1badc65-...) — tied to campaign 908a28ab-... via campaign_id
DELETE FROM augur_deals
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND campaign_id IN (
      '9ec2d662-f01f-48c4-84e3-c81a06e5d740','a5eece8c-f02d-4413-b795-8f0636226fa9',
      '6cc8dbe0-6775-48f7-98ed-83b2a1f342da','5ece316b-fb19-4622-8b7a-aa762363a8ab',
      '6225828f-0981-49f4-9656-72724533ed95','83f528b0-197b-4211-aaea-084855619a23',
      'c9933bb5-6abd-4914-9734-93b0d8f72409','dd2f81c7-0065-4e9d-a4c6-9f6e1d9bc107',
      'ec9fc602-3db7-4ebb-8c71-7324e849277d','80d58bbb-f6d3-41ba-b7b6-7349b0732b72',
      '908a28ab-fe73-43e4-b04f-640b1bc8c2a1','0fd165f3-fdaa-4514-b808-a95b910a1617'
    );
  -- expect 1 row ("New deal2")

-- 3. Asset check-in/check-out transactions tied to these campaigns
DELETE FROM asset_transactions
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND campaign_id IN (
      '9ec2d662-f01f-48c4-84e3-c81a06e5d740','a5eece8c-f02d-4413-b795-8f0636226fa9',
      '6cc8dbe0-6775-48f7-98ed-83b2a1f342da','5ece316b-fb19-4622-8b7a-aa762363a8ab',
      '6225828f-0981-49f4-9656-72724533ed95','83f528b0-197b-4211-aaea-084855619a23',
      'c9933bb5-6abd-4914-9734-93b0d8f72409','dd2f81c7-0065-4e9d-a4c6-9f6e1d9bc107',
      'ec9fc602-3db7-4ebb-8c71-7324e849277d','80d58bbb-f6d3-41ba-b7b6-7349b0732b72',
      '908a28ab-fe73-43e4-b04f-640b1bc8c2a1','0fd165f3-fdaa-4514-b808-a95b910a1617'
    );
  -- expect 2 rows (a check-in and a check-out on the same asset)

-- 4. Tasks/activities under these campaigns
DELETE FROM tasks
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND campaign_id IN (
      '9ec2d662-f01f-48c4-84e3-c81a06e5d740','a5eece8c-f02d-4413-b795-8f0636226fa9',
      '6cc8dbe0-6775-48f7-98ed-83b2a1f342da','5ece316b-fb19-4622-8b7a-aa762363a8ab',
      '6225828f-0981-49f4-9656-72724533ed95','83f528b0-197b-4211-aaea-084855619a23',
      'c9933bb5-6abd-4914-9734-93b0d8f72409','dd2f81c7-0065-4e9d-a4c6-9f6e1d9bc107',
      'ec9fc602-3db7-4ebb-8c71-7324e849277d','80d58bbb-f6d3-41ba-b7b6-7349b0732b72',
      '908a28ab-fe73-43e4-b04f-640b1bc8c2a1','0fd165f3-fdaa-4514-b808-a95b910a1617'
    );
  -- expect 14 rows

-- 5. campaign_rollups is NOT a base table -- it's a GROUP BY view (confirmed by the error
--    "cannot delete from view ... Views containing GROUP BY are not automatically updatable").
--    It's a computed rollup, almost certainly aggregated live from `tasks` (its
--    rollup_committed/rollup_actual values match tasks.committed_cost/actual_cost sums per
--    campaign). Nothing to delete here -- once the underlying tasks rows go (step 4, above)
--    and the campaigns go (step 7, below), this view simply stops returning rows for those
--    campaign_ids on its own. No action needed; step intentionally left out.

-- 6. Campaign-pod budget-split allocations against the (already-orphaned) duplicate pods
DELETE FROM campaign_pod_allocations
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND campaign_id IN (
      '9ec2d662-f01f-48c4-84e3-c81a06e5d740','a5eece8c-f02d-4413-b795-8f0636226fa9',
      '6cc8dbe0-6775-48f7-98ed-83b2a1f342da','5ece316b-fb19-4622-8b7a-aa762363a8ab',
      '6225828f-0981-49f4-9656-72724533ed95','83f528b0-197b-4211-aaea-084855619a23',
      'c9933bb5-6abd-4914-9734-93b0d8f72409','dd2f81c7-0065-4e9d-a4c6-9f6e1d9bc107',
      'ec9fc602-3db7-4ebb-8c71-7324e849277d','80d58bbb-f6d3-41ba-b7b6-7349b0732b72',
      '908a28ab-fe73-43e4-b04f-640b1bc8c2a1','0fd165f3-fdaa-4514-b808-a95b910a1617'
    );
  -- expect 2 rows (both against the RLS campaign, pointing at ANZ Central/Enterprise dup pods)

-- 7. The 12 campaigns themselves (Mining, Webinar series, India Growth Push, Planning
--    Benchmark Report, FY27 SG Enterprise Field Series, Compliance Campaign, SDR Outbound
--    Wave 3, SEA Webinar Track, Japan Key Account ABM, Partner Co-Sell Q3, "Campaign name",
--    RLS 481 CAMPAIGN — full list with budgets in claude/2026-09-22-region-dedup-execution-outcome.md)
DELETE FROM campaigns
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id IN (
      '9ec2d662-f01f-48c4-84e3-c81a06e5d740','a5eece8c-f02d-4413-b795-8f0636226fa9',
      '6cc8dbe0-6775-48f7-98ed-83b2a1f342da','5ece316b-fb19-4622-8b7a-aa762363a8ab',
      '6225828f-0981-49f4-9656-72724533ed95','83f528b0-197b-4211-aaea-084855619a23',
      'c9933bb5-6abd-4914-9734-93b0d8f72409','dd2f81c7-0065-4e9d-a4c6-9f6e1d9bc107',
      'ec9fc602-3db7-4ebb-8c71-7324e849277d','80d58bbb-f6d3-41ba-b7b6-7349b0732b72',
      '908a28ab-fe73-43e4-b04f-640b1bc8c2a1','0fd165f3-fdaa-4514-b808-a95b910a1617'
    );
  -- expect 12 rows

-- 8. The 2 remaining duplicate pods (ANZ Central, ANZ Enterprise) — now unblocked
DELETE FROM pods
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id IN ('e7d5af38-ed5b-4e3c-ae98-dea84c0ecff6','b0ea9378-74a7-4600-8e47-02f3345ffab1');
  -- expect 2 rows

-- 9. The 5 duplicate regions themselves — now unblocked
DELETE FROM regions
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id IN (
      '3d997daa-e351-45de-9748-a2b420b59092', -- ANZ (dup)
      '98ab8811-f6b7-4f7b-8702-4488a129d511', -- SEA (dup)
      'ce61206e-d3f3-4729-b68c-de819d3012f5', -- Japan (dup)
      '8c6d9281-fb10-415c-ad39-b4cf190cb256', -- India (dup)
      'b9c7b2f1-5938-49f6-b400-173457d92da1'  -- RLS-Only Region (dup)
    );
  -- expect 5 rows

COMMIT;

-- After running: reload North/Strategy and confirm region count drops from 12 to 7
-- (the 5 kept regions + the 2 "Unassigned" system regions), and that Campaign Planning
-- no longer lists the 12 removed campaigns.
