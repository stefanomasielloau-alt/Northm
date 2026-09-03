-- 2026-09-03: Tac-Tik orphaned Roles & Users cleanup (backlog item 5) -- v2
-- FOR REVIEW ONLY -- NOT RUN. Per standing rule, nothing that deletes data runs without
-- your explicit go-ahead. This file is prepared so you can review exactly what it would
-- remove before deciding whether to run it.
--
-- Fix from v1: v1 filtered on r.org_id = '6373bb04', which errored --
--   ERROR: 22P02: invalid input syntax for type uuid: "6373bb04"
-- '6373bb04' was a short/truncated id carried over from an earlier doc, not a real UUID,
-- and roles.org_id is a UUID column. This version looks the org up by name instead of a
-- hardcoded id -- safer regardless of what the real UUID is, and self-documenting.
--
-- Background: org "Tac-Tik" has role rows with no profile referencing them -- flagged as a
-- cleanup opportunity in the 2026-09-02 backlog doc, never actioned. This session's separate
-- "Bodgit&Scarpa roles wiped" incident (see running-log, 2026-09-03) was a DIFFERENT,
-- already-fully-repaired problem (roles that belonged to OTHER orgs had been reassigned onto
-- Tac-Tik's org_id) -- that repair is done and confirmed. This file is about a second,
-- distinct thing: roles that genuinely belong to Tac-Tik but that nobody currently holds.

-- STEP 0 -- confirms the org name resolves to exactly one id before anything else runs.
-- If this returns 0 or more than 1 row, stop and tell Claude -- the name below may not
-- match exactly (e.g. spacing/casing), and the rest of this file shouldn't run blind.
SELECT id, name FROM organizations WHERE name = 'Tac-Tik';

-- STEP 1 -- run this next, on its own, and read the result before going any further.
-- This is the exact set STEP 2 would delete. If anything in this list looks like it
-- SHOULD have a person on it (a role you know is meant to be assigned soon, a template
-- role you want to keep even though it's currently unused), stop here and tell Claude --
-- the WHERE clause below can be narrowed to exclude specific role ids.
SELECT r.id, r.name, r.org_id, r.description
FROM roles r
WHERE r.org_id = (SELECT id FROM organizations WHERE name = 'Tac-Tik')
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id);

-- STEP 2 -- only after reviewing STEP 1's output and confirming every row listed is
-- genuinely safe to remove. Wrapped in a transaction so a mistake can be rolled back
-- before COMMIT if the STEP 1 review turns out to have missed something.
BEGIN;

DELETE FROM roles r
WHERE r.org_id = (SELECT id FROM organizations WHERE name = 'Tac-Tik')
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id);

-- Verify before committing -- should return 0 rows if the delete matched STEP 1 exactly.
SELECT r.id, r.name FROM roles r
WHERE r.org_id = (SELECT id FROM organizations WHERE name = 'Tac-Tik')
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id);

-- If that verification looks right, run:
-- COMMIT;
-- If anything looks wrong, run:
-- ROLLBACK;
