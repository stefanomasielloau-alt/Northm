/* shared/boardPeriod.js  (2026-10-10)
   Pure helpers for the Board report period picker and prior-year comparison (Stef, 2026-10-10:
   "the period can be defined, and ability to compare to the same period in previous years").
   No page state, no DOM, no database -- Strategy.html feeds it what it needs.

   A period is a run of fiscal-month POSITIONS inside one financial year: 0 = first month of the FY ... 11 = last.
     NorthBoardPeriod.resolve(sel, ctx) -> { type, from, to, months, isFull, label }
        sel: { type: 'fy'|'h1'|'h2'|'q1'|'q2'|'q3'|'q4'|'ytd'|'month'|'custom', month?, from?, to? }   (default 'fy')
        ctx: { monthLabel(pos) -> 'Jul',  ytdTo: last position to include for 'ytd' (null = whole year) }
     NorthBoardPeriod.share(seasonality, from, to) -> fraction of the year's plan that falls in the period
                                                      (uses the same 12 seasonality weights as the Phased plan page)
     NorthBoardPeriod.priorFys('FY27', 2) -> ['FY26','FY25']
     NorthBoardPeriod.delta(cur, prev) -> (cur-prev)/|prev|, or null when prev is missing/zero
     NorthBoardPeriod.periodDates(fy, fyStartMonth, from, to) -> { start:'YYYY-MM-DD', end:'YYYY-MM-DD' }
     NorthBoardPeriod.overlapFraction(cStart, cEnd, pStart, pEnd, undatedShare) -> 0..1 share of a campaign that falls in the period
                                                      (campaign with no usable dates: undatedShare, i.e. spread evenly over the year)
     NorthBoardPeriod.label(fy, per) -> 'FY27' or 'FY27 · Q2'
   FY numbering follows Strategy's fyOf(): the FY labelled FYnn starts in month fyStartMonth of calendar year 20(nn-1). */
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  var TYPES = [
    ['fy','Full year'],['h1','First half (H1)'],['h2','Second half (H2)'],
    ['q1','Quarter 1'],['q2','Quarter 2'],['q3','Quarter 3'],['q4','Quarter 4'],
    ['ytd','Year to date'],['month','Single month'],['custom','Custom months']
  ];
  function clamp(n){ n = Math.round(Number(n)); if(!isFinite(n)) n = 0; return Math.max(0, Math.min(11, n)); }
  function resolve(sel, ctx){
    sel = sel || {}; ctx = ctx || {};
    var ml = ctx.monthLabel || function(p){ return 'M' + (p + 1); };
    var type = String(sel.type || 'fy'), from = 0, to = 11, label = 'Full year';
    var q = /^q([1-4])$/.exec(type);
    if(q){ from = (Number(q[1]) - 1) * 3; to = from + 2; label = 'Q' + q[1] + ' (' + ml(from) + '–' + ml(to) + ')'; }
    else if(type === 'h1'){ from = 0; to = 5; label = 'H1 (' + ml(0) + '–' + ml(5) + ')'; }
    else if(type === 'h2'){ from = 6; to = 11; label = 'H2 (' + ml(6) + '–' + ml(11) + ')'; }
    else if(type === 'ytd'){ to = (ctx.ytdTo == null) ? 11 : clamp(ctx.ytdTo); label = to === 11 ? 'Full year' : 'Year to date (' + ml(0) + '–' + ml(to) + ')'; }
    else if(type === 'month'){ from = to = clamp(sel.month); label = ml(from); }
    else if(type === 'custom'){ var a = clamp(sel.from), b = clamp(sel.to); from = Math.min(a, b); to = Math.max(a, b); label = from === to ? ml(from) : ml(from) + '–' + ml(to); }
    else { type = 'fy'; }
    return { type: type, from: from, to: to, months: to - from + 1, isFull: from === 0 && to === 11, label: (from === 0 && to === 11) ? 'Full year' : label };
  }
  function share(seasonality, from, to){
    var s = Array.isArray(seasonality) && seasonality.length === 12 ? seasonality.map(function(v){ return Number(v) || 0; }) : [1,1,1,1,1,1,1,1,1,1,1,1];
    var total = s.reduce(function(a, b){ return a + b; }, 0), part = 0;
    for(var i = from; i <= to; i++) part += s[i] || 0;
    return total > 0 ? part / total : (to - from + 1) / 12;
  }
  function fyNum(fy){ var n = parseInt(String(fy).replace(/\D/g, ''), 10); return isFinite(n) ? n : null; }
  function priorFys(fy, n){
    var base = fyNum(fy), out = []; if(base == null) return out;
    for(var i = 1; i <= (n || 0); i++){ var v = base - i; if(v < 0) break; out.push('FY' + String(v).padStart(2, '0')); }
    return out;
  }
  function delta(cur, prev){
    if(prev == null || cur == null || !isFinite(prev) || !isFinite(cur) || Number(prev) === 0) return null;
    return (Number(cur) - Number(prev)) / Math.abs(Number(prev));
  }
  function iso(y, m, d){ return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function periodDates(fy, fyStartMonth, from, to){
    var n = fyNum(fy), s = Number(fyStartMonth) || 1; if(n == null) return null;
    var startIdx = (2000 + n - 1) * 12 + (s - 1) + from, endIdx = (2000 + n - 1) * 12 + (s - 1) + to;
    var sy = Math.floor(startIdx / 12), sm = (startIdx % 12) + 1, ey = Math.floor(endIdx / 12), em = (endIdx % 12) + 1;
    var last = new Date(Date.UTC(ey, em, 0)).getUTCDate();
    return { start: iso(sy, sm, 1), end: iso(ey, em, last) };
  }
  function day(s){ var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; }
  function overlapFraction(cs, ce, ps, pe, undatedShare){
    var a = day(cs), b = day(ce), p = day(ps), q = day(pe);
    if(a == null || b == null || b < a || p == null || q == null) return undatedShare == null ? 0 : undatedShare;
    var lo = Math.max(a, p), hi = Math.min(b, q); if(hi < lo) return 0;
    return (hi - lo + 1) / (b - a + 1);
  }
  function label(fy, per){ return per && !per.isFull ? fy + ' · ' + per.label : String(fy); }
  G.NorthBoardPeriod = { TYPES: TYPES, resolve: resolve, share: share, priorFys: priorFys, delta: delta, periodDates: periodDates, overlapFraction: overlapFraction, label: label, fyNum: fyNum };
})();
