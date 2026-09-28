import io
P='Custodia.html'
s=io.open(P,encoding='utf-8',newline='').read()
def rep(old,new,cnt=1):
    global s
    n=s.count(old); assert n==cnt, (n, old[:120])
    s=s.replace(old,new)

# script tag
rep('<script src="shared/clientAdmin.js"></script>\n',
    '<script src="shared/clientAdmin.js"></script>\n<script src="shared/tableTools.js"></script><!-- 2026-09-28 (Stef: "filters + sort") -->\n')

# CSS for multi-select picker
rep('.mask{position:fixed;inset:0;',
    '/* 2026-09-28 (Stef: "Campaigns used within and Tags need dropdowns to select from a list") */\n'
    '.ms-cell{display:block;width:170px;text-align:left;border:1px solid var(--line);background:var(--input-bg);color:var(--ink);border-radius:var(--r-sm);padding:4px 18px 4px 7px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative}\n'
    '.ms-cell::after{content:"\\25BE";position:absolute;right:6px;top:4px;color:var(--ink-3)}\n'
    '.ms-cell.empty-v{color:var(--ink-3)}\n'
    '.ms-back{position:fixed;inset:0;z-index:70}\n'
    '.ms-pop{position:fixed;z-index:71;width:260px;background:#fff;border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh-2);padding:8px}\n'
    '.ms-pop .ms-list{max-height:220px;overflow:auto;margin:6px 0}\n'
    '.ms-pop label{display:flex;align-items:center;gap:6px;padding:3px 4px;font-size:12px;cursor:pointer;border-radius:4px}\n'
    '.ms-pop label:hover{background:var(--canvas)}\n'
    '.ms-pop input.ms-q{width:100%;box-sizing:border-box;font-size:12px;padding:5px 7px;border:1px solid var(--line);border-radius:4px}\n'
    '.mask{position:fixed;inset:0;')

# UI state
rep("txFilter:'', txSortBy:null, txSortDir:'desc' };",
    "txFilter:'', txSortBy:null, txSortDir:'desc', ms:null /* 2026-09-28: open multi-select picker {id,field,q,x,y} */ };")

# live won deals (fail-soft), kicked off at end of loadFromSupabase
rep("  CFG.audit = (auditR.data||[]).map(a=>({id:a.id,ts:a.ts,what:a.what,detail:a.detail}));\n}\n",
    "  CFG.audit = (auditR.data||[]).map(a=>({id:a.id,ts:a.ts,what:a.what,detail:a.detail}));\n"
    "  loadLiveWonDeals(orgScoped); /* 2026-09-28: fire-and-forget, never blocks boot */\n}\n"
    "/* 2026-09-28 (Stef: \"where the transaction's campaign has won deals, show a link to the won deals in Scoring\"):\n"
    "   read-only, fail-soft count of Closed Won augur_deals per campaign. Kept OUT of CFG (not autosaved,\n"
    "   never written back). Used only to decide whether to show a \"won deals in Scoring\" link; the\n"
    "   Effectiveness page's won counts/values still come from the closed-won import, unchanged. */\n"
    "let _liveWonByCampaign = {};\n"
    "async function loadLiveWonDeals(orgScoped){\n"
    "  try{\n"
    "    const r = await orgScoped(sb.from('augur_deals').select('id,campaign_id,stage').eq('stage','Closed Won'));\n"
    "    if(r.error) throw r.error;\n"
    "    const m={}; (r.data||[]).forEach(d=>{ if(d.campaign_id && d.stage==='Closed Won') m[d.campaign_id]=(m[d.campaign_id]||0)+1; });\n"
    "    _liveWonByCampaign=m;\n"
    "    const main=document.getElementById('main');\n"
    "    if(main && main.innerHTML.trim() && (UI.page==='transactions'||UI.page==='effectiveness')) render();\n"
    "  }catch(e){ console.warn('Live won-deal lookup unavailable (links to Scoring hidden).', e); }\n"
    "}\n"
    "function wonDealsCountFor(cid){\n"
    "  if(!cid) return 0;\n"
    "  const imported=(CFG.wonDeals||[]).filter(d=>d.campaignId===cid).length;\n"
    "  return Math.max(imported, _liveWonByCampaign[cid]||0);\n"
    "}\n"
    "/* Cursus supports #campaign=<id> (applyHashRoute) -> opens that campaign in Planning.\n"
    "   Augur has no ?page= / ?q= handling today, so the Scoring link lands on Augur's default page;\n"
    "   ?page=deals is included so it starts working as soon as Augur reads it. */\n"
    "function campaignLinkHtml(cid,name){ return `<a href=\"Cursus.html#campaign=${encodeURIComponent(cid)}\" target=\"tool_Cursus\" title=\"Open in Campaign Planning\">${esc(name)}</a>`; }\n"
    "function wonDealsLinkHtml(cid){ const n=wonDealsCountFor(cid); return n?`<a class=\"mini\" href=\"Augur.html?page=deals\" target=\"tool_Augur\" title=\"Open Deals in Scoring\">${n} won deal${n===1?'':'s'} &rarr;</a>`:''; }\n")

