# CRM & advertising connectors in North — one-time setup (platform owner)

Done once per Supabase project. After this, every organisation's admin manages their own credentials in
**North → Configuration → Integrations → CRM & advertising connectors** — no Supabase or Vercel access needed.

## Steps (about 10 minutes)

1. **Run the SQL.** Supabase dashboard (North project) → SQL Editor → paste `2026-10-08-migration-connectors.sql` → Run.
   Creates three tables (`connector_apps`, `connector_app_secrets`, `connector_tokens`). Safe to run twice.
   Rollback: `2026-10-08-migration-connectors-ROLLBACK.sql` (drops the three tables and everything stored in them).
2. **Deploy the function.** Edge Functions → Deploy a new function → Via Editor → name it exactly `connectors` →
   paste `supabase/functions/connectors/index.ts` → Deploy.
3. **Turn "Verify JWT" OFF** for `connectors` (function settings). Needed because the provider's redirect back to North carries no
   login token. The function itself checks the North session token on every call except the provider redirect, and the redirect
   is protected by a signed, 15-minute `state`.
4. **No secrets to set.** The encryption key is derived from the project's own service-role key. (Optional: set a
   `CONNECTOR_SECRET_KEY` secret to use a separate key — but do it *before* anyone saves credentials, or they must re-enter them.)
5. **Hard refresh** North (Ctrl+F5), open Configuration → Integrations. The cards load.
6. **Commit/push** the Northm repo so `connector-done.html` and the new `Configuration.html` go live on Vercel.

## What each organisation admin does (per connector card)

1. Copy the **Redirect URL** shown at the top of the card list: `https://<project>.supabase.co/functions/v1/connectors`
   (the same address for every connector).
2. In the provider's developer console, create an app and register that Redirect URL (the card's "Setup steps" says where).
3. Paste the Client ID / secret (and any region/address field) on the card → **Save** → **Sign in** (or **Connect** for
   API-key / client-credential connectors) → **Test**.
4. Anything not on the list: **+ Add custom API** (OAuth sign-in or API key).

## Security notes

- Secrets and tokens are AES-256-GCM encrypted in the database; the browser never receives them (cards only show "saved").
- The three tables have RLS on with no policies and no grants to `anon`/`authenticated`; only the function (service role) reads them.
- Only people whose role has **Configuration** access can list/save/connect. Each org sees only its own rows.
- Outbound calls from the function: https, port 443, public hosts only (private/internal addresses blocked), redirects never followed, 20 s timeout, 256 KB reply cap.
- After **Oct 30 2026** Supabase requires explicit GRANTs on new tables; the migration already grants `service_role` explicitly.

## Not verified (be upfront)

- No provider sign-in has been tested against a real account (never tested in Hub either). Use **Test** after connecting each one.
- Marketo's token request was changed to a GET with query parameters (per its docs) — unverified.
- The function was tested with a Node harness (104 + 46 checks + a browser end-to-end), **not** on real Supabase/Deno.
- Contact Seeker (Hub) still has its old CRM section until you confirm this page works; then it is removed (archive first).
