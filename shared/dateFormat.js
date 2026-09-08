/* dateFormat.js -- backlog item 24 (per-file architecture), continued
 * 2026-09-08: extracts the F.dt date/time formatter that was hand-copied
 * into all 10 files (same convention as moduleFooter.js/convertToMain.js/
 * charts.js/currencyOptions.js/orgSwitcher.js).
 *
 * Deliberately preserves EXACT current behaviour everywhere, including the
 * one known inconsistency flagged in the running log: index.html's F.dt
 * omits the year that all 9 other files include. Rather than silently
 * unifying that (a visible change flagged to Stef, awaiting his
 * confirmation per the 2026-09-08 ledger answer on item 24), this keeps
 * both variants available so the extraction itself is a pure dedup with
 * zero behavioural change anywhere -- index.html passes {omitYear:true}
 * explicitly, making the inconsistency self-documenting in the one place
 * it actually differs, instead of buried in 10 near-identical copies.
 * Once Stef confirms adding the year to index.html, that's a one-line
 * change here (drop the omitYear param at its one call site) rather than
 * hunting through the file again.
 */
function formatDt(iso, opts){
  if(!iso) return '—';
  var omitYear = opts && opts.omitYear;
  var fmt = { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' };
  if(!omitYear) fmt.year = '2-digit';
  return new Date(iso).toLocaleString('en-AU', fmt);
}
