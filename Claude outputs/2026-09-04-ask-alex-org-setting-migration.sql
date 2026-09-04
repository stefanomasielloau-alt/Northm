-- 2026-09-04: "Ask Alex" AI screen interpreter (backlog item 22, phase 1) -- one new
-- boolean column on org_settings, gating whether the "Ask Alex" button appears on
-- Strategy's Dashboard at all. Safe to run multiple times (IF NOT EXISTS guard).
--
-- Default false/NULL deliberately -- this feature sends a summary of live org data
-- (fiscal-year totals and counts, never raw campaign/contact/deal rows -- see
-- Ordo.html's pageContextForAI() and skills/explain-strategy-dashboard.json) to
-- this org's chosen third-party AI provider. Every North module already reads this
-- fail-soft (Ordo.html via its existing select('*') on org_settings; Norma.html via
-- a separate fail-soft query, since its own org_settings read uses an explicit
-- column list), so nothing breaks before this migration is run -- the feature is
-- simply off, same posture as every other additive column this session.

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS ai_screen_interpreter_enabled BOOLEAN DEFAULT false;
