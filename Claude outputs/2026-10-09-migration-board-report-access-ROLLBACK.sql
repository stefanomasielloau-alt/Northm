-- ROLLBACK for 2026-10-09-migration-board-report-access.sql
-- Run only if you want the "View board report" permission removed completely.
-- Effect: the app falls back to today's behaviour (Board report hidden from Strategy's menu, still
-- reachable from Reporting) because a missing column means "feature not switched on".
-- This drops one boolean column and nothing else. The values in it (which roles were ticked) are lost,
-- so before running, you can save them with:
--   select id, org_id, name, view_board_report from public.roles where view_board_report = true;

alter table public.roles
  drop column if exists view_board_report;
