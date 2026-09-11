-- 2026-09-11 -- Rename org-prefixed roles back to the standard generic names,
-- per the audit Stef reviewed (2026-09-11-role-names-audit-diagnostic.sql) and
-- confirmed: "Yeah. I'm okay for you to name back to the standard planner
-- roles." Only the 6 non_standard rows from that audit are touched below, by
-- exact role_id (not by name pattern-matching, so there's no risk of an edge
-- case elsewhere getting caught by a stray prefix rule).
--
-- Safe to re-run: each UPDATE is scoped to id + current name, so if a row has
-- already been renamed (name no longer matches), that line is just a no-op.
-- Nothing here touches org_id, role permissions/config, or which users hold
-- the role -- name only.

begin;

update roles set name = 'Admin'      where id = '20876bce-09a6-4d9a-86df-0489cab1eb9b' and name = 'BG Admin';       -- Bodgit&Scarpa
update roles set name = 'Manager'    where id = 'a3c93211-7f11-4af6-a18e-f6efe045158d' and name = 'BG Manager';     -- Bodgit&Scarpa
update roles set name = 'Planner'    where id = 'd95a12e3-9e77-4ed6-a967-0bd150e0612e' and name = 'BG Planner';     -- Bodgit&Scarpa
update roles set name = 'Super User' where id = '2ea71373-ad34-48ba-9805-11b7fd3fa232' and name = 'BG Super User';  -- Bodgit&Scarpa
update roles set name = 'Viewer'     where id = '38914783-1767-498f-a4e3-6f12c78180aa' and name = 'BG Viewer';      -- Bodgit&Scarpa
update roles set name = 'Admin'      where id = '4fb42831-3fe2-4a63-8292-c5fb40820f17' and name = 'Admin (RLS test org)'; -- RLS Script Test 1786518151369

-- Verification: re-run the audit query and confirm every row now shows
-- "already standard". (Tac-Tik's 5 roles were already standard and are
-- untouched by this script.)
select
  r.id as role_id,
  o.name as org_name,
  r.name as current_role_name,
  case when r.name in ('Admin','Manager','Planner','Super User','Viewer')
       then 'already standard'
       else 'non_standard -- still needs review' end as status
from roles r
join organizations o on o.id = r.org_id
order by status desc, o.name, r.name;

commit;

-- Rollback note: if you need to undo this before running anything else,
-- the six original names were (by role_id):
--   20876bce-09a6-4d9a-86df-0489cab1eb9b -> 'BG Admin'
--   a3c93211-7f11-4af6-a18e-f6efe045158d -> 'BG Manager'
--   d95a12e3-9e77-4ed6-a967-0bd150e0612e -> 'BG Planner'
--   2ea71373-ad34-48ba-9805-11b7fd3fa232 -> 'BG Super User'
--   38914783-1767-498f-a4e3-6f12c78180aa -> 'BG Viewer'
--   4fb42831-3fe2-4a63-8292-c5fb40820f17 -> 'Admin (RLS test org)'
