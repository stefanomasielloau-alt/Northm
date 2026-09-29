-- 2026-09-29 (Stef: "users choose between the API, the desktop version or the web version of an LLM or
-- agent ... an org can mandate what LLM/agents to use where -- one or several -- or set a preferred one and
-- a user picks from an approved list; a user can connect their own if the org allows").
--
-- ADDITIVE ONLY: two new tables + two new columns. Nothing is dropped or rewritten. Safe to re-run.
-- Rollback: 2026-09-29-migration-ai-choice-policy-ROLLBACK.sql (drops only what this file adds).
--
--   llm_providers.approved   -- the org's approved list (an unapproved row stays on file but nobody can pick it)
--   llm_providers.web_url    -- optional override for "Open in web app" (defaults come from the kind)
--   org_ai_policy            -- one row per org: mandate vs choose, own keys allowed, built-in AI allowed,
--                               and per-area settings {area: {default, allowed[], locked}}
--   user_ai_prefs            -- one row per user per org: {area: option id}; owner-only (RLS)
-- Users' own API keys are NOT here -- they live encrypted in Hub-Backend (north_ai_keys).

BEGIN;

ALTER TABLE public.llm_providers ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true;
ALTER TABLE public.llm_providers ADD COLUMN IF NOT EXISTS web_url  text;

CREATE TABLE IF NOT EXISTS public.org_ai_policy (
  org_id         uuid PRIMARY KEY,
  choice_mode    text NOT NULL DEFAULT 'choose',      -- 'choose' (users pick from approved) | 'mandate' (org's pick only)
  allow_own_keys boolean NOT NULL DEFAULT false,
  allow_builtin  boolean NOT NULL DEFAULT true,       -- North's built-in AI (Hub-Backend's own default key)
  areas          jsonb   NOT NULL DEFAULT '{}'::jsonb, -- {"ask_alec":{"default":"<option id>","allowed":["..."],"locked":false}, ...}
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid
);

CREATE TABLE IF NOT EXISTS public.user_ai_prefs (
  user_id    uuid NOT NULL,
  org_id     uuid NOT NULL,
  choices    jsonb NOT NULL DEFAULT '{}'::jsonb,       -- {"ask_alec":"<option id>", ...}
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

ALTER TABLE public.org_ai_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_prefs ENABLE ROW LEVEL SECURITY;

-- org policy: everyone in the org can read it (it decides what they see); writes are gated to
-- configuration roles in the app, same as llm_providers.
DROP POLICY IF EXISTS org_ai_policy_org_isolation ON public.org_ai_policy;
CREATE POLICY org_ai_policy_org_isolation ON public.org_ai_policy
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- personal choices: strictly the user's own row.
DROP POLICY IF EXISTS user_ai_prefs_owner ON public.user_ai_prefs;
CREATE POLICY user_ai_prefs_owner ON public.user_ai_prefs
  USING (user_id = auth.uid() AND org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (user_id = auth.uid() AND org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.org_ai_policy TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_prefs TO authenticated;

COMMIT;
