/* Shared currency-conversion helper (extracted 2026-09-03 from 5 hand-copied originals --
   Cursus, Custodia, Eventus, Norma, Ordo -- see the per-file-architecture proposal doc,
   claude/2026-09-03-north-per-file-architecture-proposal.md, for why). Loaded via a plain
   <script src="shared/convertToMain.js"> tag (no build step, no bundler -- North has none
   today and this doesn't add one), placed before each page's own inline <script> block so
   the function is a normal global by the time the rest of the page's code runs, exactly as
   if it had been defined inline. Every call site is unchanged.

   Reads CFG.currency (set from org_settings.currency_config, fail-soft if that migration
   hasn't run -- unchanged from before this extraction). Returns a snapshot object, not a
   bare number, matching every existing call site's expectation
   ({original, originalCurrency, converted, convertedCurrency, rate, convertedAt}). */
function convertToMain(amount, fromCode){
  const main=CFG.currency.main;
  if(!fromCode || fromCode===main){
    return {original:amount, originalCurrency:fromCode||main, converted:amount, convertedCurrency:main, rate:1, convertedAt:new Date().toISOString()};
  }
  const row=(CFG.currency.rates||[]).find(r=>r.code===fromCode);
  const rate=(row&&row.rate)?row.rate:1;
  return {original:amount, originalCurrency:fromCode, converted:Math.round(amount*rate*100)/100, convertedCurrency:main, rate:rate, convertedAt:new Date().toISOString()};
}
