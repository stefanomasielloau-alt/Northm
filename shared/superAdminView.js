/* shared/superAdminView.js -- 2026-09-10 (item 68)

   Super Admin cross-org "view as" context. Built per Stef's explicit scope
   ("be that level zero or level one... I should be able to see everything...
   across all organizations, all users... a dropdown that allows me to select
   the organization and potentially even select the user within that
   organization... we need to be able to fully edit... but when first
   converting or selecting it should be read only -- a conscious decision by
   the super admin to open up to editing").

   Design, in one paragraph: the context (mode + selected org/user + an
   explicit "editing enabled" flag) lives in localStorage so it survives
   navigating between North's separate per-module HTML pages, exactly like
   shared/orgSwitcher.js's own "change context -> reload" pattern, which this
   mirrors on purpose. 'own' mode (the default, and what every non-Super-Admin
   always is) behaves EXACTLY as today everywhere -- zero gating, zero banner,
   zero change to existing per-role canEdit()/writeAll logic. Only switching to
   'all' / a specific org / a specific org+user changes anything, and doing so
   ALWAYS resets editing back to off -- flipping it on is a separate, explicit
   click, every single time the selection changes.

   THE DATA-SAFETY PIECE (read this before wiring a new module in): every
   North module that has its own Supabase writes (Cursus, Ordo, Custodia,
   etc.) saves via a single "ambient org id" variable stamped onto every row
   on every autosave (e.g. Cursus's upsertRows() does
   `Object.assign(mapFn(r), {org_id:_orgId})` for EVERY row, unconditionally).
   That is safe today because a module only ever loads its own org's rows.
   The instant a module starts loading OTHER orgs' rows too (View All / View
   Org X), that same stamping pattern would silently overwrite every visible
   row's org_id with the viewer's own org on the very next autosave --
   corrupting other orgs' data with no error, no warning. SAV.stampOrgId()
   below is the fix: every wired-in module must select org_id on its cross-
   org-relevant reads, carry it into memory as row.orgId, and pass it through
   SAV.stampOrgId(row.orgId, ambientOrgId) instead of using the bare ambient
   id directly. See Cursus.html for the reference wiring.
*/
(function(){
  const KEY = 'north_sav_context_v1';

  function loadCtx(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return {mode:'own', orgId:null, userId:null, editing:false};
      const c = JSON.parse(raw);
      const mode = (c.mode==='all'||c.mode==='org'||c.mode==='user') ? c.mode : 'own';
      return {mode, orgId:c.orgId||null, userId:c.userId||null, editing:!!c.editing};
    }catch(e){ return {mode:'own', orgId:null, userId:null, editing:false}; }
  }
  function saveCtx(c){ try{ localStorage.setItem(KEY, JSON.stringify(c)); }catch(e){} }

  const SAV = {
    _ctx: loadCtx(),
    _ownOrgId: null,

    /* Call once per module load, right after CFG.isSuperAdmin/_orgId (or equivalent) are
       known -- ownOrgId is the caller's own real org id, used whenever mode is 'own' (the
       default) and as the safe fallback everywhere else. */
    init(ownOrgId){ this._ownOrgId = ownOrgId; },

    mode(){ return this._ctx.mode; },
    context(){ return Object.assign({}, this._ctx); },

    /* null in 'all' mode means "no org filter -- read across every organization". A
       specific org id in 'org'/'user' mode. The caller's own org id in 'own' mode
       (identical to today's behavior for every module that hasn't wired this in yet). */
    effectiveOrgId(){
      if(this._ctx.mode==='all') return null;
      if(this._ctx.mode==='org' || this._ctx.mode==='user') return this._ctx.orgId;
      return this._ownOrgId;
    },
    effectiveUserId(){ return this._ctx.mode==='user' ? this._ctx.userId : null; },

    /* 'own' mode is never gated by this -- existing per-role edit permissions apply
       exactly as before. 'all' mode is ALWAYS read-only, full stop: with rows merged
       from every organization there is no single correct org to stamp a save or a new
       record against, so editing there is never offered, no matter the toggle -- pick a
       specific organization first. 'org'/'user' mode starts read-only and stays that way
       until the explicit toggle below is clicked, since every visible row genuinely does
       belong to that one selected org. */
    canEdit(){
      if(this._ctx.mode==='own') return true;
      if(this._ctx.mode==='all') return false;
      return !!this._ctx.editing;
    },

    /* The data-safety helper described in the file header -- always prefer a row's own
       recorded org id over the viewer's ambient one. */
    stampOrgId(rowOrgId, ambientOrgId){
      return (rowOrgId!=null && rowOrgId!=='') ? rowOrgId : ambientOrgId;
    },

    /* Call this right before a mutating action (not deep inside a debounced autosave --
       by then the in-memory change already happened) so the UI never lets an edit start
       in the first place. Returns true/false; toasts an explanation on false if a global
       toast() function exists. */
    gateWrite(actionLabel){
      if(this.canEdit()) return true;
      try{ if(typeof toast==='function') toast('Read-only cross-org view — click "Enable editing" in the Super Admin bar to '+(actionLabel||'make changes')+'.'); }
      catch(e){}
      return false;
    },

    _setAndReload(ctx){ saveCtx(ctx); location.reload(); },
    setMode(mode, orgId, userId){ this._setAndReload({mode, orgId:orgId||null, userId:userId||null, editing:false}); },
    setEditing(on){
      if(this._ctx.mode==='own') return;
      this._setAndReload(Object.assign({}, this._ctx, {editing:!!on}));
    },

    /* Renders (or re-renders) the toolbar. No-ops entirely when !opts.isSuperAdmin, so
       this has zero footprint for anyone but a Super Admin. `organizations` is
       [{id,name}], `usersForOrg(orgId)` returns [{id,name|email}] for that org (each
       module supplies its own, since not all of them load the same cross-org user list).
       `lockSelector` (default '#main') is dimmed + made non-interactive while the view is
       cross-org and not editable -- the single point of control for "read-only" rather
       than trying to gate every scattered input/button individually. */
    renderBar(opts){
      opts = opts || {};
      if(!opts.isSuperAdmin) return;
      this._lastRenderOpts = opts;
      /* 2026-09-10 fix: the org list used to be fetched eagerly on EVERY module boot
         (even in 'own' mode, where the dropdown isn't even shown) just so it was ready
         if the Super Admin opened the org picker. Confirmed by Stef live-testing this
         was hurting Cursus specifically (only Super Admin logins were slow/timing out;
         a regular org user was fine) -- this was the one genuinely NEW cross-org read
         item 68 added that ran unconditionally on every boot, unlike everything else
         which only runs when actually viewing cross-org data. Now it's lazy: pass
         `loadOrganizations` (an async function returning the org list) instead of a
         pre-fetched `organizations` array, and it's only called the first time the
         Super Admin actually opens "Choose an organization...". */
      const orgs = opts.organizations || this._loadedOrgs || [];
      const usersForOrg = opts.usersForOrg || function(){ return []; };
      const lockSel = opts.lockSelector || '#main';

      let bar = document.getElementById('savBar');
      if(!bar){
        bar = document.createElement('div');
        bar.id = 'savBar';
        document.body.insertBefore(bar, document.body.firstChild);
      }
      const ctx = this._ctx;
      const crossOrg = ctx.mode!=='own';
      const editing = crossOrg && ctx.editing;

      const esc = s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const orgOptions = orgs.map(o=>`<option value="${esc(o.id)}" ${ctx.orgId===o.id?'selected':''}>${esc(o.name)}</option>`).join('');
      let userOptions = '';
      if(ctx.mode==='org' || ctx.mode==='user'){
        const us = (ctx.orgId ? usersForOrg(ctx.orgId) : []) || [];
        userOptions = `<option value="">All users in this org</option>` + us.map(u=>`<option value="${esc(u.id)}" ${ctx.userId===u.id?'selected':''}>${esc(u.name||u.email||u.id)}</option>`).join('');
      }

      bar.style.cssText = 'position:sticky;top:0;z-index:99999;display:flex;flex-wrap:wrap;gap:8px;align-items:center;'+
        'padding:6px 12px;font:13px system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.3);'+
        (editing ? 'background:#7a1f1f;color:#fff;' : (crossOrg ? 'background:#8a6400;color:#fff;' : 'background:#1f2d3a;color:#cfe0ee;'));
      bar.innerHTML =
        '<b>Super Admin view:</b>'+
        '<select id="savModeSel">'+
          `<option value="own" ${ctx.mode==='own'?'selected':''}>My organization</option>`+
          `<option value="all" ${ctx.mode==='all'?'selected':''}>All organizations</option>`+
          `<option value="org" ${(ctx.mode==='org'||ctx.mode==='user')?'selected':''}>Choose an organization…</option>`+
        '</select>'+
        `<span id="savOrgWrap" style="display:${(ctx.mode==='org'||ctx.mode==='user')?'inline':'none'}">`+
          `<select id="savOrgSel"><option value="">Select org…</option>${orgOptions}</select>`+
        '</span>'+
        `<span id="savUserWrap" style="display:${(ctx.mode==='org'||ctx.mode==='user')&&ctx.orgId?'inline':'none'}">`+
          `→ <select id="savUserSel">${userOptions}</select>`+
        '</span>'+
        ((crossOrg && ctx.mode!=='all') ? `<button id="savEditBtn" style="margin-left:auto;font-weight:700;cursor:pointer;padding:4px 10px;border-radius:4px;border:1px solid rgba(255,255,255,.5);background:transparent;color:inherit;">${editing?'✏️ Editing enabled — click to lock':'🔒 Read-only — click to enable editing'}</button>` : '') +
        (crossOrg ? `<span style="opacity:.9;${ctx.mode==='all'?'margin-left:auto;':''}">${ctx.mode==='all'?'Viewing every organization merged together — always read-only. Pick a specific organization to edit its data.':'Viewing as if you belonged to this organization.'}</span>` : '');

      // If the page loaded directly into 'org'/'user' mode (persisted from a previous
      // visit), the org list is needed right away to show the current selection and let
      // the Super Admin change it -- fetch once here rather than waiting for a change
      // event that won't come until they touch the dropdown again.
      if((ctx.mode==='org' || ctx.mode==='user') && !orgs.length && opts.loadOrganizations && !SAV._loadedOrgs && !SAV._loadingOrgs){
        SAV._loadingOrgs = true;
        opts.loadOrganizations().then(function(list){
          SAV._loadedOrgs = list || [];
          SAV._loadingOrgs = false;
          SAV.renderBar(opts);
        }).catch(function(){ SAV._loadingOrgs = false; });
      }

      const modeSel = document.getElementById('savModeSel');
      modeSel.onchange = async function(){
        const v = this.value;
        if(v==='own') SAV.setMode('own');
        else if(v==='all') SAV.setMode('all');
        else {
          document.getElementById('savOrgWrap').style.display='inline';
          document.getElementById('savUserWrap').style.display='none';
          if(!orgs.length && opts.loadOrganizations && !SAV._loadedOrgs){
            const orgSelEl = document.getElementById('savOrgSel');
            if(orgSelEl) orgSelEl.innerHTML = '<option value="">Loading organizations…</option>';
            try{
              SAV._loadedOrgs = await opts.loadOrganizations() || [];
            }catch(e){ SAV._loadedOrgs = []; }
            SAV.renderBar(opts);
          }
        }
      };
      const orgSel = document.getElementById('savOrgSel');
      if(orgSel) orgSel.onchange = function(){ if(this.value) SAV.setMode('org', this.value, null); };
      const userSel = document.getElementById('savUserSel');
      if(userSel) userSel.onchange = function(){ SAV.setMode(this.value?'user':'org', ctx.orgId, this.value||null); };
      const editBtn = document.getElementById('savEditBtn');
      if(editBtn) editBtn.onclick = function(){ SAV.setEditing(!ctx.editing); };

      // Single point of control for "read-only": dim + freeze the module's own content
      // area rather than trusting every scattered input/button to check canEdit() itself.
      const target = document.querySelector(lockSel);
      if(target){
        if(crossOrg && !editing){ target.style.pointerEvents='none'; target.style.opacity='0.75'; target.setAttribute('aria-disabled','true'); }
        else { target.style.pointerEvents=''; target.style.opacity=''; target.removeAttribute('aria-disabled'); }
      }
    }
  };
  window.SAV = SAV;
})();
