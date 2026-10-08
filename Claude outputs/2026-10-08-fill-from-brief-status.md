---
title: Fill from brief (voice / documents / folder) - Phase 1 built
description: Shared "Fill from brief" engine (speak, type, paste, Word/text files, browser folder-watch) with per-field review; wired to Events; Campaign Planning wizard now shares its file reading + dictation.
sources: [cowork session 2026-10-08]
---

# Status - 2026-10-08

One local commit, needs `git push`. No SQL, no migration.

## What you can do now (after push + hard refresh)
- **Events > open an event > "Fill from brief"** (top of the event page).
- Input: **speak** (Chrome/Edge), type/paste, **add files** (Word .docx, .txt, .md, .csv, .json, .html - **PDF is NOT read yet**), or **choose a folder** (Chrome/Edge). The folder is remembered per event in that browser and re-checked every 15s **only while North is open**; when files change you get a "Read changes" prompt - it never re-fills by itself.
- The AI (your org's configured AI, area "Document upload") proposes: event name, type, status, requester, budget, linked campaign, the rich-text Event brief, **venues** (with dates/PAX) and **speakers**.
- **Review step**: current vs proposed for every field, each editable and tick-able. Anything that would **replace** something already filled in starts **unticked**. The brief is **appended** under an "Imported <date>" heading, never replaced. Venues/speakers match existing rows by name (update) or are added. Nothing is saved until you click Apply; then values go through the normal setIn() path (view-only roles blocked, audit logged, normal save).
- **Campaign Planning wizard** (refactor you approved): upload now also reads Word/Markdown/JSON/HTML, and dictation runs on the shared engine. Its own flow/behaviour is otherwise unchanged.

## Tested
- Headless-browser test of the panel: typing, two Word files (deflate + stored), propose, overwrite defaults, edit-before-apply, append brief, venue update+add, speaker add, error path, PDF rejection, Escape - all pass. Fake speech engine: recording state, interim/final text, stop, mic-blocked message - all pass. Both pages' inline scripts parse.
- **NOT tested live (needs your push):** the real AI call through your org's provider, real microphone, real folder picker/watch, the Events page itself. These need your browser.

## Known limits (honest)
- PDF not supported. Safari: no speech, no folder watch. Folder watch is not a background service (server route is a later phase).
- Only Events (+ wizard helpers) use it so far. Other pages need a small schema each - a "universal" mode that auto-detects visible fields is possible but not built.
- The browser must grant microphone / folder access; the folder permission may need one click to reconnect after the browser restarts.

## Files
- shared/aiFill.js (new) - the engine
- Events.html - script tag, "Fill from brief" button, event schema, FAQ entry
- CampaignPlanning.html - script tag; file reading + dictation moved to shared engine
- Claude outputs/2026-10-08-fill-from-brief-status.md (this note)
