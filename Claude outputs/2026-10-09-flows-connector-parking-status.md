# Flows and connectors — option C (park it, make the wording honest) — 2026-10-09

Committed locally in **Northm** and **Hub-Backend**; **not pushed**. Wording changes only: no behaviour change, no database change.

## Live check on your PC (read-only, nothing saved)
- Process Maps (My organization) lists 5 flows. **Only 1 is active:** "ZZ Claude test - inbound webhook".
- That flow's steps are *Log a note* and *Send email*. **No connector steps are in use.**
- Runs & approvals shows 2 runs, both from 29 Sept: one cancelled after the Gmail API was disabled, then a retry that sent 1/1 via Gmail (Done). So the inbound webhook, note and email paths worked end to end.
- The other 4 flows are not active, so they cannot run anything.
- I did not read the database directly (the permission system blocked it) and I did not create or activate a test flow.

## What changed
- **ProcessMaps.html:**
  - FAQ "How do I connect outside apps…" now says CRM/ad apps are set up in Configuration → Integrations, and that using them inside flows is planned but not available yet. It points to webhook, chat message and "pull from URL" for now.
  - The connector action editor shows the same note. The "(needs setup in Hub)" option label and the "credentials set up in Hub" warning now say "not available yet".
- **Hub-Backend flows.py:** the three messages that told people to "connect it in Hub Settings > Connectors" now say the app isn't available in flows yet and that CRM/ad apps are set up in North.
- The connector step type and `connectors.py` are **kept** (flows.py still imports it). Nothing is removed.

## Later (when you register the first real provider app)
Option A: move connector execution into North's Supabase (a signed call from Hub's dispatch, or inside flow-runner) so flows use the tokens saved in Configuration → Integrations.

## Rollback
- Northm: `git checkout pre-flows-connector-parking-2026-10-09 -- ProcessMaps.html`, or copy back `archive/2026-10-09-pre-flows-connector-parking-ProcessMaps.html`.
- Hub-Backend: `git checkout pre-flows-connector-parking-2026-10-09 -- flows.py`, or copy back `archive/2026-10-09-pre-flows-connector-parking-flows.py`.

## Tested
Syntax checks only (inline scripts in ProcessMaps.html; Python parse of flows.py) and a diff review of every changed line. Not tested in the browser: after pushing, open a flow, add an "App / connector" action and check the note shows.