# ---- Assets table: switch to tableTools ----
rep("  const visible=sortAssetsList(filterAssetsList(CFG.assets));",
    "  /* 2026-09-28 (Stef: \"filters + sort, Status column needs sort\"): column sort/filter now comes from\n"
    "     shared/tableTools.js (every column incl. Status); the old header sort (sortAssetsList) is no longer\n"
    "     applied so rows aren't double-sorted. Search box + Low-stock toggle still pre-filter as before. */\n"
    "  const visible=filterAssetsList(CFG.assets);")
old_head=s[s.index('    <div class="bd flush"><div class="scroll cap"><table><thead><tr>\n      <th style="cursor:pointer" onclick="setAssetsSort(\'name\')">'):]
old_head=old_head[:old_head.index('<th></th></tr></thead><tbody>')+len('<th></th></tr></thead><tbody>')]
rep(old_head,
    '    <div class="bd flush"><div class="scroll cap"><table class="tt"><thead><tr>\n'
    '      <th>Asset</th><th>Status</th><th>Category</th><th>Tags</th><th class="n">Stock</th><th class="n">Low-stock at</th>\n'
    '      <th class="n">Cost per</th><th>Ccy</th><th>Purchased</th><th>Location</th><th>Cost bucket</th><th>Campaigns used within</th><th></th></tr></thead><tbody>')
rep('<tr><td colspan="12" class="empty">${CFG.assets.length?\'No assets match your search.\'',
    '<tr><td colspan="13" class="empty">${CFG.assets.length?\'No assets match your search.\'')
rep('''        <td><input class="cel txt" style="width:120px" value="${esc(a.tags)}" onchange="setIn('assets','${a.id}','tags',this.value)"></td>''',
    '''        <td>${msCellHtml(a,'tags')}</td>''')
rep('''        <td class="n"><input class="cel w" value="${a.costPer||0}" onchange="setIn('assets','${a.id}','costPer',this.value,'money');recomputeAssetCostFx('${a.id}')">
          <div style="display:flex;align-items:center;gap:3px;margin-top:2px">
            <select class="cel txt" style="width:62px;font-size:10px;padding:2px 4px" title="Currency this was entered in, if not ${CFG.currency.main}" onchange="setAssetCostCurrency('${a.id}',this.value)">${currencyOptionsHtml(a.costPerCcy, {blankLabel: CFG.currency.main+' (default)'})}</select>
            ${(a.costPerFx&&a.costPerFx.originalCurrency&&a.costPerFx.originalCurrency!==CFG.currency.main)?`<span class="mini">≈ ${F.mk(a.costPerFx.converted)}</span>`:''}
          </div></td>''',
    '''        <td class="n"><input class="cel w" value="${a.costPer||0}" onchange="setIn('assets','${a.id}','costPer',this.value,'money');recomputeAssetCostFx('${a.id}')">
          ${(a.costPerFx&&a.costPerFx.originalCurrency&&a.costPerFx.originalCurrency!==CFG.currency.main)?`<div class="mini" style="margin-top:2px">≈ ${F.mk(a.costPerFx.converted)}</div>`:''}</td>
        <!-- 2026-09-28: currency picker moved to its own column so Cost per sorts numerically (tableTools reads a cell's select first) -->
        <td><select class="cel txt" style="width:78px;font-size:11px;padding:2px 4px" title="Currency this was entered in, if not ${CFG.currency.main}" onchange="setAssetCostCurrency('${a.id}',this.value)">${currencyOptionsHtml(a.costPerCcy, {blankLabel: CFG.currency.main+' (default)'})}</select></td>''')
