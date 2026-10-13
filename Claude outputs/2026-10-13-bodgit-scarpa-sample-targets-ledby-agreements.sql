-- 2026-10-13 -- SAMPLE DATA for the demo org Bodgit&Scarpa ONLY (org 8eae1af2-8af8-4224-94c1-5ddf2ff237f2)
-- so the new Led by / targets / pipeline / partner-agreement screens show figures in demos.
-- Run AFTER 2026-10-13-migration-campaign-ledby-segments-targets-partner-fy.sql (already run).
-- Only fills BLANKS -- nothing that already has a value is overwritten. Every row it touches is
-- backed up first into _sample_backup_20261013 (closed to the app/API).
-- Undo: 2026-10-13-bodgit-scarpa-sample-UNDO.sql
-- All figures are fictional demo values.

BEGIN;

CREATE TABLE IF NOT EXISTS public._sample_backup_20261013 (kind text NOT NULL, row_id uuid NOT NULL, data jsonb, PRIMARY KEY (kind,row_id));
ALTER TABLE public._sample_backup_20261013 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._sample_backup_20261013 FROM anon, authenticated;

INSERT INTO public._sample_backup_20261013 (kind,row_id,data)
SELECT 'campaign', id, jsonb_build_object('led_by',led_by,'target_leads',target_leads,'target_pipeline',target_pipeline,'actual_leads',actual_leads)
  FROM public.campaigns WHERE org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
ON CONFLICT DO NOTHING;
INSERT INTO public._sample_backup_20261013 (kind,row_id,data)
SELECT 'partner', id, jsonb_build_object('contact_terms',contact_terms,'acv_targets_by_fy',acv_targets_by_fy,'acv_target',acv_target)
  FROM public.partners WHERE org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
ON CONFLICT DO NOTHING;
INSERT INTO public._sample_backup_20261013 (kind,row_id,data)
SELECT 'deal', id, jsonb_build_object('campaign_id',campaign_id)
  FROM public.augur_deals WHERE org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
ON CONFLICT DO NOTHING;

-- 1. Led by (blank only): from the activity's route, else from the campaign name
UPDATE public.campaigns c SET led_by = CASE
    WHEN r.name ILIKE '%partner%' OR a.name ILIKE '%partner%' OR c.name ~* '(partner|referral|enablement)' THEN 'Partner-led'
    WHEN a.name ~* '(self-?gen|bdm)' THEN 'Sales-sourced (self-gen)'
    WHEN r.name ILIKE '%outbound%' OR a.name ~* '(sdr|bdr)' OR c.name ~* '(outbound|retention|account)' THEN 'BDR-sourced'
    ELSE 'Marketing-sourced' END
  FROM public.campaigns c2
  LEFT JOIN public.activities a ON a.id = c2.activity_id
  LEFT JOIN public.routes r ON r.id = a.route_id
 WHERE c.id = c2.id AND c.org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2' AND c.led_by IS NULL;

-- 2. Targets (blank only). Leads target = expected leads (budget / cost per lead, else budget / 350) + 10%.
--    Pipeline target = 6 x budget. Actual leads only for campaigns already started: target x time elapsed x 70-110%.
UPDATE public.campaigns c SET
    target_leads = COALESCE(c.target_leads, x.tl),
    target_pipeline = COALESCE(c.target_pipeline, round(COALESCE(c.budget,0) * 6, -3)),
    actual_leads = COALESCE(c.actual_leads, CASE WHEN c.start_date IS NOT NULL AND c.start_date <= CURRENT_DATE
        THEN round(x.tl * LEAST(1, GREATEST(0,
               (CURRENT_DATE - c.start_date)::numeric / NULLIF(GREATEST(COALESCE(c.end_date, c.start_date + 90) - c.start_date, 1), 0)))
             * (0.7 + (abs(hashtext(c.id::text)) % 41) / 100.0))
        ELSE NULL END)
  FROM (SELECT c3.id, round(COALESCE(c3.budget,0) / COALESCE(NULLIF(a.cost_per,0), 350) * 1.1) AS tl
          FROM public.campaigns c3 LEFT JOIN public.activities a ON a.id = c3.activity_id
         WHERE c3.org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2') x
 WHERE c.id = x.id AND COALESCE(c.budget,0) > 0;

-- 3. Link deals to their campaign (blank campaign_id only) using the campaign name they already carry
UPDATE public.augur_deals d SET campaign_id = c.id
  FROM public.campaigns c
 WHERE d.org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2' AND c.org_id = d.org_id
   AND d.campaign_id IS NULL AND d.campaign_ref IS NOT NULL
   AND lower(trim(c.name)) = lower(trim(d.campaign_ref));

-- 4. Partners with no agreement target: add one sample agreement covering the current FY, with a target,
--    and the matching FY target (same rule the app uses: target pro-rated by days; a full-FY agreement = 100%).
WITH fy AS (
  SELECT COALESCE(s.fy_start_month,1) AS fsm,
         (CASE WHEN COALESCE(s.fy_start_month,1) > 1 AND EXTRACT(MONTH FROM now() AT TIME ZONE 'Australia/Sydney') >= COALESCE(s.fy_start_month,1)
               THEN EXTRACT(YEAR FROM now() AT TIME ZONE 'Australia/Sydney') + 1
               ELSE EXTRACT(YEAR FROM now() AT TIME ZONE 'Australia/Sydney') END)::int AS fyyear
    FROM public.organizations o LEFT JOIN public.org_settings s ON s.org_id = o.id
   WHERE o.id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2'),
rng AS (
  SELECT 'FY' || right(fyyear::text,2) AS fykey,
         CASE WHEN fsm > 1 THEN make_date(fyyear-1, fsm, 1) ELSE make_date(fyyear,1,1) END AS fstart FROM fy),
p AS (
  SELECT pa.id, (200000 + 50000 * (row_number() OVER (ORDER BY pa.name) - 1))::numeric AS tgt
    FROM public.partners pa
   WHERE pa.org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2'
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(pa.contact_terms,'[]'::jsonb)) t WHERE (t->>'target') IS NOT NULL AND (t->>'target') <> ''))
UPDATE public.partners pa SET
    contact_terms = COALESCE(pa.contact_terms,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'name','Sample agreement','email','','phone','',
        'termStart', to_char(r.fstart,'YYYY-MM-DD'),
        'termEnd',   to_char((r.fstart + interval '1 year' - interval '1 day')::date,'YYYY-MM-DD'),
        'target', p.tgt, 'notes','SAMPLE 2026-10-13')),
    acv_targets_by_fy = jsonb_build_object(r.fykey, p.tgt),
    acv_target = p.tgt
  FROM p, rng r
 WHERE pa.id = p.id;

COMMIT;

-- What it did (run after):
SELECT name, led_by, budget, target_leads, actual_leads, target_pipeline FROM campaigns WHERE org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2' ORDER BY name;
SELECT c.name, count(d.id) AS deals, sum(d.value) AS value FROM campaigns c JOIN augur_deals d ON d.campaign_id=c.id WHERE c.org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2' GROUP BY c.name;
SELECT name, acv_target, acv_targets_by_fy FROM partners WHERE org_id='8eae1af2-8af8-4224-94c1-5ddf2ff237f2';
