-- 2026-09-03: North test/demo data seed v2 -- PROGRAMMES layer, requested directly by Stef
-- ("formulate 5-6 programmes and multiple campaigns and activities within, multiple timing,
-- activities, budgets, results etc so we can test better and demonstrate easier" -- tester
-- feedback that the app needed much more sample data to test/demo well).
--
-- FOR REVIEW ONLY -- NOT RUN. Same standing rule as every other data-writing SQL this
-- session: nothing runs without your explicit go-ahead. Review Step 0/1, then COMMIT or
-- ROLLBACK yourself at the bottom.
--
-- HOW THIS RELATES TO v1 (2026-09-03-north-test-data-seed.sql, also still unrun): v1 seeded
-- 6 campaigns directly (no programme parent) plus deals/events/assets, one row per automation
-- trigger condition. This file is additive, not a replacement -- different tracking_ref
-- ('demo-seed-2026-09-03-v2' vs v1's 'demo-seed-2026-09-03'), so the two can be run
-- independently, together, or not at all, with no collision. This v2 file focuses specifically
-- on what Stef asked for just now: a Programme > Campaign > Activity hierarchy with real
-- depth, since v1's campaigns had no programme and only 1-2 tasks each -- too thin to browse
-- Campaign Planning's Programmes roll-up or demo a full campaign's activity list.
--
-- WHERE: org "Bodgit&Scarpa" (looked up by name, not a hardcoded id -- same lesson as the
-- Tac-Tik cleanup script's v1 error). North's established, precedented test org.
--
-- WHAT: 6 programmes, 16 campaigns spread across them (2-3 each), ~40 tasks/activities spread
-- across those campaigns (2-3 each). Deliberately varied: every campaign differs in
-- signoff_status (Draft/Submitted/Approved/Rejected), timing (past-ended, currently running,
-- future-planned), and budget outcome (under, on-track, off-target, over-budget) so dashboards,
-- the Programmes roll-up, and Process Maps automations all have real variety to show instead of
-- 1-2 similar-looking rows. Three campaigns carry a multi-currency budget_fx snapshot (USD,
-- EUR, GBP) so the currency-conversion display has more than v1's single example. Tasks vary
-- type (General/Event/Content/Paid Media/Email/Webinar/Contact Outreach/Contact Sourcing),
-- status (Planned/Submitted/Approved/In progress/Completed), and due dates (several overdue,
-- several future) with planned/committed/actual cost figures filled in where the task is past
-- Planned, so budget roll-ups have real numbers under them. Owners are cycled across whichever
-- profiles already exist in Bodgit&Scarpa (from the 2026-09-02 Tac-Tik clone) rather than
-- invented people.
--
-- MARKING: tracking_ref = 'demo-seed-2026-09-03-v2' on every programme/campaign/task row, so
-- it can be found and removed independently of v1 later. To remove: DELETE FROM tasks WHERE
-- tracking_ref='demo-seed-2026-09-03-v2'; DELETE FROM campaigns WHERE tracking_ref=
-- 'demo-seed-2026-09-03-v2'; DELETE FROM programmes WHERE tracking_ref=
-- 'demo-seed-2026-09-03-v2'; -- run in that order (tasks/campaigns reference programmes).
--
-- NOT verified against live schema constraints (no DB query access this session -- every
-- column/domain below was read directly from Cursus.html/Ordo.html's own code, not guessed).
-- If this errors, paste the exact Postgres error back for a v3, same pattern as every other
-- SQL file this session.

-- Safe no-op if a previous run of this file left a transaction open.
ROLLBACK;

-- STEP 0 -- confirm the org resolves to exactly one id before anything else runs.
SELECT id, name FROM organizations WHERE name = 'Bodgit&Scarpa';

-- STEP 1 -- everything below runs in one transaction so it can be rolled back in full if
-- anything looks wrong before COMMIT.
BEGIN;

DO $$
DECLARE
  v_org_id       uuid;
  v_owner_ids    uuid[];
  v_owner_names  text[];
  v_owner_emails text[];
  v_owner_n      int;
  v_prog_a uuid := gen_random_uuid();  -- Brand Awareness
  v_prog_b uuid := gen_random_uuid();  -- Demand Generation
  v_prog_c uuid := gen_random_uuid();  -- Partner & Channel
  v_prog_d uuid := gen_random_uuid();  -- Product Launch FY26
  v_prog_e uuid := gen_random_uuid();  -- Customer Retention & Expansion
  v_prog_f uuid := gen_random_uuid();  -- APAC Regional Expansion
  v_c_a1 uuid := gen_random_uuid(); v_c_a2 uuid := gen_random_uuid(); v_c_a3 uuid := gen_random_uuid();
  v_c_b1 uuid := gen_random_uuid(); v_c_b2 uuid := gen_random_uuid(); v_c_b3 uuid := gen_random_uuid();
  v_c_c1 uuid := gen_random_uuid(); v_c_c2 uuid := gen_random_uuid();
  v_c_d1 uuid := gen_random_uuid(); v_c_d2 uuid := gen_random_uuid(); v_c_d3 uuid := gen_random_uuid();
  v_c_e1 uuid := gen_random_uuid(); v_c_e2 uuid := gen_random_uuid();
  v_c_f1 uuid := gen_random_uuid(); v_c_f2 uuid := gen_random_uuid(); v_c_f3 uuid := gen_random_uuid();
  -- helper: pick owner i (1-based), wraps around if fewer profiles than campaigns, NULL-safe
  -- if the org has zero profiles.
  v_i int;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Bodgit&Scarpa';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Bodgit&Scarpa org not found -- aborting, nothing inserted.';
  END IF;

  SELECT array_agg(id), array_agg(name), array_agg(email)
    INTO v_owner_ids, v_owner_names, v_owner_emails
    FROM (SELECT id, name, email FROM profiles WHERE org_id = v_org_id ORDER BY id LIMIT 8) p;
  v_owner_n := COALESCE(array_length(v_owner_ids, 1), 0);

  ------------------------------------------------------------------
  -- Programmes (6)
  ------------------------------------------------------------------
  INSERT INTO programmes (id, org_id, name, owner, focus, status, tracking_ref, notes) VALUES
  (v_prog_a, v_org_id, 'Demo Program: Brand Awareness', 'Marketing', 'Awareness & reach', 'Active',
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] 3 campaigns, mixed timing/currency.'),
  (v_prog_b, v_org_id, 'Demo Program: Demand Generation', 'Marketing', 'Pipeline generation', 'Active',
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] 3 campaigns, includes off-target and over-budget triggers.'),
  (v_prog_c, v_org_id, 'Demo Program: Partner & Channel', 'Partnerships', 'Channel enablement', 'Active',
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] 2 campaigns, one rejected for variety.'),
  (v_prog_d, v_org_id, 'Demo Program: Product Launch FY26', 'Product Marketing', 'Launch readiness', 'Active',
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] 3 campaigns spanning completed/future/multi-currency.'),
  (v_prog_e, v_org_id, 'Demo Program: Customer Retention & Expansion', 'Customer Marketing', 'Retention & upsell', 'Active',
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] 2 campaigns, one multi-currency (GBP).'),
  (v_prog_f, v_org_id, 'Demo Program: APAC Regional Expansion', 'Regional', 'APAC growth', 'Active',
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] 3 campaigns across running/future/rejected.');

  ------------------------------------------------------------------
  -- Campaigns (16) -- varied signoff_status, timing, budget outcome.
  ------------------------------------------------------------------
  v_i := 1;
  INSERT INTO campaigns (id, org_id, programme_id, name, start_date, end_date, budget, committed, actual,
    signoff_status, owner_id, owner_name, owner_email, tracking_ref, notes) VALUES
  -- Programme A: Brand Awareness
  (v_c_a1, v_org_id, v_prog_a, 'Demo: Social Amplification Q3', CURRENT_DATE - 5, CURRENT_DATE + 25,
    18000, 6000, 4200, 'Approved',
    CASE WHEN v_owner_n>0 THEN v_owner_ids[1+((v_i-1)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_names[1+((v_i-1)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_emails[1+((v_i-1)%v_owner_n)] END,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Running, on track.'),
  (v_c_a2, v_org_id, v_prog_a, 'Demo: Influencer Outreach', CURRENT_DATE + 10, CURRENT_DATE + 50,
    9000, 0, 0, 'Draft', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future, not yet approved.'),
  (v_c_a3, v_org_id, v_prog_a, 'Demo: Brand Video Series', CURRENT_DATE + 3, CURRENT_DATE + 40,
    16500, 0, 0, 'Submitted',
    CASE WHEN v_owner_n>0 THEN v_owner_ids[1+((v_i+1)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_names[1+((v_i+1)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_emails[1+((v_i+1)%v_owner_n)] END,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Multi-currency: 11000 USD -> 16500 AUD.'),
  -- Programme B: Demand Generation
  (v_c_b1, v_org_id, v_prog_b, 'Demo: Webinar Nurture Series', CURRENT_DATE - 8, CURRENT_DATE + 15,
    25000, 25500, 9000, 'Approved',
    CASE WHEN v_owner_n>0 THEN v_owner_ids[1+((v_i+2)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_names[1+((v_i+2)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_emails[1+((v_i+2)%v_owner_n)] END,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Off-target: committed >= budget.'),
  (v_c_b2, v_org_id, v_prog_b, 'Demo: Paid Search Sprint', CURRENT_DATE - 45, CURRENT_DATE - 10,
    12000, 12000, 14200, 'Approved', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Over budget: actual > 110% of budget, already ended.'),
  (v_c_b3, v_org_id, v_prog_b, 'Demo: ABM Target Account Push', CURRENT_DATE + 20, CURRENT_DATE + 75,
    30000, 0, 0, 'Draft', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future, healthy, largest budget in the set.'),
  -- Programme C: Partner & Channel
  (v_c_c1, v_org_id, v_prog_c, 'Demo: Reseller Enablement Kit', CURRENT_DATE - 3, CURRENT_DATE + 30,
    7000, 2000, 1500, 'Approved',
    CASE WHEN v_owner_n>0 THEN v_owner_ids[1+((v_i+3)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_names[1+((v_i+3)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_emails[1+((v_i+3)%v_owner_n)] END,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Running, on track.'),
  (v_c_c2, v_org_id, v_prog_c, 'Demo: Legacy Partner Co-op Fund', CURRENT_DATE - 90, CURRENT_DATE - 60,
    5000, 0, 0, 'Rejected', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Rejected, for variety.'),
  -- Programme D: Product Launch FY26
  (v_c_d1, v_org_id, v_prog_d, 'Demo: Launch Week Media Blitz', CURRENT_DATE - 60, CURRENT_DATE - 30,
    40000, 39500, 38700, 'Approved',
    CASE WHEN v_owner_n>0 THEN v_owner_ids[1+((v_i+4)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_names[1+((v_i+4)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_emails[1+((v_i+4)%v_owner_n)] END,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Completed, delivered close to budget -- healthy example.'),
  (v_c_d2, v_org_id, v_prog_d, 'Demo: Post-Launch Retargeting', CURRENT_DATE + 5, CURRENT_DATE + 35,
    14000, 0, 0, 'Submitted', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Multi-currency: 9333 EUR -> 14000 AUD.'),
  (v_c_d3, v_org_id, v_prog_d, 'Demo: Launch Anniversary Campaign', CURRENT_DATE + 200, CURRENT_DATE + 230,
    10000, 0, 0, 'Draft', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Far future, plain.'),
  -- Programme E: Customer Retention & Expansion
  (v_c_e1, v_org_id, v_prog_e, 'Demo: Renewal Nurture Track', CURRENT_DATE - 15, CURRENT_DATE + 45,
    11000, 3500, 3100, 'Approved',
    CASE WHEN v_owner_n>0 THEN v_owner_ids[1+((v_i+5)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_names[1+((v_i+5)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_emails[1+((v_i+5)%v_owner_n)] END,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Running, on track.'),
  (v_c_e2, v_org_id, v_prog_e, 'Demo: Expansion Upsell Playbook', CURRENT_DATE + 8, CURRENT_DATE + 60,
    17500, 0, 0, 'Submitted', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Multi-currency: 10000 GBP -> 17500 AUD.'),
  -- Programme F: APAC Regional Expansion
  (v_c_f1, v_org_id, v_prog_f, 'Demo: APAC Launch Roadshow', CURRENT_DATE - 4, CURRENT_DATE + 26,
    26000, 9000, 6000, 'Approved',
    CASE WHEN v_owner_n>0 THEN v_owner_ids[1+((v_i+6)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_names[1+((v_i+6)%v_owner_n)] END,
    CASE WHEN v_owner_n>0 THEN v_owner_emails[1+((v_i+6)%v_owner_n)] END,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Running, on track.'),
  (v_c_f2, v_org_id, v_prog_f, 'Demo: SEA Market Entry Content', CURRENT_DATE + 30, CURRENT_DATE + 90,
    13000, 0, 0, 'Draft', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future, plain.'),
  (v_c_f3, v_org_id, v_prog_f, 'Demo: Legacy JAPAC Print Campaign', CURRENT_DATE - 120, CURRENT_DATE - 90,
    4000, 0, 0, 'Rejected', NULL, NULL, NULL,
    'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Rejected, older, for variety.');

  -- Multi-currency snapshots (3 campaigns: USD, EUR, GBP).
  UPDATE campaigns SET budget_fx = jsonb_build_object(
    'original', 11000, 'originalCurrency', 'USD', 'converted', 16500, 'convertedCurrency', 'AUD',
    'rate', 1.5, 'convertedAt', now()) WHERE id = v_c_a3;
  UPDATE campaigns SET budget_fx = jsonb_build_object(
    'original', 9333, 'originalCurrency', 'EUR', 'converted', 14000, 'convertedCurrency', 'AUD',
    'rate', 1.5, 'convertedAt', now()) WHERE id = v_c_d2;
  UPDATE campaigns SET budget_fx = jsonb_build_object(
    'original', 10000, 'originalCurrency', 'GBP', 'converted', 17500, 'convertedCurrency', 'AUD',
    'rate', 1.75, 'convertedAt', now()) WHERE id = v_c_e2;

  ------------------------------------------------------------------
  -- Tasks / activities (~40) -- 2-3 per campaign, varied type/status/timing/cost.
  ------------------------------------------------------------------
  INSERT INTO tasks (id, org_id, campaign_id, name, type, start_date, due_date, status,
    planned_cost, committed_cost, actual_cost, tracking_ref, notes) VALUES
  -- A1
  (gen_random_uuid(), v_org_id, v_c_a1, 'Demo: Content calendar', 'Content', CURRENT_DATE-5, CURRENT_DATE-1, 'Completed', 2000, 2000, 1800, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_a1, 'Demo: Paid social boost', 'Paid Media', CURRENT_DATE-2, CURRENT_DATE+8, 'In progress', 4000, 4000, 2400, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_a1, 'Demo: Performance report', 'General', CURRENT_DATE+20, CURRENT_DATE+24, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- A2
  (gen_random_uuid(), v_org_id, v_c_a2, 'Demo: Influencer shortlist', 'Contact Sourcing', CURRENT_DATE+10, CURRENT_DATE+18, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  (gen_random_uuid(), v_org_id, v_c_a2, 'Demo: Outreach emails', 'Contact Outreach', CURRENT_DATE+18, CURRENT_DATE+25, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- A3
  (gen_random_uuid(), v_org_id, v_c_a3, 'Demo: Script & storyboard', 'Content', CURRENT_DATE+3, CURRENT_DATE+12, 'Approved', 3000, 3000, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_a3, 'Demo: Production shoot', 'Event', CURRENT_DATE+15, CURRENT_DATE+17, 'Planned', 8000, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  (gen_random_uuid(), v_org_id, v_c_a3, 'Demo: Edit & distribute', 'Content', CURRENT_DATE+20, CURRENT_DATE+35, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- B1
  (gen_random_uuid(), v_org_id, v_c_b1, 'Demo: Webinar platform setup', 'Webinar', CURRENT_DATE-8, CURRENT_DATE-6, 'Completed', 1500, 1500, 1500, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_b1, 'Demo: Speaker coordination', 'Event', CURRENT_DATE-3, CURRENT_DATE-1, 'Completed', 2000, 2000, 2100, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_b1, 'Demo: Email nurture build', 'Email', CURRENT_DATE-1, CURRENT_DATE+5, 'In progress', 3000, 3000, 1200, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  -- B2 (over budget, already ended)
  (gen_random_uuid(), v_org_id, v_c_b2, 'Demo: Keyword research', 'Paid Media', CURRENT_DATE-45, CURRENT_DATE-40, 'Completed', 1500, 1500, 1500, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_b2, 'Demo: Ad copy & creative', 'Content', CURRENT_DATE-38, CURRENT_DATE-30, 'Completed', 3500, 3500, 3700, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_b2, 'Demo: Bid management', 'Paid Media', CURRENT_DATE-30, CURRENT_DATE-10, 'Completed', 7000, 7000, 9000, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Overspend driver.'),
  -- B3
  (gen_random_uuid(), v_org_id, v_c_b3, 'Demo: Target account list build', 'Contact Sourcing', CURRENT_DATE+20, CURRENT_DATE+27, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  (gen_random_uuid(), v_org_id, v_c_b3, 'Demo: Personalised outreach', 'Contact Outreach', CURRENT_DATE+30, CURRENT_DATE+45, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- C1
  (gen_random_uuid(), v_org_id, v_c_c1, 'Demo: Kit design', 'Content', CURRENT_DATE-3, CURRENT_DATE+2, 'In progress', 2000, 2000, 900, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_c1, 'Demo: Partner training webinar', 'Webinar', CURRENT_DATE+10, CURRENT_DATE+11, 'Planned', 1000, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- C2
  (gen_random_uuid(), v_org_id, v_c_c2, 'Demo: Co-op fund review', 'General', CURRENT_DATE-90, CURRENT_DATE-85, 'Completed', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Historical, rejected program.'),
  -- D1
  (gen_random_uuid(), v_org_id, v_c_d1, 'Demo: Launch press release', 'Content', CURRENT_DATE-60, CURRENT_DATE-58, 'Completed', 2500, 2500, 2400, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_d1, 'Demo: Media buy', 'Paid Media', CURRENT_DATE-55, CURRENT_DATE-35, 'Completed', 30000, 29500, 29800, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_d1, 'Demo: Post-launch retro', 'General', CURRENT_DATE-31, CURRENT_DATE-30, 'Completed', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  -- D2
  (gen_random_uuid(), v_org_id, v_c_d2, 'Demo: Retargeting audience build', 'Paid Media', CURRENT_DATE+5, CURRENT_DATE+9, 'Planned', 5000, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  (gen_random_uuid(), v_org_id, v_c_d2, 'Demo: Creative refresh', 'Content', CURRENT_DATE+9, CURRENT_DATE+18, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- D3
  (gen_random_uuid(), v_org_id, v_c_d3, 'Demo: Anniversary concept', 'Content', CURRENT_DATE+200, CURRENT_DATE+205, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Far future.'),
  -- E1
  (gen_random_uuid(), v_org_id, v_c_e1, 'Demo: Renewal email series', 'Email', CURRENT_DATE-15, CURRENT_DATE-8, 'Completed', 1500, 1500, 1400, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_e1, 'Demo: Customer webinar', 'Webinar', CURRENT_DATE-2, CURRENT_DATE+2, 'In progress', 2000, 2000, 1700, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_e1, 'Demo: Case study production', 'Content', CURRENT_DATE+10, CURRENT_DATE+30, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- E2
  (gen_random_uuid(), v_org_id, v_c_e2, 'Demo: Upsell playbook draft', 'General', CURRENT_DATE+8, CURRENT_DATE+15, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  (gen_random_uuid(), v_org_id, v_c_e2, 'Demo: Sales enablement training', 'Event', CURRENT_DATE+25, CURRENT_DATE+26, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- F1
  (gen_random_uuid(), v_org_id, v_c_f1, 'Demo: Venue & logistics', 'Event', CURRENT_DATE-4, CURRENT_DATE+1, 'In progress', 6000, 6000, 3500, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_f1, 'Demo: Regional invite list', 'Contact Sourcing', CURRENT_DATE-6, CURRENT_DATE-3, 'Completed', 500, 500, 500, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2]'),
  (gen_random_uuid(), v_org_id, v_c_f1, 'Demo: Post-event follow-up', 'Contact Outreach', CURRENT_DATE+22, CURRENT_DATE+28, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- F2
  (gen_random_uuid(), v_org_id, v_c_f2, 'Demo: SEA localisation', 'Content', CURRENT_DATE+30, CURRENT_DATE+45, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  (gen_random_uuid(), v_org_id, v_c_f2, 'Demo: Regional partner briefing', 'General', CURRENT_DATE+45, CURRENT_DATE+50, 'Planned', 0, 0, 0, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Future.'),
  -- F3
  (gen_random_uuid(), v_org_id, v_c_f3, 'Demo: Legacy print run', 'Other', CURRENT_DATE-120, CURRENT_DATE-115, 'Completed', 4000, 4000, 4000, 'demo-seed-2026-09-03-v2', '[DEMO SEED v2] Historical, rejected program.');

  RAISE NOTICE 'Demo seed v2 complete for org %: 6 programmes, 16 campaigns, ~40 tasks.', v_org_id;
END $$;

-- STEP 2 -- verify before committing.
SELECT 'programmes' AS table_name, count(*) FROM programmes WHERE tracking_ref = 'demo-seed-2026-09-03-v2'
UNION ALL SELECT 'campaigns', count(*) FROM campaigns WHERE tracking_ref = 'demo-seed-2026-09-03-v2'
UNION ALL SELECT 'tasks', count(*) FROM tasks WHERE tracking_ref = 'demo-seed-2026-09-03-v2';
-- Expect: programmes 6, campaigns 16, tasks 40.

-- Also worth a look before COMMIT -- the Programmes roll-up Ordo.html/Cursus.html will show:
SELECT p.name AS programme, count(c.id) AS campaigns, sum(c.budget) AS total_budget,
       sum(c.committed) AS total_committed, sum(c.actual) AS total_actual
FROM programmes p LEFT JOIN campaigns c ON c.programme_id = p.id
WHERE p.tracking_ref = 'demo-seed-2026-09-03-v2'
GROUP BY p.name ORDER BY p.name;

-- If those counts/numbers look right, run:
-- COMMIT;
-- If anything looks wrong, run:
-- ROLLBACK;

-- To remove this v2 seed later (independent of v1, any time, no rush):
--   DELETE FROM tasks WHERE tracking_ref='demo-seed-2026-09-03-v2';
--   DELETE FROM campaigns WHERE tracking_ref='demo-seed-2026-09-03-v2';
--   DELETE FROM programmes WHERE tracking_ref='demo-seed-2026-09-03-v2';