rep('''        <td><input class="cel txt" style="width:180px" placeholder="campaign name(s)" value="${esc(a.campaignsUsed)}" onchange="setIn('assets','${a.id}','campaignsUsed',this.value)"></td>''',
    '''        <td>${msCellHtml(a,'campaignsUsed')}</td>''')

# ---- Effectiveness ----
rep("    return { name:camp?camp.name:cid, assetCost:b.cost,",
    "    return { cid, name:camp?camp.name:cid, assetCost:b.cost,")
rep('''<th class="n">Won value</th><th class="n">Value : cost</th></tr></thead><tbody>
    ${!campRows.length?`<tr><td colspan="6" class="empty">''',
    '''<th class="n">Won value</th><th class="n">Value : cost</th><th></th></tr></thead><tbody>
    ${!campRows.length?`<tr><td colspan="7" class="empty">''')
rep('''<div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th>Campaign</th><th class="n">Assets used</th>''',
    '''<div class="bd flush"><div class="scroll cap"><table class="tt"><thead><tr>
      <th>Campaign</th><th class="n">Assets used</th>''')
rep('''      campRows.map(r=>`<tr><td>${esc(r.name)}</td><td class="n calc">${r.assetCount}</td>''',
    '''      /* 2026-09-28 (Stef: "Asset spend by campaign: sort + filters, drill-down to the campaign and its won deals") */
      campRows.map(r=>`<tr><td>${campaignLinkHtml(r.cid,r.name)}</td><td class="n calc">${r.assetCount}</td>''')
rep('''<td class="n calc">${r.ratio!=null?r.ratio.toFixed(2)+'×':'—'}</td></tr>`).join('')}''',
    '''<td class="n calc">${r.ratio!=null?r.ratio.toFixed(2)+'×':'—'}</td><td>${wonDealsLinkHtml(r.cid)}</td></tr>`).join('')}''')

# ---- References ----
rep("function pageReferences(){\n  let h=`<div class=\"phead\"><div><h1>Reference tracking</h1>",
    "/* 2026-09-28 (Stef: \"Reference tracking is moving to Targets\"): Targets now owns this page at\n"
    "   Prospectus.html?page=refTracking, reading the same asset_references table (no data moves).\n"
    "   The old editable page is kept below as pageReferencesLegacy (not routed). Custodia's load/save of\n"
    "   asset_references is untouched; its upsert sends an explicit column map (id,client_name,\n"
    "   contact_name,notes,org_id), so Targets' new deal_id column is never overwritten. */\n"
    "function pageReferences(){\n"
    "  return `<div class=\"phead\"><div><h1>Reference tracking</h1>\n"
    "    <p>Customer references have moved to the Targets module.</p></div></div>\n"
    "    <div class=\"card\"><h3>Reference tracking now lives in Targets</h3><div class=\"bd\">\n"
    "      <p style=\"margin:0 0 10px\">Customers willing to act as a sales reference are now tracked alongside accounts and deals in Targets,\n"
    "        where each reference can be linked to a deal. It reads the same list as before, so nothing has been moved or lost\n"
    "        (${CFG.references.length} reference${CFG.references.length===1?'':'s'} on file).</p>\n"
    "      <a class=\"btn pri\" href=\"Prospectus.html?page=refTracking\" target=\"tool_North\">Open Reference tracking in Targets &rarr;</a>\n"
    "    </div></div>`;\n"
    "}\n"
    "function pageReferencesLegacy(){\n  let h=`<div class=\"phead\"><div><h1>Reference tracking</h1>")
rep("{id:'references',   ix:'4', label:'Reference tracking', fn:pageReferences},",
    "{id:'references',   ix:'4', label:'Reference tracking ↗', fn:pageReferences}, /* 2026-09-28: moved to Targets */")

