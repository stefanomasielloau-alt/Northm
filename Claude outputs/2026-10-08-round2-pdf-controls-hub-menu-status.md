---
title: Round 2 (2026-10-08) - PDF reading, tick boxes/radios/times, Hub menu fix, org-credentials rule
description: What was built after "Talk to this screen": PDF reading, tick-box/option-button/time fields in Talk to this screen, Hub + Queue top-menu repoint to the renamed North modules, the standing "orgs bring their own credentials" rule, and the corrected dropped-items check. Includes the added live-test steps.
sources: [cowork session 2026-10-08]
---

# Round 2 status - 2026-10-08

## Commits (all LOCAL - need `git push`)
- **Northm** (3 ahead of origin): `3608b05` Talk to this screen; `141e164` PDF reading; `b667d47` tick boxes / option buttons / time fields.
- **Hub-Backend** (1 ahead): `1fc5aeb` Hub + Queue top menu now point at the renamed North modules.
No SQL for any of these.

## 1. Dropped-items check (read-only) - correction to my own earlier note
Pod-level rate/stream overrides and the Board-report PPT export are **already built and pushed** (not dropped). Genuinely open: v7 RLS confirm, Item 47 live re-check, multi-org auth test, Company Signals activation decision, Strategy "Reset layout" click, pod "Unassigned" row decision, other migrations' run-status, Item 37. Full table: `claude/2026-10-08-dropped-items-checklist.md`.

## 2. PDF reading (Fill from brief, Talk to this screen, Campaign Planning wizard upload)
Text-based PDFs now read (first 60 pages). pdf.js 3.11.174 (Apache-2.0) is **vendored** in `shared/vendor/pdfjs-3.11.174/` (same origin, no CDN, nothing leaves the browser) and only loads when a PDF is chosen. An org that wants to self-host it elsewhere can set `window.NORTH_PDFJS_BASE`. Limits: scanned/image-only PDFs give a clear "no readable text" message (no OCR yet); password-protected PDFs give a clear message (that path NOT tested with a real encrypted file).
Tested headlessly with real PDFs: text PDF extracts correctly incl. table cells; image-only PDF rejected honestly; 70-page PDF truncated at 60 with a note; corrupt PDF rejected; unsupported type rejected; all earlier regression tests pass.

## 3. Talk to this screen - now also tick boxes, option buttons, time fields
- Tick boxes appear to the AI as Ticked/Unticked; option-button groups as one field with its options; time fields as HH:MM. Applied by clicking/typing like a person, so each page's own handlers run; re-read afterwards, "skipped" if the page refuses.
- Un-ticked box = "empty" so ticking it is pre-selected; changing something already ticked/selected starts unticked in the review (same overwrite rule as other fields).
- Still skipped: disabled boxes, boxes named like passwords/consent-secrets, custom toggle switches built from divs, drag/resize widgets.
- Tested headlessly: field detection (incl. table-cell tick box labelled by row + column), review defaults, apply through page handlers, refused change reported as skipped.

## 4. Hub + Queue top menu
Both `contact-seeker-hub.html` and `linkedin-queue.html` linked to the OLD file names (Ordo.html, Cursus.html, Eventus.html, Custodia.html, Prospectus.html, Augur.html, Schema.html, Norma.html, Reportus.html) - labels were already new but the links went to pages that no longer exist. All 10 links per page (incl. Help) now point at Strategy, CampaignPlanning, Events, AssetRegister, Targets, Scoring, ProcessMaps, Configuration, Reporting, and the window names match North's own menu. Backups: Hub-Backend `archive/2026-10-08-pre-nav-rename-*.html`. Not live-clicked.
Still referencing old names (comments/docstrings only, harmless): comments in the two HTML files and Python docstrings.

## 5. Standing rule (Stef 2026-10-08): external connections must let an organisation add its own credentials
Applied to what is built so far: PDF reading and browser folder-watch need no credentials (all in the browser); AI calls already use the organisation's own provider/keys from Configuration > LLM providers (Hub-Backend `llm_providers`). Speech uses the browser's built-in recognition (in Chrome this is processed by Google's speech service - no key, but audio leaves the device; worth a line in the privacy statement, Item 37).
**Applies to the next builds**: server-side folder watch (Drive/OneDrive/Dropbox) and audio-file transcription must ship with an org-level credentials form from day one - not environment-only.
**Open question / possible gap to confirm:** Hub-Backend `connectors.py` is switched on by Vercel environment variables (platform-level app Client ID/Secret per provider); each org then connects its own account via OAuth and tokens are stored per org. That is "bring your own account", not "bring your own app credentials". If you want each org to enter its OWN Client ID/Secret (or custom API endpoint + key) in Configuration for every connector, that is a separate build - say if you want it scoped.

## Added live-test steps (after push + hard refresh)
9. Events > Fill from brief > add a text-based PDF: expect its text read and fields proposed. Try a scanned PDF: expect the "no readable text" message.
10. Campaign Planning wizard > Upload a document > a PDF: expect it reads.
11. Talk to this screen on an Events page: "tick Catering, set format to hybrid, doors open 9:30" (adapt to a screen that has such controls): expect Ticked/option/time rows in the review.
12. Hub and Queue: click each top-menu item: each opens the right North module (same tab reused on repeat).
13. Chrome F12 console: no errors while doing 9-12.

## Files
Created/modified - see the end-of-task list in the chat reply.
