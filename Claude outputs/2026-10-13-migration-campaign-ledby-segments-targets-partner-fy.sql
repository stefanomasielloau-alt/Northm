-- 2026-10-13 -- Campaign "Led by", multi-segment split, campaign targets, partner $ target by FY
-- Safe to run more than once (IF NOT EXISTS / NOT EXISTS guards). Additive only: nothing dropped,
-- no existing value changed. Rollback: 2026-10-13-migration-campaign-ledby-segments-targets-partner-fy-ROLLBACK.sql
-- The app works before this is run (the new fields just stay hidden behind a banner).

BEGIN;

-- 1. Campaign "Led by" (who leads it: Marketing-sourced, BDR-sourced, Partner-led ...)
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS led_by text;
-- the pick-list, per organisation (editable in Strategy > Admin & configuration > Campaigns)
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS led_by_presets jsonb;
UPDATE public.org_settings
   SET led_by_presets = '["Marketing-sourced","BDR-sourced","Partner-led","Sales-sourced (self-gen)"]'::jsonb
 WHERE led_by_presets IS NULL;

-- 2. Campaign targets (item 5). Actual leads is entered by hand until a lead feed exists;
--    actual pipeline is read from Scoring deals linked to the campaign, so no column for it.
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS target_leads numeric;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS target_pipeline numeric;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS actual_leads numeric;

-- 3. Multi-segment split, % per segment (same shape as campaign_pod_allocations).
--    campaigns.segment_id is kept and still drives the planning engine (= the largest share).
CREATE TABLE IF NOT EXISTS public.campaign_segment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  share_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, segment_id)
);
CREATE INDEX IF NOT EXISTS campaign_segment_allocations_campaign_idx
  ON public.campaign_segment_allocations (campaign_id);
ALTER TABLE public.campaign_segment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_segment_allocations_org_isolation ON public.campaign_segment_allocations;
CREATE POLICY campaign_segment_allocations_org_isolation ON public.campaign_segment_allocations
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_segment_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_segment_allocations TO service_role;
-- backfill: every campaign's current single segment becomes a 100% row
INSERT INTO public.campaign_segment_allocations (org_id, campaign_id, segment_id, share_pct)
SELECT c.org_id, c.id, c.segment_id, 100
  FROM public.campaigns c
 WHERE c.segment_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.campaign_segment_allocations a WHERE a.campaign_id = c.id);

-- 4. Partner $ target by financial year, e.g. {"FY27": 500000}. acv_target is kept, untouched.
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS acv_targets_by_fy jsonb;
-- backfill: existing single target -> the org's CURRENT FY (Stef, 2026-10-13), using the org's FY start month
UPDATE public.partners p
   SET acv_targets_by_fy = jsonb_build_object(
         'FY' || right((CASE WHEN COALESCE(os.fy_start_month,1) > 1
                              AND EXTRACT(MONTH FROM now() AT TIME ZONE 'Australia/Sydney') >= COALESCE(os.fy_start_month,1)
                             THEN EXTRACT(YEAR FROM now() AT TIME ZONE 'Australia/Sydney') + 1
                             ELSE EXTRACT(YEAR FROM now() AT TIME ZONE 'Australia/Sydney') END)::int::text, 2),
         p.acv_target)
  FROM (SELECT o.id AS org_id, s.fy_start_month
          FROM organizations o LEFT JOIN public.org_settings s ON s.org_id = o.id) os
 WHERE os.org_id = p.org_id
   AND p.acv_target IS NOT NULL
   AND p.acv_targets_by_fy IS NULL;

-- 5. Activity log author columns (already used by Strategy; guard only, no change if present)
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS who text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS role text;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Check after running (all should return rows / sensible counts):
-- SELECT count(*) FROM campaign_segment_allocations;                       -- = campaigns with a segment
-- SELECT id, name, acv_target, acv_targets_by_fy FROM partners WHERE acv_target IS NOT NULL;
-- SELECT org_id, led_by_presets FROM org_settings;
