-- 2026-10-14 -- Account-based (ABM) benchmark step: MAA (marketing accepted account) -> SAO.
-- Stef: MAA counts accounts, MQL counts people; compare the lead path without MAA AND add a separate ABM comparison.
-- Additive, safe to re-run. Rollback: 2026-10-14-migration-benchmarks-abm-step-ROLLBACK.sql
BEGIN;
ALTER TABLE public.funnel_benchmarks DROP CONSTRAINT IF EXISTS funnel_benchmarks_step_check;
ALTER TABLE public.funnel_benchmarks ADD CONSTRAINT funnel_benchmarks_step_check
  CHECK (step IN ('lead_mql','mql_sql','sql_opp','opp_win','abm_maa_sao'));
-- Which gates the ABM comparison runs between: {"from_gate_id":"...","to_gate_id":"..."}
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS benchmark_abm jsonb;

INSERT INTO public.funnel_benchmarks (industry, region, step, typical, low, high, confidence, sources, note, checked_on, version)
SELECT i.industry, r.region, 'abm_maa_sao', 0.21, 0.14, 0.22, i.confidence,
  '[{"title":"Demandbase State of ABM 2026 (1,452 tenants), via RevenueFlow","url":"https://www.revenueflow.com/blog/abm-benchmarks"},{"title":"TOPO / Gartner MQA-to-SQO 21.3%, via The Starr Conspiracy ABM benchmarks","url":"https://www.thestarrconspiracy.com/insights/benchmarks/account-based-marketing-benchmarks-2025"}]'::jsonb,
  'Account-level: marketing-qualified account to sales-qualified/accepted opportunity. Demandbase median 22% (mature programmes) vs 14% (less mature); TOPO/Gartner MQA->SQO 21.3%. Definitions differ from MAA->SAO and samples skew to NA/EMEA enterprise (>$50k ACV); vendor telemetry.'
  || i.extra || ' Global figure: no public ' || r.region || '-specific split found (Oct 2026).',
  DATE '2026-10-14', '2026-Q4'
FROM (VALUES ('generic','medium',''),
             ('saas','low',' No measured SaaS-specific figure (a 6sense 15-25% example is illustrative only); generic used.'),
             ('tech_hardware','low',' No measured hardware figure (a 6sense manufacturing 8-12% example is illustrative only); generic used.')) AS i(industry, confidence, extra)
CROSS JOIN (VALUES ('NA'),('EU'),('APAC')) AS r(region)
ON CONFLICT (industry, region, step) DO NOTHING;
COMMIT;
-- Check: expect 9 rows
-- SELECT count(*) FROM public.funnel_benchmarks WHERE step='abm_maa_sao';
