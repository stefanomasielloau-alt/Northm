-- ============================================================================
-- North -- Clone organization data (backlog item 35)
-- Generated 2026-09-04. Review before running -- this is new, untested-in-
-- production logic. Tested against a synthetic mock schema (not the real
-- Supabase DB -- I don't have direct production access), see the accompanying
-- 2026-09-04-item35-clone-function-test-notes.md for exactly what was verified
-- and what wasn't.
--
-- WHY THIS IS WRITTEN THE WAY IT IS
-- I could not get an authoritative list of every org-scoped table + its real
-- column types from this session (no direct read access to Supabase's
-- information_schema, and grepping the frontend for `.eq('org_id', ...)`
-- undercounts anything Row-Level-Security scopes invisibly). Rather than
-- hand you a hardcoded table list I can't vouch for, this function DISCOVERS
-- the schema at runtime via information_schema, every time it's called --
-- so it will always match whatever the real schema actually is when you run
-- it, not a snapshot of what I could see from the repo.
--
-- HOW IT WORKS
-- 1. clone_org_preview(source_org_id)  -- READ-ONLY, zero risk, run this
--    first. Lists every table it WOULD clone (with row counts) and every
--    org-scoped table it will deliberately SKIP, with why.
-- 2. clone_organization_data(source_org_id, new_org_name) -- does the real
--    copy: creates a new org, copies every included table's rows for that
--    org into the new org with fresh UUIDs, then a second pass remaps any
--    foreign keys between cloned tables so the new org's data is internally
--    consistent (e.g. cloned activities point at the CLONED campaign, not
--    the original). Wrapped as a single function body, so it's one atomic
--    transaction -- fails clean, nothing partially written.
--
-- WHAT'S DELIBERATELY EXCLUDED -- these are org-scoped but are NOT "demo
-- content", so blindly copying them would create confusing or unsafe data:
--   organizations   -- this IS the thing being created; handled specially.
--   profiles        -- real user accounts and their org membership. A clone
--                      should get real new users invited normally, not fake
--                      duplicate memberships.
--   org_invites     -- pending invite tokens tied to specific real email
--                      addresses.
--   audit_log       -- historical record of what actually happened. Cloning
--                      it into a new org would misrepresent history.
--   org_relations   -- links to the SOURCE org's other related orgs (parent/
--                      sub-org). A clone shouldn't inherit relationships to
--                      unrelated real organizations.
--   feedback_items  -- real feedback from the source org's real users.
--   agent_dispatches, agent_destinations -- operational dispatch history,
--                      not seed/demo content.
-- If you disagree with any of these, the exclude list is the one array
-- below (_excluded_tables) -- easy to edit before running.
--
-- REVIEW BEFORE RUNNING. Recommended sequence:
--   1. Run this whole file once (defines both functions, writes nothing).
--   2. select * from clone_org_preview('<bodgit-and-scarpa-org-id>');
--      -- eyeball the included/excluded lists against what you'd expect.
--   3. select clone_organization_data('<bodgit-and-scarpa-org-id>',
--                                      'Tester Org 1');
--      -- run it in Supabase's SQL editor so you can see the RAISE NOTICE
--      -- summary it prints as it goes.
--   4. Spot-check the new org in North's UI before inviting anyone into it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared: tables to exclude, and a helper to list the org-scoped table set.
-- ---------------------------------------------------------------------------
create or replace function _clone_excluded_tables() returns text[] as $$
  select array[
    'organizations', 'profiles', 'org_invites', 'audit_log',
    'org_relations', 'feedback_items', 'agent_dispatches', 'agent_destinations'
  ];
$$ language sql immutable;

-- Every table in public schema that has an org_id column AND a single-column
-- uuid primary key -- i.e. everything this tool knows how to safely clone.
create or replace function _clone_candidate_tables()
returns table(table_name text, pk_column text) as $$
  select c.table_name, kcu.column_name as pk_column
  from information_schema.columns c
  join information_schema.table_constraints tc
    on tc.table_name = c.table_name
   and tc.table_schema = c.table_schema
   and tc.constraint_type = 'PRIMARY KEY'
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.table_schema = tc.table_schema
  where c.table_schema = 'public'
    and c.column_name = 'org_id'
    and not (c.table_name = any(_clone_excluded_tables()))
    -- exactly one PK column, and it must be uuid (this tool doesn't handle
    -- composite or non-uuid primary keys -- see clone_org_preview's
    -- "skipped_not_supported" rows for anything that falls out here)
    and (select count(*) from information_schema.key_column_usage k2
         join information_schema.table_constraints t2
           on t2.constraint_name = k2.constraint_name and t2.table_schema = k2.table_schema
         where t2.table_name = c.table_name and t2.table_schema = c.table_schema
           and t2.constraint_type = 'PRIMARY KEY') = 1
    and (select data_type from information_schema.columns
         where table_schema = c.table_schema and table_name = c.table_name
           and column_name = kcu.column_name) = 'uuid';
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- 1. PREVIEW -- read-only, safe to run any time.
-- ---------------------------------------------------------------------------
create or replace function clone_org_preview(p_source_org_id uuid)
returns table(bucket text, table_name text, row_count bigint, note text) as $$
declare
  r record;
  v_cnt bigint;
