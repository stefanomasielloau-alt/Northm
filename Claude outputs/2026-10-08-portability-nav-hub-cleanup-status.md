# Portability, nav bundling and Hub clean-up — status (2026-10-08)

Commits: Northm `95b67d0` · Hub-Backend `1472a06` (both local — push from GitHub Desktop).

## 1. Encryption key / move-readiness
- `connectors` and `voice` functions now use the function secret **`NORTH_SECRET_KEY`** when set (also accept `CONNECTOR_SECRET_KEY` / `VOICE_SECRET_KEY`).
- Safe at any time: anything saved earlier under the service-role-derived key is still read and re-encrypted under the new key
  (connectors on the next list/test; voice on its next Save). Nobody re-enters anything.
- New optional secret **`CONNECTOR_REDIRECT_URI`** replaces the callback address shown to admins and used in sign-ins (https only).
- `vercel.json` has a new rewrite `/oauth/callback` → the connectors function, so the future domain's address is ready; to move backend later change that one destination.
- The connectors panel shows a "Portability" note while the key is still tied to the Supabase project, and a hint about the callback address.
- Tests: handler 58 checks (12 new: late key set, upgrade of old rows/tokens, key removed/restored, override ignored if not https), core 104, browser end-to-end 41 — all pass. **Not run on real Supabase/Deno.**

### You do (once)
1. Redeploy `connectors` and `voice` (paste the new `index.ts` from each).
2. Supabase → Edge Functions → Secrets → add `NORTH_SECRET_KEY` (32+ random characters). **Keep a copy in your password manager.**
3. `git push` Northm (also needed for the `/oauth/callback` rewrite); test `https://northm.vercel.app/oauth/callback` shows "North connectors function is running."
4. When you buy the domain: add it in Vercel, set `CONNECTOR_REDIRECT_URI=https://<domain>/oauth/callback`, then register that address in provider apps. Until then, avoid registering provider apps (or accept re-registering).

## 2. Configuration navigation bundled (21 items → 9)
Home · Roles & users · Costs & partners (buckets, budget categories, partner types, partners, currency) · Tracking & naming (tracking IDs, campaign naming) ·
AI & agents (AI providers, agent registry, agent activity) · Integrations (integrations, export) · Feedback (North feedback, AH feedback) ·
AH (accounts, companies) · Admin (branding, licensing, regions & pods).
A group's pages appear as tabs across the top; re-opening a group returns to the last tab used; all existing `go('<page>')` links still work; Licensing / Regions stay hidden for roles that couldn't see them; read-only badges kept. Tested headlessly (22 checks) + screenshot. Not yet seen on the live site.

## 3. Hub (Contact Seeker) clean-up
- Removed the "CRM & advertising connectors" section from Settings → Connectors and its loader/JS (about 55 lines); replaced by a one-line pointer to North. The tab keeps only the contact APIs.
- **Left in place on purpose:** `connectors.py` and its `/connectors` routes in Hub-Backend (no screen uses them now). Say the word and I'll retire them (archive first).
- Backup: `Hub-Backend/archive/2026-10-08-pre-crm-connectors-removal-contact-seeker-hub.html`.
