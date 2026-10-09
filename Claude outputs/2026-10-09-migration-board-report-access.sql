-- 2026-10-09  Board report access (option B): a per-ROLE permission "View board report".
-- Run in the Supabase SQL editor for project rcmocuubeajnqjltuwdv. Safe to run more than once.
-- ORDER DOES NOT MATTER for the app: the pages treat a missing column as "feature not switched on yet"
-- and behave exactly as they do today until this has been run. Rollback: 2026-10-09-migration-board-report-access-ROLLBACK.sql
--
-- What it does
--   1. Adds roles.view_board_report (boolean, default false = new roles do NOT get it).
--   2. Keeps today's admins working: any existing role that already has Configure gets it switched on.
--      Everything else starts OFF; tick it per role in Configuration -> Roles ("Board report" column).
-- Platform admins (Super Admin) always see the Board report regardless of this flag.
-- No RLS change: the existing roles policies already cover the new column. No data is deleted.

alter table public.roles
  add column if not exists view_board_report boolean not null default false;

update public.roles
   set view_board_report = true
 where config = true
   and view_board_report = false;

-- Check afterwards (read-only):
--   select name, org_id, config, view_board_report from public.roles order by org_id, name;

-- Reserved for a possible later "option C" (per-person override). NOT created here:
--   alter table public.profiles add column if not exists board_report_override boolean;  -- null = follow role
