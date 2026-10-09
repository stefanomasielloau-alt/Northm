-- 2026-10-09  Board report access, option C: a per-PERSON override on top of the per-role setting.
-- Run in the Supabase SQL editor for project rcmocuubeajnqjltuwdv, AFTER 2026-10-09-migration-board-report-access.sql. Safe to run more than once.
-- ORDER DOES NOT MATTER for the app: until this is run, the Board report simply follows the role (no per-person control is shown).
-- Rollback: 2026-10-09-migration-board-report-person-override-ROLLBACK.sql
--
-- profiles.board_report_override
--   NULL  = follow the person's role (default; nobody changes)
--   TRUE  = always allowed, even if their role is not approved
--   FALSE = always blocked, even if their role is approved
-- Platform admins (Super Admin) always see the Board report regardless.
-- Set it in Configuration -> Users (new "Board report" column: Follow role / Always allow / Always block).
-- No data is deleted and no RLS policy is added: the existing profiles policies already cover the new column.

alter table public.profiles
  add column if not exists board_report_override boolean;

-- Read-only checks afterwards:
--   select name, role_id, board_report_override from public.profiles order by name;
--
-- SECURITY CHECK (read-only, please run once): people must not be able to change their OWN override.
-- List who may UPDATE profiles; the self-update policy, if any, should not let a normal user change role_id / module_overrides
-- / this column on their own row (the same protection module_overrides already needs):
--   select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='profiles' and cmd in ('UPDATE','ALL');
-- If a normal user CAN update their own row freely, tell me and I will add a guard before you rely on this control.

notify pgrst, 'reload schema';
