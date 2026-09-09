-- Item 45 -- Events + Assets, sub-asks 1 and 2, 2026-09-09
--
-- Two independent, additive changes bundled in one file since both are needed for
-- item 45's remaining sub-asks. Safe to run together or split into two statements
-- run separately -- neither depends on the other.
--
-- (1) assets.event_id -- lets an Asset be attached directly to an Event (sub-ask 1),
-- distinct from the existing assets.campaign_id link. Today an asset only links to a
-- Campaign; an Event also links to a Campaign (events.campaign_id), but there was no
-- direct Asset<->Event edge, so "attach this asset to this specific event" had no
-- column to write to. Nullable, ON DELETE SET NULL (removing an event un-attaches its
-- assets rather than deleting them -- matches how source_task_id/campaign_id already
-- behave on this table). Eventus.html's Event Detail page now reads/writes this once
-- this migration has run; the app works fine before that (the new Assets section on
-- an event just can't attach anything yet, same fail-soft shape as every other
-- migration-pending column in this project).
--
-- (2) org_settings.asset_tag_presets -- corrects Custodia.html's first pass at sub-ask 2
-- (commit 64dde5c), which shipped with a hardcoded preset array in JS. Found afterward:
-- item 41's migration (2026-09-08) already proposed this exact org-editable-preset
-- pattern for asset tags ("same pattern recommended for asset tags in item 45, defined
-- here first" -- see partner_type_presets in that file). Matching it properly rather
-- than leaving two inconsistent patterns in the codebase. Seeded with a starter list as
-- the column default (unlike partner_type_presets, which starts empty) since generic
-- event/asset tags are a reasonable universal starting point, not something every org
-- should have to type in by hand before the picker is useful -- still fully editable
-- and extendable per org from there via "+ Add new preset".

ALTER TABLE assets ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES eventus_events(id) ON DELETE SET NULL;

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS asset_tag_presets jsonb NOT NULL DEFAULT
  '["Signage","Giveaway","Booth","AV equipment","Printed collateral","Branded merchandise","Badge / lanyard","Furniture","Digital asset","Reusable"]'::jsonb;

-- Verification
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='assets' AND column_name='event_id'
UNION ALL
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='org_settings' AND column_name='asset_tag_presets';
