-- 2026-09-03: North test/demo data seed (new backlog item, added by Stef 2026-09-03 night)
-- FOR REVIEW ONLY -- NOT RUN. Per standing rule, nothing that writes data runs without your
-- explicit go-ahead. This file is prepared so you can review exactly what it would insert
-- before deciding whether to run it.
--
-- WHERE this seeds: org "Bodgit&Scarpa" (org_id 8eae1af2-8af8-4224-94c1-5ddf2ff237f2),
-- looked up by name rather than hardcoded, same "don't trust a stale id" lesson learned from
-- the Tac-Tik cleanup script's v1 error. Bodgit&Scarpa is North's existing, established test
-- org -- it already received a full Tac-Tik data clone on 2026-09-02 for exactly this kind of
-- testing (see running-log), Bruce/Claudia/DavidD test as users there, and none of it is real
-- client data. That makes it the safe, already-precedented target for more synthetic data --
-- I did not seed into "Beta Testing" or any other org, since those may carry real usage.
-- If you'd rather this land somewhere else, don't run this file -- say where and I'll rebuild it.
--
-- WHY: newly-built features have had little or no real data to exercise end-to-end --
-- multi-currency conversion (budget_fx), every Process Maps automation trigger type
-- (ready-to-execute, off-target, over-budget, asset low-stock, deal-stage, event-status,
-- task-overdue), and the Reporting/Board Report charts (want more than 1-2 data points to
-- look like a real dashboard). This seed is deliberately small and targeted -- one or two
-- rows per condition, not a bulk/volume load -- per the standing "chunk large jobs" rule.
-- Nothing here touches Tac-Tik or any other org.
--
-- MARKING: every row this script inserts is tagged so it can be found and removed later --
-- tracking_ref = 'demo-seed-2026-09-03' where that column exists, and every notes field
-- (including assets, which has no tracking_ref column) starts with '[DEMO SEED 2026-09-03]'.
-- To remove everything this script added later: DELETE FROM <table> WHERE tracking_ref =
-- 'demo-seed-2026-09-03' (campaigns/tasks/augur_deals/eventus_events), and DELETE FROM assets
-- WHERE notes LIKE '[DEMO SEED 2026-09-03]%' -- never done automatically, your call each time.
--
-- REQUIRES: pgcrypto's gen_random_uuid() for new ids -- standard on Supabase, but if this
-- errors with "function gen_random_uuid() does not exist", run
-- `CREATE EXTENSION IF NOT EXISTS pgcrypto;` first (harmless if already enabled).
--
-- NOT verified against live schema constraints (this session has no DB query access -- every
-- column name below was read directly from North's own app code, not guessed, but a NOT NULL
-- or CHECK constraint the app code doesn't happen to reveal could still reject a row). If this
-- errors, paste the exact Postgres error back and it'll get a v2 the same way the Tac-Tik
-- script did -- expect a possible round-trip, same as every other SQL file this session.

-- If a previous run of this file left a transaction open, this is a safe no-op:
ROLLBACK;

-- STEP 0 -- confirms the org resolves to exactly one id before anything else runs. If this
-- returns 0 or more than 1 row, stop and tell Claude.
SELECT id, name FROM organizations WHERE name = 'Bodgit&Scarpa';

-- STEP 1 -- everything below runs in one transaction so it can be rolled back in full if
-- anything looks wrong before COMMIT.
BEGIN;

DO $$
DECLARE
  v_org_id      uuid;
  v_owner_id    uuid;
  v_owner_name  text;
  v_owner_email text;
  v_camp_a      uuid := gen_random_uuid();  -- ready-to-execute trigger
  v_camp_b      uuid := gen_random_uuid();  -- off-target trigger
  v_camp_c      uuid := gen_random_uuid();  -- over-budget trigger
  v_camp_d      uuid := gen_random_uuid();  -- plain draft, AUD
  v_camp_e      uuid := gen_random_uuid();  -- multi-currency (USD), submitted
  v_camp_f      uuid := gen_random_uuid();  -- rejected, for variety
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Bodgit&Scarpa';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Bodgit&Scarpa org not found -- aborting, nothing inserted.';
  END IF;

  -- Pick any existing profile in this org as the campaign owner (for the "notify the
  -- manager" alert-target logic on ready_to_execute/off_target automations) -- doesn't
  -- invent a person, reuses whoever the 2026-09-02 clone already put here.
  SELECT id, name, email INTO v_owner_id, v_owner_name, v_owner_email
    FROM profiles WHERE org_id = v_org_id LIMIT 1;

  ------------------------------------------------------------------
  -- Campaigns (6) -- each engineered to hit one specific condition.
  ------------------------------------------------------------------
  INSERT INTO campaigns (id, org_id, name, start_date, end_date, budget, committed, actual,
    signoff_status, owner_id, owner_name, owner_email, tracking_ref, notes)
  VALUES
  -- A: Approved + already started -> "campaign ready to execute"
  (v_camp_a, v_org_id, 'Demo: Partner Webinar Series', CURRENT_DATE - 2, CURRENT_DATE + 40,
    50000, 8000, 3000, 'Approved', v_owner_id, v_owner_name, v_owner_email,
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Engineered to trip "campaign ready to execute" (Approved + start date reached).'),
  -- B: running, committed >= budget*1.0 -> "campaign off target"
  (v_camp_b, v_org_id, 'Demo: Regional Trade Show', CURRENT_DATE - 10, CURRENT_DATE + 20,
    40000, 41000, 15000, 'Approved', v_owner_id, v_owner_name, v_owner_email,
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Engineered to trip "campaign off target" (committed >= budget).'),
  -- C: actual > budget*1.1 -> "campaign over budget"
  (v_camp_c, v_org_id, 'Demo: Product Launch Sprint', CURRENT_DATE - 30, CURRENT_DATE - 5,
    20000, 20000, 23500, 'Approved', v_owner_id, v_owner_name, v_owner_email,
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Engineered to trip "campaign over budget" (actual > 110% of budget).'),
  -- D: plain, healthy, still Draft -- dashboard/chart variety, no trigger fired
  (v_camp_d, v_org_id, 'Demo: Content Refresh Q1', CURRENT_DATE + 5, CURRENT_DATE + 60,
    12000, 0, 0, 'Draft', NULL, NULL, NULL,
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Plain healthy campaign, no automation trigger engineered.'),
  -- E: Submitted, non-AUD currency via budget_fx (assumes org's main currency is AUD;
  -- adjust originalCurrency/rate if Bodgit&Scarpa's org_settings.currency_config.main differs)
  (v_camp_e, v_org_id, 'Demo: APAC Expansion Push', CURRENT_DATE + 15, CURRENT_DATE + 90,
    22500, 0, 0, 'Submitted', v_owner_id, v_owner_name, v_owner_email,
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Exercises multi-currency: budget entered as 15000 USD, converted to 22500 AUD at 1.5.'),
  -- F: Rejected -- variety
  (v_camp_f, v_org_id, 'Demo: Legacy Segment Campaign', CURRENT_DATE - 60, CURRENT_DATE - 30,
    8000, 0, 0, 'Rejected', NULL, NULL, NULL,
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Rejected status, for dashboard/report variety.');

  -- Multi-currency snapshot for campaign E, same shape convertToMain() writes.
  UPDATE campaigns SET budget_fx = jsonb_build_object(
    'original', 15000, 'originalCurrency', 'USD',
    'converted', 22500, 'convertedCurrency', 'AUD',
    'rate', 1.5, 'convertedAt', now()
  ) WHERE id = v_camp_e;

  ------------------------------------------------------------------
  -- Tasks (9) -- spread across the campaigns above, some overdue.
  ------------------------------------------------------------------
  INSERT INTO tasks (id, org_id, campaign_id, name, due_date, status, tracking_ref, notes) VALUES
  (gen_random_uuid(), v_org_id, v_camp_a, 'Demo: Confirm speaker line-up', CURRENT_DATE - 4, 'Planned',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Overdue, not completed -> "task overdue".'),
  (gen_random_uuid(), v_org_id, v_camp_a, 'Demo: Book venue AV', CURRENT_DATE + 10, 'Approved',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Not yet due.'),
  (gen_random_uuid(), v_org_id, v_camp_b, 'Demo: Finalise booth design', CURRENT_DATE - 2, 'In progress',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Overdue, not completed -> "task overdue".'),
  (gen_random_uuid(), v_org_id, v_camp_b, 'Demo: Ship collateral', CURRENT_DATE + 3, 'Submitted',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Not yet due.'),
  (gen_random_uuid(), v_org_id, v_camp_c, 'Demo: Post-launch retro', CURRENT_DATE - 1, 'Completed',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Completed -- must NOT trigger task-overdue despite past due date.'),
  (gen_random_uuid(), v_org_id, v_camp_d, 'Demo: Draft refreshed copy', CURRENT_DATE + 20, 'Planned',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Future, plain.'),
  (gen_random_uuid(), v_org_id, v_camp_d, 'Demo: Legal review', CURRENT_DATE + 25, 'Planned',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Future, plain.'),
  (gen_random_uuid(), v_org_id, v_camp_e, 'Demo: Localise landing page', CURRENT_DATE + 30, 'Planned',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Future, plain.'),
  (gen_random_uuid(), v_org_id, v_camp_e, 'Demo: Recruit regional partners', CURRENT_DATE - 3, 'In progress',
    'demo-seed-2026-09-03', '[DEMO SEED 2026-09-03] Overdue, not completed -> "task overdue".');

  ------------------------------------------------------------------
  -- augur_deals (6) -- one per pipeline stage, mixed currencies (native `currency` column
  -- here, unlike campaigns/tasks/events which use the budget_fx jsonb pattern).
  ------------------------------------------------------------------
  INSERT INTO augur_deals (id, org_id, name, account, value, currency, stage, close_date, source, tracking_ref) VALUES
  (gen_random_uuid(), v_org_id, 'Demo: Initial outreach — Meridian Co', 'Meridian Co', 18000, 'AUD', 'Prospecting', CURRENT_DATE + 45, 'Manual', 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Discovery call booked — Alcove Pty', 'Alcove Pty', 32000, 'AUD', 'Qualifying', CURRENT_DATE + 30, 'Manual', 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Proposal sent — Bravado Group', 'Bravado Group', 54000, 'USD', 'Proposal', CURRENT_DATE + 21, 'Manual', 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Terms under discussion — Kessler Ltd', 'Kessler Ltd', 41000, 'EUR', 'Negotiation', CURRENT_DATE + 14, 'Manual', 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Signed — Northfield Retail', 'Northfield Retail', 27500, 'AUD', 'Closed Won', CURRENT_DATE - 5, 'Manual', 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Lost to competitor — Ashgrove Media', 'Ashgrove Media', 19000, 'AUD', 'Closed Lost', CURRENT_DATE - 10, 'Manual', 'demo-seed-2026-09-03');

  ------------------------------------------------------------------
  -- eventus_events (5) -- one per status.
  ------------------------------------------------------------------
  INSERT INTO eventus_events (id, org_id, name, type, status, start_date, end_date, budget, tracking_ref) VALUES
  (gen_random_uuid(), v_org_id, 'Demo: Roadshow — Planning stage', 'Conference', 'Planned', CURRENT_DATE + 60, CURRENT_DATE + 61, 15000, 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Partner Summit — Awaiting sign-off', 'Summit', 'Approved', CURRENT_DATE + 45, CURRENT_DATE + 46, 22000, 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Regional Expo — Confirmed', 'Expo', 'Confirmed', CURRENT_DATE + 20, CURRENT_DATE + 21, 18000, 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Q2 Webinar — Wrapped', 'Webinar', 'Completed', CURRENT_DATE - 15, CURRENT_DATE - 15, 2000, 'demo-seed-2026-09-03'),
  (gen_random_uuid(), v_org_id, 'Demo: Cancelled Field Day', 'Field event', 'Cancelled', CURRENT_DATE + 10, CURRENT_DATE + 10, 5000, 'demo-seed-2026-09-03');

  ------------------------------------------------------------------
  -- assets (4) -- two below their low-stock threshold, two healthy.
  ------------------------------------------------------------------
  INSERT INTO assets (id, org_id, name, category, stock, low_stock_at, notes) VALUES
  (gen_random_uuid(), v_org_id, 'Demo: Branded pop-up banner', 'Signage', 2, 5, '[DEMO SEED 2026-09-03] Below low-stock threshold -> "asset low stock".'),
  (gen_random_uuid(), v_org_id, 'Demo: Printed brochure — Q3', 'Print collateral', 10, 25, '[DEMO SEED 2026-09-03] Below low-stock threshold -> "asset low stock".'),
  (gen_random_uuid(), v_org_id, 'Demo: Branded tote bags', 'Merchandise', 300, 50, '[DEMO SEED 2026-09-03] Healthy stock level.'),
  (gen_random_uuid(), v_org_id, 'Demo: Conference lanyards', 'Merchandise', 500, 100, '[DEMO SEED 2026-09-03] Healthy stock level.');

  RAISE NOTICE 'Demo seed complete for org %: 6 campaigns, 9 tasks, 6 deals, 5 events, 4 assets.', v_org_id;
END $$;

-- STEP 2 -- verify before committing: row counts for everything this script just added.
SELECT 'campaigns' AS table_name, count(*) FROM campaigns WHERE tracking_ref = 'demo-seed-2026-09-03'
UNION ALL SELECT 'tasks', count(*) FROM tasks WHERE tracking_ref = 'demo-seed-2026-09-03'
UNION ALL SELECT 'augur_deals', count(*) FROM augur_deals WHERE tracking_ref = 'demo-seed-2026-09-03'
UNION ALL SELECT 'eventus_events', count(*) FROM eventus_events WHERE tracking_ref = 'demo-seed-2026-09-03'
UNION ALL SELECT 'assets', count(*) FROM assets WHERE notes LIKE '[DEMO SEED 2026-09-03]%';
-- Expect: campaigns 6, tasks 9, augur_deals 6, eventus_events 5, assets 4.

-- If those counts look right, run:
-- COMMIT;
-- If anything looks wrong, run:
-- ROLLBACK;

-- To remove this seed later (any time, no rush): run each of these on its own, reviewing
-- the SELECT first the same way as any other delete in this project:
--   SELECT * FROM campaigns WHERE tracking_ref='demo-seed-2026-09-03';
--   DELETE FROM campaigns WHERE tracking_ref='demo-seed-2026-09-03';
--   DELETE FROM tasks WHERE tracking_ref='demo-seed-2026-09-03';
--   DELETE FROM augur_deals WHERE tracking_ref='demo-seed-2026-09-03';
--   DELETE FROM eventus_events WHERE tracking_ref='demo-seed-2026-09-03';
--   DELETE FROM assets WHERE notes LIKE '[DEMO SEED 2026-09-03]%';
