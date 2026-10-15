/* shared/savedReports.js  (2026-10-10)
   Saved private / public reports for the Reporting module (Stef, 2026-10-10: "the ability for a person to create and
   save private and public reports").

   A saved report is a DEFINITION, never data: a name, who can see it, which Reporting tiles it shows, and (optionally)
   a Board report setting (financial year + period + prior-year comparison). Whoever opens it sees the numbers their own
   access allows -- sharing a public report shares the recipe, not anyone's figures.

   Table: public.saved_reports (migration 2026-10-10-migration-saved-reports.sql). Pure helpers only here -- no DOM, no database.

     NorthSavedReports.TILES                      catalogue of tiles a report can show
     NorthSavedReports.sanitizeDefinition(def)    -> {v:1, tiles:[known ids in catalogue order], board:null|{fy,sel,cmp}}
     NorthSavedReports.sanitizeName(s)            -> trimmed, single-spaced, max 120 chars ('' if blank)
     NorthSavedReports.canPublish(role, isSuper)  -> may this person make a PUBLIC report?  (role.publish or role.config or platform admin)
     NorthSavedReports.canManage(rep, me, role, isSuper) -> may this person edit/delete it?  (owner; or, for a PUBLIC report,
                                                    a Configure-role person / platform admin as moderation)
     NorthSavedReports.canSee(rep, myId)          -> public, or mine (the database enforces this too; this keeps the screen honest)
     NorthSavedReports.split(list, myId)          -> {mine:[], shared:[]}  (shared = public reports by other people)
     NorthSavedReports.boardSummary(board)        -> 'FY27 · Quarter 2, compared with 1 earlier year'
     NorthSavedReports.boardLink(board)           -> 'Strategy.html?page=boardreport&br=<json>'  (Strategy applies it on open)
     NorthSavedReports.summary(def)               -> '3 tiles + Board report'
     2026-10-14: def.widgets = chart-library elements (ADVANCED, paid add-on): up to 30 ids like 'dashboards.deals',
     'relmap.map' or 'external.<custom widget id>'. The database refuses them unless the author is entitled
     (saved_reports_advanced_guard / advanced_reports_can_create()).
*/
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  var TILES = [
    { id: 'dashboards.kpis',    group: 'Dashboards',   label: 'KPI tiles',            hint: 'Campaign budget, sign-off, pipeline, events, low stock, touchpoints (click a tile for detail)', page: 'dashboards',   wid: 'kpis' },
    { id: 'dashboards.deals',   group: 'Dashboards',   label: 'Deals by stage',       hint: 'Deal count per stage, chart and table',        page: 'dashboards',   wid: 'deals' },
    { id: 'organization.counts',  group: 'Organization', label: 'Headcount summary',  hint: 'People, roles, regions and teams counts',      page: 'organization', wid: 'counts' },
    { id: 'organization.roles',   group: 'Organization', label: 'People by role',     hint: 'How many people hold each role',               page: 'organization', wid: 'roles' },
    { id: 'organization.regions', group: 'Organization', label: 'Regions',            hint: 'The regions set up in Configuration',          page: 'organization', wid: 'regions' },
    { id: 'organization.teams',   group: 'Organization', label: 'Teams',              hint: 'Teams and member counts',                      page: 'organization', wid: 'teams' },
    { id: 'reports.log',          group: 'Reports',      label: 'Report activity log', hint: 'Who opened which report, and when',           page: 'reports',      wid: 'log' }
  ];
  var BOARD_TYPES = ['fy', 'h1', 'h2', 'q1', 'q2', 'q3', 'q4', 'ytd', 'month', 'custom'];
  var BOARD_LABEL = { fy: 'Full year', h1: 'First half (H1)', h2: 'Second half (H2)', q1: 'Quarter 1', q2: 'Quarter 2', q3: 'Quarter 3', q4: 'Quarter 4', ytd: 'Year to date', month: 'Single month', custom: 'Custom months' };

  function sanitizeName(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 120); }
  function pos(v){ var n = Math.round(Number(v)); if(!isFinite(n)) n = 0; return Math.max(0, Math.min(11, n)); }
  function sanitizeBoard(b){
    if(!b || typeof b !== 'object') return null;
    var sel = (b.sel && typeof b.sel === 'object') ? b.sel : {};
    var type = BOARD_TYPES.indexOf(String(sel.type)) >= 0 ? String(sel.type) : 'fy';
    var out = { type: type };
    if(type === 'month') out.month = pos(sel.month);
    if(type === 'custom'){ out.from = pos(sel.from); out.to = pos(sel.to); }
    var cmp = Math.round(Number(b.cmp)); if(!isFinite(cmp)) cmp = 0; cmp = Math.max(0, Math.min(3, cmp));
    var fy = /^FY\d{2}$/.test(String(b.fy || '')) ? String(b.fy) : null;
    return { fy: fy, sel: out, cmp: cmp };
  }
  function sanitizeDefinition(def){
    def = (def && typeof def === 'object') ? def : {};
    var want = {}; (Array.isArray(def.tiles) ? def.tiles : []).forEach(function(t){ want[String(t)] = true; });
    var tiles = TILES.filter(function(t){ return want[t.id]; }).map(function(t){ return t.id; });
    var seen = {}, widgets = (Array.isArray(def.widgets) ? def.widgets : []).map(String)
      .filter(function(w){ if(seen[w] || !/^[a-z_]{2,40}\.[A-Za-z0-9_-]{1,80}$/.test(w)) return false; seen[w] = true; return true; }).slice(0, 30);
    var out = { v: 1, tiles: tiles, board: sanitizeBoard(def.board) };
    if(widgets.length){ out.v = 2; out.widgets = widgets; }
    /* 2026-10-15 (Stef: change the layout of saved reports): optional order + width per item, kept only for items in the report */
    if(Array.isArray(def.layout)) out.layout = layoutOf({ tiles: tiles, widgets: widgets, board: out.board, layout: def.layout });
    return out;
  }
  var WIDTHS = [3, 4, 6, 8, 12];
  function itemKeys(d){ return (d.tiles || []).map(function(t){ return 'tile:' + t; }).concat((d.widgets || []).map(function(w){ return 'widget:' + w; })).concat(d.board ? ['board'] : []); }
  /* full ordered layout for a definition: saved order first, then anything not placed yet (full width) */
  function layoutOf(d){
    d = d || {}; var keys = itemKeys(d), have = {}, out = [];
    (Array.isArray(d.layout) ? d.layout : []).forEach(function(it){
      if(!it || typeof it !== 'object') return; var k = String(it.k || '');
      if(keys.indexOf(k) < 0 || have[k]) return; have[k] = 1;
      /* 2026-10-15: the report now uses the shared drag/resize Edit layout, so any width 1-12 is kept, plus
         the grid position (x, y) and height (h) once someone has arranged it */
      var w = Math.round(Number(it.w)); var o = { k: k, w: (w >= 1 && w <= 12) ? w : 12 };
      var x = Math.round(Number(it.x)), y = Math.round(Number(it.y)), h = Math.round(Number(it.h));
      if (isFinite(x) && isFinite(y) && isFinite(h) && x >= 0 && x <= 11 && y >= 0 && y <= 5000 && h >= 1 && h <= 1000) { o.x = Math.min(x, 12 - o.w); o.y = y; o.h = h; }
      /* 2026-10-15: per-report framing of a saved map / drill-down view (the area shown, in the picture's own units) */
      var f = it.f;
      if (f && typeof f === 'object') {
        var fx = Number(f.x), fy = Number(f.y), fw = Number(f.w), fh = Number(f.h);
        if (isFinite(fx) && isFinite(fy) && isFinite(fw) && isFinite(fh) && fw > 0 && fh > 0 && fw < 1e6 && fh < 1e6 && Math.abs(fx) < 1e6 && Math.abs(fy) < 1e6) o.f = { x: Math.round(fx), y: Math.round(fy), w: Math.round(fw), h: Math.round(fh) };
      }
      out.push(o);
    });
    keys.forEach(function(k){ if(!have[k]) out.push({ k: k, w: 12 }); });
    return out;
  }
  function isEmpty(def){ var d = sanitizeDefinition(def); return !d.tiles.length && !d.board && !(d.widgets && d.widgets.length); }
  function isAdvanced(def){ var d = sanitizeDefinition(def); return !!(d.widgets && d.widgets.length); }
  function canPublish(role, isSuper){ return !!(isSuper || (role && (role.publish || role.config))); }
  function isOwner(rep, me){ return !!(rep && me && rep.owner_id && rep.owner_id === me); }
  function canManage(rep, me, role, isSuper){
    if(!rep) return false;
    if(isOwner(rep, me)) return true;
    return rep.visibility === 'public' && !!(isSuper || (role && role.config));
  }
  function canSee(rep, myId){ return !!rep && (rep.visibility === 'public' || isOwner(rep, myId)); }
  function split(list, myId){
    var mine = [], shared = [];
    (list || []).forEach(function(r){
      if(!canSee(r, myId)) return;
      if(isOwner(r, myId)) mine.push(r); else shared.push(r);
    });
    return { mine: mine, shared: shared };
  }
  function boardSummary(b){
    var d = sanitizeBoard(b); if(!d) return '';
    var t = BOARD_LABEL[d.sel.type] || 'Full year';
    var s = (d.fy ? d.fy + ' · ' : '') + t;
    if(d.cmp) s += ', compared with ' + d.cmp + ' earlier year' + (d.cmp === 1 ? '' : 's');
    return s;
  }
  function boardLink(b){
    var d = sanitizeBoard(b);
    var base = 'Strategy.html?page=boardreport';
    return d ? base + '&br=' + encodeURIComponent(JSON.stringify(d)) : base;
  }
  function summary(def){
    var d = sanitizeDefinition(def), parts = [];
    if(d.tiles.length) parts.push(d.tiles.length + ' tile' + (d.tiles.length === 1 ? '' : 's'));
    if(d.widgets && d.widgets.length) parts.push(d.widgets.length + ' chart library element' + (d.widgets.length === 1 ? '' : 's'));
    if(d.board) parts.push('Board report');
    return parts.length ? parts.join(' + ') : 'Empty';
  }
  G.NorthSavedReports = { TILES: TILES, BOARD_TYPES: BOARD_TYPES, BOARD_LABEL: BOARD_LABEL, sanitizeDefinition: sanitizeDefinition, sanitizeName: sanitizeName,
    sanitizeBoard: sanitizeBoard, layoutOf: layoutOf, WIDTHS: WIDTHS, isEmpty: isEmpty, isAdvanced: isAdvanced, canPublish: canPublish, canManage: canManage, canSee: canSee, split: split, boardSummary: boardSummary, boardLink: boardLink, summary: summary };
})();
