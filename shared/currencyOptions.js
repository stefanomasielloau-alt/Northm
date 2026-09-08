/* 2026-09-08 (item 43): shared currency-option-list builder. Item 43's audit found 5
   currency-code fields across Ordo/Cursus/Eventus/Custodia/Norma(Licensing) were plain
   free-text <input maxlength="3"> fields, letting anyone type any 3 letters instead of
   picking from Configuration's actual configured currency list (CFG.currency.main +
   CFG.currency.rates) -- violating Stef's stated rule ("a currency dropdown should be
   selectable everywhere unless fixed in admin settings"). This is the shared dropdown
   builder used to fix all 5, reading CFG.currency at CALL time (not load time) so script
   placement doesn't matter -- same convention as shared/convertToMain.js and
   shared/charts.js. Never silently drops an existing/legacy code that isn't in the
   configured list (e.g. old data entered before a rate was added, or before this fix
   shipped) -- it's appended so the current value stays selected and visible instead of
   being blanked out. */
function currencyCodeList(){
  const main = (CFG.currency && CFG.currency.main) || '';
  const rateCodes = ((CFG.currency && CFG.currency.rates) || []).map(r => r.code);
  const codes = [main].concat(rateCodes).map(c => (c || '').trim().toUpperCase()).filter(Boolean);
  return [...new Set(codes)];
}
function currencyOptionsHtml(sel, opts){
  opts = opts || {};
  const list = currencyCodeList();
  const selUp = (sel || '').trim().toUpperCase();
  if (selUp && !list.includes(selUp)) list.push(selUp);
  let h = '';
  if (opts.blankLabel) h += `<option value="" ${!selUp ? 'selected' : ''}>${esc(opts.blankLabel)}</option>`;
  h += list.map(c => `<option value="${esc(c)}" ${c === selUp ? 'selected' : ''}>${esc(c)}</option>`).join('');
  return h;
}
