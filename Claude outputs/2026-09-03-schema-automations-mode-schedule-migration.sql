-- 2026-09-03: Process Maps automations, phase 2 of item 15 (event-based triggers + Automate/Trigger mode)
-- Adds the two new columns Schema.html's automations engine now reads/writes.
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE schema_automations ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'automatic';
ALTER TABLE schema_automations ADD COLUMN IF NOT EXISTS schedule_time TEXT;

-- mode: 'automatic' (default, unchanged behaviour -- fires on Run checks / the 5-minute
--   poll while the page is open) or 'trigger_only' (matches are found but never auto-fire;
--   a person fires them via the rule's own "Run now" button).
-- schedule_time: optional 'HH:MM' (24h, local to whoever's browser is evaluating it) --
--   when set on an 'automatic' rule, that rule is only checked/fired at or after this time
--   each day. Still bound by the engine's existing honest limit: only evaluated while
--   someone has the Automations page open, or the 5-minute auto-poll while it's open --
--   this delays the check, it does not guarantee a fire at that exact time in the
--   background. NULL means "no time gate, check on every poll" (existing behaviour).
