-- 2026-09-10: Bodgit&Scarpa "lost all campaign/North data" -- diagnostic + repair
--
-- CONTEXT: Bodgit&Scarpa (org_id 8eae1af2-8af8-4224-94c1-5ddf2ff237f2) was fully
-- seeded on 2026-09-08 (regions, cost buckets, a pod, 2 programmes, 6 campaigns,
-- tasks, plus a later pass adding assets/augur_deals/eventus_events/
-- prospectus_filters) and confirmed run by Stef at the time ("ok both done").
-- Today (2026-09-10) a Bodgit&Scarpa user reports seeing none of it.
--
-- WORKING HYPOTHESIS -- not confirmed against the live database (no query
-- access from here), so treat this as the most likely explanation, not a
-- verified fact. claude/running-log.md documents a real, confirmed bug from
-- 2026-09-09: Ordo.html's generic upsertRows('roles', CFG.roles, ...) helper
-- unconditionally stamps org_id:_orgId onto EVERY row in memory on save --
-- and because that read had no explicit org filter (relying on RLS, which
-- grants Super Admins a cross-org read), a Super Admin who had ever loaded
-- OTHER orgs' roles into memory would silently overwrite all of them back to
-- whichever org was currently open on the next save. The doc calls this
-- "very likely the real explanation for all three historical role/org
-- corruption incidents in this project."
--
-- The exact same mechanism existed in Cursus.html's upsertRows() for
-- campaigns/tasks/programmes/etc. BEFORE today's item 68 fix (SAV.stampOrgId,
-- shipped today) -- and the original item 68 v1/v2 migration (also today,
-- earlier) briefly gave Super Admins an unfiltered cross-org RLS bypass on
-- exactly these tables. If Stef, testing as Super Admin any time between v1/v2
-- landing and today's SAV.stampOrgId fix, loaded Cursus with an unfiltered
-- cross-org read active and triggered ANY save, every row from every org then
-- in memory -- including Bodgit&Scarpa's seeded campaigns/tasks -- would have
-- been silently reassigned org_id to whatever org was open at that moment.
-- That would look exactly like "lost all campaign/North data": the rows still
-- exist, just filed under the wrong org now.
--
-- WHAT THIS DOES: Step 1 is 100% read-only -- it looks up the exact known
-- 2026-09-08 seed rows BY THEIR OWN ID (not by org_id, so it finds them
-- wherever they currently are) and shows each one's current org_id next to
-- what it should be. Run this first and read the output before touching
-- Step 2.
--
-- Step 2 is the repair -- ONLY run it if Step 1 shows rows sitting under a
-- DIFFERENT org_id than 8eae1af2-8af8-4224-94c1-5ddf2ff237f2. It is scoped to
-- the exact known seed ids only (never a bare org_id or table-wide update), so
-- it cannot touch any other org's real data even if the hypothesis above is
-- wrong. If Step 1 instead shows these ids simply don't exist at all (0 rows,
-- not "wrong org"), that's a different problem (actual deletion) and Step 2
-- won't help -- stop and let me know what Step 1 returned.

-- ============================================================
-- STEP 1 -- READ ONLY. Run this first.
-- ============================================================
SELECT 'regions' AS table_name, id, org_id,
       (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS in_bodgit_scarpa
FROM regions WHERE id IN (
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003')
UNION ALL
SELECT 'cost_buckets', id, org_id, (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
FROM cost_buckets WHERE id IN (
  'a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000005')
UNION ALL
SELECT 'pods', id, org_id, (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
FROM pods WHERE id = 'a3000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'programmes', id, org_id, (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
FROM programmes WHERE id IN ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002')
UNION ALL
SELECT 'campaigns', id, org_id, (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
FROM campaigns WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
UNION ALL
SELECT 'tasks', id, org_id, (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
FROM tasks WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
UNION ALL
SELECT 'augur_deals', id, org_id, (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
FROM augur_deals WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
UNION ALL
SELECT 'eventus_events', id, org_id, (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
FROM eventus_events WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
UNION ALL
SELECT 'prospectus_filters', id, org_id, (org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
FROM prospectus_filters WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
ORDER BY table_name, id;

-- Also worth a look: is Bodgit&Scarpa's own org_id EMPTY right now (matching
-- what the user is seeing) across the tables Stef called out?
SELECT
  (SELECT count(*) FROM campaigns  WHERE org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS campaigns,
  (SELECT count(*) FROM programmes WHERE org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS programmes,
  (SELECT count(*) FROM tasks      WHERE org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2') AS tasks;

-- ============================================================
-- STEP 2 -- REPAIR. Only run this if Step 1 showed the known seed rows
-- sitting under a DIFFERENT org_id (in_bodgit_scarpa = false), not missing
-- entirely. Scoped to these exact ids only -- cannot affect any other org's
-- real data. Wrapped in a transaction; review the RETURNING output, then
-- either the implicit COMMIT below runs, or replace it with ROLLBACK if
-- anything looks wrong.
-- ============================================================
/*
BEGIN;

UPDATE regions SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE id IN ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003')
  RETURNING id, org_id;

UPDATE cost_buckets SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE id IN ('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002',
               'a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000005')
  RETURNING id, org_id;

UPDATE pods SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE id = 'a3000000-0000-4000-8000-000000000001'
  RETURNING id, org_id;

UPDATE programmes SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE id IN ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002')
  RETURNING id, org_id;

UPDATE campaigns SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
  RETURNING id, org_id;

UPDATE tasks SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
  RETURNING id, org_id;

UPDATE augur_deals SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
  RETURNING id, org_id;

UPDATE eventus_events SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
  RETURNING id, org_id;

UPDATE prospectus_filters SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
  WHERE tracking_ref LIKE 'demo-bg-2026-09-08%'
  RETURNING id, org_id;

COMMIT;
*/
