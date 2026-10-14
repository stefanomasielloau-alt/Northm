-- 2026-10-14 -- Industry benchmark library + ICP industry/region (with org overrides) + buyer personas.
-- Stef: benchmark rates from web research where there is no history or a comparison is needed; generic, Tech
-- hardware and SaaS; regions North America, EU, APAC; a "base" set updated quarterly; each org can specify its
-- own on its ICP profiles (Targets); buyer personas (one combined form) linked to an ICP profile.
-- Additive, safe to re-run (the seed only inserts rows that are missing). Rollback: ...-ROLLBACK.sql
BEGIN;

-- 1. Platform-wide base benchmark library (read by everyone signed in; written by platform admins only)
CREATE TABLE IF NOT EXISTS public.funnel_benchmarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry    text NOT NULL CHECK (industry IN ('generic','tech_hardware','saas')),
  region      text NOT NULL CHECK (region IN ('NA','EU','APAC')),
  step        text NOT NULL CHECK (step IN ('lead_mql','mql_sql','sql_opp','opp_win')),
  typical     numeric NOT NULL CHECK (typical > 0 AND typical <= 1),
  low         numeric CHECK (low IS NULL OR (low > 0 AND low <= 1)),
  high        numeric CHECK (high IS NULL OR (high > 0 AND high <= 1)),
  confidence  text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  sources     jsonb NOT NULL DEFAULT '[]'::jsonb,
  note        text NOT NULL DEFAULT '',
  checked_on  date NOT NULL DEFAULT current_date,
  version     text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (industry, region, step)
);
ALTER TABLE public.funnel_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS funnel_benchmarks_select ON public.funnel_benchmarks;
CREATE POLICY funnel_benchmarks_select ON public.funnel_benchmarks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS funnel_benchmarks_write ON public.funnel_benchmarks;
CREATE POLICY funnel_benchmarks_write ON public.funnel_benchmarks FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
GRANT SELECT ON public.funnel_benchmarks TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.funnel_benchmarks TO authenticated;
GRANT ALL ON public.funnel_benchmarks TO service_role;

-- 2. Each funnel gate maps to the standard step it completes (blank = not compared)
ALTER TABLE public.gates ADD COLUMN IF NOT EXISTS benchmark_step text
  CHECK (benchmark_step IS NULL OR benchmark_step IN ('lead_mql','mql_sql','sql_opp','opp_win'));

-- 3. ICP profiles (Targets) choose an industry + region and may override the base rates
ALTER TABLE public.prospectus_filters ADD COLUMN IF NOT EXISTS bench_industry text
  CHECK (bench_industry IS NULL OR bench_industry IN ('generic','tech_hardware','saas'));
ALTER TABLE public.prospectus_filters ADD COLUMN IF NOT EXISTS bench_region text
  CHECK (bench_region IS NULL OR bench_region IN ('NA','EU','APAC'));
-- {"mql_sql":{"rate":0.25,"note":"our 2025 CRM"}, ...}
ALTER TABLE public.prospectus_filters ADD COLUMN IF NOT EXISTS bench_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4. Which ICP profile Strategy uses: org default, optional per campaign
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS benchmark_icp_id uuid;
ALTER TABLE public.campaigns    ADD COLUMN IF NOT EXISTS benchmark_icp_id uuid;

-- 5. Buyer personas (one combined form), linked to an ICP profile
CREATE TABLE IF NOT EXISTS public.personas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  icp_id             uuid,
  name               text NOT NULL DEFAULT '' CHECK (char_length(name) <= 120),
  quote              text NOT NULL DEFAULT '',
  photo_url          text NOT NULL DEFAULT '',
  title              text NOT NULL DEFAULT '',
  seniority          text NOT NULL DEFAULT '',
  demographics       jsonb NOT NULL DEFAULT '{}'::jsonb,
  background         text NOT NULL DEFAULT '',
  goals              jsonb NOT NULL DEFAULT '[]'::jsonb,
  challenges         jsonb NOT NULL DEFAULT '[]'::jsonb,
  motivations        jsonb NOT NULL DEFAULT '[]'::jsonb,
  frustrations       jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  expectations       jsonb NOT NULL DEFAULT '[]'::jsonb,
  identifiers        jsonb NOT NULL DEFAULT '[]'::jsonb,
  how_we_help        jsonb NOT NULL DEFAULT '[]'::jsonb,
  marketing_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  targeting_focus    text NOT NULL DEFAULT '',
  outbound_messaging text NOT NULL DEFAULT '',
  key_tactics        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personas_org_idx ON public.personas (org_id);
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personas_org ON public.personas;
CREATE POLICY personas_org ON public.personas FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personas TO authenticated;
GRANT ALL ON public.personas TO service_role;

-- 6. Base set 2026-Q4 (researched 2026-10-14). No public source found with a North America / EU / APAC split,
--    so the same global figure is loaded for all three regions and flagged in the note. Missing rows only.
INSERT INTO public.funnel_benchmarks (industry, region, step, typical, low, high, confidence, sources, note, checked_on, version)
SELECT b.industry, r.region, b.step, b.typical, b.low, b.high, b.confidence, b.sources::jsonb,
       b.note || ' Global figure: no public ' || r.region || '-specific split found (Oct 2026).', DATE '2026-10-14', '2026-Q4'
