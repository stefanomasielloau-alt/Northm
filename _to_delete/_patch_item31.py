path = "Eventus.html"
with open(path, "r") as f:
    content = f.read()

edits_applied = []

def apply(label, old, new, count=1):
    n = content.count(old)
    if n != count:
        raise SystemExit(f"EDIT '{label}' FAILED: expected {count} occurrence(s), found {n}")
    return old, new

replacements = []

# 1. UI state: add eventsView
old = "const UI = { page:'home', helpOpen:false, eventId:null, rollupLevel:'programme', rollupProgrammeId:null, rollupCampaignId:null,\n  eventsFilter:'', eventsSortBy:null, eventsSortDir:'asc', eventsUpcomingOnly:false };"
new = "const UI = { page:'home', helpOpen:false, eventId:null, rollupLevel:'programme', rollupProgrammeId:null, rollupCampaignId:null,\n  eventsFilter:'', eventsSortBy:null, eventsSortDir:'asc', eventsUpcomingOnly:false, eventsView:'table' };"
replacements.append(("UI state", old, new))

# 2. select: add sort_order
old = "sb.from('eventus_events').select('id,name,type,status,start_date,end_date,country,venue,location,pax,requester,campaign_ref,campaign_id,budget,registered,attended,tracking_ref,is_template,budget_fx')"
new = "sb.from('eventus_events').select('id,name,type,status,start_date,end_date,country,venue,location,pax,requester,campaign_ref,campaign_id,budget,registered,attended,tracking_ref,is_template,budget_fx,sort_order')"
replacements.append(("select sort_order", old, new))

# 3. CFG.events map: add sortOrder
old = """  CFG.events = (eventsR.data||[]).map(e=>({
    id:e.id,name:e.name,type:e.type||'',status:e.status||'Planned',start:e.start_date||'',end:e.end_date||'',
    country:e.country||'',venue:e.venue||'',location:e.location||'',pax:e.pax||0,requester:e.requester||'',
    campaignRef:e.campaign_ref||'',campaignId:e.campaign_id||null,budget:e.budget||0,registered:e.registered||0,attended:e.attended||0,
    budgetFx:e.budget_fx||null,budgetCcy:(e.budget_fx&&e.budget_fx.originalCurrency)||'',
    trackingRef:e.tracking_ref||null,isTemplate:!!e.is_template
  }));"""
new = """  CFG.events = (eventsR.data||[]).map(e=>({
    id:e.id,name:e.name,type:e.type||'',status:e.status||'Planned',start:e.start_date||'',end:e.end_date||'',
    country:e.country||'',venue:e.venue||'',location:e.location||'',pax:e.pax||0,requester:e.requester||'',
    campaignRef:e.campaign_ref||'',campaignId:e.campaign_id||null,budget:e.budget||0,registered:e.registered||0,attended:e.attended||0,
    budgetFx:e.budget_fx||null,budgetCcy:(e.budget_fx&&e.budget_fx.originalCurrency)||'',
    trackingRef:e.tracking_ref||null,isTemplate:!!e.is_template,sortOrder:e.sort_order||0
  }));"""
replacements.append(("CFG.events sortOrder", old, new))

# 4. Also persist sortOrder + campaignId edits in the save layer -- check the save
# payload builder that mirrors the select list (used for INSERT/UPDATE on save).
old = """      campaign_ref:e.campaignRef||'',campaign_id:e.campaignId||null,budget:e.budget||0,registered:e.registered||0,attended:e.attended||0,"""
new = """      campaign_ref:e.campaignRef||'',campaign_id:e.campaignId||null,budget:e.budget||0,registered:e.registered||0,attended:e.attended||0,
      sort_order:e.sortOrder||0,"""
replacements.append(("save payload sort_order", old, new))

