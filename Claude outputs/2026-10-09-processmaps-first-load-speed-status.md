# Process Maps first-load speed — found and fixed 2026-10-09

Committed locally; **not pushed**. One line of behaviour changed; no database change.

## What I found (measured on your PC, live, read-only)
On a fresh load of Process Maps the page took about **16 seconds** to finish (the earlier "5 s" was a better day). The page's own data requests (about 25 calls to your database) all completed in roughly 2 seconds. The delay was one call to Hub-Backend, `/automations/external-events`, which took **14.2 s** (a slow Hub response, likely a cold start). Process Maps was *waiting for it* before drawing anything, because the start-up code awaited that call.

## The fix
That call now runs in the background instead of being awaited at start-up. It already fails softly, and the Automations page fetches the same events again (immediately and every 5 minutes) before it checks any trigger, so no automation fires any differently. Expected result: Process Maps draws after the ~2 s of database calls instead of waiting on Hub.

## Behaviour difference to know about
External-trigger events (webhook-style triggers) merge in whenever Hub answers, so on the first screen a pending count that depends on them can appear a moment later or on the next click, rather than before the page draws.

## Rollback
`git checkout pre-processmaps-speed-2026-10-09 -- ProcessMaps.html`, or copy back `archive/2026-10-09-pre-processmaps-speed-ProcessMaps.html`.

## How to confirm after pushing
Hard refresh Process Maps: it should be usable in about 2–3 s. If you want the root cause fixed too, the Hub endpoint's slow response (cold start or a slow query) is worth a look separately — it also affects anything else that calls it.

## Tested
Syntax check, diff review, and confirmed the function being called cannot throw (it wraps everything in its own try/catch) and that the Automations page re-fetches before evaluating. Not re-measured after the change (needs the push).
