# Setup v2: flow-test-send  (replaces 2026-10-10-flow-test-send-setup.md)  - 2026-10-10

## What went wrong on the first attempt (so it does not repeat)
The code was pasted into the EXISTING `flow-runner` function instead of a NEW function. `flow-runner` is the scheduled flow engine, so it stopped working: its code was replaced and its "Verify JWT" setting went ON (pg_cron sends no user token, so every scheduled run would be rejected). Restore it first (A), then create the new function (B).

## A. Restore flow-runner  (do this first)
1. Supabase > Edge Functions > **flow-runner** > **Code**. Open `index.ts`, select all, delete.
2. Paste the whole of `C:\Users\stefa\OneDrive\Documents\GitHub\Northm\supabase\functions\flow-runner\index.ts` (48 lines, last changed 29 Sep, untouched by today's work). Click **Deploy updates**.
3. Check the Code tab still lists **flowEngine.js** and **runner.js** next to index.ts (they are part of this function). Do not edit them.
4. **Settings** tab: set **Name** back to `flow-runner` and turn **Verify JWT with legacy secret** **OFF** (its own file says JWT must be OFF: pg_cron has no user token, the X-Runner-Secret header is the auth). **Save changes**.
5. Tell me; I confirm from here that `flow-runner` answers a plain health check again with `engine: 2026-09-29.1`.

## B. Create the new function  (from the LIST, not from inside another function)
1. Supabase > **Edge Functions** (the list page) > **Deploy a new function** > **Via Editor**.
2. Name it exactly `flow-test-send`. Replace the sample code with the whole of `...\Northm\supabase\functions\flow-test-send\index.ts`. **Deploy**.
3. **Settings**: turn **Verify JWT with legacy secret** **OFF** - this function checks the signed-in user itself (it rejects a missing or invalid token with 401), and with newer Supabase signing keys the legacy-secret check can reject real user logins. (The first setup doc said ON; OFF is the safer setting.)
4. Secrets: nothing to add (`FLOW_DISPATCH_SECRET` is already set and shared).
5. Process Maps > a flow with a Send email step > Simulate > Run to end > **Send test to me**.