# ---- Transactions ----
rep('''    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th style="cursor:pointer" onclick="setTxSort('date')">Date${UI.txSortBy==='date'?(UI.txSortDir==='desc'?' ▼':' ▲'):''}</th>
      <th>Asset</th><th>Type</th><th class="n">Qty</th><th class="n">Before → After</th><th>Campaign</th><th>Notes</th></tr></thead><tbody>
      ${!txOrdered.length?`<tr><td colspan="7" class="empty">''',
    '''    <!-- 2026-09-28 (Stef: "Transactions: column sort + filters, drill-down links"): sort/filter via shared/tableTools.js;
         the old Date-only header sort is removed. Date cell carries a hidden ISO value so it sorts chronologically. -->
    <div class="bd flush"><div class="scroll cap"><table class="tt"><thead><tr>
      <th>Date</th><th>Asset</th><th>Type</th><th class="n">Qty</th><th class="n">Before → After</th><th>Campaign</th><th>Notes</th><th></th></tr></thead><tbody>
      ${!txOrdered.length?`<tr><td colspan="8" class="empty">''')
rep('''          const campaignDisplay=linked?esc(linked.name):(t.campaignRef?esc(t.campaignRef)+' <span class="mini">(unlinked)</span>':'—');
          return `<tr><td class="mini">${F.d(t.date)}</td><td>${a?esc(a.name):'<span class="mini">(deleted asset)</span>'}</td>''',
    '''          const campaignDisplay=linked?campaignLinkHtml(linked.id,linked.name):(t.campaignRef?esc(t.campaignRef)+' <span class="mini">(unlinked)</span>':'—');
          return `<tr><td class="mini"><input type="hidden" value="${esc(t.date||'')}">${F.d(t.date)}</td><td>${a?`<a href="#" title="Open asset details" onclick="openAssetDetail('${a.id}');return false">${esc(a.name)}</a>`:'<span class="mini">(deleted asset)</span>'}</td>''')
rep('''<td class="mini">${campaignDisplay}</td><td class="mini">${esc(t.notes||'—')}</td></tr>`;''',
    '''<td class="mini">${campaignDisplay}</td><td class="mini">${esc(t.notes||'—')}</td><td>${linked?wonDealsLinkHtml(linked.id):''}</td></tr>`;''')

