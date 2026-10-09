-- ROLLBACK for 2026-10-09-migration-board-report-person-override.sql
-- Effect: per-person overrides disappear; the Board report goes back to following each person's ROLE only (option B). Nothing else changes.
-- The saved overrides are lost, so before running you can save them with:
--   select id, name, board_report_override from public.profiles where board_report_override is not null;
alter table public.profiles drop column if exists board_report_override;
notify pgrst, 'reload schema';
