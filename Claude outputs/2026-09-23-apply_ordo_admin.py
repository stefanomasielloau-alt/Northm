import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageAdmin(){\n"
end_marker = "\n\n/* ---------- admin mutations ---------- */"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageAdmin(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
for marker in ["Gate set", "Regions <span", "Pods <span", "Reps <span", "Streams <span",
               "Activities <span", "Pre-Lead chains", "Segments <span", "Programme roll-up",
               "Campaigns <span", "Cost buckets <span", "Fiscal calendar", "Period map",
               "Versions &amp; scenarios", "Roles &amp; users have moved",
               "Requires commit on plan edits", "Connections <span", "Load rules", "Future adjacencies",
               "Audit log <span"]:
    assert marker in old_block, "missing expected marker: " + marker

new_block = r'''function adminGatesWidgetSet(){
  const dis=canConfig()?'':'disabled';
  const ro=canConfig()?'':'class="locked"';
  const c=chain(),iss=rateIssues();
  const _exitG = exitGate();
  const _showOrgCol = typeof SAV!=='undefined' && SAV.mode && SAV.mode()==='all';
  const _orgName = oid => { const o=(CFG.allOrganizations||[]).find(x=>x.id===oid); return o?o.name:(oid?'Unknown org':'—'); };
  let h='';
  if(!c.length){
    h+=`<div class="note b"><strong>No gates are configured for this organization yet.</strong> Strategy needs at least one gate to compute anything. Click "Add gate" below, or use a starter preset from the "Gate naming presets" card underneath to get going quickly.</div>`;
  } else {
    h+=`<div class="note"><strong>How the chain works.</strong> Each gate converts from the one above it.
      The first gate is the entry point and has no inbound rate. Reorder with the arrows — the engine re-resolves immediately.
      A pass-through gate takes <b>100%</b>, never 0%.</div>`;
  }
  if(iss.length) h+=`<div class="note b"><strong>${iss.length} rate issue${iss.length>1?'s':''}.</strong> ${iss.map(i=>(i.gate?esc(i.gate.name)+': ':'')+esc(i.msg)).join(' ')}</div>`;
  const _gatesDisplay = (_showOrgCol && UI.gatesSortByOrg)
    ? CFG.gates.slice().sort((a,b)=> _orgName(a.orgId).localeCompare(_orgName(b.orgId)) || a.order-b.order)
    : CFG.gates.sort((a,b)=>a.order-b.order);
  h+=`<div class="card"><h3>Gate set <span class="sp"></span>
    <span class="pill n">${c.length} active</span>
    <button class="btn sm pri" ${dis} onclick="addGate()">Add gate</button></h3>
    <div class="bd flush"><div class="scroll"><table ${ro}><thead><tr>
      <th style="width:30px"></th><th>Gate name</th><th>Code</th>${_showOrgCol?`<th style="cursor:pointer" onclick="UI.gatesSortByOrg=!UI.gatesSortByOrg;render();" title="Click to ${UI.gatesSortByOrg?'go back to chain order':'group by organization'}">Org ${UI.gatesSortByOrg?'▾':'⇅'}</th>`:''}
      <th class="n" title="The conversion rate INTO this gate from the previous one, as a percentage (e.g. 25 means 25% of the prior stage converts through). The entry gate has no inbound rate -- nothing converts into it.">Rate in (%) ⓘ</th>
      <th class="n" title="Cumulative conversion rate from the entry gate all the way down to this one.">Cum. to here</th><th>Role</th><th>Definition shown to users</th><th class="n">Order</th><th></th>
    </tr></thead><tbody>`;
  _gatesDisplay.forEach((g,i)=>{
    const isEntry=g.entry, cum=g.active?cumRate(g.id):null;
    h+=`<tr${g.active?'':' style="opacity:.45"'}>
      <td><span class="grab">⋮⋮</span></td>
      <td><input class="cel txt" value="${esc(g.name)}" ${dis} onchange="setIn('gates','${g.id}','name',this.value)"></td>
      <td><input class="cel txt" style="width:70px" value="${esc(g.code)}" ${dis} onchange="setIn('gates','${g.id}','code',this.value)"></td>
      ${_showOrgCol?`<td class="mini">${esc(_orgName(g.orgId))}</td>`:''}
      <td class="n">${isEntry?'<span class="mini">entry</span>':
        `<input class="cel w ${g.rate===0?'bad':''}" value="${(g.rate*100).toFixed(0)}" ${dis} onchange="setIn('gates','${g.id}','rate',this.value,'pct')" title="Percent -- e.g. 25 means 25%">%`}</td>
      <td class="n calc">${isEntry?'100%':F.p(cum,2)}</td>
      <td>${isEntry?'<span class="pill v">Entry</span>':(i===CFG.gates.length-1?'<span class="pill ok">Target</span>':'<span class="pill n">Stage</span>')}</td>
      <td><input class="cel txt" style="width:260px" value="${esc(g.note||'')}" ${dis} onchange="setIn('gates','${g.id}','note',this.value)"></td>
      <td class="n">
        <button class="btn sm" ${dis||i===0?'disabled':''} onclick="moveGate('${g.id}',-1)">↑</button>
        <button class="btn sm" ${dis||i===CFG.gates.length-1?'disabled':''} onclick="moveGate('${g.id}',1)">↓</button></td>
      <td class="n"><button class="btn sm dgr" ${dis} onclick="removeGate('${g.id}')">Remove</button></td>
    </tr>`;
  });
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function adminGatesWidgetPreview(){
  const c=chain();
  const _exitG = exitGate();
  return `<div class="card"><h3>Chain preview</h3><div class="bd">
    ${c.length?svgFunnel(Object.values(backward(100)).reverse().reverse(),c.map(g=>g.name),600):'<p class="mini">Add at least one gate to see a preview.</p>'}
    <div class="mini" style="margin-top:6px">${_exitG?('Volumes required to land <b>100</b> at '+esc(_exitG.name)+'.'):'Add at least one gate to compute required volumes.'}</div>
  </div></div>`;
}
function adminGatesWidgetPresets(){
  const dis=canConfig()?'':'disabled';
  return `<div class="card"><h3>Gate naming presets</h3><div class="bd">
    <p class="mini" style="margin:0 0 9px">Different organisations gate differently. Load a preset, then rename freely.</p>
    <div class="row">
      <button class="btn" ${dis} onclick="preset('anaplan')">5-gate (Lead→Win)</button>
      <button class="btn" ${dis} onclick="preset('full')">6-gate incl. SAO</button>
      <button class="btn" ${dis} onclick="preset('mqlsql')">4-gate (MQL→Win)</button>
      <button class="btn" ${dis} onclick="preset('long')">8-gate enterprise</button>
    </div>
    <div class="dv"></div>
    <div class="mini"><b>Where gates appear.</b> ${MODULE_USE.Gates.modules.length} modules,
      ${MODULE_USE.Gates.views.length} views, ${MODULE_USE.Gates.calcs.length} calculations,
      ${MODULE_USE.Gates.valids.length} validations, ${MODULE_USE.Gates.feeds.length} feed mappings.
      Full list shows on any change.</div>
  </div></div>`;
}
function adminGeoWidgetRegions(){
  const dis=canConfig()?'':'disabled';
  const ro=canConfig()?'':'class="locked"';
  let h=`<div class="card"><h3>Regions <span class="sp"></span>
    <button class="btn sm pri" ${dis} onclick="addRegion()">Add region</button></h3>
    <div class="bd flush"><table ${ro}><thead><tr><th>Region</th><th>Code</th><th class="n">AE heads</th>
      <th class="n">ACV target</th><th class="n">Pods</th><th>Pod allocation</th><th></th></tr></thead><tbody>`;
  CFG.regions.forEach(r=>{
    const t=podShareTotal(r.id),ok=Math.abs(t-1)<0.0001;
    h+=`<tr${r.unassigned?' style="opacity:.6"':''}>
      <td class="lb">${r.unassigned?esc(r.name)+' <span class="tag">system</span>':`<input class="cel txt" style="width:140px" value="${esc(r.name)}" ${dis} onchange="setIn('regions','${r.id}','name',this.value)">`}</td>
      <td>${esc(r.code)}</td>
      <td class="n"><input class="cel w" value="${r.aeHeads}" ${dis} onchange="setIn('regions','${r.id}','aeHeads',this.value,'num')"></td>
      <td class="n"><input class="cel" value="${r.acvTarget}" ${dis} onchange="setIn('regions','${r.id}','acvTarget',this.value,'money')"></td>
      <td class="n calc">${P(r.id).length}</td>
      <td><div class="row"><div class="bar" style="width:80px"><i style="width:${clamp(t*100,0,100)}%;background:${ok?'var(--ok)':'var(--bad)'}"></i></div>
        <span class="pill ${ok?'ok':'bad'}">${F.p(t,0)}</span></div></td>
      <td class="n">${r.unassigned?'':`<button class="btn sm dgr" ${dis} onclick="removeRegion('${r.id}')">Remove</button>`}</td>
    </tr>`;
  });
  h+=`</tbody></table></div></div>`;
  return h;
}
function adminGeoWidgetPods(){
  const dis=canConfig()?'':'disabled';
  const ro=canConfig()?'':'class="locked"';
  let h=`<div class="card"><h3>Pods <span class="sp"></span>
    <button class="btn sm pri" ${dis} onclick="addPod()">Add pod</button></h3>
    <div class="bd flush"><div class="scroll cap"><table ${ro}><thead><tr>
      <th>Pod name</th><th>Region</th><th class="n">Share of region</th><th>Allocation</th><th></th></tr></thead><tbody>`;
  CFG.regions.forEach(r=>{
    const pods=CFG.pods.filter(p=>p.regionId===r.id); if(!pods.length)return;
    h+=`<tr class="gp"><td colspan="5">${esc(r.name)}</td></tr>`;
    pods.forEach(p=>{
      h+=`<tr${p.unassigned?' style="opacity:.6"':''}>
        <td><input class="cel txt" style="width:190px" value="${esc(p.name)}" ${dis} onchange="setIn('pods','${p.id}','name',this.value)"></td>
        <td><select class="cel txt" style="width:120px" ${dis} onchange="setIn('pods','${p.id}','regionId',this.value)">
          ${CFG.regions.map(x=>`<option value="${x.id}" ${x.id===p.regionId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></td>
        <td class="n"><input class="cel w" value="${(p.share*100).toFixed(0)}" ${dis} onchange="setIn('pods','${p.id}','share',this.value,'pct')"></td>
        <td><div class="bar" style="width:100px"><i style="width:${clamp(p.share*100,0,100)}%"></i></div></td>
        <td class="n">${p.unassigned?'':`<button class="btn sm dgr" ${dis} onclick="removePod('${p.id}')">Remove</button>`}</td>
      </tr>`;
    });
  });
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function adminGeoWidgetReps(){
  const dis=canConfig()?'':'disabled';
  const ro=canConfig()?'':'class="locked"';
  let h=`<div class="card"><h3>Reps <span class="sp"></span>
    <span class="mini">Third hierarchy level — Region &gt; Pod &gt; Rep — for contribution tracking down to a salesperson</span></h3>
    <div class="bd flush"><div class="scroll cap"><table ${ro}><thead><tr>
      <th>Rep name</th><th>Pod</th><th class="n">Share of pod</th><th>Allocation</th><th></th></tr></thead><tbody>`;
  CFG.pods.filter(p=>!p.unassigned).forEach(p=>{
    const reps=REP(p.id);
    h+=`<tr class="gp"><td colspan="5">${esc(p.name)} <button class="btn sm" style="margin-left:8px" ${dis} onclick="addRep('${p.id}')">Add rep</button></td></tr>`;
    if(!reps.length){ h+=`<tr><td colspan="5" class="mini" style="padding-left:14px">No reps added — pod total is planned as one block.</td></tr>`; return; }
    reps.forEach(x=>{
      h+=`<tr><td><input class="cel txt" style="width:190px" value="${esc(x.name)}" ${dis} onchange="setIn('reps','${x.id}','name',this.value)"></td>
        <td><select class="cel txt" style="width:150px" ${dis} onchange="setIn('reps','${x.id}','podId',this.value)">
          ${CFG.pods.filter(pp=>!pp.unassigned).map(pp=>`<option value="${pp.id}" ${pp.id===x.podId?'selected':''}>${esc(pp.name)}</option>`).join('')}</select></td>
        <td class="n"><input class="cel w" value="${(x.share*100).toFixed(0)}" ${dis} onchange="setIn('reps','${x.id}','share',this.value,'pct')"></td>
        <td><div class="bar" style="width:100px"><i style="width:${clamp(x.share*100,0,100)}%"></i></div></td>
        <td class="n"><button class="btn sm dgr" ${dis} onclick="removeRep('${x.id}')">Remove</button></td></tr>`;
    });
  });
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function adminStreamsWidgetTable(){
  const dis=canConfig()?'':'disabled';
  const t=streamMixTotal(),ok=Math.abs(t-1)<0.0001;
  const wt=CFG.drivers.winTarget;
  let h=`<div class="card"><h3>Streams <span class="sp"></span>
    <button class="btn sm" ${dis} onclick="normStreams()">Normalise to 100%</button>
    <button class="btn sm pri" ${dis} onclick="addStream()">Add stream</button></h3>
    <div class="bd flush"><table><thead><tr><th>Stream</th><th class="n">Mix</th><th></th>
      <th class="n">Marketing contribution</th><th class="n">Wins @ target</th><th class="n">Mktg wins</th><th></th></tr></thead><tbody>`;
  S().forEach(s=>{
    h+=`<tr><td class="lb"><input class="cel txt" style="width:150px" value="${esc(s.name)}" ${dis} onchange="setIn('streams','${s.id}','name',this.value)"></td>
      <td class="n"><input class="cel w" value="${(s.mix*100).toFixed(0)}" ${dis} onchange="setIn('streams','${s.id}','mix',this.value,'pct')"></td>
      <td><div class="bar" style="width:110px"><i style="width:${clamp(s.mix*100,0,100)}%"></i></div></td>
      <td class="n"><input class="cel w" value="${(s.mktContrib*100).toFixed(0)}" ${dis} onchange="setIn('streams','${s.id}','mktContrib',this.value,'pct')"></td>
      <td class="n calc">${F.n(wt*s.mix,1)}</td>
      <td class="n calc">${F.n(wt*s.mix*s.mktContrib,1)}</td>
      <td class="n"><button class="btn sm dgr" ${dis} onclick="removeStream('${s.id}')">Remove</button></td></tr>`;
  });
  h+=`<tr class="tot"><td>Total</td><td class="n"><span class="pill ${ok?'ok':'bad'}">${F.p(t,0)}</span></td><td></td>
    <td class="n calc">blend ${F.p(sum(S().map(s=>s.mix*s.mktContrib))/(t||1),1)}</td>
    <td class="n">${F.n(wt*t,1)}</td><td class="n">${F.n(sum(S().map(s=>wt*s.mix*s.mktContrib)),1)}</td><td></td></tr>`;
  h+=`</tbody></table></div></div>`;
  return h;
}
function adminActsWidgetTable(){
  const dis=canConfig()?'':'disabled';
  const ro=canConfig()?'':'class="locked"';
  const cr=cumRate(exitGate().id);
  let h=`<div class="card"><h3>Activities <span class="sp"></span>
    <button class="btn sm pri" ${dis} onclick="addActivity()">Add activity</button></h3>
    <div class="bd flush"><div class="scroll cap"><table ${ro}><thead><tr>
      <th>Activity</th><th>Route</th><th class="n">Cost / lead</th><th class="n">Capacity / month</th>
      <th class="n">Cost per win @ plan</th><th>Active</th><th></th></tr></thead><tbody>`;
  CFG.activities.forEach(a=>{
    const cpw = cr>0? a.costPer/cr : null;
    h+=`<tr${a.unassigned?' style="opacity:.6"':''}>
      <td><input class="cel txt" style="width:170px" value="${esc(a.name)}" ${dis} onchange="setIn('activities','${a.id}','name',this.value)"></td>
      <td><select class="cel txt" style="width:110px" ${dis} onchange="setIn('activities','${a.id}','routeId',this.value)">
        ${CFG.routes.map(x=>`<option value="${x.id}" ${x.id===a.routeId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></td>
      <td class="n"><input class="cel w" value="${a.costPer}" ${dis} onchange="setIn('activities','${a.id}','costPer',this.value,'money')"></td>
      <td class="n"><input class="cel w" value="${a.capMonth}" ${dis} onchange="setIn('activities','${a.id}','capMonth',this.value,'num')"></td>
      <td class="n calc">${a.costPer?F.m(cpw):'—'}</td>
      <td><span class="pill ${a.active?'ok':'n'}">${a.active?'Active':'Retired'}</span></td>
      <td class="n">${a.unassigned?'':`<button class="btn sm" ${dis} onclick="toggleActivity('${a.id}')">${a.active?'Retire':'Restore'}</button>`}</td>
    </tr>`;
  });
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function adminActsWidgetPreChains(){
  const dis=canConfig()?'':'disabled';
  return `<div class="card"><h3>Pre-Lead chains <span class="sp"></span>
      <span class="mini">optional, per activity type</span></h3>
    <div class="bd">
      <p class="mini" style="margin:0 0 10px">Some activity types have their own channel-specific stages before a Lead
        exists — Paid/SEO uses Impressions and Clicks, Syndication uses single/double opt-in clicks, and so on. Define
        them here per activity, using whatever terms match that channel. Leave an activity with no stages and it works
        exactly as before — this only ever feeds into the existing Lead gate, one layer earlier; nothing downstream
        of Lead is affected.</p>
      ${CFG.activities.filter(a=>!a.unassigned).map(a=>{
        const stages=activityPreChain(a.id);
        return `<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line)">
          <div class="row" style="align-items:center"><b>${esc(a.name)}</b><span class="sp"></span>
            <button class="btn sm" ${dis} onclick="addPreStage('${a.id}')">Add stage</button></div>
          ${!stages.length?`<div class="mini" style="margin-top:4px">No pre-chain — leads are the first stage tracked for this activity.</div>`:
            `<div class="scroll" style="margin-top:6px"><table><thead><tr><th>Stage</th><th class="n">Order</th>
              <th class="n">Rate to next stage (or to Lead, if last)</th><th></th></tr></thead><tbody>
            ${stages.map(s=>`<tr>
              <td><input class="cel txt" style="width:200px" value="${esc(s.name)}" ${dis} onchange="setPreStage('${a.id}','${s.id}','name',this.value)"></td>
              <td class="n"><input class="cel w" value="${s.order}" ${dis} onchange="setPreStage('${a.id}','${s.id}','order',this.value,'num')"></td>
              <td class="n"><input class="cel w" value="${((s.rateToNext||0)*100).toFixed(1)}" ${dis} onchange="setPreStage('${a.id}','${s.id}','rateToNext',this.value,'pct')"></td>
              <td class="n"><button class="btn sm dgr" ${dis} onclick="removePreStage('${a.id}','${s.id}')">Remove</button></td></tr>`).join('')}
            </tbody></table></div>`}
        </div>`;
      }).join('')}
    </div></div>`;
}
function adminSegsWidgetTable(){
  const dis=canConfig()?'':'disabled';
  const ro=canConfig()?'':'class="locked"';
  const t=segMixTotal(),ok=Math.abs(t-1)<0.0001;
  let h=`<div class="card"><h3>Segments <span class="sp"></span>
    <button class="btn sm pri" ${dis} onclick="addSegment()">Add segment</button></h3>
    <div class="bd flush"><table ${ro}><thead><tr>
      <th>Segment</th><th>Tier</th><th class="n">Mix</th><th class="n">Rate multiplier</th>
      <th class="n">Deal multiplier</th><th class="n">Avg deal</th><th class="n">Addressable</th>
      <th class="n">Engaged</th><th></th></tr></thead><tbody>`;
  G().forEach(s=>{
    h+=`<tr><td class="lb">${esc(s.name)}</td>
      <td><input class="cel txt" style="width:78px" value="${esc(s.tier)}" ${dis} onchange="setIn('segments','${s.id}','tier',this.value)"></td>
      <td class="n"><input class="cel w" value="${(s.mix*100).toFixed(0)}" ${dis} onchange="setIn('segments','${s.id}','mix',this.value,'pct')"></td>
      <td class="n"><input class="cel w" value="${s.rateMult.toFixed(2)}" ${dis} onchange="setIn('segments','${s.id}','rateMult',this.value,'num')"></td>
      <td class="n"><input class="cel w" value="${s.dealMult.toFixed(2)}" ${dis} onchange="setIn('segments','${s.id}','dealMult',this.value,'num')"></td>
      <td class="n calc">${F.mk(CFG.drivers.avgDealSize*s.dealMult)}</td>
      <td class="n"><input class="cel w" value="${s.addressable}" ${dis} onchange="setIn('segments','${s.id}','addressable',this.value,'num')"></td>
      <td class="n"><input class="cel w" value="${s.engaged}" ${dis} onchange="setIn('segments','${s.id}','engaged',this.value,'num')"></td>
      <td class="n"><button class="btn sm dgr" ${dis} onclick="removeSegment('${s.id}')">Remove</button></td></tr>`;
  });
  h+=`<tr class="tot"><td>Total / blend</td><td></td><td class="n"><span class="pill ${ok?'ok':'bad'}">${F.p(t,0)}</span></td>
    <td class="n">${segBlend().toFixed(3)}</td><td class="n"></td><td class="n">${F.mk(blendedDeal())}</td>
    <td class="n">${F.n(sum(G().map(s=>s.addressable)))}</td><td class="n">${F.n(sum(G().map(s=>s.engaged)))}</td><td></td></tr>`;
  h+=`</tbody></table></div></div>`;
  h+=`<div class="note"><strong>Deferred by design.</strong> Segment-level target entry, coverage analytics,
    cross-segment lift and independent per-segment rate sets are not built. The dimension, the fact key,
    the feed mapping and the campaign link are — which is the part that is expensive to add later.</div>`;
  return h;
}
function adminCampsWidgetCursusLink(){
  return `<div class="card"><h3>Campaign Planning — activity detail lives there <span class="sp"></span>
      <a class="btn sm" href="Cursus.html" target="tool_Cursus">Open Campaign Planning — all campaigns</a></h3>
    <div class="bd">
      <p class="mini">Marketing and sales enter activities, suppliers, POs and day-to-day cost in Campaign Planning, a separate tool.
        Strategy only shows the top-line numbers. Since both are standalone files with no shared server, keep the two in sync
        with an export/import pair rather than a live link.</p>
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn sm pri" onclick="exportCampaignsForCursus()">Export campaign list for Campaign Planning</button>
        <span class="mini">then import it into Campaign Planning so it knows which campaigns exist.</span>
      </div>
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <label class="btn sm">Import roll-up from Campaign Planning<input type="file" accept="application/json" style="display:none" onchange="handleCursusImportFile(this.files[0])"></label>
        <span class="mini">reads a Campaign Planning "cost roll-up" export and updates each matching campaign's Committed/Actual above.</span>
      </div>
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <label class="btn sm">Import new campaigns from Campaign Planning<input type="file" accept="application/json" style="display:none" onchange="handleCursusNewCampaignsFile(this.files[0])"></label>
        <span class="mini">adds campaigns that were created in Campaign Planning first and pushed here — appears below once added, ready to have its Activity/Segment dropdowns set.</span>
      </div>
    </div></div>`;
}
function adminCampsWidgetProgrammes(){
  const dis=canConfig()?'':'disabled';
  const progRows=CFG.programmes.map(p=>{
    const camps=CFG.campaigns.filter(c=>c.programmeId===p.id);
    return { p, camps, count:camps.length, budget:sum(camps.map(c=>campaignBudgetMain(c))),
      committed:sum(camps.map(c=>c.committed||0)), actual:sum(camps.map(c=>c.actual||0)) };
  });
  const noProg=CFG.campaigns.filter(c=>!c.programmeId).length;
  return `<div class="card"><h3>Programme roll-up <span class="sp"></span><span class="pill n">${CFG.programmes.length}</span>
      <button class="btn sm pri" ${dis} onclick="addProgramme()">Add programme</button></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr><th>Programme</th><th>Notes</th><th class="n">Campaigns</th>
      <th class="n">Budget</th><th class="n">Committed</th><th class="n">Actual</th><th></th></tr></thead><tbody>
      ${!progRows.length?`<tr><td colspan="7" class="empty">No programmes yet.</td></tr>`:
        progRows.map(r=>`<tr><td><input class="cel txt" style="width:170px" value="${esc(r.p.name)}" onchange="setIn('programmes','${r.p.id}','name',this.value)">${r.p.clonedFromId?' <span class="pill n" title="cloned">clone</span>':''}
            ${r.count?`<div class="mini" title="Campaigns in this programme">${r.camps.map(c=>esc(c.name)).join(', ')}</div>`:''}</td><td><input class="cel txt" style="width:150px" placeholder="notes" value="${esc(r.p.notes||'')}" ${dis} onchange="setIn('programmes','${r.p.id}','notes',this.value)"></td><td class="n calc">${r.count}</td>
          <td class="n calc">${F.mk(r.budget)}</td><td class="n calc">${F.mk(r.committed)}</td>
          <td class="n calc">${F.mk(r.actual)}</td>
          <td class="n"><button class="btn sm" ${dis} onclick="cloneProgramme('${r.p.id}')">Clone</button>
            ${r.count?'':`<button class="btn sm dgr" ${dis} onclick="removeProgramme('${r.p.id}')">Remove</button>`}</td></tr>`).join('')}
    </tbody></table></div>
    ${noProg?`<div class="mini" style="padding:8px 14px">${noProg} campaign${noProg===1?'':'s'} ${noProg===1?"isn't":"aren't"} under a
      programme yet, so ${noProg===1?"it isn't":"they aren't"} included above — set Programme in the table below.</div>`:''}
    </div></div>`;
}
function adminCampsWidgetTable(){
  const dis=canConfig()?'':'disabled';
  let h=`<div class="card"><h3>Campaigns <span class="sp"></span>
    <span class="pill n">${CFG.campaigns.length} records</span>
    <button class="btn sm" onclick="toast('Pull queued. In the built system this calls the MAP connector.')">Pull from feed</button>
    <button class="btn sm pri" ${dis} onclick="addCampaign()">Add campaign</button></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th>Campaign</th><th>Programme</th><th>Activity</th><th>Segment</th><th>Region</th><th>Start</th><th>End</th>
      <th class="n">Budgeted</th><th class="n">Committed</th><th class="n">Actual</th><th>Cost bucket</th>
      <th>Conv. source</th><th class="n">Conv. %</th>
      <th>Source</th><th>Ref</th><th>Campaign Planning</th><th></th></tr></thead><tbody>`;
  CFG.campaigns.forEach(c=>{
    const bad=c.end&&c.start&&c.end<c.start;
    h+=`<tr><td><input class="cel txt" style="width:210px" value="${esc(c.name)}" onchange="setIn('campaigns','${c.id}','name',this.value)">${c.trackingRef?`<div class="mini">${esc(c.trackingRef)}</div>`:''}</td>
      <td><select class="cel txt" style="width:130px" onchange="setIn('campaigns','${c.id}','programmeId',this.value||null)">
        <option value="">— none —</option>
        ${CFG.programmes.map(p=>`<option value="${p.id}" ${p.id===c.programmeId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></td>
      <td><select class="cel txt" style="width:130px" onchange="setIn('campaigns','${c.id}','activityId',this.value)">
        ${CFG.activities.map(a=>`<option value="${a.id}" ${a.id===c.activityId?'selected':''}>${esc(a.name)}</option>`).join('')}</select></td>
      <td><select class="cel txt" style="width:105px" onchange="setIn('campaigns','${c.id}','segmentId',this.value)">
        ${CFG.segments.map(s=>`<option value="${s.id}" ${s.id===c.segmentId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></td>
      <td><select class="cel txt" style="width:95px" onchange="setIn('campaigns','${c.id}','regionId',this.value)">
        ${CFG.regions.map(r=>`<option value="${r.id}" ${r.id===c.regionId?'selected':''}>${esc(r.name)}</option>`).join('')}</select></td>
      <td><input class="cel txt" style="width:104px" type="date" value="${c.start||''}" onchange="setIn('campaigns','${c.id}','start',this.value)"></td>
      <td><input class="cel txt ${bad?'bad':''}" style="width:104px" type="date" value="${c.end||''}" onchange="setIn('campaigns','${c.id}','end',this.value)"></td>
      <td class="n"><input class="cel" value="${c.budget}" onchange="setIn('campaigns','${c.id}','budget',this.value,'money');recomputeCampaignBudgetFx('${c.id}')">
        <div style="display:flex;align-items:center;gap:3px;margin-top:2px">
          <select class="cel txt" style="width:62px;font-size:10px;padding:2px 4px" title="Currency this budget was entered in, if not ${CFG.currency.main}" onchange="setCampaignBudgetCurrency('${c.id}',this.value)">${currencyOptionsHtml(c.budgetCcy, {blankLabel: CFG.currency.main+' (default)'})}</select>
          ${(c.budgetFx&&c.budgetFx.originalCurrency&&c.budgetFx.originalCurrency!==CFG.currency.main)?`<span class="mini" title="Converted ${esc(F.dt(c.budgetFx.convertedAt))} at rate ${c.budgetFx.rate}">≈ ${F.mk(c.budgetFx.converted)} ${CFG.currency.main}</span>`:''}
        </div></td>
      <td class="n"><input class="cel" value="${c.committed||0}" onchange="setIn('campaigns','${c.id}','committed',this.value,'money')"></td>
      <td class="n"><input class="cel" value="${c.actual||0}" onchange="setIn('campaigns','${c.id}','actual',this.value,'money')"></td>
      <td><select class="cel txt" style="width:150px" onchange="setIn('campaigns','${c.id}','costBucketId',this.value)">
        ${CFG.costBuckets.map(b=>`<option value="${b.id}" ${b.id===c.costBucketId?'selected':''}>${esc(b.label)}</option>`).join('')}</select></td>
      <td><select class="cel txt" style="width:150px" onchange="applyRateSource('${c.id}',this.value)">
        <option value="manual" ${c.rateSource==='manual'?'selected':''}>Manual entry</option>
        <option value="benchmark_ind" ${c.rateSource==='benchmark_ind'?'selected':''}>Industry benchmark</option>
        <option value="benchmark_hist" ${c.rateSource==='benchmark_hist'?'selected':''}>Historical (this org)</option></select></td>
      <td class="n"><input class="cel w" value="${c.convOverride!=null?(c.convOverride*100).toFixed(2):''}" placeholder="auto"
        onchange="setIn('campaigns','${c.id}','convOverride',this.value,'pct')"></td>
      <td><span class="pill ${c.source==='Feed'?'n':'v'}">${esc(c.source)}</span></td>
      <td class="mini">${esc(c.extRef||'—')}</td>
      <td><a class="btn sm" href="Cursus.html#campaign=${c.id}" target="tool_Cursus">Open →</a></td>
      <td class="n"><button class="btn sm dgr" ${dis} onclick="removeCampaign('${c.id}')">Remove</button></td></tr>`;
  });
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function adminBucketsWidgetSharedConfig(){
  return `<div class="card"><h3>Configuration — shared configuration <span class="sp"></span>
      ${CFG.meta.normaSyncedAt?`<span class="pill ok">Last synced ${F.dt(CFG.meta.normaSyncedAt)} (v${CFG.meta.normaConfigVersion||'?'})</span>`:`<span class="pill warn">Never synced</span>`}
      <a class="btn sm" href="Norma.html" target="tool_Norma">Open Configuration</a></h3>
    <div class="bd">
      <p class="mini">Cost buckets and the tracking ID naming convention are meant to be the same across every module —
        Configuration is where that shared config is owned. Import its export here to bring Strategy's cost bucket list up to date.</p>
      <label class="btn sm">Import shared config from Configuration<input type="file" accept="application/json" style="display:none" onchange="handleNormaImportFile(this.files[0])"></label>
    </div></div>`;
}
function adminBucketsWidgetLocalAutosave(){
  return `<div class="card"><h3>Local autosave</h3><div class="bd">
    <p class="mini" style="margin:0 0 8px">This plan saves to this browser automatically. Local only — use Export config for a portable
      backup or to hand off to someone else.</p>
    <button class="btn sm dgr" onclick="clearLocal()">Clear local autosave</button></div></div>`;
}
function adminBucketsWidgetCostBuckets(){
  const dis=canConfig()?'':'disabled';
  let h=`<div class="card"><h3>Cost buckets <span class="sp"></span>
    <span class="pill n">${CFG.costBuckets.length} buckets</span>
    <button class="btn sm pri" ${dis} onclick="addCostBucket()">Add bucket</button></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th>Label</th><th>Code</th><th>Department</th><th>Ext. chart-of-accounts code</th>
      <th class="n">Campaigns using it</th><th></th></tr></thead><tbody>`;
  CFG.costBuckets.forEach(b=>{
    const inUse=CFG.campaigns.filter(c=>c.costBucketId===b.id).length;
    h+=`<tr><td><input class="cel txt" style="width:230px" value="${esc(b.label)}" ${dis} onchange="setIn('costBuckets','${b.id}','label',this.value)"></td>
      <td><input class="cel txt" style="width:100px" value="${esc(b.code)}" ${dis} onchange="setIn('costBuckets','${b.id}','code',this.value)"></td>
      <td><input class="cel txt" style="width:120px" value="${esc(b.dept)}" ${dis} onchange="setIn('costBuckets','${b.id}','dept',this.value)"></td>
      <td><input class="cel txt" style="width:150px" value="${esc(b.extCode||'')}" placeholder="not mapped yet" ${dis} onchange="setIn('costBuckets','${b.id}','extCode',this.value)"></td>
      <td class="n calc">${inUse}</td>
      <td class="n"><button class="btn sm dgr" ${dis} onclick="removeCostBucket('${b.id}')">Remove</button></td></tr>`;
  });
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function adminTimeWidgetFiscalCalendar(){
  const dis=canConfig()?'':'disabled';
  return `<div class="card"><h3>Fiscal calendar</h3><div class="bd">
    <div class="grid g3">
      <div class="f"><label>FY start month</label>
        <select class="in" ${dis} onchange="SET('time.fyStartMonth',this.value,{type:'num'})">
        ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${CFG.time.fyStartMonth===i+1?'selected':''}>${new Date(2000,i,1).toLocaleDateString('en-AU',{month:'long'})}</option>`).join('')}</select>
        <span class="hint">FY${String(CFG.time.currentFy).slice(2)} runs ${new Date(2000,CFG.time.fyStartMonth-1,1).toLocaleDateString('en-AU',{month:'short'})} → ${new Date(2000,(CFG.time.fyStartMonth+10)%12,1).toLocaleDateString('en-AU',{month:'short'})}</span></div>
      <div class="f"><label>Reporting grain</label>
        <select class="in" onchange="UI.grain=this.value;CFG.time.grain=this.value;render()">
        ${CFG.time.grains.map(g=>`<option ${UI.grain===g?'selected':''}>${g}</option>`).join('')}</select>
        <span class="hint">Month · Quarter · Half · Year all supported</span></div>
      <div class="f"><label>Current FY</label>
        <select class="in" ${dis} onchange="SET('time.currentFy',this.value)">
        ${CFG.time.years.map(y=>`<option ${CFG.time.currentFy===y?'selected':''}>${y}</option>`).join('')}</select>
        <span class="hint">Drives default context</span></div>
    </div>
    <div class="dv"></div>
    <div class="mini"><b>Fiscal years configured:</b> ${CFG.time.years.join(' · ')}
      · <b>History loaded:</b> ${MONTHS.length} months (${MONTHS[0].label} → ${MONTHS[MONTHS.length-1].label})</div>
  </div></div>`;
}
function adminTimeWidgetPeriodMap(){
  return `<div class="card"><h3>Period map — how the loaded months resolve</h3><div class="bd flush"><div class="scroll cap">
    <table><thead><tr><th>Month</th><th>FY</th><th>Quarter</th><th>Half</th><th class="n">FY position</th><th class="n">Seasonality index</th></tr></thead><tbody>
    ${MONTHS.map(m=>`<tr><td class="lb">${m.label}</td><td>${fyOf(m)}</td><td>${qtrOf(m)}</td><td>${halfOf(m)}</td>
      <td class="n calc">${fyPos(m)+1}</td><td class="n calc">${(CFG.seasonality[fyPos(m)]??1).toFixed(2)}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
}
function adminVerWidgetTable(){
  const dis=canConfig()?'':'disabled';
  return `<div class="card"><h3>Versions &amp; scenarios <span class="sp"></span>
    <button class="btn sm pri" ${dis} onclick="addScenario()">New scenario</button></h3>
    <div class="bd flush"><table><thead><tr><th>Version</th><th>Kind</th><th>State</th>
      <th class="n">Rate multiplier applied</th><th></th></tr></thead><tbody>
    ${CFG.versions.map(v=>{
      const m=v.name==='Budget'?1:v.name==='Forecast'?0.94:v.name==='Scenario — Events heavy'?1.11:v.name==='Scenario — Outbound heavy'?1.06:1;
      return `<tr><td class="lb">${esc(v.name)} ${v.id===UI.versionId?'<span class="pill v">current</span>':''}</td>
      <td><span class="pill n">${esc(v.kind)}</span></td>
      <td><span class="pill ${v.locked?'warn':'ok'}">${v.locked?'Locked':'Open'}</span></td>
      <td class="n calc">${v.kind==='actual'?'—':'×'+m.toFixed(2)}</td>
      <td class="n"><button class="btn sm" ${dis} onclick="toggleLock('${v.id}')">${v.locked?'Unlock':'Lock'}</button></td></tr>`;
    }).join('')}
    </tbody></table></div></div>`;
}
function adminUsersWidgetMoved(){
  return `<div class="card"><h3>Roles &amp; users have moved</h3>
    <div class="bd"><p>Managing roles, users, invites, and (for Super Admins) all organizations now lives in
      <b>Configuration — Shared Configuration</b>, alongside the rest of the settings that apply across every tool.</p>
      <a class="btn pri" href="Norma.html" target="tool_Norma">Open Configuration → Roles &amp; users</a></div></div>`;
}
function adminUsersWidgetRequireCommit(){
  const dis=canConfig()?'':'disabled';
  return `<div class="card"><h3>Requires commit on plan edits <span class="sp"></span><span class="pill n">Strategy/Campaign Planning only</span></h3>
    <div class="bd flush"><table><thead><tr><th>Role</th><th>Requires commit on plan edits</th></tr></thead><tbody>
    ${CFG.roles.map(r=>`<tr><td class="lb">${esc(r.name)}</td>
      <td><button class="btn sm" ${dis} onclick="toggleRequireCommit('${r.id}')">
        <span class="pill ${r.requireCommitOnEdit?'ok':'n'}">${r.requireCommitOnEdit?'Yes':'No'}</span></button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="bd" style="padding-top:0"><p class="mini">The only role setting that's specific to this tool (and Campaign Planning) —
      kept here rather than in Configuration. When on, that role's edits to a campaign's budget, dates, committed/actual figures,
      or conversion override are queued rather than applied immediately.</p></div></div>`;
}
function adminFeedsWidgetConnections(){
  return `<div class="card"><h3>Connections <span class="sp"></span>
    <button class="btn sm pri" onclick="syncNow()">Sync now</button></h3>
    <div class="bd flush"><div class="scroll"><table><thead><tr>
      <th>Connection</th><th>Direction</th><th>Mode</th><th>Dimension mappings</th>
      <th class="n">Last run</th><th class="n">Rows</th><th class="n">Rejects</th><th class="n">Unassigned</th><th>State</th></tr></thead><tbody>
    ${CFG.feeds.map(f=>`<tr${f.state==='off'?' style="opacity:.55"':''}>
      <td class="lb">${esc(f.name)}</td>
      <td><span class="pill ${f.dir==='in'?'n':'v'}">${f.dir==='in'?'Inbound':'Outbound'}</span></td>
      <td>${esc(f.mode)}</td>
      <td class="mini">${f.maps.map(esc).join(' · ')}</td>
      <td class="n mini">${f.last?esc(f.last):'—'}</td>
      <td class="n calc">${f.rows?F.n(f.rows):'—'}</td>
      <td class="n">${f.rejects?`<span class="pill warn">${F.n(f.rejects)}</span>`:'—'}</td>
      <td class="n">${f.unassigned?`<span class="pill ${f.unassigned>0.05?'warn':'ok'}">${F.p(f.unassigned,1)}</span>`:'—'}</td>
      <td><span class="pill ${f.state==='ok'?'ok':f.state==='warn'?'warn':'n'}">${f.state==='ok'?'Healthy':f.state==='warn'?'Rejects':'Not connected'}</span></td>
    </tr>`).join('')}
    </tbody></table></div></div></div>`;
}
function adminFeedsWidgetLoadRules(){
  return `<div class="card"><h3>Load rules</h3><div class="bd">
    <ul style="margin:0;padding-left:16px;font-size:11.5px;color:var(--ink-2);line-height:1.7">
      <li><b>Staging first.</b> Validate, then commit. Reject-and-report, never partial-load.</li>
      <li><b>Idempotent keys.</b> A re-run changes nothing.</li>
      <li><b>Restatement handling.</b> CRM stage dates are mutable — corrected records update prior periods without corrupting the snapshot.</li>
      <li><b>Snapshots.</b> "What did actuals look like when we forecast in March" stays answerable.</li>
      <li><b>Unassigned fallback.</b> A missing dimension key lands in Unassigned rather than failing the row.</li>
    </ul></div></div>`;
}
function adminFeedsWidgetAdjacencies(){
  return `<div class="card"><h3>Future adjacencies — join keys reserved</h3><div class="bd">
    <p class="mini" style="margin:0 0 8px">These stay standalone. The keys are reserved now so integration is a mapping, not a migration.</p>
    <table><tbody>
      <tr><td class="lb">Event planning tool</td><td class="mini">Campaign ID · Activity ID</td><td><span class="pill n">Key reserved</span></td></tr>
      <tr><td class="lb">Asset register</td><td class="mini">Campaign ID · cost line</td><td><span class="pill n">Key reserved</span></td></tr>
      <tr><td class="lb">Asset tracking</td><td class="mini">Asset ID → cost line</td><td><span class="pill n">Key reserved</span></td></tr>
    </tbody></table></div></div>`;
}
function adminAuditWidgetLog(){
  return `<div class="card"><h3>Audit log <span class="sp"></span><span class="pill n">${CFG.audit.length} entries this session</span></h3>
    <div class="bd flush">${CFG.audit.length?`<div class="scroll cap"><table><thead><tr>
      <th>When</th><th>Who</th><th>Role</th><th>Action</th><th>Detail</th></tr></thead><tbody>
      ${CFG.audit.map(a=>`<tr><td class="mini">${esc(a.ts)}</td><td class="lb">${esc(a.who)}</td>
        <td><span class="pill n">${esc(a.role)}</span></td><td>${esc(a.what)}</td>
        <td class="mini">${esc(a.detail)}</td></tr>`).join('')}
    </tbody></table></div>`:'<div class="empty">No changes yet. Edit a driver or a dimension and it appears here.</div>'}</div></div>`;
}
window.adminGatesWidgetSet=adminGatesWidgetSet;
window.adminGatesWidgetPreview=adminGatesWidgetPreview;
window.adminGatesWidgetPresets=adminGatesWidgetPresets;
window.adminGeoWidgetRegions=adminGeoWidgetRegions;
window.adminGeoWidgetPods=adminGeoWidgetPods;
window.adminGeoWidgetReps=adminGeoWidgetReps;
window.adminStreamsWidgetTable=adminStreamsWidgetTable;
window.adminActsWidgetTable=adminActsWidgetTable;
window.adminActsWidgetPreChains=adminActsWidgetPreChains;
window.adminSegsWidgetTable=adminSegsWidgetTable;
window.adminCampsWidgetCursusLink=adminCampsWidgetCursusLink;
window.adminCampsWidgetProgrammes=adminCampsWidgetProgrammes;
window.adminCampsWidgetTable=adminCampsWidgetTable;
window.adminBucketsWidgetSharedConfig=adminBucketsWidgetSharedConfig;
window.adminBucketsWidgetLocalAutosave=adminBucketsWidgetLocalAutosave;
window.adminBucketsWidgetCostBuckets=adminBucketsWidgetCostBuckets;
window.adminTimeWidgetFiscalCalendar=adminTimeWidgetFiscalCalendar;
window.adminTimeWidgetPeriodMap=adminTimeWidgetPeriodMap;
window.adminVerWidgetTable=adminVerWidgetTable;
window.adminUsersWidgetMoved=adminUsersWidgetMoved;
window.adminUsersWidgetRequireCommit=adminUsersWidgetRequireCommit;
window.adminFeedsWidgetConnections=adminFeedsWidgetConnections;
window.adminFeedsWidgetLoadRules=adminFeedsWidgetLoadRules;
window.adminFeedsWidgetAdjacencies=adminFeedsWidgetAdjacencies;
window.adminAuditWidgetLog=adminAuditWidgetLog;
const ADMIN_TAB_WIDGETS={
  gates:{boxSizes:{box1:12,box2:6,box3:6},defaults:{box1:'set',box2:'preview',box3:'presets'},fns:{set:adminGatesWidgetSet,preview:adminGatesWidgetPreview,presets:adminGatesWidgetPresets}},
  geo:{boxSizes:{box1:12,box2:12,box3:12},defaults:{box1:'regions',box2:'pods',box3:'reps'},fns:{regions:adminGeoWidgetRegions,pods:adminGeoWidgetPods,reps:adminGeoWidgetReps}},
  streams:{boxSizes:{box1:12},defaults:{box1:'table'},fns:{table:adminStreamsWidgetTable}},
  acts:{boxSizes:{box1:12,box2:12},defaults:{box1:'table',box2:'prechains'},fns:{table:adminActsWidgetTable,prechains:adminActsWidgetPreChains}},
  segs:{boxSizes:{box1:12},defaults:{box1:'table'},fns:{table:adminSegsWidgetTable}},
  camps:{boxSizes:{box1:12,box2:12,box3:12},defaults:{box1:'cursuslink',box2:'programmes',box3:'table'},fns:{cursuslink:adminCampsWidgetCursusLink,programmes:adminCampsWidgetProgrammes,table:adminCampsWidgetTable}},
  buckets:{boxSizes:{box1:6,box2:6,box3:12},defaults:{box1:'sharedconfig',box2:'localautosave',box3:'costbuckets'},fns:{sharedconfig:adminBucketsWidgetSharedConfig,localautosave:adminBucketsWidgetLocalAutosave,costbuckets:adminBucketsWidgetCostBuckets}},
  time:{boxSizes:{box1:12,box2:12},defaults:{box1:'fiscalcalendar',box2:'periodmap'},fns:{fiscalcalendar:adminTimeWidgetFiscalCalendar,periodmap:adminTimeWidgetPeriodMap}},
  ver:{boxSizes:{box1:12},defaults:{box1:'table'},fns:{table:adminVerWidgetTable}},
  users:{boxSizes:{box1:12,box2:12},defaults:{box1:'moved',box2:'requirecommit'},fns:{moved:adminUsersWidgetMoved,requirecommit:adminUsersWidgetRequireCommit}},
  feeds:{boxSizes:{box1:12,box2:6,box3:6},defaults:{box1:'connections',box2:'loadrules',box3:'adjacencies'},fns:{connections:adminFeedsWidgetConnections,loadrules:adminFeedsWidgetLoadRules,adjacencies:adminFeedsWidgetAdjacencies}},
  audit:{boxSizes:{box1:12},defaults:{box1:'log'},fns:{log:adminAuditWidgetLog}}
};
function pageAdmin(){
  let h=`<div class="phead"><div><h1>Admin &amp; configuration</h1>
    <p>Dimensions are data, not structure. Add a gate here and every module below follows it — no rebuild.</p></div>
    <div class="sp"></div>
    ${canConfig()?'<span class="pill ok">Configuration unlocked</span>':'<span class="pill bad">Read only for '+esc(roleName())+'</span>'}
    </div>`;
  h+=`<div class="tabs">${ADMIN_TABS.map(t=>`<button class="tab ${UI.adminTab===t[0]?'on':''}" onclick="go('admin','${t[0]}')">${t[1]}</button>`).join('')}</div>`;

  if(UI.adminTab==='geo'){
    h+=`<div class="note"><strong>Pod shares must total 100% within each region.</strong> The bar turns red if they don't, and publish is blocked.</div>`;
    h+=`<div class="note"><strong>Regions and Pods are shared across every organization</strong> -- there is no
      per-org copy of this geography list. A new or cloned organization sees the same shared Regions/Pods everyone
      else does, not its own independent set. The org_units layer (optional) can restrict which regions a person
      sees, but does not give an organization its own separate regions.</div>`;
  }
  if(UI.adminTab==='streams'){
    const t=streamMixTotal(),ok=Math.abs(t-1)<0.0001;
    h+=`<div class="note ${ok?'g':'b'}"><strong>Stream mix totals ${F.p(t,0)}.</strong>
      ${ok?'Streams are mutually exclusive and exhaustive. Reconciliation will tie.'
         :'This is the defect carried over from the spreadsheet — a mix that does not total 100% produces a structural variance that looks like a finding but is an artefact. Publish is blocked until this reads 100%.'}</div>`;
  }
  if(UI.adminTab==='acts'){
    h+=`<div class="note"><strong>Activity names and routes are free text.</strong> Cost per unit and monthly capacity feed module 6 — leave them at zero if you don't track them yet.</div>`;
  }
  if(UI.adminTab==='segs'){
    const t=segMixTotal(),ok=Math.abs(t-1)<0.0001;
    h+=`<div class="note ${ok?'':'b'}"><strong>Segments are deliberately coarse.</strong>
      Three real members capture most of the rate variance and stay maintainable. Split them later — that's a list edit,
      not a migration. Segment mix totals ${F.p(t,0)}.</div>`;
    h+=`<div class="note w"><strong>Multiplier, not an independent rate set.</strong>
      A segment modifies the base gate rate (${G().length} inputs). It does not carry its own ${G().length}×${chain().length-1} rate grid.
      Upgrading to independent rates later needs no regrain. Going the other way does.</div>`;
  }
  if(UI.adminTab==='camps'){
    h+=`<div class="note"><strong>Manual entry now, feed-ready.</strong> Rows sourced <span class="pill n">Feed</span>
      carry an external reference and would be overwritten on sync. <span class="pill v">Manual</span> rows are owned here.
      Committed and Actual below are the fallback figures used only for campaigns Campaign Planning hasn't reported a roll-up for yet —
      once you import a roll-up export from Campaign Planning, its numbers override these two fields for that campaign.</div>`;
  }
  if(UI.adminTab==='buckets'){
    h+=`<div class="note"><strong>Admin-editable, same as funnel gates.</strong> Add, rename or retire a bucket here —
      every campaign, activity and cost line downstream references it by ID, so nothing breaks when you rename one.
      The starter list below is a logical default for a marketing strategic plan; map <span class="mini">Ext. code</span>
      to your chart of accounts / cost-centre list once you have one.</div>`;
  }
  if(UI.adminTab==='ver'){
    h+=`<div class="note"><strong>Versions separate plan from actual.</strong> Locked versions cannot be edited except by Admin.
      Scenarios branch freely and are compared in module 8.</div>`;
  }
  if(UI.adminTab==='feeds'){
    const una=CFG.feeds.filter(f=>f.dir==='in'&&f.unassigned>0);
    h+=`<div class="note"><strong>Three sync modes.</strong> Scheduled, on-demand, and API. Every inbound feed lands in
      staging, validates, and reports rejects — nothing part-loads. An <b>Unassigned</b> member exists on every dimension so
      records missing a key still load instead of being rejected. The unassigned rate is the data-quality metric to watch.</div>`;
    if(una.length) h+=`<div class="note w"><strong>Unassigned rate above target on ${una.length} feed${una.length>1?'s':''}.</strong>
      ${una.map(f=>esc(f.name.split('—')[0].trim())+' '+F.p(f.unassigned,1)).join(' · ')} — target is below 5%.</div>`;
  }
  if(UI.adminTab==='audit'){
    h+=`<div class="note"><strong>Every driver and dimension change is logged.</strong> Who, when, from, to.
      Configuration changes additionally record the impact acknowledgement.</div>`;
  }

  const tabCfg=ADMIN_TAB_WIDGETS[UI.adminTab];
  if(tabCfg){
    window.__northGridSubId='admin_'+UI.adminTab;
    const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('admin_'+UI.adminTab):tabCfg.defaults);
    const boxIds=Object.keys(tabCfg.boxSizes);
    h+=`<div class="grid-stack" id="ordo-grid-admin-${UI.adminTab}">`;
    boxIds.forEach(boxId=>{
      const widgetId=assigned[boxId]||tabCfg.defaults[boxId];
      const fn=tabCfg.fns[widgetId]||tabCfg.fns[tabCfg.defaults[boxId]]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
      h+=`<div class="grid-stack-item" gs-w="${tabCfg.boxSizes[boxId]}" gs-id="${boxId}">
        <div class="grid-stack-item-content">${fn()}</div>
      </div>`;
    });
    h+=`</div>`;
  }
  return h;
}
'''

new_src = src[:start_idx + 1] + new_block + src[end_idx:]

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(new_src)

print("OK, chars before:", orig_len, "after:", len(new_src), "delta:", len(new_src) - orig_len)