# ---- multi-select picker + render hook ----
rep("function openAssetDetail(id){ UI.assetDetailId=id; render(); }",
r"""/* 2026-09-28 (Stef: "Campaigns used within and Tags need dropdowns to select from a list"):
   multi-select picker for the two free-text, comma-separated asset columns. Storage format is
   unchanged -- values are still written as one "A, B, C" string via setIn(), exactly as the old
   text inputs did. Campaign options = the org's campaigns (already loaded into
   CFG.referenceList.campaigns) plus any names already typed on an asset; tag options = distinct
   tags already used on any asset plus the org's tag presets. Typing a value not in the list adds it. */
const MS_FIELDS={ tags:{label:'tags', empty:'Add tags…'}, campaignsUsed:{label:'campaigns', empty:'Pick campaigns…'} };
function msSplit(v){ return String(v||'').split(',').map(t=>t.trim()).filter(Boolean); }
function msOptions(field){
  const seen=new Map();
  const add=v=>{ const t=String(v||'').trim(); if(t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(),t); };
  if(field==='campaignsUsed') (CFG.referenceList.campaigns||[]).forEach(c=>add(c.name));
  else (CFG.assetTagPresets||[]).forEach(add);
  CFG.assets.forEach(a=>msSplit(a[field]).forEach(add));
  return [...seen.values()].sort((x,y)=>x.localeCompare(y,undefined,{sensitivity:'base'}));
}
function msCellHtml(a,field){
  const vals=msSplit(a[field]);
  return `<button type="button" class="ms-cell${vals.length?'':' empty-v'}" title="${esc(vals.join(', ')||MS_FIELDS[field].empty)}" onclick="openMs(event,'${a.id}','${field}')">${vals.length?esc(vals.join(', ')):'—'}</button>`;
}
function openMs(ev,id,field){
  const r=ev.currentTarget.getBoundingClientRect();
  let y=r.bottom+4; if(y+330>window.innerHeight) y=Math.max(8,r.top-334);
  const x=Math.max(8,Math.min(r.left, window.innerWidth-272));
  UI.ms={id,field,q:'',x,y}; render();
  setTimeout(()=>{ const q=document.getElementById('msQ'); if(q) q.focus(); },0);
}
function closeMs(){ if(!UI.ms) return; UI.ms=null; render(); }
function msWrite(list){
  const m=UI.ms; if(!m) return;
  setIn('assets',m.id,m.field,list.join(', '));
}
function msToggle(val){
  const m=UI.ms; if(!m) return; const a=byId(CFG.assets,m.id); if(!a) return;
  const cur=msSplit(a[m.field]); const i=cur.findIndex(t=>t.toLowerCase()===String(val).toLowerCase());
  if(i>=0) cur.splice(i,1); else cur.push(val);
  msWrite(cur);
}
function msAddTyped(){
  const m=UI.ms; if(!m) return; const el=document.getElementById('msQ'); const val=(el?el.value:'').trim(); if(!val) return;
  const a=byId(CFG.assets,m.id); if(!a) return;
  const cur=msSplit(a[m.field]);
  const existing=msOptions(m.field).find(o=>o.toLowerCase()===val.toLowerCase())||val;
  if(!cur.some(t=>t.toLowerCase()===existing.toLowerCase())){ cur.push(existing); m.q=''; msWrite(cur); }
  else { m.q=''; render(); }
  setTimeout(()=>{ const q=document.getElementById('msQ'); if(q) q.focus(); },0);
}
function msFilter(v){
  if(!UI.ms) return; UI.ms.q=v; const q=v.trim().toLowerCase();
  document.querySelectorAll('#msPop .ms-list label').forEach(l=>{ l.style.display=(!q||l.getAttribute('data-v').toLowerCase().includes(q))?'':'none'; });
  const add=document.getElementById('msAddRow');
  if(add){ const exact=msOptions(UI.ms.field).some(o=>o.toLowerCase()===q); add.style.display=(q&&!exact)?'':'none'; const s=document.getElementById('msAddLbl'); if(s) s.textContent=v.trim(); }
}
function msPopHtml(){
  const m=UI.ms; if(!m) return ''; const a=byId(CFG.assets,m.id); if(!a){ UI.ms=null; return ''; }
  const cur=msSplit(a[m.field]).map(t=>t.toLowerCase());
  const q=(m.q||'').trim().toLowerCase();
  const opts=msOptions(m.field);
  const exact=opts.some(o=>o.toLowerCase()===q);
  return `<div class="ms-back" onclick="closeMs()"></div>
  <div class="ms-pop" id="msPop" style="left:${Math.round(m.x)}px;top:${Math.round(m.y)}px">
    <input class="ms-q" id="msQ" placeholder="Search or type a new one…" value="${esc(m.q||'')}" oninput="msFilter(this.value)"
      onkeydown="if(event.key==='Enter'){event.preventDefault();msAddTyped();} if(event.key==='Escape'){closeMs();}">
    <div class="ms-list">
      ${!opts.length?`<div class="mini" style="padding:4px">No ${MS_FIELDS[m.field].label} yet — type one above and press Enter.</div>`:
        opts.map(o=>`<label data-v="${esc(o)}" style="${q&&!o.toLowerCase().includes(q)?'display:none':''}"><input type="checkbox" ${cur.includes(o.toLowerCase())?'checked':''} onchange="msToggle('${jsAttr(o)}')">${esc(o)}</label>`).join('')}
    </div>
    <div id="msAddRow" style="${q&&!exact?'':'display:none'}"><button type="button" class="btn sm" onclick="msAddTyped()">+ Add "<span id="msAddLbl">${esc(m.q||'')}</span>"</button></div>
    <div class="row" style="justify-content:space-between;margin-top:6px"><span class="mini">${cur.length} selected</span><button type="button" class="btn sm" onclick="closeMs()">Done</button></div>
  </div>`;
}
window.openMs=openMs; window.closeMs=closeMs; window.msToggle=msToggle; window.msAddTyped=msAddTyped; window.msFilter=msFilter;
/* a fixed-position popover would drift from its cell on scroll -- close it instead */
window.addEventListener('scroll',e=>{ if(UI.ms && !(e.target && e.target.closest && e.target.closest('#msPop'))) closeMs(); },true);
function openAssetDetail(id){ UI.assetDetailId=id; render(); }""")
rep("    mainHtml = p.fn() + (UI.assetDetailId?assetDetailHtml():'') + (UI.helpOpen?helpPanelHtml():'');",
    "    if(UI.ms && UI.page!=='assets') UI.ms=null; /* 2026-09-28: picker only lives on the Assets page */\n"
    "    mainHtml = p.fn() + (UI.assetDetailId?assetDetailHtml():'') + (UI.helpOpen?helpPanelHtml():'') + (UI.ms?msPopHtml():'');")
io.open(P,'w',encoding='utf-8',newline='').write(s)
print('ok')