begin
  -- included tables + how many rows they'd contribute
  for r in select * from _clone_candidate_tables() loop
    execute format('select count(*) from %I where org_id = $1', r.table_name)
      into v_cnt using p_source_org_id;
    if v_cnt > 0 then
      bucket := 'would_clone'; table_name := r.table_name; row_count := v_cnt;
      note := 'pk=' || r.pk_column;
      return next;
    end if;
  end loop;

  -- deliberately excluded org-scoped tables + their row counts, for visibility
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'org_id'
      and c.table_name = any(_clone_excluded_tables())
  loop
    begin
      execute format('select count(*) from %I where org_id = $1', r.table_name)
        into v_cnt using p_source_org_id;
    exception when others then
      v_cnt := null;
    end;
    bucket := 'excluded_by_design'; table_name := r.table_name; row_count := v_cnt;
    note := 'see header comment for why';
    return next;
  end loop;

  -- org-scoped tables this tool can't safely handle (composite/non-uuid PK)
  for r in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'org_id'
      and not (c.table_name = any(_clone_excluded_tables()))
      and c.table_name not in (select cc.table_name from _clone_candidate_tables() cc)
  loop
    bucket := 'skipped_not_supported'; table_name := r.table_name; row_count := null;
    note := 'no single-column uuid primary key found -- needs manual handling';
    return next;
  end loop;

  return;
end;
$$ language plpgsql stable;

-- ---------------------------------------------------------------------------
-- 2. CLONE -- the real thing. Returns the new org's id.
-- ---------------------------------------------------------------------------
create or replace function clone_organization_data(
  p_source_org_id uuid,
  p_new_org_name text
) returns uuid as $$
declare
  v_new_org_id uuid;
  v_source_org_name text;
  r record;
  v_cols text;
  v_fk record;
  v_rows_touched bigint;
  v_total_cloned bigint := 0;
begin
  select name into v_source_org_name from organizations where id = p_source_org_id;
  if v_source_org_name is null then
    raise exception 'clone_organization_data: source org % not found', p_source_org_id;
  end if;

  -- 0. new org
  insert into organizations (id, name)
    values (gen_random_uuid(), p_new_org_name)
    returning id into v_new_org_id;
  raise notice 'Created new org % (%) cloned from % (%)',
    v_new_org_id, p_new_org_name, p_source_org_id, v_source_org_name;

  -- id-remap table for this run only
  create temporary table _clone_id_map (
    table_name text, old_id uuid, new_id uuid
  ) on commit drop;

  -- PASS 1 -- copy every included table's rows for this org, fresh uuids,
  -- every other column copied as-is (FK columns still point at OLD ids).
  for r in select * from _clone_candidate_tables() loop
    select string_agg(quote_ident(column_name), ', ')
      into v_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = r.table_name
       and column_name not in (r.pk_column, 'org_id');

    execute format($f$
      with src as (
        select %I as old_id, gen_random_uuid() as new_id %s
        from %I where org_id = $1
      ), ins as (
        insert into %I (%I, org_id %s)
        select new_id, $2 %s from src
        returning 1
      )
      insert into _clone_id_map(table_name, old_id, new_id)
      select %L, old_id, new_id from src
    $f$,
      r.pk_column,
      case when v_cols is not null then ', ' || v_cols else '' end,
      r.table_name,
      r.table_name, r.pk_column,
      case when v_cols is not null then ', ' || v_cols else '' end,
      case when v_cols is not null then ', ' || v_cols else '' end,
      r.table_name
    ) using p_source_org_id, v_new_org_id;

    get diagnostics v_rows_touched = row_count;
    if v_rows_touched > 0 then
      raise notice '  % : % row(s) copied', r.table_name, v_rows_touched;
      v_total_cloned := v_total_cloned + v_rows_touched;
    end if;
  end loop;

  -- PASS 2 -- remap FK columns on the newly-cloned rows so they point at the
  -- CLONED parent rows, not the originals. Only touches FK columns whose
  -- referenced table is itself one of the cloned (included) tables.
  for v_fk in
    select
      tc.table_name as child_table,
      kcu.column_name as fk_column,
      ccu.table_name as parent_table
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name in (select table_name from _clone_candidate_tables())
      and ccu.table_name in (select table_name from _clone_candidate_tables())
      and kcu.column_name <> 'org_id'
  loop
    execute format($f$
      update %I child
      set %I = m.new_id
      from _clone_id_map m
      where m.table_name = %L
        and child.%I = m.old_id
        and child.id in (select new_id from _clone_id_map where table_name = %L)
    $f$,
      v_fk.child_table, v_fk.fk_column,
      v_fk.parent_table,
      v_fk.fk_column,
      v_fk.child_table
    );
    get diagnostics v_rows_touched = row_count;
    if v_rows_touched > 0 then
      raise notice '  remapped %.% -> % (% row(s))',
        v_fk.child_table, v_fk.fk_column, v_fk.parent_table, v_rows_touched;
    end if;
  end loop;

  raise notice 'Done. % row(s) cloned in total into org %.', v_total_cloned, v_new_org_id;
  return v_new_org_id;
end;
$$ language plpgsql;

-- NOTE: PASS 2's remap UPDATE assumes the child table's primary key column
-- is literally named "id" (child.id in ...) -- true for every table this
-- session found in the real schema (checked via the earlier grep pass), but
-- if any org-scoped table uses a differently-named PK, that table's FK
-- remap would silently no-op (rows stay pointed at the original org's
-- parent rows) rather than fail loudly. clone_org_preview's pk_column
-- output tells you the real PK name per table -- worth a quick glance
-- before trusting a production run.
