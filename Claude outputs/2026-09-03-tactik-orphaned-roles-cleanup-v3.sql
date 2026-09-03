-- 2026-09-03: Tac-Tik orphaned Roles & Users cleanup (backlog item 5) -- v3
-- FOR REVIEW ONLY -- NOT RUN. Per standing rule, nothing that deletes data runs without
-- your explicit go-ahead. This file is prepared so you can review exactly what it would
-- remove before deciding whether to run it.
--
-- Fix from v2: v2's DELETE hit a second real reference and errored --
--   ERROR: 23503: update or delete on table "roles" violates foreign key constraint
--   "org_invites_role_id_fkey" on table "org_invites"
--   DETAIL: Key (id)=(f211fc8d-62e4-4aef-a3c0-1a4faa4a47ed) is still referenced from
--   table "org_invites".
-- v2 only checked profiles.role_id; a pending/unexpired invite (org_invites.role_id) can
-- also point at a role with nobody currently on it. Since this was inside v2's BEGIN
-- block, the failed DELETE was NOT committed -- Postgres aborts the whole transaction on
-- error, so nothing was actually deleted by v2's run. No data was lost or changed.
-- v3 excludes roles referenced by EITHER profiles.role_id OR org_invites.role_id. These
-- are the only two role_id references in North's own application code (confirmed by
-- searching every module's Supabase calls) -- if a third, DB-only reference exists that
-- the app code doesn't use, this would still fail safely the same way v2 did (the
-- transaction aborts, nothing commits) rather than partially delete anything.
--
-- Background: org "Tac-Tik" has role rows with no profile referencing them -- flagged as a
-- cleanup opportunity in the 2026-09-02 backlog doc, never actioned. This session's separate
-- "Bodgit&Scarpa roles wiped" incident (see running-log, 2026-09-03) was a DIFFERENT,
-- already-fully-repaired problem (roles that belonged to OTHER orgs had been reassigned onto
-- Tac-Tik's org_id) -- that repair is done and confirmed. This file is about a second,
-- distinct thing: roles that genuinely belong to Tac-Tik but that nobody currently holds
-- and nothing currently invites someone into.

-- If v2's run left an open transaction in your SQL editor session, run this first (safe
-- either way -- a no-op if there's nothing open):
ROLLBACK;

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
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM org_invites i WHERE i.role_id = r.id);

-- STEP 2 -- only after reviewing STEP 1's output and confirming every row listed is
-- genuinely safe to remove. Wrapped in a transaction so a mistake can be rolled back
-- before COMMIT if the STEP 1 review turns out to have missed something.
BEGIN;

DELETE FROM roles r
WHERE r.org_id = (SELECT id FROM organizations WHERE name = 'Tac-Tik')
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM org_invites i WHERE i.role_id = r.id);

-- Verify before committing -- should return 0 rows if the delete matched STEP 1 exactly.
SELECT r.id, r.name FROM roles r
WHERE r.org_id = (SELECT id FROM organizations WHERE name = 'Tac-Tik')
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.role_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM org_invites i WHERE i.role_id = r.id);

-- If that verification looks right, run:
-- COMMIT;
-- If anything looks wrong, run:
-- ROLLBACK;
