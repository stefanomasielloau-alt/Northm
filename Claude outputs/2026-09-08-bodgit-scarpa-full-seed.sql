-- 2026-09-08: Bodgit&Scarpa sample-data seed -- North side.
--
-- LIVE-VERIFIED FIRST, not assumed: a direct query against production
-- (2026-09-08) confirmed Bodgit&Scarpa (org_id 8eae1af2-8af8-4224-94c1-
-- 5ddf2ff237f2) currently has ZERO rows in every business table --
-- campaigns, tasks, eventus_events, assets, augur_deals,
-- prospectus_filters, programmes, regions, cost_buckets, pods, partners.
-- Only roles (5) and profiles (4) exist. The 2026-09-02 running-log entry
-- claiming a full Tac-Tik clone was "confirmed run successfully" does not
-- match today's actual live state -- whatever happened between then and
-- now, this org is a genuinely blank slate today, foundational config
-- included. This migration does NOT try to explain that discrepancy; it
-- just builds a real, complete, working foundation from here.
--
-- This is a ONE-OFF seed for this org, not the general "auto-seed any
-- new org" feature Stef asked for separately -- that's bigger (needs a
-- design decision on hook points in both North and Hub-Backend, and
-- fictitious data for Hub/Queue too, which lives in a completely
-- separate database this file has no access to) and deliberately scoped
-- as its own follow-up, not built here.
--
-- Naming: fictitious, Winnie-the-Pooh-themed per Stef's explicit request,
-- so no one mistakes this for real client data at a glance. FOR REVIEW
-- ONLY, same convention as every other data-writing SQL this session --
-- run Step 1 (SELECT preview) first, then Step 2 (the actual writes) only
-- once you're happy with what Step 1 shows.

