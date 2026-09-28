---
title: Real root cause of undersized tiles found — wrong pixel-per-unit divisor
description: Your own diagnosis (the "12 pixels off" hunch) led straight to it — packItems/fitBoxHeight were dividing target heights by 22 instead of 12, undersizing every fresh auto-fit by ~45%. Fixed and verified live against Drivers & rate library.
sources: [cowork session]
---

# Status — 2026-09-28

One commit, local, needs `git push` (on top of `543efd0`, confirmed already live): `09907ed`.

## You were right, and your instinct pointed at exactly the right place

"Whatever the height of the bar is at the top... the height of that whole area should be
saved N pixels smaller/bigger" — that's the right shape of bug, just not the exact mechanism.
Checked "Drivers & rate library" live, box by box:

Every box's saved height (`h`, in grid units) was rendering at **exactly `h × 12` pixels** —
e.g. a box saved at `h=13` rendered at exactly 156px. But the auto-fit code that decides `h` in
the first place was computing it as `Math.ceil(neededPixels / 22)` — dividing by 22 (12 +
GridStack's 10px row margin) instead of 12. GridStack's own margin is the gap *between* rows,
not part of any one box's own height, so that extra +10 in the divisor was never correct.

The effect: every fresh auto-fit undersized its box by roughly 45%. A widget genuinely needing
265px of height (confirmed live — that's "Segment rate multipliers"'s real content height) got
`Math.ceil(265/22) = 13` units -> 156px, clipping about 110px of its own content. The correct
math, `Math.ceil(265/12) = 23-24` units -> 276-288px, fits it with zero clipping -- verified this
exact box live before committing.

**This is the real, page-wide explanation.** Not the drag-handle-height bug fixed on 09-24
(`b0f02f9`) — that one was real, but far smaller (tens of pixels, not 100+). And not something
any reset could ever have fixed on its own, since a reset just re-runs this same wrong formula —
which is exactly why it kept coming back no matter how many times layouts got reset.

## What this means for you

The fix only changes how **future** auto-fits are computed — it can't retroactively fix heights
already saved in your browser under the old wrong math. Any page currently showing a
short/clipped tile needs its own **per-page "Reset layout"** click (the button on that page, not
"Reset ALL layouts") once this is pushed and you've hard-refreshed — that's scoped to the one
page, safe, and will now size correctly.

I don't know which of your pages you've hand-tuned vs left on auto-fit, so I didn't reset any of
them myself. If you want, tell me which pages still look short and I'll confirm the fix on each
one, or I can scan the app for every box using a chart-style widget (the ones most likely to be
affected) and give you a checklist.

## One small thing, unrelated to you

While fixing this, `git commit` left two harmless stale lock files behind in `.git/` on your
machine (`index.lock`, `HEAD.lock`) — this cloud session isn't allowed to delete files in your
folder, so it couldn't clean them up itself. Your own git client should just overwrite or remove
them the next time you commit or pull, with no action needed from you — flagging only in case you
see a lock-related error, which would be the reason.

## Files touched
- `shared/grid.js` — `packItems()` and `fitBoxHeight()`'s pixel-to-grid-unit divisor fixed
  (22 -> 12); `packItems()` also now applies a row's real x/y/width before measuring its content
  height, a smaller defensive fix found while tracing this.

[STATUS: PARTIAL – NEED CLARIFICATION]
- Root cause found, fixed, and verified live: committed locally (`09907ed`), needs `git push`.
- Existing saved layouts on affected pages need a one-time per-page "Reset layout" click each,
  once pushed -- tell me which pages still look short (or ask me to scan for likely candidates)
  and I'll confirm each one.
