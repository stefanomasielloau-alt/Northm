-- 2026-09-28 -- Events (Eventus.html) upgrade: event brief, per-row notes, checklist templates.
-- Stef: "a rich-text Notes field to describe the event brief", "Speakers / Checklist / Cost lines /
-- Venues each need a text (notes) field per row", "add items from preset templates, or save the
-- current event's checklist as a template".
--
-- Idempotent: safe to run more than once. Eventus.html is fail-soft until this runs (it probes each
-- column/table at boot and leaves anything missing out of its saves; the built-in checklist
-- templates work without this migration).
-- Checked first: none of eventus_speakers / eventus_checklist / eventus_cost_lines /
-- eventus_event_venues had a notes column in any earlier migration.

BEGIN;

-- 1) Rich-text event brief (sanitized HTML, written by the app)
ALTER TABLE public.eventus_events       ADD COLUMN IF NOT EXISTS brief_html text;

-- 2) Per-row notes
ALTER TABLE public.eventus_speakers     ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.eventus_checklist    ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.eventus_cost_lines   ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.eventus_event_venues ADD COLUMN IF NOT EXISTS notes text;

-- 3) Team-saved checklist templates. items = [{"item": text, "offset_days": int|null}]
--    offset_days = days BEFORE the event start date (0 = event day, negative = after the event).
CREATE TABLE IF NOT EXISTS public.eventus_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventus_checklist_templates_org_idx ON public.eventus_checklist_templates(org_id);

ALTER TABLE public.eventus_checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventus_checklist_templates_org_isolation ON public.eventus_checklist_templates;
CREATE POLICY eventus_checklist_templates_org_isolation ON public.eventus_checklist_templates
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- Data API access (Oct 30 2026 requirement) -- authenticated + service_role only, never anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventus_checklist_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventus_checklist_templates TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
