-- 2026-09-10 -- READ-ONLY diagnostic for the Strategy/Ordo crash-loop incident.
-- Nothing here writes or deletes anything. Run in Supabase's SQL editor and paste
-- the results back.
--
-- Context: Strategy (Ordo.html) crashed on open with
--   "Cannot read properties of undefined (reading 'id')" at Ordo.html:1103
-- inside buildHist(), which reads chain()[chain().length-1] -- i.e. the last
-- ACTIVE gate. That's only undefined if the org being loaded has zero rows in
-- `gates` with active = true. The app has been made defensive so this can no
-- longer crash/loop the sign-in, but the underlying question -- WHY does an org
-- have zero active gates right now -- is still open, and is very likely related
-- to this morning's Bodgit&Scarpa data-recovery work (item 68), since `gates`
-- was one of the 34 tables repaired.

-- 1. Every org's gate count, split by active/inactive. Any org showing 0 under
--    "active_gates" is the one that would crash Strategy right now.
select
  o.id as org_id,
  o.name as org_name,
  count(g.id) filter (where g.active = true)  as active_gates,
  count(g.id) filter (where g.active = false) as inactive_gates,
  count(g.id) as total_gates
from organizations o
left join gates g on g.org_id = o.id
group by o.id, o.name
order by active_gates asc, org_name;

-- 2. Full detail for whichever org(s) showed 0 active_gates above -- replace
--    <ORG_ID> with that org's id from query 1's output. Shows every gate row
--    for that org regardless of active flag, so we can tell "genuinely has no
--    gates at all" apart from "has gates, but all got flipped to inactive".
-- select id, name, code, "order", entry, rate, active, note
-- from gates
-- where org_id = '<ORG_ID>'
-- order by "order";

-- 3. Cross-check against the "RLS Test Org" mix-up from this morning's incident
--    (org_id 6373bb04-fc25-4a72-b43b-ccd8bb110cda) and Bodgit&Scarpa
--    (8eae1af2-8af8-4224-94c1-5ddf2ff237f2) specifically, in case either is the
--    affected org and isn't obviously named in query 1's output.
select id, name, code, "order", entry, rate, active, note
from gates
where org_id in ('6373bb04-fc25-4a72-b43b-ccd8bb110cda','8eae1af2-8af8-4224-94c1-5ddf2ff237f2')
order by org_id, "order";
