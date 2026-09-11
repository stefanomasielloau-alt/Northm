-- 2026-09-11 -- READ-ONLY diagnostic, step 1 of renaming org-prefixed roles back to
-- plain generic names (Stef confirmed: "okay for you to name back to the standard
-- planner roles"). Nothing here writes or deletes anything.
--
-- Lists every role, its organization, and whether its name already matches one of
-- the 5 standard generic names this project uses elsewhere (Admin / Manager /
-- Planner / Super User / Viewer). Review the "non_standard" rows below -- those are
-- the actual rename candidates (e.g. "BG Planner" -> "Planner"). Paste the result
-- back and I'll build the actual rename script only for the rows you confirm,
-- rather than guessing a prefix-stripping rule that might get an edge case wrong.

select
  r.id as role_id,
  o.name as org_name,
  r.name as current_role_name,
  case when r.name in ('Admin','Manager','Planner','Super User','Viewer')
       then 'already standard'
       else 'non_standard -- candidate for rename' end as status,
  (select count(*) from profiles p where p.role_id = r.id) as users_on_this_role
from roles r
join organizations o on o.id = r.org_id
order by status desc, o.name, r.name;
