-- Item 36 -- Licensing tool, MVP, 2026-09-07
--
-- Scope, per the recommendation you approved ("Do it .. we can run with Stripe for now"):
-- this migration builds the DATA MODEL for org-level plans, per-role user pricing, hosting
-- and benchmark add-ons, and manual proforma invoicing. It does NOT touch payment
-- processing -- real Stripe charging needs a server that can hold a secret API key (North
-- is client-side Supabase calls only; Hub-Backend already has a real Python API and is the
-- right place for that, mirroring how Google/Microsoft OAuth were built there). Building
-- that without your actual Stripe keys would mean fabricating an integration I can't test
-- and you can't use -- same reasoning as the Microsoft OAuth credentials gap earlier this
-- session. Flagged clearly as the next phase, not started here.
--
-- Module entitlements deliberately reuse the EXISTING per-org access_* columns on
-- organizations (already has a full UI in Configuration) rather than duplicating that as a
-- second, parallel "what's included" system -- a plan's entitlements ARE those toggles.
--
-- Safe to run any time: pure addition, no existing table touched.

CREATE TABLE IF NOT EXISTS org_plans (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES organizations(id),
  plan_name                text NOT NULL DEFAULT '',
  status                   text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','expired','cancelled')),
  start_date               date,
  end_date                 date,
  currency                 text NOT NULL DEFAULT 'AUD',
  base_price               numeric NOT NULL DEFAULT 0,
  -- {"Admin": {"included": 1, "extra_price": 0}, "Manager": {...}, "Planner": {...}, "Viewer": {...}, "Super User": {...}}
  -- included = how many of this role tier are covered by base_price; extra_price = $ per
  -- additional user of that role tier beyond the included count.
  role_pricing             jsonb NOT NULL DEFAULT '{}'::jsonb,
  hosting_gb_included      numeric NOT NULL DEFAULT 5,
  hosting_gb_extra_price   numeric NOT NULL DEFAULT 0,
  -- connections priced individually beyond the standard/included set (HubSpot, CSV, XML,
  -- watched-folder are standard/included per your note -- anything else, e.g. Salesforce, is
  -- a priced connection). {"Salesforce": 200, "Marketo": 150}
  connection_pricing       jsonb NOT NULL DEFAULT '{}'::jsonb,
  benchmark_reporting_addon boolean NOT NULL DEFAULT false,
  benchmark_reporting_price numeric NOT NULL DEFAULT 0,
  benchmark_exclusion_addon boolean NOT NULL DEFAULT false,
  benchmark_exclusion_price numeric NOT NULL DEFAULT 0,
  notes                    text NOT NULL DEFAULT '',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_plans_org_id ON org_plans(org_id);

CREATE TABLE IF NOT EXISTS org_plan_invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id),
  plan_id        uuid REFERENCES org_plans(id),
  invoice_number text NOT NULL DEFAULT '',
  issue_date     date NOT NULL DEFAULT current_date,
  period_start   date,
  period_end     date,
  -- [{"description": "Base plan", "amount": 500}, {"description": "3 extra Planner seats", "amount": 150}, ...]
  line_items     jsonb NOT NULL DEFAULT '[]'::jsonb,
  total          numeric NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'AUD',
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_plan_invoices_org_id ON org_plan_invoices(org_id);

ALTER TABLE org_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_plan_invoices ENABLE ROW LEVEL SECURITY;

-- Only the full Super Admin manages licensing -- this is operator-facing (you managing
-- customer plans), not something an org's own admin should see or edit about themselves.
DROP POLICY IF EXISTS org_plans_full_admin_only ON org_plans;
CREATE POLICY org_plans_full_admin_only ON org_plans
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS org_plan_invoices_full_admin_only ON org_plan_invoices;
CREATE POLICY org_plan_invoices_full_admin_only ON org_plan_invoices
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Verification
SELECT count(*) AS org_plans_row_count FROM org_plans;
SELECT count(*) AS org_plan_invoices_row_count FROM org_plan_invoices;
