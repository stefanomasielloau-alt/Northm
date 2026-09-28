-- =====================================================================================
-- 2026-09-28 -- Item 35 v2: clone an organisation's full dataset into a new org.
-- SUPERSEDES 2026-09-04-item35-clone-organization-function.sql (kept unchanged for reference).
--
-- Review of v1 (tested 28 Sep against a local Postgres copy of North's table shapes) found:
--   1. FAILS on any table with a unique key made of foreign keys (region_gate_rates,
--      region_streams, pod_gate_rates, pod_streams): v1 inserted each copy still pointing at the
--      SOURCE org's parents, colliding with the source row -> "duplicate key" and nothing cloned.
--   2. The 8 Sep auto-seed trigger on organizations (seed_new_organization) fires when v1 creates
--      the new org, so the clone ALSO got the starter regions/campaigns -> duplicates.
--   3. Tables whose primary key IS org_id (org_settings) broke v1's insert ("column specified
--      more than once").
--   4. Ids stored inside jsonb / text / uuid[] columns (e.g. activities.pre_chain) were never
--      remapped, so the clone silently pointed back at the source org's rows.
--   5. v1's functions were callable by any signed-in user through the API (no REVOKE).
-- v2 fixes all five: it builds the complete old->new id map FIRST, inserts parents before children
-- with every foreign key already remapped, pauses only the auto-seed trigger for the one INSERT
-- into organizations, handles org_id-keyed tables, rewrites ids inside jsonb/text/uuid[] columns,
-- and revokes API access. Still a full-dataset copy: run clone_org_preview_v2() first.
--
-- HOW TO USE (Supabase SQL editor, North project):
--   1. Run this whole file once (creates the functions; changes no data).
--   2. SELECT * FROM clone_org_preview_v2('<source org uuid>');        -- read-only
--   3. SELECT clone_organization_data_v2('<source org uuid>', 'New org name');
--      It returns the new org's id. Users are NOT copied (profiles/invites are excluded) --
--      invite testers into the new org as usual.
-- Prepared by Claude, NOT run on production. Tested locally only (see 2026-09-28 build log).
-- =====================================================================================

create or replace function _clone2_excluded_tables() returns text[] language sql immutable as $$
  select array['organizations','profiles','org_invites','audit_log','audit_log_archive','org_relations',
               'feedback_items','agent_dispatches','agent_destinations','profile_orgs','platform_admin_grants',
               'org_plans','org_plan_invoices','archived_seed_rows']
$$;

-- base tables in public with an org_id column, their single-column PK, and whether PK = org_id
create or replace function _clone2_tables()
returns table(tbl text, pk text, pk_is_org boolean) language sql stable as $$
  select c.relname::text, a.attname::text, (a.attname = 'org_id')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_constraint pk on pk.conrelid = c.oid and pk.contype = 'p' and array_length(pk.conkey,1) = 1
  join pg_attribute a on a.attrelid = c.oid and a.attnum = pk.conkey[1]
  where c.relkind in ('r','p')
    and exists (select 1 from pg_attribute o where o.attrelid = c.oid and o.attname = 'org_id' and not o.attisdropped)
    and not (c.relname = any(_clone2_excluded_tables()))
    and (a.attname = 'org_id' or format_type(a.atttypid, a.atttypmod) = 'uuid')
$$;

-- single-column FKs from a cloned table to another cloned table (or itself)
create or replace function _clone2_fks()
returns table(child text, col text, parent text) language sql stable as $$
  select ch.relname::text, a.attname::text, pa.relname::text
  from pg_constraint f
  join pg_class ch on ch.oid = f.conrelid
  join pg_class pa on pa.oid = f.confrelid
  join pg_attribute a on a.attrelid = ch.oid and a.attnum = f.conkey[1]
  where f.contype = 'f' and array_length(f.conkey,1) = 1 and a.attname <> 'org_id'
    and ch.relname in (select tbl from _clone2_tables() where not pk_is_org)
    and pa.relname in (select tbl from _clone2_tables() where not pk_is_org)
$$;

-- replace every mapped uuid found inside a text value
create or replace function _clone2_remap_text(t text) returns text language plpgsql as $$
declare m record; u text;
begin
  if t is null then return null; end if;
  for u in select distinct x[1] from regexp_matches(t, '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', 'g') as x loop
    select new_id into m from _clone2_map where old_id::text = lower(u) limit 1;
    if found then t := replace(t, u, m.new_id::text); end if;
  end loop;
  return t;
end $$;

create or replace function clone_org_preview_v2(p_source_org_id uuid)
returns table(bucket text, table_name text, row_count bigint, note text) language plpgsql stable as $$
declare r record; v bigint;
begin
  for r in select * from _clone2_tables() order by 1 loop
    execute format('select count(*) from public.%I where org_id = $1', r.tbl) into v using p_source_org_id;
    if v > 0 then bucket:='would_clone'; table_name:=r.tbl; row_count:=v; note:=case when r.pk_is_org then 'one row per org' else 'pk='||r.pk end; return next; end if;
  end loop;
  for r in select c.relname::text as tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
           where c.relkind in ('r','p') and exists (select 1 from pg_attribute o where o.attrelid=c.oid and o.attname='org_id' and not o.attisdropped)
             and c.relname not in (select tbl from _clone2_tables()) order by 1 loop
    bucket := case when r.tbl = any(_clone2_excluded_tables()) then 'excluded_by_design' else 'skipped_not_supported' end;
    table_name := r.tbl; row_count := null;
    note := case when bucket='excluded_by_design' then 'people, logs, billing and cross-org tables are never copied' else 'no single uuid primary key -- copy by hand if needed' end;
    return next;
  end loop;
end $$;

create or replace function clone_organization_data_v2(p_source_org_id uuid, p_new_org_name text)
returns uuid language plpgsql as $$
declare
  v_new uuid := gen_random_uuid();
  r record; tg record; f record;
  v_done text[] := '{}'; v_left text[]; v_progress boolean;
  v_cols text; v_sel text; v_n bigint; v_total bigint := 0;
  v_paused text[] := '{}';
begin
  if not exists (select 1 from organizations where id = p_source_org_id) then
    raise exception 'clone: source org % not found', p_source_org_id;
  end if;
  if coalesce(trim(p_new_org_name),'') = '' then raise exception 'clone: new org name is required'; end if;

  -- pause ONLY the auto-seed trigger(s) for the org insert (transactional: an error rolls this back too)
  for tg in select t.tgname from pg_trigger t join pg_proc p on p.oid = t.tgfoid
            where t.tgrelid = 'public.organizations'::regclass and not t.tgisinternal and p.proname = 'seed_new_organization' loop
    execute format('alter table public.organizations disable trigger %I', tg.tgname);
    v_paused := v_paused || tg.tgname::text;
  end loop;
  insert into organizations (id, name) values (v_new, p_new_org_name);
  foreach tg.tgname in array v_paused loop
    execute format('alter table public.organizations enable trigger %I', tg.tgname);
  end loop;

  -- 1. complete old -> new id map, before anything is inserted
  create temporary table _clone2_map (tbl text, old_id uuid, new_id uuid) on commit drop;
  create index on _clone2_map (old_id);
  for r in select * from _clone2_tables() where not pk_is_org loop
    execute format('insert into _clone2_map select %L, %I, gen_random_uuid() from public.%I where org_id = $1', r.tbl, r.pk, r.tbl)
      using p_source_org_id;
  end loop;

  -- 2. one-row-per-org tables (pk = org_id), e.g. org_settings
  for r in select * from _clone2_tables() where pk_is_org loop
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
      from pg_attribute where attrelid = format('public.%I', r.tbl)::regclass and attnum > 0 and not attisdropped
       and attgenerated = '' and attname <> 'org_id';
    execute format('insert into public.%I (org_id%s) select $2%s from public.%I where org_id = $1 on conflict (org_id) do nothing',
      r.tbl, coalesce(', '||v_cols,''), coalesce(', '||v_cols,''), r.tbl) using p_source_org_id, v_new;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end loop;

  -- 3. insert parents before children, every FK already pointing at the new rows
  v_left := array(select tbl from _clone2_tables() where not pk_is_org);
  while array_length(v_left,1) > 0 loop
    v_progress := false;
    for r in select t.* from _clone2_tables() t where t.tbl = any(v_left) loop
      if exists (select 1 from _clone2_fks() k where k.child = r.tbl and k.parent <> r.tbl and k.parent = any(v_left)) then
        continue;  -- a parent still to do
      end if;
      select string_agg(
               case
                 when a.attname = r.pk then format('(select new_id from _clone2_map m where m.tbl=%L and m.old_id=s.%I)', r.tbl, a.attname)
                 when a.attname = 'org_id' then '$2'
                 when exists (select 1 from _clone2_fks() k where k.child=r.tbl and k.col=a.attname)
                   then format('coalesce((select new_id from _clone2_map m where m.old_id=s.%1$I limit 1), s.%1$I)', a.attname)
                 when format_type(a.atttypid,a.atttypmod) in ('jsonb','json','text','uuid[]','text[]')
                   then format('_clone2_remap_text(s.%I::text)::%s', a.attname, format_type(a.atttypid,a.atttypmod))
                 else format('s.%I', a.attname)
               end, ', ' order by a.attnum),
             string_agg(quote_ident(a.attname), ', ' order by a.attnum)
        into v_sel, v_cols
        from pg_attribute a
       where a.attrelid = format('public.%I', r.tbl)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      execute format('insert into public.%I (%s) select %s from public.%I s where s.org_id = $1', r.tbl, v_cols, v_sel, r.tbl)
        using p_source_org_id, v_new;
      get diagnostics v_n = row_count;
      if v_n > 0 then raise notice '  %: % row(s)', r.tbl, v_n; v_total := v_total + v_n; end if;
      v_left := array_remove(v_left, r.tbl);
      v_progress := true;
    end loop;
    if not v_progress then
      raise exception 'clone: circular foreign keys between %, nothing was cloned', v_left;
    end if;
  end loop;

  raise notice 'Done: % row(s) cloned into new org % (%).', v_total, v_new, p_new_org_name;
  return v_new;
end $$;

-- API lock-down: these must only ever be run from the SQL editor.
revoke all on function _clone2_excluded_tables(), _clone2_tables(), _clone2_fks(), _clone2_remap_text(text),
  clone_org_preview_v2(uuid), clone_organization_data_v2(uuid, text) from public, anon, authenticated;
do $$ begin
  if to_regprocedure('clone_organization_data(uuid,text)') is not null then
    execute 'revoke all on function clone_organization_data(uuid, text) from public, anon, authenticated';
  end if;
  if to_regprocedure('clone_org_preview(uuid)') is not null then
    execute 'revoke all on function clone_org_preview(uuid) from public, anon, authenticated';
  end if;
end $$;
