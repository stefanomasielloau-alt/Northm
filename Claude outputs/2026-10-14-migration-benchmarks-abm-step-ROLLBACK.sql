-- ROLLBACK for 2026-10-14-migration-benchmarks-abm-step.sql
BEGIN;
DELETE FROM public.funnel_benchmarks WHERE step='abm_maa_sao';
ALTER TABLE public.funnel_benchmarks DROP CONSTRAINT IF EXISTS funnel_benchmarks_step_check;
ALTER TABLE public.funnel_benchmarks ADD CONSTRAINT funnel_benchmarks_step_check CHECK (step IN ('lead_mql','mql_sql','sql_opp','opp_win'));
ALTER TABLE public.org_settings DROP COLUMN IF EXISTS benchmark_abm;
COMMIT;
