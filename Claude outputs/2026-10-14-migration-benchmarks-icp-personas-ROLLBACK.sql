-- ROLLBACK for 2026-10-14-migration-benchmarks-icp-personas.sql
-- WARNING: drops personas and the benchmark library, and any ICP overrides / gate mappings entered since.
-- Export them first if they matter (SELECT * FROM public.personas; etc.).
BEGIN;
DROP TABLE IF EXISTS public.personas;
DROP TABLE IF EXISTS public.funnel_benchmarks;
ALTER TABLE public.gates              DROP COLUMN IF EXISTS benchmark_step;
ALTER TABLE public.prospectus_filters DROP COLUMN IF EXISTS bench_industry;
ALTER TABLE public.prospectus_filters DROP COLUMN IF EXISTS bench_region;
ALTER TABLE public.prospectus_filters DROP COLUMN IF EXISTS bench_overrides;
ALTER TABLE public.org_settings       DROP COLUMN IF EXISTS benchmark_icp_id;
ALTER TABLE public.campaigns          DROP COLUMN IF EXISTS benchmark_icp_id;
COMMIT;
