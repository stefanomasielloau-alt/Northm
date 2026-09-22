import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

# --- 1. head: gridstack CSS -------------------------------------------------
anchor1 = "</head>"
assert src.count(anchor1) == 1, "expected exactly one </head>"
src = src.replace(
    anchor1,
    '<link rel="stylesheet" href="assets/vendor/gridstack/gridstack.min.css">\n</head>',
    1
)

# --- 2. style block: grid + swap-picker CSS --------------------------------
# Insert before the FIRST </style> in the document (the main :root/.card/.kpi
# block) -- located by position rather than by matching surrounding
# whitespace, which turned out not to match byte-for-byte against a printed
# copy of the same line.
first_style_close = src.find("</style>")
assert first_style_close != -1, "no </style> found at all"
grid_css = """
/* --- Editable grid layout + widget swap (pilot: Home page, 2026-09-23) --- */
.grid-stack{position:relative}
.grid-stack-item-content{overflow:hidden}
.gs-inner{height:100%;display:flex;flex-direction:column}
.gs-item-handle{
  display:none;align-items:center;justify-content:space-between;gap:8px;
  padding:4px 8px;font-size:10.5px;color:var(--ink-3);background:var(--canvas-2);
  border-bottom:1px solid var(--line);border-radius:var(--r) var(--r) 0 0;cursor:move;user-select:none;
}
.grid-edit-mode .gs-item-handle{display:flex}
.grid-edit-mode .grid-stack-item{outline:1px dashed #B9C2D6;border-radius:var(--r)}
.gs-swap-btn{
  font-size:10.5px;padding:2px 8px;border-radius:var(--r-sm);border:1px solid var(--line);
  background:var(--surface);color:var(--ink-2);cursor:pointer;
}
.gs-swap-btn:hover{background:var(--canvas-2)}
.grid-stack-item .ui-resizable-handle{background:var(--nav);opacity:0;border-radius:3px}
.grid-edit-mode .ui-resizable-handle{opacity:.35}
.grid-edit-mode .ui-resizable-handle:hover{opacity:.9}
.gs-swap-overlay{
  position:fixed;inset:0;background:rgba(16,24,43,.35);z-index:9000;
  display:flex;align-items:center;justify-content:center;
}
.gs-swap-panel{
  width:420px;max-width:92vw;max-height:80vh;overflow:auto;background:var(--surface);
  border-radius:var(--r);box-shadow:var(--sh-2);
}
.gs-swap-head{
  display:flex;align-items:center;justify-content:space-between;padding:12px 16px;
  font-weight:700;border-bottom:1px solid var(--line);
}
.gs-swap-close{border:none;background:none;font-size:14px;color:var(--ink-3);cursor:pointer;padding:4px}
.gs-swap-list{padding:8px}
.gs-swap-row{
  display:block;width:100%;text-align:left;padding:10px 12px;margin:2px 0;border-radius:var(--r-sm);
  border:1px solid transparent;background:none;cursor:pointer;
}
.gs-swap-row:hover{background:var(--canvas-2)}
.gs-swap-row.on{border-color:var(--nav);background:var(--input-bg)}
.gs-swap-row-label{display:block;font-size:12.5px;font-weight:600;color:var(--ink)}
.gs-swap-row-hint{display:block;font-size:11px;color:var(--ink-3);margin-top:1px}
.gs-swap-disabled{opacity:.55;cursor:not-allowed}
.gs-swap-disabled:hover{background:none}
"""
src = src[:first_style_close] + grid_css + src[first_style_close:]

# --- 3. script tags: gridstack lib + grid.js --------------------------------
anchor3 = '<script src="shared/charts.js"></script>'
assert src.count(anchor3) == 1, "expected exactly one charts.js script tag"
src = src.replace(
    anchor3,
    anchor3 + '\n<script src="assets/vendor/gridstack/gridstack-all.js"></script>\n<script src="shared/grid.js"></script>',
    1
)

