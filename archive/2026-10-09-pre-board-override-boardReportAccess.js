/* shared/boardReportAccess.js -- ONE place that decides "may this person see the Board report?"
   (added 2026-10-09). Used by Strategy.html (menu link + page), Reporting.html (the "Open Board
   report" button) and, for the toggle itself, Configuration.html (Roles table).

   Rule (option B): the Board report is available when
     - the viewer is a platform admin (Super Admin), OR
     - their ROLE has roles.view_board_report = true, OR
     - [reserved for option C] a per-person override says true (pass it as opts.userOverride; a
       boolean beats the role flag in both directions; null/undefined = follow the role).

   Before the migration (2026-10-09-migration-board-report-access.sql) has been run the column does not
   exist. That is NOT an error: the result is { enforced:false, allowed:true } and every page behaves
   exactly as it did before (Board report hidden from Strategy's menu, still reachable from Reporting).
   Any OTHER failure (network, RLS) fails CLOSED: { enforced:true, allowed:false }.

   NorthBoardReportAccess.load(sb, { roleId, isPlatformAdmin, userOverride }) -> Promise<{enforced, allowed, reason}>
   NorthBoardReportAccess.noAccessHtml()  -> a small "no access" card for the Board report page.
   ROLLBACK: remove the <script> tags; pages guard every use with `window.NorthBoardReportAccess`. */
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  var NIL = '00000000-0000-0000-0000-000000000000';

  function isMissingColumn(err){
    if(!err) return false;
    var code = String(err.code || ''), msg = String(err.message || '');
    return code === '42703' || code === 'PGRST204' || /view_board_report/i.test(msg) && /(does not exist|could not find|schema cache)/i.test(msg);
  }

  function load(sb, opts){
    opts = opts || {};
    if(!sb || typeof sb.from !== 'function') return Promise.resolve({ enforced:false, allowed:true, reason:'no client' });
    var q;
    try{
      q = sb.from('roles').select('id,view_board_report').eq('id', opts.roleId || NIL).limit(1);
    }catch(e){ return Promise.resolve({ enforced:true, allowed:false, reason:'error: ' + e.message }); }
    return Promise.resolve(q).then(function(res){
      res = res || {};
      if(res.error){
        if(isMissingColumn(res.error)) return { enforced:false, allowed:true, reason:'feature not installed' };
        return { enforced:true, allowed:false, reason:'error: ' + (res.error.message || res.error.code || 'unknown') };
      }
      // Column exists -> the feature is on.
      if(opts.isPlatformAdmin) return { enforced:true, allowed:true, reason:'platform admin' };
      if(opts.userOverride === true || opts.userOverride === false)
        return { enforced:true, allowed:opts.userOverride, reason:'person override' };
      var row = (res.data && res.data[0]) || null;
      var on = !!(row && row.view_board_report === true);
      return { enforced:true, allowed:on, reason: on ? 'role' : (row ? 'role not approved' : 'no role') };
    }, function(e){
      return { enforced:true, allowed:false, reason:'error: ' + (e && e.message) };
    });
  }

  function noAccessHtml(){
    return '<div class="card"><h3>Board report</h3><div class="bd">'
      + '<p style="margin:0 0 6px">The Board report is available to approved roles only.</p>'
      + '<p class="mini" style="margin:0">Ask an administrator to turn on <b>Board report</b> for your role in Configuration &rarr; Roles.</p>'
      + '</div></div>';
  }

  G.NorthBoardReportAccess = { load: load, noAccessHtml: noAccessHtml };
})();
