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
    return { v: 1, tiles: tiles, board: sanitizeBoard(def.board) };
  }
  function isEmpty(def){ var d = sanitizeDefinition(def); return !d.tiles.length && !d.board; }
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
    if(d.board) parts.push('Board report');
    return parts.length ? parts.join(' + ') : 'Empty';
  }
  G.NorthSavedReports = { TILES: TILES, BOARD_TYPES: BOARD_TYPES, BOARD_LABEL: BOARD_LABEL, sanitizeDefinition: sanitizeDefinition, sanitizeName: sanitizeName,
    sanitizeBoard: sanitizeBoard, isEmpty: isEmpty, canPublish: canPublish, canManage: canManage, canSee: canSee, split: split, boardSummary: boardSummary, boardLink: boardLink, summary: summary };
})();