FROM (VALUES
 ('generic','lead_mql',0.31,0.20,0.41,'medium','[{"title":"Gradient Works - 2025 B2B sales performance benchmarks","url":"https://www.gradient.works/blog/2025-b2b-sales-performance-benchmarks"},{"title":"Zeliq - B2B conversion rates by industry (Jun 2026)","url":"https://www.zeliq.com/blog/b2b-conversion-rates-by-industry"},{"title":"Digital Bloom - 2025 B2B funnel benchmarks","url":"https://thedigitalbloom.com/learn/pipeline-performance-benchmarks-2025/"}]','All-B2B blend; sources range 20-41%.'),
 ('generic','mql_sql',0.20,0.13,0.30,'medium','[{"title":"Gradient Works - 2025 B2B sales performance benchmarks","url":"https://www.gradient.works/blog/2025-b2b-sales-performance-benchmarks"},{"title":"Pipeline Grader - State of B2B sales 2026","url":"https://pipelinegrader.com/insights/b2b-pipeline-cac-benchmarks"}]','Sources disagree widely (13-40%); typical is the mid of the most-cited 13-30% range.'),
 ('generic','sql_opp',0.40,0.30,0.50,'medium','[{"title":"Zeliq - B2B conversion rates by industry (Jun 2026)","url":"https://www.zeliq.com/blog/b2b-conversion-rates-by-industry"},{"title":"42 Agency - B2B funnel conversion benchmarks (Apr 2026)","url":"https://intel.42agency.com/b2b-benchmarks/funnel-conversion-rates/"}]','Inbound converts higher than SDR-sourced.'),
 ('generic','opp_win',0.21,0.19,0.30,'high','[{"title":"Ebsta x Pavilion 2025 GTM Benchmarks (655k opportunities), via Pipeline Grader","url":"https://pipelinegrader.com/insights/b2b-pipeline-cac-benchmarks"},{"title":"Digital Bloom - 2025 B2B funnel benchmarks","url":"https://thedigitalbloom.com/learn/pipeline-performance-benchmarks-2025/"}]','Win rate falls with deal size: <$50k 35-45%, >$100k 15-25%.'),
 ('saas','lead_mql',0.39,0.25,0.45,'medium','[{"title":"First Page Sage funnel report, via Prospeo","url":"https://prospeo.io/s/b2b-conversion-rates"},{"title":"42 Agency - B2B funnel conversion benchmarks (Apr 2026)","url":"https://intel.42agency.com/b2b-benchmarks/funnel-conversion-rates/"}]','Varies by source channel: demo requests 60-80%, content downloads 15-30%.'),
 ('saas','mql_sql',0.30,0.20,0.38,'medium','[{"title":"42 Agency - B2B funnel conversion benchmarks (Apr 2026)","url":"https://intel.42agency.com/b2b-benchmarks/funnel-conversion-rates/"},{"title":"First Page Sage funnel report, via Prospeo","url":"https://prospeo.io/s/b2b-conversion-rates"}]','42 Agency SaaS band 20-30% (200+ SaaS companies); First Page Sage 38%.'),
 ('saas','sql_opp',0.42,0.30,0.50,'medium','[{"title":"First Page Sage funnel report, via Prospeo","url":"https://prospeo.io/s/b2b-conversion-rates"},{"title":"42 Agency - B2B funnel conversion benchmarks (Apr 2026)","url":"https://intel.42agency.com/b2b-benchmarks/funnel-conversion-rates/"}]','Enterprise motions 25-40%, SMB 45-60%.'),
 ('saas','opp_win',0.25,0.22,0.37,'medium','[{"title":"42 Agency - B2B funnel conversion benchmarks (Apr 2026)","url":"https://intel.42agency.com/b2b-benchmarks/funnel-conversion-rates/"},{"title":"Digital Bloom - 2025 B2B funnel benchmarks","url":"https://thedigitalbloom.com/learn/pipeline-performance-benchmarks-2025/"},{"title":"First Page Sage funnel report, via Prospeo","url":"https://prospeo.io/s/b2b-conversion-rates"}]','42 Agency median 25%; Digital Bloom SaaS & Technology 22%; First Page Sage 37%.'),
 ('tech_hardware','lead_mql',0.31,0.20,0.41,'low','[{"title":"Gradient Works - 2025 B2B sales performance benchmarks","url":"https://www.gradient.works/blog/2025-b2b-sales-performance-benchmarks"}]','No hardware-specific source found; generic B2B figure used.'),
 ('tech_hardware','mql_sql',0.21,0.13,0.30,'low','[{"title":"Digital Bloom - 2025 B2B funnel benchmarks (Consumer Electronics)","url":"https://thedigitalbloom.com/learn/pipeline-performance-benchmarks-2025/"}]','Single source (Consumer Electronics 21%); range is the generic B2B range.'),
 ('tech_hardware','sql_opp',0.45,0.35,0.55,'low','[{"title":"Zeliq - B2B conversion rates by industry, Industrial manufacturing band","url":"https://www.zeliq.com/blog/b2b-conversion-rates-by-industry"}]','Closest available proxy: industrial manufacturing (35-55%), described by the source as orientation bands. Typical = midpoint.'),
 ('tech_hardware','opp_win',0.19,0.19,0.45,'low','[{"title":"Digital Bloom - 2025 B2B funnel benchmarks (Manufacturing)","url":"https://thedigitalbloom.com/learn/pipeline-performance-benchmarks-2025/"},{"title":"Zeliq - Industrial manufacturing band","url":"https://www.zeliq.com/blog/b2b-conversion-rates-by-industry"}]','Proxies only: Manufacturing win rate 19% (Digital Bloom); industrial manufacturing 25-45% (Zeliq).')
) AS b(industry, step, typical, low, high, confidence, sources, note)
CROSS JOIN (VALUES ('NA'),('EU'),('APAC')) AS r(region)
ON CONFLICT (industry, region, step) DO NOTHING;

COMMIT;

-- Check: expect 36 rows
-- SELECT industry, count(*) FROM public.funnel_benchmarks GROUP BY 1;
