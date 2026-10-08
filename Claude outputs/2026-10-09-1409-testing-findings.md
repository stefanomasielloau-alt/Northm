# North/Hub live UAT run — 2026-10-09

## Scope
North only (production, https://northm.vercel.app/), read-only, as the already-signed-in Super User (Stefano, Tac-Tik, "All organisations" super-admin view) in Stef's Chrome. Every module's sidebar/tab pages were opened by script-clicking each entry, with `console.error`, `window.onerror` and `unhandledrejection` hooks installed to catch anything thrown. Nothing was saved, created, activated or deleted. **Not covered:** AH (contact-seeker-hub.html) and LinkedIn Queue (popup/SSO-handoff limits per skill notes), real provider sign-ins, mic/voice, Ask Alec AI calls, any data-changing flow.
Also run this session: Stef's read-only migration-status query in the Supabase SQL editor (see below).

## Errors found
**None thrown.** 0 console errors / unhandled rejections across: Strategy (14 pages), Campaign Planning (6), Events (5), Assets (6), Targets (8), Scoring (5), Process Maps (5), Reporting (5), Configuration (9 groups), Home. (Confidence: confirmed live for thrown errors only; console history from page load itself could not be captured — the browser console tool returned nothing on fresh loads — so a load-time-only error would be missed.)

## Real gap found by reading code (not a thrown error) — needs your decision
**Flow "App / connector (via Hub)" steps no longer have anywhere to connect.** Today's move put CRM/ad connectors into North Configuration (new Supabase tables) and removed the Hub Settings → Connectors section. But the flow runtime still executes connector actions in Hub-Backend (`flows.py` → `connectors.get_access_token` against Hub's own token table and Hub env vars), and its error messages and Process Maps' help text still say "a Hub admin connects it in Hub Settings > Connectors" / "credentials added in Hub". Result: no one can connect a connector for flows any more, and a connector connected in North is invisible to flows. Also: `connectors.py` is **not** unused — `flows.py` imports it — so do **not** retire it. Options: (a) flow-runner reads North's connector tokens (build; needs the NORTH_SECRET_KEY decrypt path on the Hub side or move connector execution into the Supabase function); (b) restore a minimal Hub connect screen (undoes today's rule). Likely low impact today: all 16 North cards show "Needs credentials", and the Hub connectors were never tested against a real account — but I could not check Hub's own token table, so confirm no flow already uses a connector step. Confidence: confirmed in code (flows.py lines ~568–700), not exercised live.

## Performance notes (single-user impression, not a benchmark)
- Process Maps: on a fresh load the spinner was still showing at 5 s; fine afterwards.
- Strategy: Dashboard, Quick calculator, Drivers & rates, Activity plan, Campaign & cost, Actuals, Snapshots each take ~1 s of blocking render on first open (others <0.3 s).
- Configuration → Integrations (16 connector cards + custom + voice) settles in ~3 s.

## Functionality gaps / observations
- Reporting → Drill-down start-point list shows duplicate programme names (e.g. "Always-on Demand Gen" ×2, "Enterprise Growth FY27" ×2; 61 options). Scope was "All organisations", so these may be two orgs' programmes — worth a quick look in a single-org view before calling it a bug. The drill-down itself works: "★ Everything" drew a 49-node graph.
- Page text for Targets sub-pages is short (≈1k characters) — looks like empty-state content for this org, not a failure.
- Connector redirect URL still shows the Supabase address (expected until `CONNECTOR_REDIRECT_URI` is set with a domain).
- Code comments throughout still mention old file names (Ordo.html, Norma.html …). All are comments; **no live links point at old names** (checked every string/href in all 10 files).

## What passed clean
- Top-nav links on every module use the new file names and resolve (index lists 10 links, all current).
- Configuration: 9 nav groups with sub-tabs; Integrations shows 16 alphabetical connector cards, Voice card, Add custom API; the "Portability" warning is gone (dedicated key active); redirect URL shown.
- Reporting drill-down renders a real graph; Process Maps pages (Flows, System processes, Bundles, Runs) all open.
- **Supabase migration check (read-only):** all 29 groups APPLIED — including v7 RLS bypass closure ("no `*_super_admin_all` policies left"), stream/segment dedup, region_streams, campaign_execution_status, profile_orgs, augur confidence_level, budget_line_items/categories, partners-build, voice_providers and connectors tables.

## HELP/FAQ proposals (NOT applied — need your OK)
Corrections
1. ProcessMaps — "How do I connect outside apps (connectors, webhooks, AI agents)?" currently says connectors are "set up in Hub" with credentials "added in Hub". Proposed: say the CRM/ad connectors are set up per organisation in **Configuration → Integrations → CRM & advertising connectors**; add a note that using them inside flows is pending (see gap above) — final wording depends on your decision there.
Additions (none of these exist in any module's FAQ today)
2. Configuration: *"Where do I enter my CRM or advertising app credentials?"* — Configuration → Integrations → CRM & advertising connectors: each organisation enters its own Client ID/secret on the card, then Save → Sign in (or Connect) → Test. Secrets are saved encrypted and never shown again. "+ Add custom API" covers anything not listed.
3. Configuration: *"What is the Redirect URL on the connectors page?"* — the address to register in the provider's developer console; same for every connector.
4. Configuration: *"Where did the Configuration menu items go?"* — grouped into 9 items; pages appear as tabs (e.g. Costs & partners → Cost buckets, Budget categories, Partner types, Partners, Currency).
5. Configuration: *"How do I set up read-aloud voices?"* — Configuration → Integrations → Voice; choose a provider, paste your key, Test voice; Ask Alec falls back to the browser voice if it fails.
6. Strategy / Campaign Planning / Events / Assets / Targets / Scoring / Configuration / Reporting: *"What is 'Talk to this screen'?"* — floating button; speak or type what to fill in; review before anything is applied; fields the page refuses are listed as skipped; not available in Process Maps.
7. Ask Alec modules: *"Can Ask Alec read answers aloud / review the screen?"* — per-message Read aloud with pause/stop/voice/speed; "Review this screen" gives headline / working / needs attention / recommended; "Create draft…" only opens a pre-filled form — nothing is created until you press Create.
8. Strategy / Campaign Planning / Events: *"Can I upload a PDF as a brief?"* — yes, text-based PDFs (first 60 pages); scanned/image-only PDFs show "no readable text".

## Skill changes made this run
None required to the skill file. One practical note for next time (kept here rather than in the skill): Claude-in-Chrome console capture returned nothing on fresh loads, so a script-installed error hook + click-through gave the most reliable read; the probe is cheap to re-create.
