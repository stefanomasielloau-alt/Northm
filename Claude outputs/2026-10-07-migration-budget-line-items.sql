-- Budget line items (Reference Environment Option B, subsystem 1 of 6)
-- Design locked in by Stef 2026-10-07: full 5-stage lifecycle (planned/quoted/approved/
-- committed/actual) + variance, attaching at BOTH campaign level and activity/task level,
-- admin-editable categories (seeded with defaults), roll-up across the whole hierarchy
-- (task/activity -> campaign -> programme) so a campaign's budget/committed/actual become
-- derived totals rather than independently-entered numbers. Zero line items is a valid
-- state (Stef, 2026-10-07: "all it would mean is it isn't started ... wouldn't impact
-- final Budget numbers") -- an empty campaign/task simply rolls up to zero, no special
-- fallback logic needed.
--
-- Safe to run multiple times. Follows the standard Oct 30 2026 grant template
-- (Claude outputs/2026-09-28-new-table-migration-template.sql): authenticated +
-- service_role granted, anon never (North has no logged-out data access), RLS +
-- org_isolation policy on every new table.
--
-- Scope note: this migration is schema + roll-up only (build-plan step 1, from
-- claude/2026-10-07-reference-environment-budget-line-items-proposal.md). The entry UI in
-- CampaignPlanning.html/Strategy.html and the Configuration.html category-admin screen are
-- step 2, tracked separately -- running this alone changes nothing visible in the app yet.

BEGIN;

-- 1. Admin-editable categories, per-org (same shape as Partners' type list).
CREATE TABLE IF NOT EXISTS public.budget_line_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_line_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_line_categories_org_isolation ON public.budget_line_categories;
CREATE POLICY budget_line_categories_org_isolation ON public.budget_line_categories
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_line_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_line_categories TO service_role;

-- Seed the standard defaults for every existing org. Guarded by NOT EXISTS so re-running
-- this migration (or running it after an org has already customized its list) never
-- duplicates or overwrites anything -- Stef can rename/add/remove from here afterward via
-- the Configuration.html admin screen (step 2).
INSERT INTO public.budget_line_categories (org_id, name, sort_order)
SELECT o.id, c.name, c.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('Media',1), ('Creative',2), ('Agency fees',3), ('Travel',4), ('Other',5)
) AS c(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.budget_line_categories blc
  WHERE blc.org_id = o.id AND blc.name = c.name
);

-- 2. Line items -- polymorphic parent (campaign or task), full 5-stage lifecycle + variance.
-- parent_type/parent_id instead of two nullable FK columns, matching the lighter-weight
-- pattern already used elsewhere in this schema for cross-table references; validated at
-- the application layer (CampaignPlanning.html/Strategy.html), same as those other spots.
CREATE TABLE IF NOT EXISTS public.budget_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_type text NOT NULL CHECK (parent_type IN ('campaign','task')),
  parent_id uuid NOT NULL,
  category_id uuid REFERENCES public.budget_line_categories(id),
  description text,
  planned_amount numeric,
  quoted_amount numeric,
  approved_amount numeric,
  committed_amount numeric,
  actual_amount numeric,
  variance_amount numeric,
  variance_reason text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budget_line_items_parent_idx
  ON public.budget_line_items (parent_type, parent_id);

ALTER TABLE public.budget_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_line_items_org_isolation ON public.budget_line_items;
CREATE POLICY budget_line_items_org_isolation ON public.budget_line_items
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_line_items TO service_role;

-- 3. Roll-up views -- computed, not stored, so they can never drift out of sync with the
-- line items underneath them. WITH (security_invoker = true) on both so each view runs
-- under the QUERYING user's own permissions, keeping the org_isolation RLS policies above
-- in force through the view -- without it, a view defaults to running as its owner and can
-- silently bypass RLS.

-- Campaign total = its own directly-attached line items + its tasks' line items.
CREATE OR REPLACE VIEW public.campaign_budget_rollup
WITH (security_invoker = true) AS
SELECT
  c.id AS campaign_id,
  c.org_id,
  COALESCE(SUM(li.planned_amount), 0)   AS planned_total,
  COALESCE(SUM(li.quoted_amount), 0)    AS quoted_total,
  COALESCE(SUM(li.approved_amount), 0)  AS approved_total,
  COALESCE(SUM(li.committed_amount), 0) AS committed_total,
  COALESCE(SUM(li.actual_amount), 0)    AS actual_total,
  COALESCE(SUM(li.variance_amount), 0)  AS variance_total,
  COUNT(li.id) AS line_item_count
FROM campaigns c
LEFT JOIN public.budget_line_items li
  ON (li.parent_type = 'campaign' AND li.parent_id = c.id)
  OR (li.parent_type = 'task' AND li.parent_id IN (
        SELECT t.id FROM tasks t WHERE t.campaign_id = c.id
      ))
GROUP BY c.id, c.org_id;

GRANT SELECT ON public.campaign_budget_rollup TO authenticated;
GRANT SELECT ON public.campaign_budget_rollup TO service_role;

-- Programme total = sum of its campaigns' rollup totals.
CREATE OR REPLACE VIEW public.programme_budget_rollup
WITH (security_invoker = true) AS
SELECT
  c.programme_id,
  c.org_id,
  SUM(r.planned_total)   AS planned_total,
  SUM(r.quoted_total)    AS quoted_total,
  SUM(r.approved_total)  AS approved_total,
  SUM(r.committed_total) AS committed_total,
  SUM(r.actual_total)    AS actual_total,
  SUM(r.variance_total)  AS variance_total,
  SUM(r.line_item_count) AS line_item_count
FROM campaigns c
JOIN public.campaign_budget_rollup r ON r.campaign_id = c.id
WHERE c.programme_id IS NOT NULL
GROUP BY c.programme_id, c.org_id;

GRANT SELECT ON public.programme_budget_rollup TO authenticated;
GRANT SELECT ON public.programme_budget_rollup TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verification -- run after the above to confirm the shapes look right:
-- SELECT * FROM public.budget_line_categories ORDER BY org_id, sort_order;
-- SELECT * FROM public.campaign_budget_rollup LIMIT 20;
-- SELECT * FROM public.programme_budget_rollup LIMIT 20;
