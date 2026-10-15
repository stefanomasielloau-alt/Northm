-- Rollback of 2026-10-15-migration-augur-deals-credited-user.sql (drops the column and any "credited to" reps saved in it;
-- Scoring saves will fail again until the column exists).
ALTER TABLE public.augur_deals DROP COLUMN IF EXISTS attribution_credited_to_user_id;
NOTIFY pgrst, 'reload schema';
