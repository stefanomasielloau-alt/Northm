-- 2026-09-03: Tac-Tik orphaned Roles & Users cleanup (backlog item 5).
-- FOR REVIEW ONLY -- NOT RUN. Per standing rule, nothing that deletes data runs without
-- your explicit go-ahead. This file is prepared so you can review exactly what it would
-- remove before deciding whether to run it.
--
-- Background: org 6373bb04 ("Tac-Tik") has role rows with no profile referencing them --
-- flagged as a cleanup opportunity in the 2026-09-02 backlog doc, never actioned. This
-- session's separate "Bodgit&Scarpa roles wiped" incident (see running-log, 2026-09-03) was
-- a DIFFERENT, already-fully-repaired problem (roles that belonged to OTHER orgs had been
-- reassigned onto Tac-Tik's org_id) -- that repair is done and confirmed. This file is
-- about a second, distinct thing: roles that genuinely belong to Tac-Tik but that nobody
-- currently holds. No live database query access from this session (git only, not a DB
-- connection) -- so this can't be run blind even if it were otherwise safe to. It also uses
-- a live SELECT-based WHERE clause rather than hardcoded row ids, which is both safer
-- (nothing here can go stale between when this was written and when you run it) and more
-- correct (it always reflects whatever the orphaned set actually is at run time).

-- STEP 1 -- run this first, on its own, and read the result before going any further.
-- This is the exact set STEP 2 would delete. If anything in this list looks like it
-- SHOULD have a person on it (a role you know is meant to be assigned soon, a template
-- role you want to keep even though it's currently unused), stop here and tell Claude --
-- the WHERE clause below can be narrowed to exclude specific role ids.
SELECT r.id, r.name, r.org_id, r.description
FROM roles r
WHERE r.org_id = '6373bb04'
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id);

-- STEP 2 -- only after reviewing STEP 1's output and confirming every row listed is
-- genuinely safe to remove. Wrapped in a transaction so a mistake can be rolled back
-- before COMMIT if the STEP 1 review turns out to have missed something.
BEGIN;

DELETE FROM roles r
WHERE r.org_id = '6373bb04'
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id);

-- Verify before committing -- should return 0 rows if the delete matched STEP 1 exactly.
SELECT r.id, r.name FROM roles r
WHERE r.org_id = '6373bb04'
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id);

-- If that verification looks right, run:
-- COMMIT;
-- If anything looks wrong, run:
-- ROLLBACK;
