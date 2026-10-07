# Zapier integration -- setup checklist (built 2026-10-06)

Built to the credential point, same as every other connector in this project -- the only things
left are things only Stef can do (a Zapier developer account, and one quick authenticated call to
mint North's own API key). Nothing here needs external accounts to have been *built*.

## Why this shape (long-term vs. short-term tradeoff, answered)

Zapier is architecturally the reverse of every other connector: North needs to become something
Zapier connects **into**, not something North connects out to. Two shapes were possible:

- **Module-specific** (a trigger per module -- "new Lead", "new Deal", "new Event" -- and an action
  per module -- "create a Lead", etc.). Quick to demo for one module, but every module needs its own
  new trigger/action/endpoint, forever. Doesn't compose with anything else in North.
- **Flow-based** (what got built): one generic trigger ("New Flow Run") and one generic action
  ("Trigger a North Flow"), both riding on North's own flows runtime -- the automation layer that
  already exists, already spans every module, and is where new automation logic is meant to live
  going forward. A new module, or a new "when X happens, do Y" rule, needs a new *flow*, not a new
  *Zapier integration file*. No rework later when the next module needs Zapier access.

Picked the flow-based shape for exactly that reason: short-term it's no slower to build (it's
actually less code -- the action needs zero new backend endpoints), and long-term it never needs
redoing.

## What's built

- **`zapier-integration/`** (new folder, this repo) -- a real Zapier Platform CLI project: one
  trigger (`new_flow_run`, polling), one action (`trigger_flow`), API-key authentication. Verified
  with `node --check` on every file.
- **`supabase/functions/zapier-keygen/`** -- new Edge Function. Mints a North API key for the
  calling org (authenticated with the caller's own North session token -- same pattern as every
  other authenticated call North's frontend already makes). The raw key is shown once; only its
  hash is stored.
- **`supabase/functions/zapier-poll-runs/`** -- new Edge Function. The trigger's data source --
  returns an org's recent flow runs (covers both "ran" and "needs approval", since `status` already
  distinguishes them), authenticated with the API key.
- **`Claude outputs/2026-10-06-migration-zapier-api-keys.sql`** -- new `api_keys` table (org-scoped,
  RLS, hash-only storage). Generic name on purpose -- any future reversed integration (not just
  Zapier) reuses it instead of getting its own one-off token table.
- **The action needs no new backend code at all** -- it calls the flow-inbound webhook that's
  already been live since 2026-09-29, just with the Supabase `apikey` header baked in (this is the
  actual fix for the backlog's "flow-inbound requires a Supabase apikey header" item, as far as
  Zapier's own calls are concerned -- the broader fix, if any other external caller needs it too,
  is still the Supabase dashboard check in that backlog item).

## What's still needed (in order)

1. **Run the migration.** `Claude outputs/2026-10-06-migration-zapier-api-keys.sql` against the
   North Supabase project -- same manual step every other migration in this project needs.
2. **Deploy the two new Edge Functions** (`zapier-keygen` with JWT verification ON -- the default;
   `zapier-poll-runs` with JWT verification OFF, same as `flow-inbound`).
3. **Mint your org's API key.** No admin-UI button for this yet (flagged below as a fast follow) --
   for now, one authenticated call does it. From the browser console while logged into North:
   ```js
   const { data } = await sb.auth.getSession();
   const res = await fetch('https://rcmocuubeajnqjltuwdv.supabase.co/functions/v1/zapier-keygen', {
     method: 'POST',
     headers: { 'Authorization': `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
     body: JSON.stringify({ label: 'Zapier' }),
   });
   console.log(await res.json());   // { ok: true, api_key: "nk_...", label: "Zapier" } -- copy it now, shown once
   ```
4. **Create a Zapier developer account** at platform.zapier.com (free) -- this is the actual
   "credential point" equivalent to every other connector's provider-dashboard signup.
5. **`cd zapier-integration && npm install -g zapier-platform-cli && zapier login && zapier push`**
   -- registers the integration as a private/unlisted Zapier app (visible only to you, needs no
   Zapier review) for testing.
6. **In Zapier:** Connect an Account using the `nk_...` key from step 3. Test the "New Flow Run"
   trigger against any flow that's already run at least once. Test "Trigger a North Flow" against a
   flow whose trigger is set to "Inbound webhook" in Process Maps (gives you the `flow_id` +
   `webhook_token` the action needs).

## Not built this pass -- flagged, not guessed at

- **No admin-UI button to mint/rotate/revoke API keys.** Step 3 above is a one-off console command
  for now. A real "Integrations" settings panel (generate key, see label/last-used, revoke) is a
  small, contained follow-up once the integration itself is proven out -- say the word.
- **Only one trigger, one action.** Matches the memo's "minimal 1+1" recommendation. More of either
  (e.g. an action to create a Lead/Deal directly, bypassing flows) is additive later, not a rework.
- **Public App Directory listing** (so North shows up in Zapier's own search) is a separate,
  heavier Zapier review process -- private/unlisted (step 5) needs none of that and is enough for
  Stef's own use and for any customer he hands a direct Zap-template link to.