# 5. Insert the new engine (RAG color, gantt helpers, grouping, drag handlers,
# board/gantt renderers, view switcher) right after ragPillHtml().
anchor = """function ragPillHtml(rag){
  return `<span class="rag rag-${rag.tone}">${esc(rag.label)}${rag.exceed?' <span class="rag-exceed">★</span>':''}</span>`;
}"""
engine = anchor + '''

/* ============================================================================
   Nested Campaign -> Events -> Activities Table/Board/Gantt (backlog item 31,
   2026-09-09). Confirmed decision: nested, not flat. Activities are shown
   read-only (linkedActivitiesFor) -- Eventus has never written to the tasks
   table before, and this keeps that true; edit an activity from Campaign
   Planning as before. Campaigns here don't carry dates/budget (Eventus's
   own campaigns query only ever selected id/name/programme_id), so the
   Gantt's campaign grouping is a visual section header, not its own bar --
   the events underneath it are the real bars, same as Board's columns.
   ============================================================================ */
const RAG_BAR_COLOR={grey:'#9AA3B5',blue:'#1F3AC7',amber:'#B5730E',red:'#9C2B3C',green:'#0E8A5F'};
function allowDrop(ev){ ev.preventDefault(); }
window.allowDrop=allowDrop;

/* All activities linked to one event -- plural sibling of the existing
   linkedActivityFor() (kept as-is, still used by the read-only rollup
   page), since an event can have more than one linked activity even
   though that page only ever showed the first. */
function linkedActivitiesFor(eventId){ return CFG.linkedActivities.filter(a=>a.eventId===eventId); }

function eventsCampaignName(campaignId){
  if(!campaignId) return 'No linked campaign';
  const c=byId(CFG.campaigns,campaignId);
  return c ? c.name : 'No linked campaign';
}
/* Groups a list of events by their campaign, sorted by campaign name
   (events with no campaign_id land in their own "No linked campaign"
   group rather than being dropped). */
function eventsGroupedByCampaign(list){
  const groups={};
  list.forEach(e=>{
    const key=e.campaignId||'__none__';
    if(!groups[key]) groups[key]={campaignId:e.campaignId||null, campaignName:eventsCampaignName(e.campaignId), events:[]};
    groups[key].events.push(e);
  });
  return Object.values(groups).sort((a,b)=>a.campaignName.localeCompare(b.campaignName));
}
/* Campaign-level status is an aggregate of its events, since campaigns
   carry no status/signoff of their own here -- mirrors the spirit of
   Cursus's ragForProgramme (roll up from children) rather than reading a
   field that doesn't exist on this side. */
function ragForCampaignGroup(events){
  if(!events.length) return {tone:'grey',label:'No events'};
  if(events.some(e=>{ const r=ragForEvent(e); return r.tone==='red' && r.label!=='Cancelled'; })) return {tone:'red',label:'Needs attention'};
  if(events.every(e=>ragForEvent(e).label==='Completed' || e.status==='Cancelled')) return {tone:'green',label:'Completed'};
  if(events.some(e=>ragForEvent(e).tone==='amber')) return {tone:'amber',label:'At risk'};
  return {tone:'blue',label:'On track'};
}

/* ---------- drag-to-reorder (within a campaign group) and drag-to-recategorize
   (drop on a different campaign's Board column) -- same triad pattern as
   Cursus's dragPlanRow/dropPlanRow/dropCampaignStage. ---------- */
function dragEventRow(ev,id){ ev.dataTransfer.setData('text/plain',id); ev.dataTransfer.effectAllowed='move'; }
window.dragEventRow=dragEventRow;
function dropEventRow(ev,targetId){
  ev.preventDefault();
  const dragId=ev.dataTransfer.getData('text/plain');
  if(!dragId||dragId===targetId) return;
  const dragged=byId(CFG.events,dragId), target=byId(CFG.events,targetId);
  if(!dragged||!target) return;
  if((dragged.campaignId||null)!==(target.campaignId||null)) return; // reorder only within the same campaign group
  const ids=CFG.events.filter(e=>(e.campaignId||null)===(target.campaignId||null)).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(e=>e.id);
  const from=ids.indexOf(dragId), to=ids.indexOf(targetId);
  if(from<0||to<0) return;
  ids.splice(to,0,ids.splice(from,1)[0]);
  ids.forEach((id,i)=>{ setIn('events',id,'sortOrder',i,'num'); });
}
window.dropEventRow=dropEventRow;
function dropEventOnCampaign(ev,campaignId){
  ev.preventDefault();
  const dragId=ev.dataTransfer.getData('text/plain');
  if(!dragId) return;
  const dragged=byId(CFG.events,dragId); if(!dragged) return;
  const newCampaignId = campaignId || null;
  if((dragged.campaignId||null)===newCampaignId) return;
  setIn('events',dragId,'campaignId',newCampaignId);
  toast('Moved "'+dragged.name+'" to '+eventsCampaignName(newCampaignId)+'.');
}
window.dropEventOnCampaign=dropEventOnCampaign;

function setEventsView(view){ UI.eventsView=view; render(); }
window.setEventsView=setEventsView;

function eventsViewSwitcherHtml(){
  return `<div class="row" style="gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center;background:#EAF6F3;border:1px solid #CFEAE3;border-radius:var(--r);padding:10px 12px">
    <button class="btn sm ${UI.eventsView==='table'?'pri':''}" onclick="setEventsView('table')">Table</button>
    <button class="btn sm ${UI.eventsView==='board'?'pri':''}" onclick="setEventsView('board')">Board</button>
    <button class="btn sm ${UI.eventsView==='gantt'?'pri':''}" onclick="setEventsView('gantt')">Gantt</button>
    <span class="mini" style="color:var(--ink-3)">— grouped by linked Campaign; Activities shown read-only below each event</span>
  </div>`;
}

/* ---------- Board view: columns = campaigns, cards = events, drag between
   columns to relink an event's campaign, drag within a column to reorder. ---------- */
function eventsPlanBoardHtml(){
  const groups=eventsGroupedByCampaign(filteredSortedEvents());
  let h=`<div class="card"><h3>Board <span class="sp"></span><span class="pill n">${CFG.events.length}</span></h3>
    <div class="bd flush"><div class="scroll" style="padding:12px"><div style="display:flex;gap:14px;min-width:${Math.max(900,groups.length*260)}px">`;
  groups.forEach(g=>{
    const rag=ragForCampaignGroup(g.events);
    h+=`<div style="flex:1;min-width:240px" ondragover="allowDrop(event)" ondrop="dropEventOnCampaign(event,'${g.campaignId||''}')">
      <div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;color:var(--ink-3)">${esc(g.campaignName)} <span class="pill n">${g.events.length}</span> ${ragPillHtml(rag)}</div>
      <div style="display:flex;flex-direction:column;gap:6px;min-height:60px;background:var(--canvas);border-radius:6px;padding:6px">
      ${!g.events.length?'<div class="mini" style="text-align:center;padding:10px;color:var(--ink-3)">—</div>':g.events.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(e=>{
        const erag=ragForEvent(e), range=eventDateRange(e), acts=linkedActivitiesFor(e.id);
        return `<div draggable="true" ondragstart="dragEventRow(event,'${e.id}')" ondragover="allowDrop(event)" ondrop="dropEventRow(event,'${e.id}')" onclick="go('event','${e.id}')"
          style="background:var(--surface);border:1px solid var(--line);border-left:4px solid ${RAG_BAR_COLOR[erag.tone]};border-radius:6px;padding:8px;cursor:pointer;box-shadow:var(--sh)">
          <div style="font-weight:600;font-size:12.5px">${esc(e.name)}</div>
          <div class="mini">${F.d(range.start)}${range.end&&range.end!==range.start?' → '+F.d(range.end):''}</div>
          <div class="mini calc">${F.mk(eventBudgetMain(e))}</div>
          ${acts.length?`<div class="mini" style="color:var(--ink-3)">↳ ${acts.map(a=>esc(a.name)).join(', ')}</div>`:''}
          <div style="margin-top:3px">${ragPillHtml(erag)}</div>
        </div>`;
      }).join('')}
      </div></div>`;
  });
  h+=`</div></div></div></div>`;
  return h;
}

/* ---------- Gantt view: campaign name as a section header, one bar per
   event underneath (real dates), each event's linked activities as a
   smaller read-only sub-row beneath its bar. Drag a bar to reschedule,
   drag the ⠿ handle to reorder within the campaign. ---------- */
function eventsGanttTicks(rs,re,span,rangeDays){
  const ticks=[];
  if(rangeDays<=70){
    let d=new Date(rs); d.setDate(d.getDate()-((d.getDay()+6)%7));
    let guard=0;
    while(d.getTime()<=re && guard<60){
      guard++;
      if(d.getTime()>=rs){
        const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        ticks.push({ left: Math.max(0,Math.min(1,(d.getTime()-rs)/span))*100, label: F.d(iso), major:false });
      }
      d.setDate(d.getDate()+7);
    }
  } else {
    let d=new Date(rs); d.setDate(1);
    if(d.getTime()<rs) d.setMonth(d.getMonth()+1);
    let guard=0;
    while(d.getTime()<=re && guard<48){
      guard++;
      const label=d.toLocaleDateString('en-AU',{month:'short'})+(d.getMonth()===0?" '"+String(d.getFullYear()).slice(2):'');
      ticks.push({ left: Math.max(0,Math.min(1,(d.getTime()-rs)/span))*100, label, major:true });
      d.setMonth(d.getMonth()+1);
    }
  }
  return ticks;
}
function eventsGanttScaleHeaderHtml(ticks){
  return `<div class="row" style="gap:8px;margin-bottom:6px">
    <span style="width:14px;flex-shrink:0"></span>
    <div style="width:170px;flex-shrink:0"></div>
    <div style="flex:1;position:relative;height:16px">
      ${ticks.map(t=>`<div class="mini" style="position:absolute;left:${t.left}%;top:0;transform:translateX(-1px);border-left:1px solid var(--line);padding-left:4px;white-space:nowrap;color:var(--ink-3)">${esc(t.label)}</div>`).join('')}
    </div>
  </div>`;
}
function eventsGanttGridlinesHtml(ticks){
  return ticks.map(t=>`<div style="position:absolute;left:${t.left}%;top:0;bottom:0;width:1px;background:var(--line)"></div>`).join('');
}
let _eventsGanttDrag=null;
function eventsGanttBarMouseDown(ev,id){
  ev.preventDefault(); ev.stopPropagation();
  const track=ev.currentTarget.closest('.gtrack'); if(!track) return;
  const rec=byId(CFG.events,id); if(!rec) return;
  const rangeDays=parseFloat(track.dataset.rangeDays)||1;
  const trackWidth=track.getBoundingClientRect().width||1;
  _eventsGanttDrag={id,startX:ev.clientX,origStart:rec.start,origEnd:rec.end,pxPerDay:trackWidth/rangeDays,moved:false};
}
window.eventsGanttBarMouseDown=eventsGanttBarMouseDown;
document.addEventListener('mousemove',ev=>{
  if(!_eventsGanttDrag) return;
  if(Math.abs(ev.clientX-_eventsGanttDrag.startX)>3) _eventsGanttDrag.moved=true;
});
document.addEventListener('mouseup',ev=>{
  if(!_eventsGanttDrag) return;
  const g=_eventsGanttDrag; _eventsGanttDrag=null;
  if(!g.moved){ go('event',g.id); return; }
  const dayDelta=Math.round((ev.clientX-g.startX)/g.pxPerDay);
  if(!dayDelta) return;
  const shift=(iso,days)=>{ if(!iso) return iso; const d=new Date(iso+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
  const newStart=shift(g.origStart,dayDelta), newEnd=shift(g.origEnd,dayDelta);
  if(g.origStart) setIn('events',g.id,'start',newStart);
  if(g.origEnd) setIn('events',g.id,'end',newEnd);
});
function eventsPlanGanttHtml(){
  const list=filteredSortedEvents();
  const groups=eventsGroupedByCampaign(list);
  const starts=list.map(e=>eventDateRange(e).start).filter(Boolean).sort();
  const ends=list.map(e=>eventDateRange(e).end).filter(Boolean).sort();
  let h=`<div class="card"><h3>Gantt <span class="sp"></span><span class="pill n">${list.length}</span></h3><div class="bd">`;
  if(!starts.length || !ends.length){
    h+=`<div class="empty">Not enough dated events in this scope to draw a timeline.</div></div></div>`;
    return h;
  }
  const range={start:starts[0], end:ends[ends.length-1]};
  const rs=new Date(range.start+'T00:00:00').getTime(), re=new Date(range.end+'T00:00:00').getTime();
  const span=Math.max(1,re-rs), rangeDays=Math.max(1,Math.round(span/86400000));
  const ticks=eventsGanttTicks(rs,re,span,rangeDays);
  h+=`<div class="mini" style="margin-bottom:8px">${F.d(range.start)} → ${F.d(range.end)} · drag a bar to reschedule, drag the ⠿ handle to reorder within its campaign</div>`;
  h+=eventsGanttScaleHeaderHtml(ticks);
  groups.forEach(g=>{
    h+=`<div class="mini" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px;color:var(--ink-3)">${esc(g.campaignName)}</div>`;
    h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
    g.events.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).forEach(e=>{
      const s0=e.start, e0=e.end||e.start;
      const s=s0?new Date(s0+'T00:00:00').getTime():rs;
      const e_=e0?new Date(e0+'T00:00:00').getTime():s;
      const left=Math.max(0,Math.min(1,(s-rs)/span))*100;
      const width=Math.max(2,Math.max(0,Math.min(1,(e_-s)/span))*100);
      const rag=ragForEvent(e), color=RAG_BAR_COLOR[rag.tone];
      const acts=linkedActivitiesFor(e.id);
      h+=`<div class="row" style="gap:8px">
        <span class="mini" draggable="true" ondragstart="dragEventRow(event,'${e.id}')" ondragover="allowDrop(event)" ondrop="dropEventRow(event,'${e.id}')" style="width:14px;flex-shrink:0;cursor:grab" title="Drag to reorder">⠿</span>
        <div class="mini" style="width:170px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="go('event','${e.id}')">${esc(e.name)}</div>
        <div class="gtrack" data-range-days="${rangeDays}" style="flex:1;position:relative;height:20px;background:var(--canvas);border-radius:4px">
          ${eventsGanttGridlinesHtml(ticks)}
          <div onmousedown="eventsGanttBarMouseDown(event,'${e.id}')"
            style="position:absolute;top:2px;height:16px;left:${left}%;width:${width}%;background:${color};border-radius:3px;cursor:grab"
            title="${esc(e.name)} — ${esc(rag.label)}"></div>
        </div>
        ${ragPillHtml(rag)}
      </div>`;
      if(acts.length){
        h+=`<div class="mini" style="margin-left:36px;color:var(--ink-3)">↳ ${acts.map(a=>esc(a.name)).join(', ')}</div>`;
      }
    });
    h+=`</div>`;
  });
  h+=`</div></div>`;
  return h;
}'''
if content.count(anchor) != 1:
    raise SystemExit(f"ANCHOR (ragPillHtml) failed: count={content.count(anchor)}")
