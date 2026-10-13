-- ROLLBACK for 2026-10-14-migration-pipeline-gate.sql. Any chosen pipeline stage is lost; the app goes back to automatic.
ALTER TABLE public.org_settings DROP COLUMN IF EXISTS pipeline_gate_id;
NOTIFY pgrst, 'reload schema';
