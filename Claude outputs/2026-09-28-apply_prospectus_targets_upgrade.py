import sys, io
root = sys.argv[1]
P = root + '/Prospectus.html'
src = io.open(P, encoding='utf-8', newline='').read()
rep = io.open(root + '/Reportus.html', encoding='utf-8', newline='').read()
NL = '\r\n' if '\r\n' in src else '\n'
src = src.replace('\r\n', '\n')

def sub(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, ('anchor count %d != %d: %r' % (n, count, old[:120]))
    src = src.replace(old, new)

# ---- grid CSS copied from Reportus.html ----
rl = rep.replace('\r\n', '\n').split('\n')
i0 = next(i for i, l in enumerate(rl) if l.startswith('.ctxbar{'))
i1 = next(i for i, l in enumerate(rl) if l.startswith('/* --- Editable grid layout'))
i2 = next(i for i, l in enumerate(rl) if l.startswith('/* 2026-09-28: Relationship map */'))
assert i1 == i0 + 3 and i2 > i1
grid_css = '\n'.join(rl[i0:i2]).rstrip() + '\n'

MY_CSS = r'''/* 2026-09-28 (Stef: "Edit layout" on the Opportunity report drill-down) -- grid CSS below copied
   verbatim from Reportus.html so tiles look and behave the same as Strategy/Reporting. */
''' + grid_css + r'''/* 2026-09-28 (Stef: Tile views + pop-up editing on Filters / Target list / References / Reference tracking) */
.vt{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.vt button{border:none;background:#fff;padding:4px 10px;font-size:11.5px;cursor:pointer;color:var(--ink-2);font-family:inherit}
.vt button+button{border-left:1px solid var(--line)}
.vt button.on{background:var(--nav);color:#fff}
.pr-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:14px}
.pr-tile{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px 13px;display:flex;flex-direction:column;gap:6px;box-shadow:var(--sh)}
.pr-tile.click{cursor:pointer}
.pr-tile.click:hover{border-color:var(--nav)}
.pr-tile .pt-h{display:flex;align-items:center;gap:6px;font-size:13.5px}
.pr-tile .pt-sub{font-size:11.5px;color:var(--ink-2)}
.pr-tile .pt-body{font-size:12px;color:var(--ink);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.pr-tile .pt-meta{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11.5px;color:var(--ink-2);align-items:center}
.pr-tile .pt-foot{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:6px;border-top:1px solid var(--line-2)}
.pr-modal>h3{display:flex;align-items:center;gap:8px;position:sticky;top:0;background:#fff;z-index:2}
.pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
.pf{display:flex;flex-direction:column;gap:3px;min-width:0}
.pf.full{grid-column:1/-1}
.pf .cel{width:100%}
.rt-sec{border:1px solid var(--line);border-radius:var(--r);padding:10px 12px;margin-top:10px}
.rt-sec.on{border-color:var(--nav);background:linear-gradient(180deg,#fff,rgba(156,43,60,.03))}
.rt-flag{display:flex;align-items:center;gap:8px;cursor:pointer}
.occ-row{display:grid;grid-template-columns:130px 1fr 1fr 1fr 30px;gap:6px;margin-top:6px;align-items:center}
.occ-head{display:grid;grid-template-columns:130px 1fr 1fr 1fr 30px;gap:6px;margin-top:8px}
/* 2026-09-28: the revenue-ramp bars never showed (a % height inside an un-sized column resolves to 0) */
.months .mcol{align-self:stretch}
.months .mbar{flex:none}
@media (max-width:640px){.pf-grid{grid-template-columns:1fr}.occ-row,.occ-head{grid-template-columns:1fr 1fr}}
'''
sub('.authbrand .ab-ver{font-size:9px;letter-spacing:.08em;color:var(--ink-3);font-weight:700;text-transform:uppercase;margin-top:1px;}\n</style>',
    '.authbrand .ab-ver{font-size:9px;letter-spacing:.08em;color:var(--ink-3);font-weight:700;text-transform:uppercase;margin-top:1px;}\n' + MY_CSS + '</style>')

# ---- script/link tags ----
sub('<script src="shared/clientAdmin.js"></script>\n',
    '<script src="shared/clientAdmin.js"></script>\n'
    '<!-- 2026-09-28 (Stef: "filters + sort on columns"; "Edit layout" on the report drill-down) -->\n'
    '<script src="shared/tableTools.js"></script>\n'
    '<link rel="stylesheet" href="assets/vendor/gridstack/gridstack.min.css">\n'
    '<script src="assets/vendor/gridstack/gridstack-all.js"></script>\n'
    '<script src="shared/grid.js"></script>\n')

# ---- ctxbar (only shown on grid pages -- see render()) ----
sub('<div class="wrap" id="wrap">\n  <nav class="side" id="side"></nav>',
    '<!-- 2026-09-28 (Stef: "Opportunity Reports drill down ... Edit layout"): same ctxbar buttons as Reportus.html;\n'
    '     shared/grid.js shows them only on a page with a registered grid (reportDetail). -->\n'
    '<div class="ctxbar" id="ctxbar" style="display:none">\n'
    '  <div class="sp" style="flex:1"></div>\n'
    '  <button class="btn sm" id="grid-edit-toggle" type="button" style="display:none">⠿ Edit layout</button>\n'
    '  <button class="btn sm" id="grid-reset" type="button" style="display:none">Reset layout</button>\n'
    '  <button class="btn sm" id="grid-addtile" type="button" style="display:none">+ Add / unhide tile</button>\n'
    '</div>\n'
    '<div class="wrap" id="wrap">\n  <nav class="side" id="side"></nav>')

# ---- go()/openReport() close any open pop-up ----
sub("function go(page){ UI.page=page; render(); }",
    "function go(page){ UI.page=page; UI.modal=null; render(); } /* 2026-09-28: also closes any open pop-up */")
sub("function openReport(id){ UI.reportId=id; UI.page='reportDetail'; render(); }",
    "function openReport(id){ UI.reportId=id; UI.page='reportDetail'; UI.modal=null; render(); }")

# ---- save: references details (fail-soft) + reference tracking ----
sub("""      is_testimonial:!!r.isTestimonial,testimonial_quote:r.testimonialQuote||'',testimonial_attribution:r.testimonialAttribution||''
    }))
  ]);""",
"""      is_testimonial:!!r.isTestimonial,testimonial_quote:r.testimonialQuote||'',testimonial_attribution:r.testimonialAttribution||'',
      /* 2026-09-28 (Stef: per-type notes + multiple occurrences): only sent once the column exists
         (probed at load) -- an upsert naming a missing column would fail the whole row. */
      ...(CFG._refDetailsCol ? {details:refDetailsForSave(r)} : {})
    })),
    /* 2026-09-28 (Stef: "Reference tracking should sit in Targets after 5 References"): the SAME
       asset_references table Assets used, so existing rows carry over untouched. deal_id only
       once 2026-09-28-migration-prospectus-references-details-and-deal-link.sql has run. */
    (CFG._refTrackLoaded ? upsertRows('asset_references', CFG.refTracking, r=>Object.assign(
      {id:r.id,client_name:r.clientName||'',contact_name:r.contactName||'',notes:r.notes||''},
      CFG._refTrackDealCol ? {deal_id:r.dealId||null} : {})) : Promise.resolve())
  ]);""")

# ---- load: details probe, reference tracking, deals ----
sub("""  CFG.references = [];
  try{
    const refR = await orgScoped(sb.from('prospectus_references')
      .select('id,org_id,name,doc_folder_url,notes,is_case_study,case_study_url,case_study_date,is_speaking,speaking_event,speaking_date,is_webinar,webinar_url,webinar_date,is_testimonial,testimonial_quote,testimonial_attribution'));""",
"""  CFG.references = [];
  /* 2026-09-28: fail-soft probe for the new jsonb 'details' column (per-type notes + occurrences). */
  CFG._refDetailsCol = false;
  try{ const pr = await sb.from('prospectus_references').select('details').limit(1); CFG._refDetailsCol = !pr.error; }catch(e){}
  try{
    const refR = await orgScoped(sb.from('prospectus_references')
      .select('id,org_id,name,doc_folder_url,notes,is_case_study,case_study_url,case_study_date,is_speaking,speaking_event,speaking_date,is_webinar,webinar_url,webinar_date,is_testimonial,testimonial_quote,testimonial_attribution'+(CFG._refDetailsCol?',details':'')));""")
sub("""        isTestimonial:!!r.is_testimonial,testimonialQuote:r.testimonial_quote||'',testimonialAttribution:r.testimonial_attribution||''
      }));
    }
  }catch(e){ /* table not created yet -- fine, this is additive and opt-in until the migration runs. */ }
}""",
"""        isTestimonial:!!r.is_testimonial,testimonialQuote:r.testimonial_quote||'',testimonialAttribution:r.testimonial_attribution||'',
        details:(r.details && typeof r.details==='object') ? r.details : {}
      }));
      CFG.references.forEach(r=>{ refDet(r); r.isReference=!!(r.details.reference && r.details.reference.on); refSeedFromLegacy(r); });
    }
  }catch(e){ /* table not created yet -- fine, this is additive and opt-in until the migration runs. */ }

  /* 2026-09-28 (Stef: "Reference tracking should sit in Targets after 5 References"): reads the
     same asset_references table Assets (Custodia.html) used -- no data move. deal_id probed
     first (new column, see the migration); everything here is fail-soft. */
  CFG.refTracking = []; CFG._refTrackLoaded = false; CFG._refTrackDealCol = false; CFG._refTrackLoadError = '';
  try{
    try{ const pd = await sb.from('asset_references').select('deal_id').limit(1); CFG._refTrackDealCol = !pd.error; }catch(e){}
    const rtR = await orgScoped(sb.from('asset_references').select('id,org_id,client_name,contact_name,notes'+(CFG._refTrackDealCol?',deal_id':'')));
    if(rtR.error) throw rtR.error;
    CFG.refTracking = (rtR.data||[]).map(r=>({id:r.id,orgId:r.org_id,clientName:r.client_name||'',contactName:r.contact_name||'',notes:r.notes||'',dealId:r.deal_id||null}));
    CFG._refTrackLoaded = true;
  }catch(e){ console.warn('asset_references not available', e); CFG._refTrackLoadError = String((e&&e.message)||e); }
  CFG.deals = [];
  try{
    const dR = await orgScoped(sb.from('augur_deals').select('id,name,account'));
    if(!dR.error) CFG.deals = (dR.data||[]).map(d=>({id:d.id,name:d.name||'',account:d.account||''})).sort((a,b)=>a.name.localeCompare(b.name));
  }catch(e){ console.warn('augur_deals not available', e); }
}""")

# ---- CRUD helpers + pop-up + tiles (before pages) ----
HELPERS = r'''/* ============================================================================
   2026-09-28 (Stef: list pages need "filters + sort on columns" (shared/tableTools.js), a Tile
   view (List | Tiles, remembered per browser) and editing in a POP-UP). The pop-up edits the
   live record through the same setIn()/handlers the list uses, so saving is the existing
   render() -> scheduleSupabaseSave() path -- nothing new to save.
   ============================================================================ */
['filtersView','targetsView','refsView'].forEach(k=>{ try{ const v=localStorage.getItem('prospectus_view_'+k); if(v==='tiles'||v==='list') UI[k]=v; }catch(e){} });
function prViewToggle(key){
  const v=UI[key]||'list';
  return `<span class="vt" role="group" aria-label="View"><button type="button" class="${v==='list'?'on':''}" onclick="setPrView('${key}','list')">List</button><button type="button" class="${v==='tiles'?'on':''}" onclick="setPrView('${key}','tiles')">Tiles</button></span>`;
}
function setPrView(key,v){ UI[key]=v; try{ localStorage.setItem('prospectus_view_'+key,v); }catch(e){} render(); }
window.setPrView=setPrView;
function openPrModal(kind,id,isNew){ UI.modal={kind:kind,id:id,isNew:!!isNew}; render(); }
window.openPrModal=openPrModal;
function closePrModal(){ UI.modal=null; render(); }
window.closePrModal=closePrModal;
/* "Discard" on a record created by Add (reference / reference tracking) -- removes it again. */
function discardPrModal(){
  const m=UI.modal; UI.modal=null;
  if(m && m.isNew){
    if(m.kind==='reference'){ CFG.references=CFG.references.filter(r=>r.id!==m.id); deleteRow('prospectus_references',m.id); }
    if(m.kind==='refTrack'){ CFG.refTracking=CFG.refTracking.filter(r=>r.id!==m.id); deleteRow('asset_references',m.id); }
    logAudit('discard new '+m.kind,m.id);
  }
  render();
}
window.discardPrModal=discardPrModal;
const safeUrl = u => /^https?:\/\//i.test(String(u||'').trim()) ? String(u).trim() : '';
const prFld = (label,inner,full) => `<label class="pf${full?' full':''}"><span class="lbl">${label}</span>${inner}</label>`;
const STATUS_TONE={New:'n',Contacted:'warn',Qualified:'ok',Disqualified:'bad'};

function prModalHtml(){
  const m=UI.modal; if(!m) return '';
  const dis=isViewer()?'disabled':'';
  let title='', body='', w=640;
  if(m.kind==='filter'){ const f=byId(CFG.filters,m.id); if(!f){ UI.modal=null; return ''; } title='Filter: '+esc(f.name||'(unnamed)'); body=filterFormHtml(f,dis); w=720; }
  else if(m.kind==='lead'){ const l=byId(CFG.leads,m.id); if(!l){ UI.modal=null; return ''; } title='Target: '+esc(l.company||'(unnamed)'); body=leadFormHtml(l,dis); }
  else if(m.kind==='reference'){ const r=byId(CFG.references,m.id); if(!r){ UI.modal=null; return ''; } title=(m.isNew?'Add reference':'Reference: '+esc(r.name||'(unnamed)')); body=referenceFormHtml(r,dis); w=860; }
  else if(m.kind==='refTrack'){ const r=byId(CFG.refTracking||[],m.id); if(!r){ UI.modal=null; return ''; } title=(m.isNew?'Add reference':'Reference: '+esc(r.clientName||'(unnamed)')); body=refTrackFormHtml(r,dis); }
  else return '';
  return `<div class="mask" onclick="if(event.target===this)closePrModal()"><div class="modal pr-modal" style="width:min(${w}px,100%)">
    <h3><span>${title}</span><span class="sp"></span>
      ${m.isNew&&!dis?`<button class="btn sm" onclick="discardPrModal()">Discard</button>`:''}
      <button class="btn sm pri" onclick="closePrModal()">${dis?'Close':'Done'}</button></h3>
    <div class="bd">${body}
      <p class="mini" style="margin:12px 0 0">Changes save as you make them (same as editing in the list).</p></div></div></div>`;
}

/* ---------- Filters: pop-up form + tiles ---------- */
function filterFormHtml(f,dis){
  return `<div class="pf-grid">
    ${prFld('Name',`<input class="cel txt" ${dis} value="${esc(f.name)}" onchange="setIn('filters','${f.id}','name',this.value)">`)}
    ${prFld('Industry',`<input class="cel txt" ${dis} value="${esc(f.industry)}" onchange="setIn('filters','${f.id}','industry',this.value)">`)}
    ${prFld('What you sell',`<input class="cel txt" ${dis} value="${esc(f.whatYouSell)}" onchange="setIn('filters','${f.id}','whatYouSell',this.value)">`)}
    ${prFld('Avg deal',`<div class="row"><select class="cel" style="width:70px" ${dis} onchange="setIn('filters','${f.id}','currency',this.value)">
        ${Object.keys(CCY_SYM).map(c=>`<option ${c===f.currency?'selected':''}>${c}</option>`).join('')}</select>
        <input class="cel" style="flex:1" ${dis} value="${f.dealValue||0}" onchange="setIn('filters','${f.id}','dealValue',this.value,'num')"></div>`)}
    ${prFld('Ideal client',`<textarea class="cel txt" rows="2" ${dis} onchange="setIn('filters','${f.id}','idealClient',this.value)">${esc(f.idealClient)}</textarea>`,true)}
    ${prFld('Market',`<select class="cel" ${dis} onchange="setIn('filters','${f.id}','market',this.value)">${MARKETS.map(x=>`<option ${x===f.market?'selected':''}>${x}</option>`).join('')}</select>`)}
    ${prFld('Country',`<input class="cel txt" ${dis} value="${esc(f.country)}" onchange="setIn('filters','${f.id}','country',this.value)">`)}
    ${prFld('Company size',`<select class="cel" ${dis} onchange="setIn('filters','${f.id}','companySize',this.value)">${COMPANY_SIZES.map(s=>`<option value="${s}" ${s===f.companySize?'selected':''}>${s||'Any'}</option>`).join('')}</select>`)}
    ${prFld('Seniority (Ctrl/Cmd-click for several)',`<select class="cel" multiple size="6" style="height:auto" ${dis} onchange="setFilterSeniority('${f.id}',this)">${SENIORITY_LEVELS.map(s=>`<option ${(f.seniority||[]).includes(s)?'selected':''}>${s}</option>`).join('')}</select>`)}
    ${prFld('Target titles',`<input class="cel txt" ${dis} placeholder="Head of Marketing, VP Sales..." value="${esc(f.targetTitles)}" onchange="setIn('filters','${f.id}','targetTitles',this.value)">`,true)}
    ${prFld('Revenue range',`<input class="cel txt" ${dis} placeholder="e.g. $10-50M" value="${esc(f.revenueRange)}" onchange="setIn('filters','${f.id}','revenueRange',this.value)">`)}
    ${prFld('Tech stack',`<input class="cel txt" ${dis} placeholder="Salesforce, HubSpot..." value="${esc(f.techStack)}" onchange="setIn('filters','${f.id}','techStack',this.value)">`)}
  </div>
  <div class="row" style="margin-top:12px;gap:8px"><span class="mini">Updated ${F.d(f.updatedAt)}${f.trackingRef?' · '+esc(f.trackingRef):''}</span><span class="sp"></span>
    <button class="btn sm pri" ${dis} onclick="generateReport('${f.id}')">Generate report</button>
    <button class="btn sm dgr" ${dis} onclick="removeFilter('${f.id}')">Remove</button></div>`;
}
function filterTilesHtml(dis){
  if(!CFG.filters.length) return `<div class="empty">No filters yet.</div>`;
  return `<div class="pr-tiles">${CFG.filters.map(f=>{
    const nRep=CFG.reports.filter(r=>r.filterId===f.id).length, nLead=CFG.leads.filter(l=>l.filterId===f.id).length;
    const where=[f.industry,f.market,f.country].filter(Boolean).map(esc).join(' · ');
    return `<div class="pr-tile">
      <div class="pt-h"><b>${esc(f.name)||'(unnamed)'}</b><span class="sp"></span>${f.trackingRef?`<span class="mini">${esc(f.trackingRef)}</span>`:''}</div>
      <div class="pt-sub">${where||'<span class="mini">No industry / market set</span>'}</div>
      ${f.idealClient?`<div class="pt-body">${esc(f.idealClient)}</div>`:''}
      <div class="pt-meta"><span>Avg deal <b>${F.mk(f.dealValue,CCY_SYM[f.currency]||'$')}</b></span>
        ${f.companySize?`<span>Size <b>${esc(f.companySize)}</b></span>`:''}
        ${(f.seniority||[]).length?`<span>${esc(f.seniority.join(', '))}</span>`:''}</div>
      ${f.targetTitles?`<div class="mini">Titles: ${esc(f.targetTitles)}</div>`:''}
      <div class="pt-foot"><span class="mini">${nRep} report${nRep===1?'':'s'} · ${nLead} target${nLead===1?'':'s'} · updated ${F.d(f.updatedAt)}</span><span class="sp"></span>
        <button class="btn sm" onclick="openPrModal('filter','${f.id}')">${dis?'View':'Edit'}</button>
        <button class="btn sm pri" ${dis} onclick="generateReport('${f.id}')">Report</button></div>
    </div>`; }).join('')}</div>`;
}

/* ---------- Target list: pop-up + tiles ---------- */
function leadFormHtml(l,dis){
  return `<div class="pf-grid">
    ${prFld('Company',`<input class="cel txt" ${dis} value="${esc(l.company)}" onchange="setIn('leads','${l.id}','company',this.value)">`)}
    ${prFld('Domain',`<input class="cel txt" placeholder="domain.com" ${dis} value="${esc(l.domain)}" onchange="setIn('leads','${l.id}','domain',this.value)">`)}
    ${prFld('Filter',`<select class="cel txt" ${dis} onchange="setIn('leads','${l.id}','filterId',this.value)"><option value="">—</option>${CFG.filters.map(f=>`<option value="${f.id}" ${f.id===l.filterId?'selected':''}>${esc(f.name)}</option>`).join('')}</select>`)}
    ${prFld('Status',`<select class="cel" ${dis} onchange="setIn('leads','${l.id}','status',this.value)">${STATUSES.map(s=>`<option ${s===l.status?'selected':''}>${s}</option>`).join('')}</select>`)}
    ${prFld('Notes',`<textarea class="cel txt" rows="3" ${dis} onchange="setIn('leads','${l.id}','notes',this.value)">${esc(l.notes)}</textarea>`,true)}
  </div>
  <div class="row" style="margin-top:12px;gap:8px">
    <span class="mini">Progress</span> ${ragPillHtml(ragForLead(l))}
    <span class="mini" style="margin-left:10px">Contact</span> ${l.contactName?'<span class="pill ok">On file</span>':'<span class="pill n">None</span>'}
    <button class="btn sm" title="Contact info lives in Hub, not North" onclick="viewCompanyInHub('${jsAttr(l.company)}')">👥 View in Hub</button>
    <span class="sp"></span>
    <button class="btn sm dgr" ${dis} onclick="removeLead('${l.id}');closePrModal()">Remove</button></div>`;
}
function leadTilesHtml(rows){
  if(!rows.length) return `<div class="empty">${CFG.leads.length?'No targets match your search.':'Nothing on the list yet.'}</div>`;
  return `<div class="pr-tiles">${rows.map(l=>{
    const f=byId(CFG.filters,l.filterId);
    return `<div class="pr-tile click" onclick="openPrModal('lead','${l.id}')" title="Open details">
      <div class="pt-h"><b>${esc(l.company)||'(unnamed)'}</b><span class="sp"></span>${ragPillHtml(ragForLead(l))}</div>
      <div class="pt-sub">${l.domain?esc(l.domain):'<span class="mini">No domain</span>'}</div>
      <div class="pt-meta"><span class="pill ${STATUS_TONE[l.status]||'n'}">${esc(l.status)}</span>
        <span>Filter <b>${f?esc(f.name):'—'}</b></span><span>${l.contactName?'Contact on file':'No contact'}</span></div>
      ${l.notes?`<div class="pt-body">${esc(l.notes)}</div>`:''}
    </div>`; }).join('')}</div>`;
}

/* ---------- References: per-type notes + multiple occurrences (2026-09-28) ----------
   Stored in prospectus_references.details (jsonb) as
   {caseStudy|speaking|webinar|testimonial|reference: {on, notes, occ:[{date,name,link,notes}]}}.
   The original boolean flag columns stay the source of truth for the four original types (and
   the new "Reference" flag lives in details.reference.on); the original single-value text
   columns are kept in sync with each type's most recent occurrence so anything reading them
   still works. */
const REF_TYPES=[
  {key:'caseStudy',  label:'Case study',  flag:'isCaseStudy',  namePh:'Title / customer story', linkPh:'Link to the case study'},
  {key:'speaking',   label:'Speaking',    flag:'isSpeaking',   namePh:'Event name',             linkPh:'Event / session link'},
  {key:'webinar',    label:'Webinar',     flag:'isWebinar',    namePh:'Webinar name',           linkPh:'Recording link'},
  {key:'testimonial',label:'Testimonial', flag:'isTestimonial',namePh:'Attribution (name, title)', linkPh:'Where it is published'},
  {key:'reference',  label:'Reference',   flag:'isReference',  namePh:'Prospect name (reference call)', linkPh:'Link (CRM record, notes)'}
];
function refDet(r){
  if(!r.details || typeof r.details!=='object' || Array.isArray(r.details)) r.details={};
  REF_TYPES.forEach(t=>{
    let d=r.details[t.key];
    if(!d || typeof d!=='object') d=r.details[t.key]={notes:'',occ:[]};
    if(!Array.isArray(d.occ)) d.occ=[];
    if(d.notes==null) d.notes='';
  });
  return r.details;
}
function refSeedFromLegacy(r){
  const d=refDet(r);
  const seed=(k,o)=>{ if(!d[k].occ.length && (o.date||o.name||o.link||o.notes)) d[k].occ.push(Object.assign({date:'',name:'',link:'',notes:''},o)); };
  seed('caseStudy',{date:r.caseStudyDate||'',link:r.caseStudyUrl||''});
  seed('speaking',{date:r.speakingDate||'',name:r.speakingEvent||''});
  seed('webinar',{date:r.webinarDate||'',link:r.webinarUrl||''});
  seed('testimonial',{name:r.testimonialAttribution||'',notes:r.testimonialQuote||''});
}
function refSyncLegacy(r){
  const d=refDet(r);
  const latest=k=>d[k].occ.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0]||{};
  let o=latest('caseStudy'); r.caseStudyUrl=o.link||''; r.caseStudyDate=o.date||'';
  o=latest('speaking'); r.speakingEvent=o.name||''; r.speakingDate=o.date||'';
  o=latest('webinar'); r.webinarUrl=o.link||''; r.webinarDate=o.date||'';
  o=latest('testimonial'); r.testimonialAttribution=o.name||''; r.testimonialQuote=o.notes||'';
}
function refDetailsForSave(r){
  const d=refDet(r), out={};
  REF_TYPES.forEach(t=>{ out[t.key]={on:!!r[t.flag],notes:d[t.key].notes||'',occ:d[t.key].occ.map(o=>({date:o.date||'',name:o.name||'',link:o.link||'',notes:o.notes||''}))}; });
  return out;
}
function refCount(r,key){ return refDet(r)[key].occ.length; }
function setRefTypeNotes(id,key,val){
  const r=byId(CFG.references,id); if(!r)return;
  refDet(r)[key].notes=val; logAudit('edit','references/'+(r.name||id)+'.'+key+'.notes'); render();
}
window.setRefTypeNotes=setRefTypeNotes;
function addRefOcc(id,key){
  const r=byId(CFG.references,id); if(!r)return;
  const t=REF_TYPES.find(x=>x.key===key); if(!t)return;
  refDet(r)[key].occ.push({date:new Date().toISOString().slice(0,10),name:'',link:'',notes:''});
  r[t.flag]=true; refSyncLegacy(r);
  logAudit('edit','references/'+(r.name||id)+': add '+t.label+' occurrence'); render();
}
window.addRefOcc=addRefOcc;
function removeRefOcc(id,key,idx){
  const r=byId(CFG.references,id); if(!r)return;
  refDet(r)[key].occ.splice(idx,1); refSyncLegacy(r);
  logAudit('edit','references/'+(r.name||id)+': remove '+key+' occurrence'); render();
}
window.removeRefOcc=removeRefOcc;
function setRefOcc(id,key,idx,field,val){
  const r=byId(CFG.references,id); if(!r)return;
  const o=refDet(r)[key].occ[idx]; if(!o)return;
  o[field]=val; refSyncLegacy(r);
  logAudit('edit','references/'+(r.name||id)+'.'+key+'['+(idx+1)+'].'+field); render();
}
window.setRefOcc=setRefOcc;
function refTypeCell(r,t){
  const on=!!r[t.flag], n=refCount(r,t.key);
  return `<span class="pill ${on?'ok':'n'}">${on?'Yes':'No'}</span>${n?` <span class="mini">${n}×</span>`:''}`;
}
function referenceFormHtml(r,dis){
  const d=refDet(r);
  let h=`<div class="pf-grid">
    ${prFld('Name',`<input class="cel txt" ${dis} value="${esc(r.name)}" onchange="setIn('references','${r.id}','name',this.value)">`)}
    ${prFld('Doc folder',`<input class="cel txt" placeholder="link to folder" ${dis} value="${esc(r.docFolderUrl)}" onchange="setIn('references','${r.id}','docFolderUrl',this.value)">`)}
    ${prFld('Notes',`<textarea class="cel txt" rows="2" ${dis} onchange="setIn('references','${r.id}','notes',this.value)">${esc(r.notes)}</textarea>`,true)}
  </div>`;
  if(!CFG._refDetailsCol) h+=`<div class="note" style="margin:12px 0 0">Run migration <b>Claude outputs/2026-09-28-migration-prospectus-references-details-and-deal-link.sql</b> to save per-type notes, the Reference flag and multiple occurrences. Until then they are kept for this session only (the most recent occurrence still saves to the original fields).</div>`;
  REF_TYPES.forEach(t=>{
    const on=!!r[t.flag], dd=d[t.key];
    h+=`<div class="rt-sec ${on?'on':''}">
      <div class="row"><label class="rt-flag"><input type="checkbox" ${on?'checked':''} ${dis} onchange="toggleRefFlag('${r.id}','${t.flag}')"><b>${t.label}</b></label>
        <span class="mini">${dd.occ.length} occurrence${dd.occ.length===1?'':'s'}</span><span class="sp"></span>
        <button class="btn sm" ${dis} onclick="addRefOcc('${r.id}','${t.key}')">+ Add occurrence</button></div>`;
    if(on || dd.notes || dd.occ.length){
      h+=`<textarea class="cel txt" rows="2" style="margin-top:8px" placeholder="${t.label} notes" ${dis} onchange="setRefTypeNotes('${r.id}','${t.key}',this.value)">${esc(dd.notes)}</textarea>`;
      if(dd.occ.length){
        h+=`<div class="occ-head"><span class="lbl">Date</span><span class="lbl">${t.key==='reference'?'Prospect':t.key==='testimonial'?'Attribution':'Name'}</span><span class="lbl">Link</span><span class="lbl">Notes</span><span></span></div>`;
        dd.occ.forEach((o,i)=>{
          const lk=safeUrl(o.link);
          h+=`<div class="occ-row">
            <input class="cel" type="date" ${dis} value="${esc(o.date)}" onchange="setRefOcc('${r.id}','${t.key}',${i},'date',this.value)">
            <input class="cel txt" placeholder="${esc(t.namePh)}" ${dis} value="${esc(o.name)}" onchange="setRefOcc('${r.id}','${t.key}',${i},'name',this.value)">
            <div class="row"><input class="cel txt" placeholder="${esc(t.linkPh)}" ${dis} value="${esc(o.link)}" onchange="setRefOcc('${r.id}','${t.key}',${i},'link',this.value)">${lk?`<a class="btn sm" href="${esc(lk)}" target="_blank" rel="noopener" title="Open link">↗</a>`:''}</div>
            <input class="cel txt" placeholder="Notes" ${dis} value="${esc(o.notes)}" onchange="setRefOcc('${r.id}','${t.key}',${i},'notes',this.value)">
            <button class="btn sm dgr" ${dis} title="Remove this occurrence" onclick="removeRefOcc('${r.id}','${t.key}',${i})">✕</button></div>`;
        });
      }
    }
    h+=`</div>`;
  });
  h+=`<div class="row" style="margin-top:12px"><span class="sp"></span><button class="btn sm dgr" ${dis} onclick="removeReference('${r.id}')">Remove reference</button></div>`;
  return h;
}
function referenceTilesHtml(dis){
  if(!CFG.references.length) return `<div class="empty">No references tracked yet.</div>`;
  return `<div class="pr-tiles">${CFG.references.map(r=>{
    const lk=safeUrl(r.docFolderUrl);
    return `<div class="pr-tile">
      <div class="pt-h"><b>${esc(r.name)||'(unnamed)'}</b><span class="sp"></span>${lk?`<a class="mini" href="${esc(lk)}" target="_blank" rel="noopener">Doc folder ↗</a>`:''}</div>
      <div class="pt-meta">${REF_TYPES.map(t=>{ const on=!!r[t.flag], n=refCount(r,t.key); return `<span class="pill ${on?'ok':'n'}" title="${n} occurrence${n===1?'':'s'}">${t.label}${n?' · '+n:''}</span>`; }).join('')}</div>
      ${r.notes?`<div class="pt-body">${esc(r.notes)}</div>`:''}
      <div class="pt-foot"><span class="sp"></span><button class="btn sm" onclick="openPrModal('reference','${r.id}')">${dis?'View':'Edit'}</button></div>
    </div>`; }).join('')}</div>`;
}

/* ---------- Reference tracking (2026-09-28, moved from Assets) ---------- */
function dealLabel(id){ const d=id?byId(CFG.deals||[],id):null; return d?d.name+(d.account?' · '+d.account:''):''; }
function refTrackFormHtml(r,dis){
  const known=!r.dealId || (CFG.deals||[]).some(d=>d.id===r.dealId);
  return `<div class="pf-grid">
    ${prFld('Client name',`<input class="cel txt" ${dis} value="${esc(r.clientName)}" onchange="setIn('refTracking','${r.id}','clientName',this.value)">`)}
    ${prFld('Contact name',`<input class="cel txt" ${dis} value="${esc(r.contactName)}" onchange="setIn('refTracking','${r.id}','contactName',this.value)">`)}
    ${prFld('Associated deal',`<select class="cel txt" ${dis} onchange="setIn('refTracking','${r.id}','dealId',this.value||null)">
        <option value="">— none —</option>
        ${known?'':`<option value="${esc(r.dealId)}" selected>(deal not found)</option>`}
        ${(CFG.deals||[]).map(d=>`<option value="${d.id}" ${d.id===r.dealId?'selected':''}>${esc(d.name)}${d.account?' · '+esc(d.account):''}</option>`).join('')}</select>`,true)}
    ${prFld('Notes / guidance',`<textarea class="cel txt" rows="3" ${dis} onchange="setIn('refTracking','${r.id}','notes',this.value)">${esc(r.notes)}</textarea>`,true)}
  </div>
  ${CFG._refTrackDealCol?'':`<div class="note" style="margin:12px 0 0">Run migration <b>Claude outputs/2026-09-28-migration-prospectus-references-details-and-deal-link.sql</b> to save the Deal link. Until then it is kept for this session only.</div>`}
  ${(CFG.deals||[]).length?'':`<p class="mini" style="margin:8px 0 0">No deals found for this organisation (Scoring).</p>`}
  <div class="row" style="margin-top:12px"><span class="sp"></span><button class="btn sm dgr" ${dis} onclick="removeRefTrack('${r.id}')">Remove</button></div>`;
}
function addRefTrack(){
  const r={orgId:_clickOrgId(),id:uid('ref'),clientName:'New client',contactName:'',notes:'',dealId:null};
  CFG.refTracking=CFG.refTracking||[]; CFG.refTracking.push(r);
  logAudit('add reference (tracking)','New client');
  openPrModal('refTrack',r.id,true);
}
window.addRefTrack=addRefTrack;
function removeRefTrack(id){
  if(!confirm('Remove this reference?'))return;
  const row=byId(CFG.refTracking||[],id);
  CFG.refTracking=(CFG.refTracking||[]).filter(r=>r.id!==id);
  if(UI.modal && UI.modal.id===id) UI.modal=null;
  logAudit('remove reference (tracking)',id); render();
  deleteRow('asset_references',id,row&&row.orgId);
}
window.removeRefTrack=removeRefTrack;
function pageRefTracking(){
  const dis=isViewer()?'disabled':'';
  const rows=CFG.refTracking||[];
  let h=`<div class="phead"><div><h1>Reference tracking</h1>
    <p>Customers willing to act as a sales reference, and the deal each one supports. Moved here from Assets --
      these are the same records (nothing was copied or moved).</p></div></div>`;
  if(!CFG._refTrackLoaded) h+=`<div class="note">Reference tracking could not be loaded${CFG._refTrackLoadError?' ('+esc(CFG._refTrackLoadError)+')':''} -- changes here will not save.</div>`;
  else if(!CFG._refTrackDealCol) h+=`<div class="note">Run migration <b>Claude outputs/2026-09-28-migration-prospectus-references-details-and-deal-link.sql</b> to save the Deal link. Everything else saves normally.</div>`;
  h+=`<div class="card"><h3>References <span class="sp"></span><span class="pill n">${rows.length}</span>
      <button class="btn sm pri" ${dis} onclick="addRefTrack()">Add reference</button></h3>
    <div class="bd flush"><div class="scroll cap"><table class="tt"><thead><tr><th>Client name</th><th>Contact name</th><th>Deal</th><th>Account</th><th>Notes / guidance</th><th></th></tr></thead><tbody>
    ${!rows.length?`<tr><td colspan="6" class="empty">No references logged yet.</td></tr>`:rows.map(r=>{
      const d=r.dealId?byId(CFG.deals||[],r.dealId):null;
      return `<tr><td class="lb"><a href="#" onclick="openPrModal('refTrack','${r.id}');return false">${esc(r.clientName)||'(unnamed)'}</a></td>
        <td>${esc(r.contactName)}</td>
        <td>${d?esc(d.name):(r.dealId?'<span class="mini">Deal not found</span>':'—')}</td>
        <td class="mini">${d?esc(d.account):''}</td>
        <td class="mini">${esc(r.notes)}</td>
        <td class="n"><div class="row"><button class="btn sm" onclick="openPrModal('refTrack','${r.id}')">${dis?'View':'Edit'}</button>
          <button class="btn sm dgr" ${dis} onclick="removeRefTrack('${r.id}')">Remove</button></div></td></tr>`; }).join('')}
    </tbody></table></div></div></div>`;
  return h;
}

/* ---------- pages ---------- */'''
sub("/* ---------- pages ---------- */", HELPERS)

# ---- Filters page: toggle + tiles + tt ----
sub("""      <button class="btn sm pri" ${dis} onclick="addFilter()">New filter</button></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th>Name</th><th>Industry</th>""",
"""      <button class="btn sm pri" ${dis} onclick="addFilter()">New filter</button>
      ${prViewToggle('filtersView')}</h3>
    ${UI.filtersView==='tiles'?`<div class="bd flush">${filterTilesHtml(dis)}</div></div>`:`
    <div class="bd flush"><div class="scroll cap"><table class="tt"><thead><tr>
      <th>Name</th><th>Industry</th>""")
sub("""        <button class="btn sm pri" ${dis} onclick="generateReport('${f.id}')">Generate report</button>
        <button class="btn sm dgr" ${dis} onclick="removeFilter('${f.id}')">Remove</button></div></td></tr>`).join('')}
    </tbody></table></div></div></div>`;
  return h;""",
"""        <button class="btn sm" onclick="openPrModal('filter','${f.id}')">${dis?'View':'Edit'}</button>
        <button class="btn sm pri" ${dis} onclick="generateReport('${f.id}')">Generate report</button>
        <button class="btn sm dgr" ${dis} onclick="removeFilter('${f.id}')">Remove</button></div></td></tr>`).join('')}
    </tbody></table></div></div></div>`}`;
  return h;""")

# ---- Targets page ----
sub("""      <button class="btn sm pri" ${dis} onclick="addLead()">Add to list</button></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th class="sortable" style="cursor:pointer" onclick="sortLeadsBy('company')">Company${leadsSortArrow('company')}</th><th>Progress</th><th>Domain</th><th>Contact</th>
      <th class="sortable" style="cursor:pointer" onclick="sortLeadsBy('filter')">Filter${leadsSortArrow('filter')}</th>
      <th class="sortable" style="cursor:pointer" onclick="sortLeadsBy('status')">Status${leadsSortArrow('status')}</th><th>Notes</th><th></th></tr></thead><tbody>""",
"""      <button class="btn sm pri" ${dis} onclick="addLead()">Add to list</button>
      ${prViewToggle('targetsView')}</h3>
    ${UI.targetsView==='tiles'?`<div class="bd flush">${leadTilesHtml(rows)}</div></div>`:`
    <div class="bd flush"><div class="scroll cap"><table class="tt"><thead><tr>
      <!-- 2026-09-28: column sort/filter now comes from shared/tableTools.js (the old click-to-sort headers would have double-sorted) -->
      <th>Company</th><th>Progress</th><th>Domain</th><th>Contact</th>
      <th>Filter</th>
      <th>Status</th><th>Notes</th><th></th></tr></thead><tbody>""")
sub("""      <td class="n"><button class="btn sm dgr" ${dis} onclick="removeLead('${l.id}')">Remove</button></td></tr>`).join('')}
    </tbody></table></div></div></div>`;""",
"""      <td class="n"><div class="row"><button class="btn sm" onclick="openPrModal('lead','${l.id}')">Details</button><button class="btn sm dgr" ${dis} onclick="removeLead('${l.id}')">Remove</button></div></td></tr>`).join('')}
    </tbody></table></div></div></div>`}`;""")

# ---- Reports list + compare ----
sub("""    <div class="bd flush"><table><thead><tr><th>Name</th><th>Filter</th><th>Generated</th><th></th></tr></thead><tbody>""",
    """    <div class="bd flush"><table class="tt"><thead><tr><th>Name</th><th>Filter</th><th>Generated</th><th></th></tr></thead><tbody>""")
sub("""<table><thead><tr><th></th><th>${esc(ra.name)}</th><th>${esc(rb.name)}</th></tr></thead><tbody>""",
    """<table class="tt"><thead><tr><th>Metric</th><th>${esc(ra.name)}</th><th>${esc(rb.name)}</th></tr></thead><tbody>""")

# ---- Report detail -> grid widgets ----
old_rd_start = """function pageReportDetail(){
  const dis=isViewer()?'disabled':'';
  const r=byId(CFG.reports,UI.reportId);
  if(!r) return `<div class="empty">Report not found.</div><a class="btn" href="#" onclick="go('reports');return false">← Back to reports</a>`;"""
sub(old_rd_start, """/* 2026-09-28 (Stef: "Opportunity Reports drill down to details ... Edit layout"): the report
   page's cards are now tiles on shared/grid.js (same system as Strategy/Reporting), one widget
   per former card; the page header stays above the grid. Layouts save per browser under
   'northm_prospectus_*' keys. prReportDetailParts() returns each card's HTML (null = no report). */
function prReportDetailParts(){
  const dis=isViewer()?'disabled':'';
  const r=byId(CFG.reports,UI.reportId);
  if(!r) return null;
  const P={};""")
# convert the h-accumulation into parts
sub("""  let h=`<div class="phead"><div>
    ${f?`<span class="pill">""", """  P.head=`<div class="phead"><div>
    ${f?`<span class="pill">""")
sub("""  h+=`<div class="kpis">
    <div class="kpi hl"><div class="k">Market size (your estimate)</div>""", """  P.kpis=`<div class="kpis" style="margin-bottom:0">
    <div class="kpi hl"><div class="k">Market size (your estimate)</div>""")
sub("""  h+=`<div class="card hl"><h3>Ideal client profile <span class="sp"></span>""", """  P.icp=`<div class="card hl"><h3>Ideal client profile <span class="sp"></span>""")
sub("""  h+=`<div class="card"><h3>Monthly pipeline</h3><div class="bd">""", """  P.pipeline=`<div class="card"><h3>Monthly pipeline</h3><div class="bd">""")
sub("""  h+=`<div class="card"><h3>Illustrative revenue ramp <span class="sp"></span>""", """  P.ramp=`<div class="card"><h3>Illustrative revenue ramp <span class="sp"></span>""")
sub("""  h+=`<div class="card hl"><h3>Summary</h3><div class="bd">""", """  P.summary=`<div class="card hl"><h3>Summary</h3><div class="bd">""")
sub("""    <p class="mini" style="margin-top:8px">Every figure above is computed from the assumptions you entered on this page — edit any of them and the summary updates.</p>
    </div></div>`;
  return h;
}""", """    <p class="mini" style="margin-top:8px">Every figure above is computed from the assumptions you entered on this page — edit any of them and the summary updates.</p>
    </div></div>`;
  return P;
}
const PR_GRID={
  reportDetail:{label:'Opportunity report', boxes:[
    ['box1','kpis',12,'Key figures','Market size, active in-market, clients won, monthly revenue'],
    ['box2','icp',12,'Ideal client profile','Headline, attributes and buying triggers'],
    ['box3','pipeline',6,'Monthly pipeline','Stage-by-stage funnel with editable rates'],
    ['box4','ramp',6,'Illustrative revenue ramp','Straight-line ramp to the monthly revenue range'],
    ['box5','summary',12,'Summary','Plain-English summary of the figures']]}
};
function prPart(page,wid){
  try{ const P=prReportDetailParts(); return P?(P[wid]||''):'<div class="card"><div class="empty">Report not found.</div></div>'; }
  catch(e){ console.error(e); return '<div class="card"><div class="empty">This tile could not be drawn.</div></div>'; }
}
window.prPart=prPart;
function pageReportDetail(){
  const P=prReportDetailParts();
  if(!P) return `<div class="empty">Report not found.</div><a class="btn" href="#" onclick="go('reports');return false">← Back to reports</a>`;
  let h=P.head+`<div class="grid-stack" id="pr-grid-reportDetail">`;
  PR_GRID.reportDetail.boxes.forEach(([box,wid,w])=>{ h+=`<div class="grid-stack-item" gs-w="${w}" gs-id="${box}"><div class="grid-stack-item-content">${P[wid]||''}</div></div>`; });
  return h+`</div>`;
}
if(typeof window.northGridUseModule==='function'){
  const pages={};
  Object.keys(PR_GRID).forEach(pg=>{
    const g=PR_GRID[pg], lib={defaults:{},boxSizes:{},widgets:{}};
    g.boxes.forEach(([box,wid,w,label,hint])=>{ lib.defaults[box]=wid; lib.boxSizes[box]=w; lib.widgets[wid]={label,hint,fn:function(){ return prPart(pg,wid); }}; });
    pages[pg]={label:g.label, container:'pr-grid-'+pg, lib};
  });
  window.northGridUseModule({storePrefix:'northm_prospectus_', pages});
}""")

# ---- References page ----
i_s = src.index('function pageReferences(){')
i_e = src.index('function addReference(){')
new_refs = r'''function pageReferences(){
  /* 2026-09-28 (Stef: References -- filters + sort, Tile view, add/edit in a POP-UP with per-type
     notes + multiple occurrences, and a new "Reference" (reference calls) type). The list is now a
     read-mostly summary; the pop-up (referenceFormHtml) holds every editable field. */
  const dis=isViewer()?'disabled':'';
  let h=`<div class="phead"><div><h1>References</h1>
    <p>Customers and contacts who can support a pitch -- case studies, speaking slots, webinars, testimonials and
      reference calls -- with every occurrence logged and a link to the supporting material.</p></div></div>`;
  if(!CFG._refDetailsCol) h+=`<div class="note">Run migration <b>Claude outputs/2026-09-28-migration-prospectus-references-details-and-deal-link.sql</b> to save per-type notes, the Reference flag and multiple occurrences (kept for this session only until then). Everything else saves normally.</div>`;
  h+=`<div class="card"><h3>References <span class="sp"></span><span class="pill n">${CFG.references.length}</span>
      <button class="btn sm pri" ${dis} onclick="addReference()">Add reference</button>
      ${prViewToggle('refsView')}</h3>`;
  if(UI.refsView==='tiles'){ h+=`<div class="bd flush">${referenceTilesHtml(dis)}</div></div>`; return h; }
  h+=`<div class="bd flush"><div class="scroll cap"><table class="tt"><thead><tr>
      <th>Name</th><th>Doc folder</th>${REF_TYPES.map(t=>`<th>${t.label}</th>`).join('')}<th>Notes</th><th></th>
    </tr></thead><tbody>
    ${!CFG.references.length?`<tr><td colspan="${REF_TYPES.length+4}" class="empty">No references tracked yet.</td></tr>`:CFG.references.map(r=>{
      const lk=safeUrl(r.docFolderUrl);
      return `<tr>
      <td class="lb"><a href="#" onclick="openPrModal('reference','${r.id}');return false">${esc(r.name)||'(unnamed)'}</a></td>
      <td class="mini">${lk?`<a href="${esc(lk)}" target="_blank" rel="noopener">Open ↗</a>`:esc(r.docFolderUrl)}</td>
      ${REF_TYPES.map(t=>`<td>${refTypeCell(r,t)}</td>`).join('')}
      <td class="mini">${esc(r.notes)}</td>
      <td class="n"><div class="row"><button class="btn sm" onclick="openPrModal('reference','${r.id}')">${dis?'View':'Edit'}</button>
        <button class="btn sm dgr" ${dis} onclick="removeReference('${r.id}')">Remove</button></div></td>
    </tr>`; }).join('')}
    </tbody></table></div></div></div>`;
  return h;
}
'''
src = src[:i_s] + new_refs + src[i_e:]

sub("""    isWebinar:false,webinarUrl:'',webinarDate:'',isTestimonial:false,testimonialQuote:'',testimonialAttribution:''});
  logAudit('add reference','New reference'); render(); toast('Reference added -- edit its fields below.');""",
"""    isWebinar:false,webinarUrl:'',webinarDate:'',isTestimonial:false,testimonialQuote:'',testimonialAttribution:'',
    isReference:false,details:{}});
  refDet(CFG.references[CFG.references.length-1]);
  /* 2026-09-28: opens the pop-up instead of editing inline */
  logAudit('add reference','New reference'); openPrModal('reference',CFG.references[CFG.references.length-1].id,true);""")
sub("""  CFG.references=CFG.references.filter(r=>r.id!==id);
  logAudit('remove reference',id); render();""",
"""  CFG.references=CFG.references.filter(r=>r.id!==id);
  if(UI.modal && UI.modal.id===id) UI.modal=null;
  logAudit('remove reference',id); render();""")

# ---- PAGES ----
sub("""  {id:'references',   ix:'5', label:'References', fn:pageReferences},
  {id:'sync',         ix:'6', label:'Shared config', fn:pageSync}""",
"""  {id:'references',   ix:'5', label:'References', fn:pageReferences},
  {id:'refTracking',  ix:'6', label:'Reference tracking', fn:pageRefTracking}, /* 2026-09-28 (Stef: "Reference tracking should sit in Targets after 5 References") */
  {id:'sync',         ix:'7', label:'Shared config', fn:pageSync}""")

# ---- render(): pop-up, ctxbar, grid hook ----
sub("""    mainHtml = p.fn() + (UI.helpOpen?helpPanelHtml():'');""",
    """    mainHtml = p.fn() + prModalHtml() + (UI.helpOpen?helpPanelHtml():''); /* 2026-09-28: + pop-up */""")
sub("""  document.getElementById('main').innerHTML=mainHtml;
  saveLocal();
  scheduleSupabaseSave();
}""", """  const _pmTop=((document.querySelector('#main .pr-modal')||{}).scrollTop)||0; /* 2026-09-28: keep the pop-up's scroll position across re-renders */
  document.getElementById('main').innerHTML=mainHtml;
  if(_pmTop){ const _pm=document.querySelector('#main .pr-modal'); if(_pm) _pm.scrollTop=_pmTop; }
  /* 2026-09-28: ctxbar (Edit layout / Reset / Add tile) only on a page that actually has a grid */
  { const cb=document.getElementById('ctxbar'); if(cb) cb.style.display = document.getElementById('pr-grid-'+p.id) ? '' : 'none'; }
  if(typeof window.northGridAfterRender==='function'){ try{ window.northGridAfterRender(p.id); }catch(e){ console.error('grid layout hook failed',e); } }
  saveLocal();
  scheduleSupabaseSave();
}""")

# ---- deep link ?page= ----
sub("""function _renderSavBarSafely(){""",
"""/* 2026-09-28: deep link, e.g. Prospectus.html?page=refTracking (Assets links here). Only visible PAGES ids. */
function applyDeepLink(){
  try{ const qp=new URLSearchParams(location.search).get('page'); if(qp && PAGES.some(x=>x.id===qp && !x.hidden)) UI.page=qp; }catch(e){}
}
function _renderSavBarSafely(){""")
sub("""          hideAuthGate();
          render();
          subscribeRealtime();""", """          hideAuthGate();
          applyDeepLink();
          render();
          subscribeRealtime();""")
sub("""    hideAuthGate();
    render();
    subscribeRealtime();
  }catch(e){""", """    hideAuthGate();
    applyDeepLink();
    render();
    subscribeRealtime();
  }catch(e){""")

io.open(P, 'w', encoding='utf-8', newline='').write(src.replace('\n', NL))
print('ok', len(src))
