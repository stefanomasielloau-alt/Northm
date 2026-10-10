# Setup: "Send test email to me" for Process Maps Simulate  (2026-10-10)

Needed once. Until it is done, the Simulate button still appears but explains that the test sender is "not installed yet". Nothing else in North is affected.

## 1. Deploy the Edge Function (no command line needed)
1. Supabase dashboard (North project, `rcmocuubeajnqjltuwdv`) > **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Name it exactly `flow-test-send`.
3. Paste the whole of `supabase/functions/flow-test-send/index.ts` from the Northm repo > **Deploy**.
4. Leave **Enforce JWT verification** ON.

## 2. Secrets
- `FLOW_DISPATCH_SECRET` - the same value already used by `flow-runner`. If flow-runner works, it is already set (secrets are shared across functions).
- `HUB_URL` - optional; defaults to `https://hub-backend-psi.vercel.app`.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

No database change. No Hub-Backend change (it uses the existing `/flows/dispatch`).

## 3. Check it is live
Open `https://rcmocuubeajnqjltuwdv.supabase.co/functions/v1/flow-test-send` in a browser tab: you may see an auth error (JWT is enforced) - that is fine. The real check is step 4.

## 4. Try it
Process Maps > open a flow that has a **Send email** step > **Simulate** > **Run to end** > in "Send a test email to me" press **Send test to me**.
- Expected: green "Sent to <your login email>", and an email titled `[TEST] <subject>` arrives in your own inbox, from your organisation's Hub sender account.
- Pressing it twice in the same minute does not send twice.
- If it says the sending account has no email method connected, connect one in Hub (the same thing real flow runs need).

## Safety design
- Recipient is always your own verified login email, read from your session on the server - the request cannot name anyone else.
- Subject is prefixed `[TEST]` and the body begins with a "this is a test" line.
- Same signed route as real runs (HMAC `ts.rawBody`), so a successful test also proves real sending works.

## Remove it
Delete the function in the dashboard (or just leave it undeployed). The button then shows the "not installed yet" message.
