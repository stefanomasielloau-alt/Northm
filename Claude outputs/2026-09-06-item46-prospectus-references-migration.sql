-- Item 46 -- Reference tracking (Prospectus module), 2026-09-06
--
-- Adds one new, standalone table: prospectus_references. Not linked to any
-- existing table (Partners, Targets, etc.) yet -- Stef asked for this to live
-- in Prospectus without specifying it should be tied to a specific Partner or
-- Target record, so it's built as its own list for now. Easy to add a
-- partner_id/lead_id FK later if that turns out to be wanted.
--
-- Safe to run any time: pure addition, no existing table touched. Prospectus.html
-- already loads/saves this table in a fail-soft try/catch (see loadFromSupabase()
-- and saveToSupabase()) -- so the app works fine before this is run, and the new
-- "References" tab just shows an empty list until it is.
--
-- CAVEAT: I don't have direct access to your Supabase schema, so the RLS policy
-- below is my best match to the org-isolation pattern used elsewhere in this app
-- (org_id must match the caller's own org via profiles.org_id). If your other
-- tables' policies are shaped differently, please adjust this one to match
-- rather than running it as-is.

CREATE TABLE IF NOT EXISTS prospectus_references (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organizations(id),
  name                   text NOT NULL DEFAULT '',
  doc_folder_url         text NOT NULL DEFAULT '',
  notes                  text NOT NULL DEFAULT '',
  is_case_study          boolean NOT NULL DEFAULT false,
  case_study_url         text NOT NULL DEFAULT '',
  case_study_date        date,
  is_speaking            boolean NOT NULL DEFAULT false,
  speaking_event         text NOT NULL DEFAULT '',
  speaking_date          date,
  is_webinar             boolean NOT NULL DEFAULT false,
  webinar_url            text NOT NULL DEFAULT '',
  webinar_date           date,
  is_testimonial         boolean NOT NULL DEFAULT false,
  testimonial_quote      text NOT NULL DEFAULT '',
  testimonial_attribution text NOT NULL DEFAULT '',
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospectus_references_org_id ON prospectus_references(org_id);

ALTER TABLE prospectus_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospectus_references_org_isolation ON prospectus_references
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Verification
SELECT count(*) AS prospectus_references_row_count FROM prospectus_references;