content = content.replace(anchor, engine, 1)

# 6. Wire pageEvents(): add the view switcher + branch to board/gantt, add a
# Campaign column + drag handle to the existing table, keep everything else
# (search, upcoming-only filter, CSV export, Add event, Clone) exactly as-is.
old_pageevents_head = '''function pageEvents(){
  const totalBudget=sum(CFG.events.map(e=>eventBudgetMain(e)));
  const totalActual=sum(CFG.events.map(e=>costsTotal(e.id,'actualCost')||e.budget*0));
  const list=filteredSortedEvents();
  const overrunCount=CFG.events.filter(eventBudgetOverrun).length;
  let h=`<div class="phead"><div><h1>Events</h1>
    <p>High-level event list. Open one to manage its cost lines, checklist, speakers and registration.</p></div></div>`;
  h+=`<div class="kpis">
    <div class="kpi hl"><div class="k">Events</div><div class="kpi-v">${CFG.events.length}</div><div class="sub">tracked here</div></div>
    <div class="kpi"><div class="k">Total budget</div><div class="kpi-v">${F.mk(totalBudget)}</div></div>
    <div class="kpi"><div class="k">Total actual spend</div><div class="kpi-v">${F.mk(sum(CFG.events.map(e=>costsTotal(e.id,'actualCost'))))}</div></div>
    <div class="kpi"><div class="k">Over budget</div><div class="kpi-v" style="color:${overrunCount?'var(--bad)':'inherit'}">${overrunCount}</div><div class="sub">of ${CFG.events.length} events</div></div>
  </div>`;
  h+=`<div class="card"><h3>Events <span class="sp"></span>
      <input class="in" type="text" style="width:220px" placeholder="Search name, type, status, venue, country…" value="${esc(UI.eventsFilter||'')}" oninput="setEventsFilter(this.value)">
      <label class="mini" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ${UI.eventsUpcomingOnly?'checked':''} onchange="toggleEventsUpcomingOnly(this.checked)"> Upcoming only</label>
      <span class="pill n">${list.length}${list.length!==CFG.events.length?' / '+CFG.events.length:''}</span>
      <button class="btn sm" onclick="exportEventsCsv()">Export CSV</button>
      <button class="btn sm pri" onclick="addEvent()">Add event</button></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th style="cursor:pointer" onclick="sortEventsBy('name')">Event${eventsSortArrow('name')}</th><th>Type</th><th>Status</th><th>Progress</th><th>Venue / location</th>
      <th style="cursor:pointer" onclick="sortEventsBy('start')">Dates${eventsSortArrow('start')}</th>
      <th class="n">PAX</th><th class="n" style="cursor:pointer" onclick="sortEventsBy('budget')">Budget${eventsSortArrow('budget')}</th><th class="n">Committed</th><th class="n">Actual</th><th></th></tr></thead><tbody>
    ${!list.length?`<tr><td colspan="11" class="empty">${CFG.events.length?'No events match your search.':'No events yet.'}</td></tr>`:list.map(e=>{
      const committed=costsTotal(e.id,'committedCost'), actual=costsTotal(e.id,'actualCost');
      const range=eventDateRange(e);
      return `<tr><td class="lb">${esc(e.name)}${e.isTemplate?' <span class="pill v">Template</span>':''}${e.trackingRef?`<div class="mini">${esc(e.trackingRef)}</div>`:''}</td>
        <td>${esc(e.type)}</td>
        <td><span class="pill ${e.status==='Completed'?'ok':e.status==='Cancelled'?'bad':e.status==='Confirmed'?'ok':'n'}">${esc(e.status)}</span></td>
        <td>${ragPillHtml(ragForEvent(e))}</td>
        <td class="mini">${esc(eventVenueSummary(e))}</td>
        <td class="mini">${F.d(range.start)}${range.end&&range.end!==range.start?' → '+F.d(range.end):''}</td>
        <td class="n calc">${F.n(eventPax(e))}</td>
        <td class="n calc">${F.mk(eventBudgetMain(e))}</td>
        <td class="n calc">${F.mk(committed)}</td>
        <td class="n calc">${F.mk(actual)}${eventBudgetOverrun(e)?' <span class="pill bad" title="Actual spend exceeds this event\\'s total budget">Over</span>':''}</td>
        <td><button class="btn sm pri" onclick="go('event','${e.id}')">Open →</button> <button class="btn sm" onclick="cloneEvent('${e.id}')" title="Deep-clones venues, cost lines, checklist and speakers; dates, registrations and actuals reset">Clone</button></td></tr>`;}).join('')}
    </tbody></table></div></div></div>`;
  return h;
}'''

