-- 2026-09-11 -- Restore Tac-Tik's Gates from the "8-gate enterprise" preset copy
-- that ended up under Bodgit&Scarpa's org_id.
--
-- FOR REVIEW ONLY. Nothing here runs automatically. Read it, then run it yourself
-- in Supabase's SQL editor.
--
-- What this does: COPIES (not moves) the 9 specific gate rows confirmed under
-- Bodgit&Scarpa (org_id 8eae1af2-8af8-4224-94c1-5ddf2ff237f2) into a fresh set of
-- rows under Tac-Tik (org_id 6373bb04-fc25-4a72-b43b-ccd8bb110cda), with brand new
-- ids. Bodgit&Scarpa's own 9 rows are left completely untouched -- this is
-- additive only, so Bodgit&Scarpa's own testing isn't affected either way.
--
-- Per Stef's confirmation (2026-09-11): the "8-gate enterprise" template is
-- acceptable to restore Tac-Tik from -- this is NOT a claim that these were
-- Tac-Tik's original custom conversion rates, just the agreed starting point to
-- get Strategy working again for Tac-Tik.
--
-- Safety check built in: the INSERT only runs if Tac-Tik currently has zero gates,
-- so this can't accidentally duplicate a funnel if it's already been restored
-- another way since this file was written.

do $$
begin
  if (select count(*) from gates where org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda') = 0 then
    insert into gates (id, org_id, name, code, "order", entry, rate, active, note)
    select gen_random_uuid(), '6373bb04-fc25-4a72-b43b-ccd8bb110cda', name, code, "order", entry, rate, active, note
    from gates
    where id in (
      'dbcf72a7-d35e-440c-a355-2982373cc1dd', -- Suspect
      'cebe54ad-632f-488e-9388-36d572f0638e', -- Inquiry
      '837165b4-3b90-4ad5-b900-4f7966d5f819', -- Lead
      'cd97605b-49a6-430a-b487-f4240edb6eff', -- MAO
      'aa1b84fe-3f84-430f-9e3b-62785516fa9f', -- MQL
      'dfa53ebb-a468-400e-838e-16f4b2f3b507', -- SQL
      '96a7b9e4-c66b-4ed0-85af-a71660ea3c99', -- SAO
      'ec85e015-c912-4892-8576-3e47c314c5fe', -- SQO
      '1fbe6297-d7b2-44df-8eaf-6894748d32a3'   -- Win
    );
    raise notice 'Inserted % gate row(s) for Tac-Tik.', (select count(*) from gates where org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda');
  else
    raise notice 'Tac-Tik already has gates -- nothing inserted. Check manually before re-running.';
  end if;
end $$;

-- Verification -- run this after the block above. Expect 9 rows, Suspect through
-- Win, all active = true, matching Bodgit&Scarpa's copy exactly except for id/org_id.
select id, name, code, "order", entry, rate, active, note
from gates
where org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
order by "order";

-- Rollback, if ever needed: every row this script inserts is new (fresh ids), and
-- since Tac-Tik had zero gates immediately before running this, any row you find
-- under org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda' afterward came from here.
--   delete from gates where org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda';
-- (commented out on purpose -- not run automatically)
