-- 2026-09-24 — Custom widgets: add `body` column for the new "Note / free text" widget type
-- Additive only (ADD COLUMN IF NOT EXISTS) — safe to run whenever, does not touch existing rows.
-- Companion to 2026-09-24-migration-custom-widgets-add-webhook-columns.sql (already run) — same
-- table, this is just the one extra column the new Note type needs.

ALTER TABLE custom_widgets
  ADD COLUMN IF NOT EXISTS body text;

-- What this enables: a 5th external-widget type, 'note' — a free-text tile you can add to any
-- grid page (via Admin & config > Widget library > "Add an external widget", type "Note / free
-- text"). Unlike iframe/gdoc/api/webhook, it has no URL — the text you type into the new "Text"
-- box on that form is stored in this column and shown on the tile as-is (line breaks kept). Good
-- for a plain instructions/reminder panel on a page. The app code (already committed, not yet
-- pushed) reads/writes this column the same way it does the existing webhook_token/latest_payload
-- columns — nothing else needed after this runs.
