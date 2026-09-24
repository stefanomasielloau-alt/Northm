---
title: "Reset ALL layouts" custom-tile gap fixed; free-text Note widget added
description: Round 4 (2026-09-24) — the global reset button had the same zombie-tile bug fixed earlier for the per-page reset button, plus a new Note/free-text external widget type.
sources: [cowork session]
---

# Status — round 4, 2026-09-24

Two commits, local, both need `git push` (on top of `b0f02f9`, confirmed already live):
`425695c` and `79e1e33`.

## 1. "Reset ALL layouts" had the same bug as the per-page reset — now fixed

You were right that resetting didn't actually clear the padding/gap problem — but not because
the height fix itself failed. I checked: it's genuinely live and working (confirmed the fixed
code is deployed, and reproduced a fresh reset + a tight, correct-looking "Campaign & cost" page
on my end with it). What I found instead: the **global** "Reset ALL layouts" button (Admin &
config > Audit log) had the exact same bug that was fixed on the per-page "Reset layout" button
last round (`1b0879d`) — it cleared grid positions and widget assignments everywhere, but never
cleared the separate bookkeeping list of custom tile ids. Any custom tile you'd added anywhere
came back as an empty, content-less placeholder on the next render of that page — which looks
and behaves exactly like a padding/gap problem, so it's a reasonable thing to have blamed on the
same issue.

**Fixed**: the global reset now clears that list too, so a custom tile is genuinely gone after a
full reset, same as the per-page fix already gave you.

**Owning the bigger issue**: I told you to use "Reset ALL layouts" for what was actually a
single-tile gap complaint. That button clears every page's layout at once — it's the wrong tool
for a one-tile problem, and it's what caused "all my layouts were destroyed." The per-page
"Reset layout" button (on the page itself) would have been the right, much narrower fix, or
often no reset at all once the underlying height bug (now fixed) is what's doing the work. I
should have pointed you at the narrower option first — sorry for the rework that caused.

If the padding/gap still shows up on a specific page/tile after this fix is pushed and you've
done a hard refresh, tell me which one and I'll look directly rather than guessing further —
my own retest keeps coming back clean, so I need a concrete page to chase it further.

## 2. New: Note / free-text widget

Added as a 5th type on the existing External widgets system (Admin & config > Widget library >
Add an external widget), alongside iframe/gdoc/api/webhook — same place, same Add/Edit form,
consistent with how every other widget type already works:

- Pick **"Note / free text"** as the type, leave URL blank, type your text into the new **Text**
  box (multi-line, line breaks are kept).
- Add it to any page from that page's "+ Add tile" / "⇄ Swap widget" picker, same as any other
  widget.
- Editing it later is done from the same Admin & config form (not inline on the tile itself) —
  matches how every other external widget is edited, and keeps this consistent rather than a
  one-off pattern. Say if you'd rather have inline click-to-edit directly on the tile; that's a
  reasonable next step but a separate, larger change (the grid tiles don't currently support any
  in-place editing).

**Needs you, prepared not run**: `Claude outputs/2026-09-24-migration-custom-widgets-add-body-column.sql`
— additive (`ADD COLUMN IF NOT EXISTS body`), adds the one column this needs to `custom_widgets`.
Safe to run whenever; the widget won't save/display text correctly until it's run.

## Files touched tonight (round 4)
- `shared/grid.js` — `window.northResetAllLayouts` now also clears
  `northm_ordo_customboxes_*` for every page; `resolveWidget()`'s `external.` branch gets a
  5th `note` case.
- `Ordo.html` — Widget library Add/Edit form: new Type option + Text textarea; `addCustomWidget()`
  / `updateCustomWidget()` take and store a `body` field, URL no longer required for `note` type
  (same as `webhook`); custom-widgets table shows a text preview instead of a URL for Note rows;
  CFG load/save mapping extended for the new column.
- `Claude outputs/2026-09-24-migration-custom-widgets-add-body-column.sql` (new, prepared, not run)

[STATUS: PARTIAL – NEED CLARIFICATION]
- `northResetAllLayouts` custom-tile fix: done, committed locally (`425695c`), needs `git push`.
- Note/free-text widget: built, committed locally (`79e1e33`), needs `git push` + the one SQL
  migration above run before it works.
- Padding/gap issue: fix confirmed live and working on my own retest after a fresh reset: if
  it's still visible for you on a specific page/tile once this is pushed and refreshed, tell me
  which one so I can chase it directly instead of guessing.