new_pageevents = '''function pageEvents(){
  const totalBudget=sum(CFG.events.map(e=>eventBudgetMain(e)));
  const totalActual=sum(CFG.events.map(e=>costsTotal(e.id,'actualCost')||e.budget*0));
  const list=filteredSortedEvents();
  const overrunCount=CFG.events.filter(eventBudgetOverrun).length;
  let h=`<div class="phead"><div><h1>Events</h1>
    <p>High-level event list, nested under each event's linked Campaign. Open one to manage its cost lines, checklist, speakers and registration.</p></div></div>`;
  h+=`<div class="kpis">
    <div class="kpi hl"><div class="k">Events</div><div class="kpi-v">${CFG.events.length}</div><div class="sub">tracked here</div></div>
    <div class="kpi"><div class="k">Total budget</div><div class="kpi-v">${F.mk(totalBudget)}</div></div>
    <div class="kpi"><div class="k">Total actual spend</div><div class="kpi-v">${F.mk(sum(CFG.events.map(e=>costsTotal(e.id,'actualCost'))))}</div></div>
    <div class="kpi"><div class="k">Over budget</div><div class="kpi-v" style="color:${overrunCount?'var(--bad)':'inherit'}">${overrunCount}</div><div class="sub">of ${CFG.events.length} events</div></div>
  </div>`;
  h+=eventsViewSwitcherHtml();
  if(UI.eventsView==='board'){ h+=eventsPlanBoardHtml(); return h; }
  if(UI.eventsView==='gantt'){ h+=eventsPlanGanttHtml(); return h; }
  const dragEnabled = !UI.eventsSortBy && !UI.eventsFilter && !UI.eventsUpcomingOnly;
  h+=`<div class="card"><h3>Events <span class="sp"></span>
      <input class="in" type="text" style="width:220px" placeholder="Search name, type, status, venue, country…" value="${esc(UI.eventsFilter||'')}" oninput="setEventsFilter(this.value)">
      <label class="mini" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ${UI.eventsUpcomingOnly?'checked':''} onchange="toggleEventsUpcomingOnly(this.checked)"> Upcoming only</label>
      <span class="pill n">${list.length}${list.length!==CFG.events.length?' / '+CFG.events.length:''}</span>
      <button class="btn sm" onclick="exportEventsCsv()">Export CSV</button>
      <button class="btn sm pri" onclick="addEvent()">Add event</button></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
      ${dragEnabled?'<th style="width:14px"></th>':''}
      <th style="cursor:pointer" onclick="sortEventsBy('name')">Event${eventsSortArrow('name')}</th><th>Campaign</th><th>Type</th><th>Status</th><th>Progress</th><th>Venue / location</th>
      <th style="cursor:pointer" onclick="sortEventsBy('start')">Dates${eventsSortArrow('start')}</th>
      <th class="n">PAX</th><th class="n" style="cursor:pointer" onclick="sortEventsBy('budget')">Budget${eventsSortArrow('budget')}</th><th class="n">Committed</th><th class="n">Actual</th><th></th></tr></thead><tbody>
    ${!list.length?`<tr><td colspan="12" class="empty">${CFG.events.length?'No events match your search.':'No events yet.'}</td></tr>`:list.map(e=>{
      const committed=costsTotal(e.id,'committedCost'), actual=costsTotal(e.id,'actualCost');
      const range=eventDateRange(e);
      const acts=linkedActivitiesFor(e.id);
      return `<tr ${dragEnabled?`draggable="true" ondragstart="dragEventRow(event,'${e.id}')" ondragover="allowDrop(event)" ondrop="dropEventRow(event,'${e.id}')"`:''}>
        ${dragEnabled?`<td class="mini" style="cursor:grab" title="Drag to reorder within its campaign">⠿</td>`:''}
        <td class="lb">${esc(e.name)}${e.isTemplate?' <span class="pill v">Template</span>':''}${e.trackingRef?`<div class="mini">${esc(e.trackingRef)}</div>`:''}${acts.length?`<div class="mini" style="color:var(--ink-3)">↳ ${acts.map(a=>esc(a.name)).join(', ')}</div>`:''}</td>
        <td class="mini">${esc(eventsCampaignName(e.campaignId))}</td>
        <td>${esc(e.type)}</td>
        <td><span class="pill ${e.status==='Completed'?'ok':e.status==='Cancelled'?'bad':e.status==='Confirmed'?'ok':'n'}">${esc(e.status)}</span></td>
        <td>${ragPillHtml(ragForEvent(e))}</td>
        <td class="mini">${esc(eventVenueSummary(e))}</td>
        <td class="mini">${F.d(range.start)}${range.end&&range.end!==range.start?' → '+F.d(range.end):''}</td>
        <td class="n calc">${F.n(eventPax(e))}</td>
        <td class="n calc">${F.mk(eventBudgetMain(e))}</td>
        <td class="n calc">${F.mk(committed)}</td>
        <td class="n calc">${F.mk(actual)}${eventBudgetOverrun(e)?' <span class="pill bad" title="Actual spend exceeds this event\\'s total budget">Over</span>':''}</td>
        <td><button class="btn sm pri" onclick="go('event','${e.id}')">Open →</button> <button class="btn sm" onclick="cloneEvent('${e.id}')" title="Deep-clones venues, cost lines, checklist and speakers; dates, registrations and actuals reset">Clone</button></td></tr>`;}).join('')}
    </tbody></table></div></div></div>`;
  return h;
}'''

if content.count(old_pageevents_head) != 1:
    raise SystemExit(f"pageEvents() replacement failed: count={content.count(old_pageevents_head)}")
content = content.replace(old_pageevents_head, new_pageevents, 1)

with open(path, "w") as f:
    f.write(content)
print("ALL EDITS APPLIED OK")
