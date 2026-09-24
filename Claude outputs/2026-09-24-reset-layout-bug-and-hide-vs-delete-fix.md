---
title: Reset layout zombie-tile bug fixed; Hide→Delete for custom tiles; Fit height button
description: Root cause and fix for the tile placeholder that survived Reset layout, plus the delete-vs-hide decision for custom tiles and the new manual Fit height control (2026-09-24, round 3).
sources: [cowork session]
---

# Status — round 3, 2026-09-24

Commit (local, needs `git push` — on top of `3c2edeb`, confirmed already live).

## 1. The tile placeholder that survived Reset layout — real root cause found and fixed

You reported the empty dashed box stayed even after clicking Reset layout, which
contradicted my earlier "stale saved height" theory — that theory assumed Reset layout
does a full fresh re-fit, so if the box was still empty afterwards, something else had
to be going on. Traced it properly this time:

Reset layout clears the page's saved grid positions and widget assignments, but it never
cleared the *custom tile id list* (a third, separate bookkeeping key). If a custom tile
had ever been added to that page — including one you'd tried to Hide, since Hide never
removed it from that list either, only marked it hidden — its id survived the reset. On
the very next render, the page saw that id, didn't know it was meant to be gone, and
created a brand-new empty box for it (its widget assignment had just been wiped, so
nothing was painted in) — a permanent, content-less placeholder that no amount of
resetting would clear, because resetting is what kept recreating it.

**Fixed**: Reset layout now also clears that id list, so a custom tile is genuinely gone
after a reset, not silently regenerated as a blank box.

## 2. "Would delete rather than hide be better?" — yes, for custom tiles

Good instinct — this is what let the bug above happen in the first place. Split it:

- **Native boxes** (the page's built-in slots) keep Hide/Unhide as-is. They always have
  a real default to fall back to, so Hide genuinely means "put it away, bring it back
  later."
- **Custom tiles** (anything added via + Add tile) now get deleted outright when you
  click what used to be their Hide button — same button, relabelled "🗑 Delete tile" for
  these. A custom tile has no default to restore, so Hide was never really recoverable
  for one anyway (Unhide couldn't bring back what it had been showing) — it was just
  leaving cruft behind. Delete is honest about that, and removing it from the bookkeeping
  list is exactly what prevents the zombie-placeholder bug from recurring. Re-adding one
  is one click from the widget library either way.

## 3. "Let's try the fit height" — built

New "⤢ Fit height" button next to Swap and Hide/Delete on every tile. Click it to resize
that one box to its actual current content height — same grow-until-it-fits logic
already used right after a widget swap, now available on demand for any box, any time,
without touching anything else on the page. Opt-in and per-box on purpose — an automatic
"refit everything on load" was rejected earlier as too risky (would silently shrink a
box you'd deliberately made taller than its content).

## 4. Regions "Unassigned" Remove button greyed out — working as intended, not a bug

Checked live: there's exactly 1 Unassigned region left now (`4c634bb2...`). The Remove
button is deliberately disabled when it's the last one — same guard Activities uses —
because the app always needs at least one Unassigned region to fall back to. Nothing to
fix here; that's the button doing its job.

## 5. Activities Remove button "not working" — confirmed a stale browser tab, not a bug

Checked live: `removeActivity` and the Remove button (added last round, commit `3c2edeb`)
are both present and working once the page is actually reloaded — a stale tab was
showing pre-update code. **If you're still not seeing a Remove button next to "1
Activity" / "2 Activity" in Admin & config, a hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
should bring it in.**

## 6. Activity/route dedup — confirmed still NOT run

Checked live: still 12 activities, still 6 routes — same counts as before. The prepared
`claude/2026-09-24-migration-activity-route-full-dedup-v2.sql` has not been executed yet
(whatever SQL you ran, it wasn't that file, or it ran against a different target). It's
still valid and ready — deletes 3 activities + 3 routes by id, all pre-checked against
campaigns, unaffected by the "1 Activity"/"2 Activity" rename since it targets by id, not
name.

## Files touched tonight (round 3)
- `shared/grid.js` — Reset layout now also clears a page's custom-tile id list; Hide
  button deletes (rather than hides) a custom tile, via new `removeCustomBox()` helper
  (also now used by the existing orphaned-external-widget self-heal path); new
  `fitBoxHeight()` extracted from the widget-swap resize logic and wired to a new
  per-tile "⤢ Fit height" button.

[STATUS: PARTIAL – NEED CLARIFICATION]
- Reset-layout zombie-tile bug: fixed, committed locally, needs `git push`.
- Hide→Delete for custom tiles: built, committed locally, needs `git push`.
- Fit height button: built, committed locally, needs `git push`.
- Regions Remove button: confirmed working as designed (last-one guard) — no fix needed.
- Activities Remove button: confirmed live and working — likely just needs a hard
  refresh on your end.
- Activity/route dedup migration: still not run — `claude/2026-09-24-migration-activity-route-full-dedup-v2.sql`
  is ready whenever you want to run it.
