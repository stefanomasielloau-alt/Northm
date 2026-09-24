-- 2026-09-24 -- Small, SAFE follow-up to 2026-09-23's activity/route dedup work
-- (see claude/2026-09-23-migration-activity-dedup-cleanup.sql and its pre-deletion snapshot json
-- for the full history). NOT YET RUN. Prepared for Stef's review.
--
-- Context: Stef flagged tonight (2026-09-24) that an "Unassigned" system row still appears
-- twice in Activities. Re-investigated live via CFG in the browser. Root cause is the SAME
-- duplicate-route seeding already diagnosed 2026-09-23 (ROUTES table has Inbound/Outbound/
-- Partner each seeded twice) -- most of the fallout from that was already cleaned up last night,
-- but 3 items were explicitly deferred pending Stef's decision:
--   1. "Web / Organic" -- 2 near-identical unused copies, needs Stef's call on which to keep
--   2. "BDM Self-gen" -- 2 copies with a genuinely DIFFERENT winTarget (4 vs 33), needs Stef's
--      call on which number is correct
--   3. The 2 "Unassigned" system activity rows themselves -- previously judged cosmetic/low-risk
--      and left alone; Stef is now asking about this specifically
-- Items 1 and 2 are still open (asked Stef directly in chat tonight, not guessing) and are NOT
-- included here. This file covers only what's unambiguous and safe right now:
--
--   a) The extra "Unassigned" activity row (2a4406de) -- confirmed live: 0 campaigns reference
--      it, 0 other activities' preChain reference it, same as its sibling that's being kept.
--      Its own route (fb4f23ad, orphan "Inbound") is NOT being dropped here, because the
--      still-undecided "Web / Organic" duplicate (ddf10304) also lives on that route --
--      that route waits for item 1's answer.
--   b) The orphan "Partner" route (102b26d8) -- confirmed live: 0 activities of ANY kind sit on
--      it any more (its only activity, the duplicate "Partner Led", was already deleted by last
--      night's migration). Fully empty, safe to drop on its own regardless of items 1/2.
--
-- After running: Activities admin list drops from 2 "Unassigned" rows to 1. Routes drops from
-- 6 to 5 (Partner's duplicate gone; Inbound and Outbound still have their duplicate pair each,
-- pending items 1 and 2). All 12 real campaigns unaffected -- neither deleted row is referenced
-- by any of them.

BEGIN;

DELETE FROM activities
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id = '2a4406de-6991-48a7-a01b-4caf733e212a'; -- duplicate "Unassigned", 0 campaigns, 0 preChain refs
  -- expect 1 row

DELETE FROM routes
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id = '102b26d8-a834-4b6f-8d03-64ae69fdb8d3'; -- duplicate "Partner", 0 activities left on it
  -- expect 1 row

COMMIT;

-- Not executed by this session -- prepared for Stef to review and run himself, per standing
-- process.
