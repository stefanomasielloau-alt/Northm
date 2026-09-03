-- 2026-09-03: Data repair -- roles wrongly mass-reassigned to Tac-Tik (v2)
--
-- v2 fix: the original file's audit_log INSERT used to_char(now(), ...) for the `ts`
-- column, producing text -- but `ts` is timestamp with time zone, so Postgres rejected it
-- (error 42804, "column ts is of type timestamp with time zone but expression is of type
-- text"). This version passes now() directly instead. Nothing else changed -- the UPDATEs
-- never ran (the whole transaction rolled back on the INSERT error), so this is safe to
-- run in full, same as the original was meant to be.
--
-- What happened: all 10 rows in `roles` currently show org_id = Tac-Tik. Cross-checking
-- each affected user's profiles.role_id (a separate FK that was NOT touched) against the
-- roles table shows exactly which rows really belong to Bodgit&Scarpa and to the RLS
-- Script Test org -- see the chat writeup for the full analysis. Two roles are directly
-- confirmed by a live profile reference (David Dockrill / Bruce Rawsthorne / Claudia all
-- point at the same "Admin" row; the RLS Script Tester points at "Admin (RLS test org)").
-- The other three (one Manager, one Planner, one Viewer) have no current profile pointing
-- at either copy in their pair, but each pair's permissions are byte-for-byte identical
-- (confirmed live), so it is safe to send one of each pair back to Bodgit&Scarpa to restore
-- its full standard 4-role set (Admin/Manager/Viewer/Planner), matching how it was
-- originally seeded via the "clone roles from another org" feature.
--
-- Safe to run once. Each UPDATE targets a specific role id, so re-running this after it
-- has already succeeded is a no-op (the WHERE clause will already be false).

BEGIN;

-- David Dockrill / Bruce Rawsthorne / Claudia's shared "Admin" role -> Bodgit&Scarpa
UPDATE roles SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
WHERE id = '53eafbf5-c0f1-4962-b4c4-18351c446067' AND org_id <> '8eae1af2-8af8-4224-94c1-5ddf2ff237f2';

-- RLS Script Tester's "Admin (RLS test org)" role -> RLS Script Test org
UPDATE roles SET org_id = 'c98f5ec7-d7e1-4078-82fc-cf0900c2edeb'
WHERE id = '4fb42831-3fe2-4a63-8292-c5fb40820f17' AND org_id <> 'c98f5ec7-d7e1-4078-82fc-cf0900c2edeb';

-- One of the two identical "Manager" rows -> Bodgit&Scarpa (the other stays with Tac-Tik)
UPDATE roles SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
WHERE id = '03b4caa9-b1db-4736-b3ab-7008aaa57de4' AND org_id <> '8eae1af2-8af8-4224-94c1-5ddf2ff237f2';

-- One of the two identical "Planner" rows -> Bodgit&Scarpa (the other stays with Tac-Tik)
UPDATE roles SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
WHERE id = '18395d8f-7597-41a3-a9eb-dd4786ad58ec' AND org_id <> '8eae1af2-8af8-4224-94c1-5ddf2ff237f2';

-- One of the two identical "Viewer" rows -> Bodgit&Scarpa (the other, referenced by Stefm, stays with Tac-Tik)
UPDATE roles SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
WHERE id = '50cd7020-a0ad-47d6-b86b-158bcf9c958e' AND org_id <> '8eae1af2-8af8-4224-94c1-5ddf2ff237f2';

-- Audit trail entries (org_id set to Tac-Tik, matching how this app's own logAudit()
-- always records against the acting user's own org, not the affected org)
INSERT INTO audit_log (ts, what, detail, user_id, org_id) VALUES
  (now(), 'move role to organization (data repair)', 'Admin -> Bodgit&Scarpa (fixing role org_id mix-up)', '871fd585-5734-4b71-9ecd-422ec90f2ad3', '6373bb04-fc25-4a72-b43b-ccd8bb110cda'),
  (now(), 'move role to organization (data repair)', 'Admin (RLS test org) -> RLS Script Test 1786518151369 (fixing role org_id mix-up)', '871fd585-5734-4b71-9ecd-422ec90f2ad3', '6373bb04-fc25-4a72-b43b-ccd8bb110cda'),
  (now(), 'move role to organization (data repair)', 'Manager -> Bodgit&Scarpa (fixing role org_id mix-up)', '871fd585-5734-4b71-9ecd-422ec90f2ad3', '6373bb04-fc25-4a72-b43b-ccd8bb110cda'),
  (now(), 'move role to organization (data repair)', 'Planner -> Bodgit&Scarpa (fixing role org_id mix-up)', '871fd585-5734-4b71-9ecd-422ec90f2ad3', '6373bb04-fc25-4a72-b43b-ccd8bb110cda'),
  (now(), 'move role to organization (data repair)', 'Viewer -> Bodgit&Scarpa (fixing role org_id mix-up)', '871fd585-5734-4b71-9ecd-422ec90f2ad3', '6373bb04-fc25-4a72-b43b-ccd8bb110cda');

COMMIT;

-- Verification: Bodgit&Scarpa should now show exactly 4 roles (Admin/Manager/Viewer/Planner),
-- Tac-Tik should still show 5 (Admin/Manager/Super User/Viewer/Planner), RLS Script Test
-- should show 1 (Admin (RLS test org)).
SELECT o.name AS organization, r.name AS role, r.id
FROM roles r JOIN organizations o ON o.id = r.org_id
ORDER BY o.name, r.name;