-- ============================================================
-- STEP 0: confirm the org and that it's still empty (sanity check
-- before writing anything -- if this returns non-zero rows for any
-- table, STOP and re-check before running Step 2).
-- ============================================================
SELECT
  (SELECT count(*) FROM regions      WHERE org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS regions,
  (SELECT count(*) FROM cost_buckets WHERE org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS cost_buckets,
  (SELECT count(*) FROM programmes   WHERE org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS programmes,
  (SELECT count(*) FROM campaigns    WHERE org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS campaigns,
  (SELECT count(*) FROM tasks t JOIN campaigns c ON c.id = t.campaign_id
     WHERE c.org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS tasks;

-- ============================================================
-- STEP 2: the actual writes. Wrapped in a transaction -- if anything
-- errors partway, nothing partial is left behind.
-- ============================================================
BEGIN;

-- ---- Regions (mirrors Tac-Tik's real set: ANZ/SEA/Japan/India, plus
--      Unassigned as the safe default every org needs) ----
INSERT INTO regions (id, org_id, name) VALUES
  ('a1000000-0000-4000-8000-000000000001', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'ANZ'),
  ('a1000000-0000-4000-8000-000000000002', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'SEA'),
  ('a1000000-0000-4000-8000-000000000003', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Unassigned');

-- ---- Cost buckets (same code/label vocabulary as Tac-Tik, so reports
--      that assume these standard codes behave the same in both orgs) ----
INSERT INTO cost_buckets (id, org_id, code, label) VALUES
  ('a2000000-0000-4000-8000-000000000001', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'CONTENT',   'Content & creative'),
  ('a2000000-0000-4000-8000-000000000002', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'PAIDMEDIA', 'Paid media & advertising'),
  ('a2000000-0000-4000-8000-000000000003', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'EVENTS',    'Events & sponsorship'),
  ('a2000000-0000-4000-8000-000000000004', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'EMAIL',     'Email & marketing automation'),
  ('a2000000-0000-4000-8000-000000000005', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'AGENCY',    'Agency & contractor fees');

-- ---- Pod (Strategy's Region/Pod hierarchy needs at least one to be usable) ----
INSERT INTO pods (id, org_id, name, region_id) VALUES
  ('a3000000-0000-4000-8000-000000000001', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Hundred Acre Pod', 'a1000000-0000-4000-8000-000000000001');

-- ---- Programmes ----
INSERT INTO programmes (id, org_id, name, owner, focus, status, tracking_ref) VALUES
  ('a4000000-0000-4000-8000-000000000001', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Honey Pot Demand Gen',     'Winnie Pooh',    'Demand generation',  'Active', 'demo-bg-2026-09-08-p1'),
  ('a4000000-0000-4000-8000-000000000002', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Hundred Acre Brand Push',  'Christopher Robin','Brand awareness',  'Active', 'demo-bg-2026-09-08-p2');

-- ---- Campaigns (6, varied signoff/timing/budget so dashboards, RAG
--      status, and sign-off filters all have something real to show) ----
INSERT INTO campaigns (
  id, org_id, name, programme_id, region_id, cost_bucket_id,
  start_date, end_date, budget, signoff_status, period_type, period_label,
  tracking_ref, business_case, owner_name, owner_email, sort_order
) VALUES
  ('a5000000-0000-4000-8000-000000000001', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Honey Jar Launch Campaign',
   'a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
   '2026-08-01', '2026-10-31', 45000, 'Approved', 'quarter', 'FY26 Q3',
   'demo-bg-2026-09-08-c1', 'Launch of the new honey jar product line into ANZ.', 'Winnie Pooh', 'pooh@bodgitscarpa.example', 1),

  ('a5000000-0000-4000-8000-000000000002', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Bouncy Tigger Social Blitz',
   'a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002',
   '2026-09-01', '2026-11-15', 18000, 'Submitted', 'quarter', 'FY26 Q3',
   'demo-bg-2026-09-08-c2', 'Paid social push for SEA awareness.', 'Tigger', 'tigger@bodgitscarpa.example', 2),

  ('a5000000-0000-4000-8000-000000000003', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Wise Owl Webinar Series',
   'a4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000004',
   '2026-07-01', '2026-09-30', 8000, 'Approved', 'quarter', 'FY26 Q2/Q3',
   'demo-bg-2026-09-08-c3', 'Thought-leadership webinar series.', 'Owl', 'owl@bodgitscarpa.example', 3),

  ('a5000000-0000-4000-8000-000000000004', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Eeyore Customer Retention Drive',
   'a4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000005',
   '2026-09-08', '2026-12-20', 22000, 'Draft', 'quarter', 'FY26 Q3/Q4',
   'demo-bg-2026-09-08-c4', 'Retention outreach for at-risk accounts.', 'Eeyore', 'eeyore@bodgitscarpa.example', 4),

  ('a5000000-0000-4000-8000-000000000005', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Piglet Partner Enablement Kit',
   'a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001',
   '2026-06-01', '2026-08-15', 6000, 'Rejected', 'quarter', 'FY26 Q2',
   'demo-bg-2026-09-08-c5', 'Partner enablement content -- deprioritized this cycle.', 'Piglet', 'piglet@bodgitscarpa.example', 5),

  ('a5000000-0000-4000-8000-000000000006', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'Kanga & Roo Referral Programme',
   'a4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003',
   '2026-05-01', '2026-07-31', 15000, 'Approved', 'quarter', 'FY26 Q2',
   'demo-bg-2026-09-08-c6', 'Completed referral incentive event series.', 'Kanga', 'kanga@bodgitscarpa.example', 6);

-- ---- Tasks / activities (2 per campaign for the first 4, varied status
--      including one overdue, so RAG/overdue logic has real data) ----
INSERT INTO tasks (id, campaign_id, name, type, owner, start_date, due_date, status, cost_bucket_id, planned_cost, committed_cost, actual_cost, tracking_ref, sort_order) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'Design honey jar creative', 'Content', 'Piglet', '2026-08-01', '2026-08-20', 'Done', 'a2000000-0000-4000-8000-000000000001', 5000, 5000, 4800, 'demo-bg-2026-09-08-t1', 1),
  ('a6000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001', 'Run launch paid media flight', 'Paid Media', 'Tigger', '2026-08-21', '2026-10-15', 'In progress', 'a2000000-0000-4000-8000-000000000002', 30000, 28000, 12000, 'demo-bg-2026-09-08-t2', 2),
  ('a6000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000002', 'Produce Tigger social assets', 'Content', 'Roo', '2026-09-01', '2026-09-20', 'In progress', 'a2000000-0000-4000-8000-000000000001', 4000, 4000, 2000, 'demo-bg-2026-09-08-t3', 1),
  ('a6000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000002', 'Boost posts across SEA', 'Paid Media', 'Tigger', '2026-08-25', '2026-09-05', 'Overdue', 'a2000000-0000-4000-8000-000000000002', 6000, 6000, 0, 'demo-bg-2026-09-08-t4', 2),
  ('a6000000-0000-4000-8000-000000000005', 'a5000000-0000-4000-8000-000000000003', 'Book webinar speakers', 'Events', 'Owl', '2026-07-01', '2026-07-15', 'Done', 'a2000000-0000-4000-8000-000000000003', 1000, 1000, 900, 'demo-bg-2026-09-08-t5', 1),
  ('a6000000-0000-4000-8000-000000000006', 'a5000000-0000-4000-8000-000000000003', 'Send webinar follow-up emails', 'Email', 'Owl', '2026-09-01', '2026-09-25', 'Planned', 'a2000000-0000-4000-8000-000000000004', 500, 0, 0, 'demo-bg-2026-09-08-t6', 2),
  ('a6000000-0000-4000-8000-000000000007', 'a5000000-0000-4000-8000-000000000004', 'Segment at-risk account list', 'Research', 'Eeyore', '2026-09-08', '2026-09-22', 'Planned', 'a2000000-0000-4000-8000-000000000005', 2000, 0, 0, 'demo-bg-2026-09-08-t7', 1),
  ('a6000000-0000-4000-8000-000000000008', 'a5000000-0000-4000-8000-000000000004', 'Draft retention email sequence', 'Content', 'Eeyore', '2026-09-15', '2026-10-05', 'Planned', 'a2000000-0000-4000-8000-000000000001', 3000, 0, 0, 'demo-bg-2026-09-08-t8', 2);

COMMIT;

-- ============================================================
-- CLEANUP (only if you ever want to remove exactly this seed and
-- nothing else): every row above is tagged with a tracking_ref/id prefix
-- starting demo-bg-2026-09-08 or a1..a6 UUID prefix, so this is safe and
-- scoped -- run manually, never automatic.
-- ============================================================
-- BEGIN;
-- DELETE FROM tasks WHERE tracking_ref LIKE 'demo-bg-2026-09-08-t%';
-- DELETE FROM campaigns WHERE tracking_ref LIKE 'demo-bg-2026-09-08-c%';
-- DELETE FROM programmes WHERE tracking_ref LIKE 'demo-bg-2026-09-08-p%';
-- DELETE FROM pods WHERE id = 'a3000000-0000-4000-8000-000000000001';
-- DELETE FROM cost_buckets WHERE id LIKE 'a2000000-0000-4000-8000-%';
-- DELETE FROM regions WHERE id LIKE 'a1000000-0000-4000-8000-%';
-- COMMIT;
