-- North V2 / Ordo (Strategy) — Gap 1: per-activity win editing
-- Run this once in Supabase's SQL editor for the North project.
--
-- What this does:
--   Adds a single nullable numeric column to public.activities. NULL means
--   "no explicit target set — follow the even split of the org's win target",
--   which is exactly today's behaviour. So this column can be added with no
--   backfill: every existing activity row gets NULL and nothing changes on
--   screen until a planner explicitly types a number into Activity plan.
--
-- Why NULL as the "auto" state, not a computed number:
--   Ordo's org-level win target (org_settings.win_target) can change at any
--   time. If we backfilled every activity with today's computed even-split
--   number, that number would go stale the next time the org target changes
--   or an activity is added/retired. Leaving it NULL keeps "auto" activities
--   auto forever, and a planner can always revert to auto with one click
--   (Ordo's "reset to auto" link), which just sets this column back to NULL.
--
-- Safety: additive only. No existing column, row, or other table is touched.
-- Reportus and other modules select explicit column lists from activities
-- and are unaffected by a new column.

alter table public.activities
  add column if not exists win_target numeric null;

comment on column public.activities.win_target is
  'Explicit planned wins for this activity, entered in Ordo > Activity plan. NULL = no override; the app falls back to an even split of org_settings.win_target across active, assigned activities.';
