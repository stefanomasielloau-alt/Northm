-- Item 41 -- Partners: Pod linkage + $ target, editable type presets, multi-term contacts
-- 2026-09-08
--
-- Closes the concrete gaps Stef flagged across three rounds of feedback on the Partners
-- page (Cursus.html): couldn't find where to edit a partner's contact info at all (it
-- turns out there never was an edit UI for it, despite the columns existing -- name/type
-- were editable, contact_name/contact_email/contact_phone/notes were load-only display);
-- "type" was free text, not a dropdown; no link to Strategy's Region > Pod hierarchy or a
-- $ target; no support for more than one contact/terms record per partner.
--
-- All additive, IF NOT EXISTS-guarded -- safe to run any time, and the app already reads/
-- writes these columns fail-soft (upsertRows() swallows errors until this runs).

ALTER TABLE partners ADD COLUMN IF NOT EXISTS pod_id uuid REFERENCES pods(id) ON DELETE SET NULL;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS acv_target numeric;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS contact_terms jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Org-level editable preset list for the Partner "type" dropdown (same pattern proposed
-- for asset tags in item 45, defined here first). Starts empty; grows as anyone in the org
-- picks "+ Add new type" on the Partners page.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS partner_type_presets jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Verification
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='partners' AND column_name IN ('pod_id','acv_target','contact_terms')
UNION ALL
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='org_settings' AND column_name='partner_type_presets';
