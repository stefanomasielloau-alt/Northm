# Process Maps Simulate - "I don't get the email"  (2026-10-10)

Committed locally in Northm; **not pushed**. One new Edge Function to deploy (see setup file). No database change.

## Why no email arrived
Simulate was always a dry run - it never sends anything - but the screen did not say so clearly. Real emails only go out when a flow is **Active** and runs.

## What changed (you asked for "Both")
1. **Clearer wording** on the Simulate tab: "Simulate never sends anything" with a pointer to the test button and to making the flow Active. Two Help/FAQ entries added.
2. **"Send a test email to me"** panel under the simulation: lists every Send email step the run reached (subject filled with the simulated record) with a **Send test to me** button. It sends one real copy, marked `[TEST]`, to your own login email only.
3. **New Edge Function `flow-test-send`** (recipient fixed server-side, duplicate-click guard per minute, same signed Hub route as real runs).

## Behaviour notes
- `{{name}}` in a test uses the simulated record's name; other `{{fields}}` come from that record, exactly as the engine does for real runs.
- The sender is the organisation's Hub sender account (as for real runs), not your personal mailbox.
- Not built: a daily cap per person (only the same-minute duplicate guard).

## Rollback
`git checkout pre-simulate-test-email-2026-10-10 -- ProcessMaps.html`, or copy back `archive/2026-10-10-pre-simulate-test-email-ProcessMaps.html`. Delete/undeploy `flow-test-send` if installed.

## Tested
- Edge Function core logic: 13 checks (input cleaning, recipient forced to self, [TEST] marking, idempotency key, HMAC cross-checked against Python).
- Page level, real FlowEngine with a fake function endpoint: 16 checks (note wording, email steps listed and filled, token sent with no recipient field, repeat-send, Hub error, function not deployed, signed-out, HTML escaping, no page errors).
- Not tested end to end against Hub / a real inbox - that needs the deploy and your step-4 try-out.
