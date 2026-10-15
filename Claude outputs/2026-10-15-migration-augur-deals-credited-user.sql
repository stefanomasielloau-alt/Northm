-- 2026-10-15 Scoring: found in live testing.
-- Scoring saves every deal with attribution_credited_to_user_id ("credited to" an internal rep), but the
-- 2026-10-07 partners-build migration never created that column. PostgREST rejects the whole augur_deals save
-- (PGRST204 "Could not find the 'attribution_credited_to_user_id' column"), so deal edits in Scoring have not
-- been saving since 7 Oct. This adds the missing column. Additive and safe to run more than once.
-- Rollback: 2026-10-15-migration-augur-deals-credited-user-ROLLBACK.sql
ALTER TABLE public.augur_deals ADD COLUMN IF NOT EXISTS attribution_credited_to_user_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
-- Check: SELECT column_name FROM information_schema.columns WHERE table_name='augur_deals' AND column_name='attribution_credited_to_user_id';