# --- 4. pageHome(): split into swappable widget functions ------------------
old_pagehome = """function pageHome(){
  const hr=new Date().getHours();
  const greeting=hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
  const u=user(), name=u?u.name.split(' ')[0]:'there';
  const today=new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
  const v=validations(), bad=v.filter(x=>x.s==='bad').length;

  let h=`<div class="phead"><div><h1>${greeting}, ${esc(name)}</h1>
    <p>${today} · ${esc(role()?role().name:'')} on ${esc(UI.fy)} · ${bad?`<b>${bad}</b> blocking validation${bad===1?'':'s'} need your attention`:'All validations pass'}</p></div>
    <div class="sp"></div>
    <button class="btn pri" onclick="go('dashboard')">Open dashboard</button></div>`;

  h+=`<div class="kpis">
    <div class="kpi"><div class="k">Gates in chain</div><div class="kpi-v">${chain().length}</div><div class="sub">${CFG.gates.length} configured</div></div>
    <div class="kpi"><div class="k">Regions / pods</div><div class="kpi-v">${R().length}<span class="mini"> / ${P().length}</span></div><div class="sub">${A().length} activities</div></div>
    <div class="kpi"><div class="k">Campaigns</div><div class="kpi-v">${CFG.campaigns.length}</div><div class="sub">synced from Campaign Planning</div></div>
    <div class="kpi ${bad?'hl':''}"><div class="k">Validations</div><div class="kpi-v">${bad||0}</div><div class="sub">${bad?'blocking':'all pass'}</div></div>
  </div>`;

  h+=`<div style="display:flex;gap:14px;align-items:flex-start;margin-top:14px;flex-wrap:wrap">`;
  h+=`<div style="flex:2;min-width:320px">
    <div class="card"><h3>Quick links</h3><div class="bd" style="padding:10px 14px">
      ${['Overview','Configure','Plan','Measure'].map(grp=>{
        const pages=PAGES.filter(p=>p.grp===grp && p.id!=='home' && !p.hidden);
        if(!pages.length) return '';
        return `<div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin:10px 0 5px">${grp}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${pages.map(p=>`<a class="btn sm" href="#" onclick="go('${p.id}');return false">${esc(p.label)}</a>`).join('')}
        </div>`;
      }).join('')}
      <div class="dv"></div>
      <button class="btn sm" onclick="exportCfg()">Export configuration</button>
    </div></div>
  </div>`;

  h+=`<div style="flex:1;min-width:260px">
    <div class="card"><h3>Validations</h3><div class="bd flush">
      ${v.slice(0,6).map(x=>`<div style="padding:7px 14px;border-bottom:1px solid var(--line);font-size:11.5px">
        <span class="pill ${x.s}">${x.s==='bad'?'Blocking':'Advisory'}</span> ${esc(x.t)}</div>`).join('') || '<div class="empty">All validations pass.</div>'}
    </div></div>
    <div class="card"><h3>Recent activity</h3><div class="bd flush">
      ${CFG.audit.slice(0,8).map(a=>`<div style="padding:7px 14px;border-bottom:1px solid var(--line);font-size:11.5px">
        <div>${esc(a.what)}</div><div class="mini" style="color:var(--ink-2)">${esc(a.detail||'')} · ${F.dt(a.ts)}</div></div>`).join('')
        || '<div class="empty">No activity yet.</div>'}
    </div></div>
  </div>`;
  h+=`</div>`;
  return h;
}
"""

