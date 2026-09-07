-- Item 50 (3) -- Board Report branding, 2026-09-07
--
-- One row per org: primary/secondary brand color, logo URL, and a font family name,
-- captured once in Configuration > Branding and applied to the Board Report PPTX
-- export (title bars, table headers, title slide). Deliberately NOT a full
-- arbitrary-template-fill engine -- per Stef's approved recommendation, this is the
-- "brand variables" version: much less risk, ships faster, covers the actual ask.
--
-- Safe to run any time: pure addition, no existing table touched. Norma.html and
-- Ordo.html both already load this table fail-soft (try/catch, defaults to null) --
-- so the app works fine before this is run, and the Branding page just shows empty
-- fields / the PPTX export just uses North's own default colors until it is.

CREATE TABLE IF NOT EXISTS org_brand_settings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL UNIQUE REFERENCES organizations(id),
  primary_color  text NOT NULL DEFAULT '',   -- hex, e.g. "#1F3AC7" -- blank = North's own default nav color
  secondary_color text NOT NULL DEFAULT '',  -- hex -- blank = North's own default accent tint
  logo_url       text NOT NULL DEFAULT '',   -- publicly fetchable image URL -- blank = no logo on the deck
  font_family    text NOT NULL DEFAULT '',   -- e.g. "Arial" -- blank = PowerPoint's own default
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Row-Level Security, matching the pattern already used on every other org-scoped
-- table in this app (org_id must match the caller's own org). If your existing
-- tables use a different helper/policy name than "org_id = auth-resolved org",
-- swap this policy body to match that convention rather than running as-is.
ALTER TABLE org_brand_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_brand_settings_org_isolation ON org_brand_settings
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Verification
SELECT count(*) AS org_brand_settings_row_count FROM org_brand_settings;
