---
title: North/Hub backlog - additions v2 (2026-10-08, supersedes the earlier 2026-10-08 additions doc)
description: Corrected additions to the 10-07 backlog - pod overrides and PPT export are NOT dropped (already built); adds Talk-to-this-screen / PDF / controls status, the org-credentials rule and the open items. Read with claude/2026-10-07-north-hub-backlog.md.
sources: [project docs search, code grep, Stef 2026-10-08]
---

# Backlog additions v2 - 2026-10-08
Supersedes `claude/2026-10-08-north-hub-backlog-additions.md`, which wrongly listed pod-level overrides and the PPT export as dropped.

## Built today (local commits awaiting Stef's push)
- Fill from brief + voice (Events, wizard): pushed `7ea8e8f`; not live-tested.
- Talk to this screen (8 modules): `3608b05`. PDF reading: `141e164`. Tick boxes / option buttons / time fields: `b667d47`. Hub + Queue menu repoint (Hub-Backend): `1fc5aeb`.
- Live test steps: `claude/2026-10-08-talk-to-this-screen-status-and-test-checklist.md` + steps 9-13 in `claude/2026-10-08-round2-pdf-controls-hub-menu-status.md`.

## Next phases (not started)
- Server-side folder watch (works when North is closed / Safari). **Must ship with an org-level credentials form** (standing rule 2026-10-08). Needs provider decision.
- Audio-file upload + transcription. Same rule (org supplies its own STT key).
- OCR for scanned PDFs (would use the org's own AI provider vision capability - needs a decision on cost).
- Hub (AH) screens + contact-form brief-fill (separate repo).
- Talk to this screen: add rows / create records; custom toggle switches.
- **Possible gap to scope:** per-org "bring your own app credentials" (Client ID/Secret, custom endpoint) for Hub connectors - today app credentials are Vercel env vars and only the account connection is per org.

## Genuinely still open from earlier backlog (verified 2026-10-08)
See `claude/2026-10-08-dropped-items-checklist.md`: v7 RLS confirm (10+ refreshes), Item 47 live re-check, multi-org auth test pass, Company Signals activation decision (Stef said "do not activate yet"), Strategy Drivers & rates "Reset layout" click, pod "Unassigned" row remove-option decision, widget no-auto-resize (parked), other migration run-status (region_streams, campaign_execution_status, profile_orgs), Item 37 privacy/T&Cs answers.