new_pagehome = """function homeWidgetKpis(){
  const bad=validations().filter(x=>x.s==='bad').length;
  return `<div class="kpis">
    <div class="kpi"><div class="k">Gates in chain</div><div class="kpi-v">${chain().length}</div><div class="sub">${CFG.gates.length} configured</div></div>
    <div class="kpi"><div class="k">Regions / pods</div><div class="kpi-v">${R().length}<span class="mini"> / ${P().length}</span></div><div class="sub">${A().length} activities</div></div>
    <div class="kpi"><div class="k">Campaigns</div><div class="kpi-v">${CFG.campaigns.length}</div><div class="sub">synced from Campaign Planning</div></div>
    <div class="kpi ${bad?'hl':''}"><div class="k">Validations</div><div class="kpi-v">${bad||0}</div><div class="sub">${bad?'blocking':'all pass'}</div></div>
  </div>`;
}
function homeWidgetQuickLinks(){
  return `<div class="card"><h3>Quick links</h3><div class="bd" style="padding:10px 14px">
    ${['Overview','Configure','Plan','Measure'].map(grp=>{
      const pages=PAGES.filter(p=>p.grp===grp && p.id!=='home' && !p.hidden);
      if(!pages.length) return '';
      return `<div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin:10px 0 5px">${grp}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${pages.map(p=>`<a class="btn sm" href="#" onclick="go('${p.id}');return false">${esc(p.label)}</a>`).join('')}
      </div>`;
    }).join('')}
    <div class="dv"></div>
    <button class="btn sm" onclick="exportCfg()">Export configuration</button>
  </div></div>`;
}
function homeWidgetValidations(){
  const v=validations();
  return `<div class="card"><h3>Validations</h3><div class="bd flush">
    ${v.slice(0,6).map(x=>`<div style="padding:7px 14px;border-bottom:1px solid var(--line);font-size:11.5px">
      <span class="pill ${x.s}">${x.s==='bad'?'Blocking':'Advisory'}</span> ${esc(x.t)}</div>`).join('') || '<div class="empty">All validations pass.</div>'}
  </div></div>`;
}
function homeWidgetRecentActivity(){
  return `<div class="card"><h3>Recent activity</h3><div class="bd flush">
    ${CFG.audit.slice(0,8).map(a=>`<div style="padding:7px 14px;border-bottom:1px solid var(--line);font-size:11.5px">
      <div>${esc(a.what)}</div><div class="mini" style="color:var(--ink-2)">${esc(a.detail||'')} · ${F.dt(a.ts)}</div></div>`).join('')
      || '<div class="empty">No activity yet.</div>'}
  </div></div>`;
}
window.homeWidgetKpis=homeWidgetKpis;
window.homeWidgetQuickLinks=homeWidgetQuickLinks;
window.homeWidgetValidations=homeWidgetValidations;
window.homeWidgetRecentActivity=homeWidgetRecentActivity;
function pageHome(){
  const hr=new Date().getHours();
  const greeting=hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
  const u=user(), name=u?u.name.split(' ')[0]:'there';
  const today=new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
  const bad=validations().filter(x=>x.s==='bad').length;

  let h=`<div class="phead"><div><h1>${greeting}, ${esc(name)}</h1>
    <p>${today} · ${esc(role()?role().name:'')} on ${esc(UI.fy)} · ${bad?`<b>${bad}</b> blocking validation${bad===1?'':'s'} need your attention`:'All validations pass'}</p></div>
    <div class="sp"></div>
    <button class="btn" id="grid-edit-toggle-home" type="button">⠿ Edit layout</button>
    <button class="btn" id="grid-reset-home" type="button">Reset layout</button>
    <button class="btn pri" onclick="go('dashboard')">Open dashboard</button></div>`;

  const homeBoxSizes={box1:12,box2:12,box3:6,box4:6};
  const homeWidgetFns={kpis:homeWidgetKpis,quicklinks:homeWidgetQuickLinks,validations:homeWidgetValidations,recent:homeWidgetRecentActivity};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('home'):{box1:'kpis',box2:'quicklinks',box3:'validations',box4:'recent'});

  h+=`<div class="grid-stack" id="ordo-grid-home">`;
  ['box1','box2','box3','box4'].forEach(boxId=>{
    const widgetId=assigned[boxId]||boxId;
    const fn=homeWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${homeBoxSizes[boxId]}" gs-id="${boxId}">
      <div class="grid-stack-item-content">${fn()}</div>
    </div>`;
  });
  h+=`</div>`;
  return h;
}
"""

assert src.count(old_pagehome) == 1, "pageHome() anchor text not found exactly once -- file may have changed"
src = src.replace(old_pagehome, new_pagehome, 1)

# --- 5. render(): hook the grid engine after #main is (re)written ----------
anchor5 = "document.getElementById('main').innerHTML=mainHtml;"
assert src.count(anchor5) == 1, "expected exactly one #main innerHTML assignment in render()"
src = src.replace(
    anchor5,
    anchor5 + "\n  if(typeof window.northGridAfterRender==='function'){ try{ window.northGridAfterRender(p.id); }catch(e){ console.error('grid layout hook failed',e); } }",
    1
)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, bytes before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
