/* Module version footer -- backlog item 24, step 1 (2026-09-04).
   Extracted from 9 hand-copied, byte-identical HTML templates (one per North module file) into
   this single shared include, per the North per-file architecture proposal's Option 2
   (lightweight shared includes, no build step -- plain <script src>, same pattern already used
   for shared/convertToMain.js and shared/charts.js).

   This specific piece was picked as the first slice of step 1 because the earlier "why this
   matters" bug (commit 5a45b47) was exactly this template being duplicated 8 times with a
   subtly different (and in that case, dead-code) placement in one of the copies -- a single
   shared function removes the chance of that particular class of drift recurring, at the lowest
   possible risk (a pure, stateless function, verified byte-identical against every prior call
   site's rendered output before this was ever wired in). */
function moduleVersionFooterHtml(name, version){
  return `<div class="side-modver" style="padding:8px 14px 10px;margin-top:4px;border-top:1px solid var(--line,#DFE3EB);font-size:10px;color:var(--ink-3,#7C879E);letter-spacing:.02em">${name} · ${version}</div>`;
}
