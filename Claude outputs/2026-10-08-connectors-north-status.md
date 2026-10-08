# Connectors moved into North Configuration — status (2026-10-08)

**Committed in Northm: `1863ab3`** (not pushed — `git push` when ready).

## What's built
- **Configuration → Integrations → "CRM & advertising connectors"**: 16 cards (HubSpot, Salesforce, Zoho, Dynamics, NetSuite, Marketo, Google Ads, Google Analytics, Pipedrive, Airtable, Excel, Monday, ClickUp, Xero, MYOB, Sage), 3 per row (2 on tablets, 1 on phones).
- Per card: credential fields (secrets write-only, show "saved"), Save, Sign in / Connect, Test, Disconnect, Clear, collapsible setup steps, status pill.
- Copyable **Redirect URL** box; **+ Add custom API** (OAuth sign-in or API key; edit/remove; max 20 per organisation).
- Credentials are entered per organisation in the UI — no Vercel env vars, no Supabase edits. Only roles with Configuration access.
- New Edge Function `connectors` (encrypted storage, signed 15-minute OAuth state, SSRF guards), `connector-done.html` (closes the sign-in pop-up and updates the card), 3 new tables.

## You need to do (once) — details in `2026-10-08-connectors-setup.md`
1. Run `Claude outputs/2026-10-08-migration-connectors.sql` in the North SQL editor.
2. Deploy Edge Function `connectors` (paste `supabase/functions/connectors/index.ts`), **Verify JWT OFF**.
3. `git push` Northm, hard refresh North.
4. Still pending from earlier: deploy the `voice` function.
5. Register `https://rcmocuubeajnqjltuwdv.supabase.co/functions/v1/connectors` as the redirect URL in each provider app.

## Tested / not tested
- Tested: function core (104 checks) + handler (46 checks) in Node; browser end-to-end (card grid 3/2/1 columns, drafts, save, secret never in page/DB plaintext, pop-up sign-in → Connected, Test, Disconnect, API-key connect + rejected key, add/remove custom, validation + private-address rejection, no-permission and function-missing messages); the real `Configuration.html` renders the new panel.
- **Not tested:** real Supabase/Deno runtime; any real provider sign-in; Marketo token request (changed to GET per its docs).

## flow-inbound 401 (read-only check, nothing changed)
- In the Supabase dashboard, `flow-inbound` already has **Verify JWT OFF** — nothing to toggle.
- Its 401s come from the function's own code (`index.ts`): "missing ?token=" if the URL has no `?token=`, or "unauthorized" if the token's SHA-256 doesn't match the flow's stored `inbound_token_hash` (token mistyped, regenerated since, or never generated for that flow).
- Logs show "No data" for the last hour, so I couldn't see the failing request. Next step: send a test POST to `.../flow-inbound/<flow_id>?token=<fresh token>` after regenerating the token in Process Maps; tell me the response text if it still fails.

## Still open
- Contact Seeker (Hub): remove its CRM section **after you confirm this page works** (archive first).
- You: password-reset email template; Activities↔Events reproduction.
- Earlier open items: Item 47 drill-down check, multi-org auth test, Strategy Reset layout, Company Signals decision.
