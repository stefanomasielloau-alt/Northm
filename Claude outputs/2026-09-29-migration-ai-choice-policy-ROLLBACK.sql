-- Rollback for 2026-09-29-migration-ai-choice-policy.sql -- removes ONLY what it added.
-- Run only if you need to undo it; the app keeps working without these (it falls back to the old single "Active" row).
BEGIN;
DROP TABLE IF EXISTS public.user_ai_prefs;
DROP TABLE IF EXISTS public.org_ai_policy;
ALTER TABLE public.llm_providers DROP COLUMN IF EXISTS web_url;
ALTER TABLE public.llm_providers DROP COLUMN IF EXISTS approved;
COMMIT;
