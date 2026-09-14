-- 2026-09-14 (Stef, live: "I need the ability to distinguish between an API, a desktop
-- version of an LLM, or the web version, and a little bit more explanation around that"):
-- llm_providers today only records name/kind/model/endpoint/key_label/enabled -- nothing
-- says whether a row is something Hub-Backend can actually CALL programmatically (an API
-- key configured server-side) versus a provider someone on the team just uses manually
-- through its own desktop app or website. That distinction matters a lot now that the
-- Agent Registry lets a task be pinned to a specific provider (2026-09-14 round 8) --
-- only an 'api' row can ever actually be assigned to automate something; a 'desktop' or
-- 'web' row is real and worth tracking (so North Config shows the full true picture of
-- what LLM access exists at this org) but can't be wired into a live call.
--
-- Run this once in the Supabase SQL editor for North's project. Safe to re-run --
-- ADD COLUMN IF NOT EXISTS is a no-op if it's already there.

ALTER TABLE llm_providers ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'api';

-- access_type values, enforced client-side (Norma.html) not by a DB constraint, matching
-- this table's existing loose-validation style (kind isn't a Postgres enum either):
--   'api'     -- Hub-Backend can call this provider directly (needs a server-side key
--               set in Vercel -- ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY).
--               Only 'api' rows can be assigned to an Agent Registry task.
--   'desktop' -- someone on the team uses this LLM through its desktop app -- real usage,
--               nothing here can call it automatically.
--   'web'     -- someone on the team uses this LLM through its website -- same as desktop,
--               just a different access surface.
--
-- Existing rows default to 'api' (the only mode this table's ever actually supported
-- until now), so nothing already configured silently stops being assignable.
