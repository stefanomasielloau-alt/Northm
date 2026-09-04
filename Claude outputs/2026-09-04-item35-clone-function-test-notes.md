# Item 35 — clone_organization_data — what was actually tested

**Not tested against the real Supabase database** — I don't have direct
read/write access to it from this session. Instead I built a synthetic mock
schema (uuid PKs, org_id on every org-scoped table, real FK chains) modeled
on the real table names found by grepping the Northm repo, spun up a local
Postgres 16 in the session workspace, and ran the actual function against it.

## What's confirmed working (verified by running it, not just reading it)

- **Schema discovery is correct**: `clone_org_preview()` correctly found every
  org-scoped table, correctly excluded the 8 tables on the exclude list
  (with their row counts still shown, for visibility), and correctly
  reported `pk=id` for each included table.
- **Org isolation holds**: a second, unrelated org's rows (same table,
  different org_id) were never touched, counted, or leaked into a clone —
  checked directly by seeding a decoy org.
- **Foreign keys are correctly remapped**: cloned `campaigns` pointed at the
  *cloned* `business_units`/`cost_buckets` rows (not the originals);
  cloned `activities`/`tasks` pointed at the *cloned* campaign; a 2-hop FK
  chain (`task_campaign_links` → `tasks` → `campaigns`) remapped correctly
  through both hops.
- **Source data is never modified**: ran the clone twice against the same
  source org — the source org's row counts didn't change either time.
- **Repeatable**: ran the clone twice in a row (per Stef's "multiple times
  if needed" requirement) — two independent new orgs, no collisions, no
  errors, each internally consistent.
- **Excluded tables genuinely stay empty in the clone**: checked directly —
  the new org had zero rows in profiles/org_invites/audit_log.
- **One real bug caught and fixed by this testing**: the first version had
  a PL/pgSQL variable-name collision (`table_name` used both as a function
  OUT parameter and a bare column reference inside a subquery) that Postgres
  rejected outright with `column reference "table_name" is ambiguous`. Fixed
  by qualifying the subquery alias. Would NOT have been caught without
  actually running it.

## What's NOT verified — real-schema unknowns this testing can't rule out

- **The real table/column list.** The mock schema is my best reconstruction
  from grepping the frontend, not a real schema dump. `clone_org_preview()`
  is specifically designed to route around this — it discovers the ACTUAL
  schema at runtime when you run it for real, not this mock — but I can't
  promise the real schema won't have a wrinkle I didn't anticipate (e.g. a
  non-uuid PK on some table, which the function is built to skip safely and
  report under `skipped_not_supported` rather than silently mishandle, but
  I haven't seen that case actually occur in a test).
- **RLS policies.** If any org-scoped table's Row Level Security policy
  would block this function's own writes (depends what role runs it — the
  Supabase SQL editor normally runs as a superuser/service role that
  bypasses RLS, but worth confirming when you run it).
- **Very large tables.** Mock test data was tiny (1-2 rows per table). The
  two-pass copy-then-remap approach should scale fine (it's set-based, not
  row-by-row), but this wasn't load-tested.
- **Whether the exclude list is the right one.** I made judgment calls on
  which org-scoped tables are "demo content" vs. "real operational data"
  (see the SQL file's header comment for the list and reasoning) — worth
  your eyes on that list specifically before the first real run, since it's
  the one part of this that's a judgment call rather than something testable.

## Recommended first real run

1. Run the whole `.sql` file once in Supabase's SQL editor (defines the
   functions, writes nothing).
2. `select * from clone_org_preview('<bodgit-and-scarpa-org-id>');` — read
   only, zero risk. Confirm the `would_clone` list and row counts look
   right, and that nothing unexpected shows up under
   `skipped_not_supported`.
3. `select clone_organization_data('<bodgit-and-scarpa-org-id>', 'Tester Org 1');`
   — run it in the SQL editor (not via a client library) so you see the
   `RAISE NOTICE` progress log as it runs.
4. Open the new org in North's UI and spot-check it before inviting anyone.
