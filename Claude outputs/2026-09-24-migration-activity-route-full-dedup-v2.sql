-- 2026-09-24 -- FULL activity + route dedup (v2 -- supersedes the smaller
-- 2026-09-24-migration-activity-unassigned-dedup-and-empty-route-cleanup.sql file sent minutes
-- earlier tonight; that file is now redundant, use this one instead. Don't run both.)
--
-- NOT YET RUN. Prepared for Stef's review. Builds on 2026-09-23's activity dedup work
-- (claude/2026-09-23-migration-activity-dedup-cleanup.sql + its pre-deletion snapshot json),
-- which cleaned 6 of 8 duplicate activity pairs and explicitly left 3 items for Stef's decision.
-- Stef answered all 3 tonight (2026-09-24) via chat:
--   1. "Web / Organic" dup       -> keep the live-route copy (688e446c), drop the orphan (ddf10304)
--   2. "BDM Self-gen" dup        -> keep winTarget 33 (bd6d1d12, already on the live route),
--                                    drop the winTarget-4 orphan copy (7522c91b)
--   3. Extra "Unassigned" activity -> drop the orphan copy (2a4406de), keep abed9bba
--
-- Deleting those 3 activities means the 2 orphaned duplicate routes (fb4f23ad "Inbound",
-- a5e86f35 "Outbound") end up with ZERO activities left on them -- so this migration also drops
-- those 2 routes, plus the already-fully-empty orphan "Partner" route (102b26d8, its only
-- activity was removed by last night's migration). That completes the route-level cleanup that
-- 2026-09-23's migration deliberately deferred ("a bigger, separate piece of work").
--
-- Verified live via CFG in the browser before writing this:
--   - All 3 deleted activities: 0 campaigns reference any of them, 0 other activities' preChain
--     reference them either.
--   - All 3 deleted routes: 0 activities remain on any of them once the above activities are gone
--     (checked activity-by-activity, not just assumed).
--   - All 12 real campaigns' activity_id values are untouched -- every one already points at a
--     "keep" copy. (2 campaigns -- "Denn campaign" and "RLS TEST CAMPAIGN" -- have a null
--     activity_id; that's a separate, pre-existing data-quality item, unrelated to this cleanup,
--     not touched here.)
--
-- After running: Routes drops from 6 to 3 (Inbound/Outbound/Partner, one each, fully deduped).
-- Activities drops from 12 to 9 (1 Unassigned + 8 real). All 12 campaigns unaffected.

BEGIN;

DELETE FROM activities
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id IN (
      '2a4406de-6991-48a7-a01b-4caf733e212a', -- duplicate "Unassigned" (0 campaigns, 0 preChain refs)
      'ddf10304-186d-4f0b-bca1-bace573b37e3',  -- duplicate "Web / Organic" (0 campaigns; Stef: keep live copy 688e446c)
      '7522c91b-d463-4b8f-a9ae-199374e41b6d'   -- duplicate "BDM Self-gen", winTarget 4 (0 campaigns; Stef: keep winTarget 33 on bd6d1d12)
    );
  -- expect 3 rows

DELETE FROM routes
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id IN (
      'fb4f23ad-52b0-445b-aa88-29249cd240f5', -- duplicate "Inbound" -- now 0 activities left on it
      'a5e86f35-8cbe-4009-b40d-9f121f4021af', -- duplicate "Outbound" -- now 0 activities left on it
      '102b26d8-a834-4b6f-8d03-64ae69fdb8d3'  -- duplicate "Partner" -- already 0 activities left on it
    );
  -- expect 3 rows

COMMIT;

-- Not executed by this session -- prepared for Stef to review and run himself, per standing
-- process.
