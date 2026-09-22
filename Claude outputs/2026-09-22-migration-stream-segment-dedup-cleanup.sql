-- 2026-09-22 — Stream & segment dedup cleanup (Tac-Tik, org_id 6373bb04-fc25-4a72-b43b-ccd8bb110cda)
--
-- Context: Finding 1 from the validations-banner review -- Tac-Tik's streams and segments have
-- the same duplicate-seed-data pattern as the regions/gates already cleaned up today, but these
-- pairs are TRUE clones (every field identical between the two rows in a pair), not just
-- same-named rows with different rates. Stef said to fix this ("Ok fix Findings 1").
--
-- Unlike the region cleanup, NO campaign reassignment is needed here. I checked every array in
-- CFG for any field referencing any of the 18 duplicate ids (streams and segments), and the only
-- hit was campaigns.segmentId -- 10 of Tac-Tik's 12 campaigns reference a segment id, and every
-- one of them already points at the copy being KEPT below, never the copy being removed. So this
-- is a plain delete of orphaned duplicate rows.
--
-- Full before-state, decision reasoning and per-campaign reference list:
--   claude/2026-09-22-stream-segment-dedup-pre-deletion-snapshot.json
--
-- Rule applied: keep whichever copy is actually referenced by live data; when neither copy is
-- referenced (true for all 5 stream pairs, and for the Unassigned segment pair, both system rows
-- with unassigned:true), keep the first/lower-id copy for consistency.

BEGIN;

-- 5 duplicate streams (all unreferenced by anything -- pure orphaned rows)
DELETE FROM streams
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id IN (
      '25eace40-cd5c-411f-bba3-2dbbbbe9f905', -- Net New (dup)
      '7b2dde1b-9a0e-4572-bf38-cfaa0214346f', -- Expand (dup)
      'ec114174-481e-4054-84e7-ab78b1a1b8cc', -- Channel (dup)
      'f4d17038-e2df-456b-80fc-587356648030', -- MKT Expand (dup)
      '46706415-809b-4a2e-a6c7-edb92f6bdb04'  -- Unassigned (dup system row)
    );
  -- expect 5 rows

-- 4 duplicate segments (the copy removed in each pair has 0 campaign references; the copy kept
-- is the one real campaigns already use)
DELETE FROM segments
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id IN (
      'c17646fa-54a7-4b4c-89c9-e61aa5e3bd51', -- Enterprise (dup, unreferenced; kept copy 3bdf0428 has 5 campaigns)
      '865a39fa-d030-4dde-96fc-f76a49271899', -- Mid-Market (dup, unreferenced; kept copy 14623424 has 4 campaigns)
      'ad047496-5e39-4d87-a37b-fa4930f31860', -- SMB (dup, unreferenced; kept copy 264a6cb1 has 1 campaign)
      '82d9306e-756d-421d-be99-53d1050bfe88'  -- Unassigned (dup system row)
    );
  -- expect 4 rows

COMMIT;

-- After running: reload North/Strategy and confirm stream count drops from 10 to 5, segment
-- count drops from 8 to 4, and the validations banner's stream-mix / segment-mix warnings clear.
-- All 12 campaigns should be unaffected (their segmentId values were never touched).
