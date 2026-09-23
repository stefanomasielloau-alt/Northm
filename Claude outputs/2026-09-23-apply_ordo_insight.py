import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageInsight(){\n"
end_marker = "\n\n/* ============================================================================\n   MODULE 9 — SNAPSHOTS"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageInsight(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Seasonality index by fiscal month" in old_block, "seasonality chart missing"
assert "Days to reach each gate" in old_block, "velocity chart missing"
assert "Observed rate by activity vs baseline" in old_block, "lift table missing"
assert "Scenario comparison" in old_block, "scenario table missing"
assert "Data sufficiency by gate" in old_block, "data sufficiency table missing"
assert "Dimensionality" in old_block, "dimensionality table missing"

new_block = '''function insightSeasonWidgetIndexChart(){
  const labels=[]; for(let i=0;i<12;i++) labels.push(new Date(2000,(CFG.time.fyStartMonth-1+i)%12,1).toLocaleDateString('en-AU',{month:'short'}));
  return `<div class="card"><h3>Seasonality index by fiscal month</h3><div class="bd">
      ${svgBars(labels.map((l,i)=>({k:l,v:CFG.seasonality[i],c:CFG.seasonality[i]>=1?SER[0]:SER[3]})),{h:210,dec:2,maxBw:36})}
      <div class="mini" style="margin-top:6px">Peak ${labels[CFG.seasonality.indexOf(Math.max.apply(null,CFG.seasonality))]}
        at ${Math.max.apply(null,CFG.seasonality).toFixed(2)}× ·
        trough ${labels[CFG.seasonality.indexOf(Math.min.apply(null,CFG.seasonality))]}
        at ${Math.min.apply(null,CFG.seasonality).toFixed(2)}×</div></div></div>`;
}
function insightSeasonWidgetMonthlyChart(){
  const vis=visibleRegions().map(r=>r.id);
  const labels=[]; for(let i=0;i<12;i++) labels.push(new Date(2000,(CFG.time.fyStartMonth-1+i)%12,1).toLocaleDateString('en-AU',{month:'short'}));
  return `<div class="card"><h3>Monthly ${esc(exitGate().name)} by fiscal year</h3><div class="bd">
      ${svgLines(labels,['FY25','FY26'].map((f,j)=>({k:f,c:SER[j],
        v:labels.map((_,i)=>{const mo=MONTHS.find(m=>fyOf(m)===f&&fyPos(m)===i);
          return mo?histSlice({monthKey:mo.key,regionIds:vis}).acc[exitGate().id]:null;})})),{h:220})}
      <div class="lgd"><span><i style="background:${SER[0]}"></i>FY25</span><span><i style="background:${SER[1]}"></i>FY26</span></div></div></div>`;
}
function insightVelWidgetDaysChart(){
  const c=chain();
  const cum=[]; let run=0;
  c.forEach(g=>{ run+=CFG.velocity[g.id]||0; cum.push(run); });
  return `<div class="card"><h3>Days to reach each gate</h3><div class="bd">
      ${svgBars(c.map((g,i)=>({k:g.name,v:cum[i]})),{h:200})}</div></div>`;
}
function insightVelWidgetStageLag(){
  const c=chain();
  const cum=[]; let run=0;
  c.forEach(g=>{ run+=CFG.velocity[g.id]||0; cum.push(run); });
  return `<div class="card"><h3>Stage lag</h3><div class="bd flush"><table><thead><tr>
      <th>Gate</th><th class="n">Median days from previous</th><th class="n">Cumulative days</th>
      <th class="n">Latest entry date to land in ${esc(UI.fy)}</th></tr></thead><tbody>
      ${c.map((g,i)=>{const fyEnd=new Date(2027,CFG.time.fyStartMonth-2,28);
        const latest=new Date(fyEnd.getTime()-cum[c.length-1]*86400000);
        return `<tr><td class="lb">${esc(g.name)}</td>
          <td class="n"><input class="cel w" value="${CFG.velocity[g.id]||0}" ${readOnly()?'disabled':''} onchange="CFG.velocity['${g.id}']=parseFloat(this.value)||0;render()"></td>
          <td class="n calc">${cum[i]}</td>
          <td class="n calc">${i===0?latest.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'2-digit'}):'—'}</td></tr>`;}).join('')}
      </tbody></table></div></div>`;
}
function insightLiftWidgetTable(){
  const c=chain(),vis=visibleRegions().map(r=>r.id);
  const acts=A();
  const rows=acts.map(a=>{
    const o=observedRates({regionIds:vis,activityIds:[a.id]});
    const base=observedRates({regionIds:vis});
    return {a:a,o:o,base:base};
  });
  return `<div class="card"><h3>Observed rate by activity vs baseline</h3><div class="bd flush"><div class="scroll"><table><thead><tr>
      <th>Activity</th>${c.slice(1).map(g=>`<th class="n">${esc(g.name)}</th>`).join('')}<th class="n">End-to-end</th><th>Evidence</th></tr></thead><tbody>
      ${rows.map(r=>{
        const n=(r.o[c[1].id]||{}).n||0,cb=confBand(n);
        let e2e=1; c.slice(1).forEach(g=>{const x=r.o[g.id]; e2e*= (x&&x.rate!=null)?x.rate:0;});
        let b2e=1; c.slice(1).forEach(g=>{const x=r.base[g.id]; b2e*= (x&&x.rate!=null)?x.rate:0;});
        return `<tr><td class="lb">${esc(r.a.name)}</td>
          ${c.slice(1).map(g=>{const x=r.o[g.id],bs=r.base[g.id];
            const lift=(x&&bs&&bs.rate)?x.rate/bs.rate:null;
            return `<td class="n calc">${x&&x.rate!=null?F.p(x.rate,1):'—'}
              ${lift!=null?`<span class="rn"> ${lift.toFixed(2)}×</span>`:''}</td>`;}).join('')}
          <td class="n calc">${F.p(e2e,3)} <span class="rn">${b2e?(e2e/b2e).toFixed(2)+'×':''}</span></td>
          <td><span class="pill ${cb.cls}">${cb.label}</span></td></tr>`;}).join('')}
      <tr class="tot"><td>Baseline (all activities)</td>
        ${c.slice(1).map(g=>{const x=rows[0].base[g.id];return `<td class="n">${x&&x.rate!=null?F.p(x.rate,1):'—'}</td>`;}).join('')}
        <td class="n"></td><td></td></tr>
      </tbody></table></div></div></div>`;
}
function insightLiftWidgetHeatmap(){
  const c=chain(),vis=visibleRegions().map(r=>r.id);
  const acts=A();
  return `<div class="card"><h3>Rate heat map — activity × gate</h3><div class="bd">
      ${svgHeat(acts.map(a=>a.name), c.slice(1).map(g=>g.name),
        acts.map(a=>{const o=observedRates({regionIds:vis,activityIds:[a.id]});
          return c.slice(1).map(g=>(o[g.id]&&o[g.id].rate!=null)?o[g.id].rate:null);}),
        {pct:true,cw:58,pl:118})}</div></div>`;
}
function insightScenWidgetTable(){
  const c=chain(),d=CFG.drivers;
  return `<div class="card"><h3>Scenario comparison</h3><div class="bd flush"><table><thead><tr>
      <th>Version</th><th>Kind</th><th class="n">Rate ×</th>${gTh()}<th class="n">Entry vs Forecast</th></tr></thead><tbody>
      ${CFG.versions.filter(v=>v.kind!=='actual').map(v=>{
        const mm=(v.name==='Budget'?1:v.name==='Forecast'?0.94:v.name==='Scenario — Events heavy'?1.11:v.name==='Scenario — Outbound heavy'?1.06:1)*segBlend();
        const val=backward(d.winTarget,mm);
        const fc=backward(d.winTarget,0.94*segBlend());
        const delta=fc[entryGate().id]?(val[entryGate().id]-fc[entryGate().id])/fc[entryGate().id]:0;
        return `<tr${v.id===UI.versionId?' style="background:#F7F2FE"':''}>
          <td class="lb">${esc(v.name)}</td><td><span class="pill n">${esc(v.kind)}</span></td>
          <td class="n calc">${(mm/segBlend()).toFixed(2)}</td>${gTd(val)}
          <td class="n" style="color:${delta>0?'var(--bad)':'var(--ok)'}">${F.sp(delta,1)}</td></tr>`;}).join('')}
      </tbody></table></div>
      <div class="bd"><div class="mini">A higher rate multiplier means fewer ${esc(entryGate().name)} needed for the same
        ${esc(exitGate().name)} target — so a negative entry delta is the favourable direction.</div></div></div>`;
}
function insightScenWidgetChart(){
  const d=CFG.drivers;
  return `<div class="card"><h3>Entry volume required by scenario</h3><div class="bd">
      ${svgBars(CFG.versions.filter(v=>v.kind!=='actual').map(v=>{
        const mm=(v.name==='Budget'?1:v.name==='Forecast'?0.94:v.name==='Scenario — Events heavy'?1.11:v.name==='Scenario — Outbound heavy'?1.06:1)*segBlend();
        return {k:v.name.replace('Scenario — ',''),v:backward(d.winTarget,mm)[entryGate().id]};}),{h:200,maxBw:70})}</div></div>`;
}
function insightReadyWidgetSufficiency(){
  const obs=observedRates({});
  return `<div class="card"><h3>Data sufficiency by gate</h3><div class="bd flush"><table><thead><tr>
      <th>Gate</th><th class="n">Observations</th><th>Confidence</th><th>Supports</th></tr></thead><tbody>
      ${chain().slice(1).map(g=>{const o=obs[g.id]||{},cb=confBand(o.n);
        const s=o.n>=1000?'Segment-level rates, seasonality, lift':o.n>=150?'Blended rates, coarse seasonality':o.n>=30?'Blended rate only':'Nothing — use a benchmark';
        return `<tr><td class="lb">${esc(g.name)}</td><td class="n calc">${F.n(o.n||0)}</td>
          <td><span class="pill ${cb.cls}">${cb.label}</span></td><td class="mini">${s}</td></tr>`;}).join('')}
      </tbody></table></div></div>`;
}
function insightReadyWidgetDimensionality(){
  return `<div class="card"><h3>Dimensionality</h3><div class="bd flush"><table><thead><tr>
      <th>Dimension</th><th class="n">Members</th><th class="mini">Cumulative cells</th></tr></thead><tbody>
      ${(()=>{const dims=[['Regions',R().length],['Pods',P().length],['Activities',A().length],
        ['Streams',S().length],['Segments',G().length],['Gates',chain().length],['Months',MONTHS.length]];
        let run=1; return dims.map(dd=>{run*=dd[1];
          return `<tr><td class="lb">${dd[0]}</td><td class="n calc">${dd[1]}</td><td class="mini">${F.n(run)}</td></tr>`;}).join('');})()}
      </tbody></table></div>
      <div class="bd"><div class="mini"><b>The lever is grain, not cleverness.</b> Drop a dimension from the fact key,
        or coarsen its members, and observations per cell rise proportionally. This is why segments were kept to three.</div></div></div>`;
}
window.insightSeasonWidgetIndexChart=insightSeasonWidgetIndexChart;
window.insightSeasonWidgetMonthlyChart=insightSeasonWidgetMonthlyChart;
window.insightVelWidgetDaysChart=insightVelWidgetDaysChart;
window.insightVelWidgetStageLag=insightVelWidgetStageLag;
window.insightLiftWidgetTable=insightLiftWidgetTable;
window.insightLiftWidgetHeatmap=insightLiftWidgetHeatmap;
window.insightScenWidgetTable=insightScenWidgetTable;
window.insightScenWidgetChart=insightScenWidgetChart;
window.insightReadyWidgetSufficiency=insightReadyWidgetSufficiency;
window.insightReadyWidgetDimensionality=insightReadyWidgetDimensionality;
function pageInsight(){
  if(calcBlocked()) return blockedPanel('Insight');
  let h=`<div class="phead"><div><h1>Insight</h1>
    <p>Descriptive first. Seasonality, velocity and lift with observation counts attached — statistical prediction only once the volume supports it.</p></div></div>`;
  h+=histBanner();
  h+=`<div class="tabs">
    <button class="tab ${UI.insightTab==='season'?'on':''}" onclick="go('insight','season')">Seasonality</button>
    <button class="tab ${UI.insightTab==='vel'?'on':''}" onclick="go('insight','vel')">Velocity</button>
    <button class="tab ${UI.insightTab==='lift'?'on':''}" onclick="go('insight','lift')">Activity lift</button>
    <button class="tab ${UI.insightTab==='scen'?'on':''}" onclick="go('insight','scen')">Scenario compare</button>
    <button class="tab ${UI.insightTab==='ready'?'on':''}" onclick="go('insight','ready')">Data sufficiency</button></div>`;

  if(UI.insightTab==='season'){
    h+=`<div class="note"><strong>Index of 1.00 is an average month.</strong> Applied as a multiplier in module 2's time phasing.
      Derived from ${MONTHS.length} months — thin, and flagged as such below.</div>`;
  }
  if(UI.insightTab==='vel'){
    const c=chain();
    const cum=[]; let run=0;
    c.forEach(g=>{ run+=CFG.velocity[g.id]||0; cum.push(run); });
    h+=`<div class="note"><strong>This is what converts "leads per year" into "leads by date".</strong>
      Total lag from ${esc(entryGate().name)} to ${esc(exitGate().name)} is <b>${run} days</b> — so a lead created inside
      that window cannot land in this fiscal year. Neither the spreadsheet nor the Anaplan build modelled this at all.</div>`;
  }
  if(UI.insightTab==='lift'){
    h+=`<div class="note"><strong>Lift is a ratio against the all-activity baseline, with n shown.</strong>
      A 1.4× lift on n=23 is not a finding. Nothing here is inferential — it is a lift table you can argue with.</div>`;
  }
  if(UI.insightTab==='scen'){
    h+=`<div class="note"><strong>Same target, different assumptions.</strong> Scenarios apply a rate multiplier.
      In the built system they would branch the full driver set.</div>`;
  }
  if(UI.insightTab==='ready'){
    const perCell = Math.round(MONTHS.length*R().length*A().length*G().length);
    const cells = R().length*P().length*A().length*S().length*G().length*chain().length;
    h+=`<div class="note b"><strong>Read this before anyone promises a predictive model.</strong>
      Prediction needs observations per cell, not rows in total. At the current dimensionality the model has
      <b>${F.n(cells)}</b> addressable cells and <b>${F.n(perCell)}</b> monthly fact rows —
      roughly <b>${(perCell/cells).toFixed(2)}</b> observations per cell. Anything fitted on that will overfit.</div>`;
  }

  const gridPageId='insight_'+UI.insightTab;
  const gridBoxOrder=['box1','box2'];
  const gridBoxSizes={box1:12,box2:12};
  const gridWidgetFns={
    season:{indexchart:insightSeasonWidgetIndexChart,monthlychart:insightSeasonWidgetMonthlyChart},
    vel:{dayschart:insightVelWidgetDaysChart,stagelag:insightVelWidgetStageLag},
    lift:{table:insightLiftWidgetTable,heatmap:insightLiftWidgetHeatmap},
    scen:{table:insightScenWidgetTable,chart:insightScenWidgetChart},
    ready:{sufficiency:insightReadyWidgetSufficiency,dimensionality:insightReadyWidgetDimensionality}
  }[UI.insightTab]||{};
  const gridDefaults={
    season:{box1:'indexchart',box2:'monthlychart'},
    vel:{box1:'dayschart',box2:'stagelag'},
    lift:{box1:'table',box2:'heatmap'},
    scen:{box1:'table',box2:'chart'},
    ready:{box1:'sufficiency',box2:'dimensionality'}
  }[UI.insightTab]||{};

  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments(gridPageId):gridDefaults);
  const containerId='ordo-grid-insight-'+UI.insightTab;
  h+=`<div class="grid-stack" id="${containerId}">`;
  gridBoxOrder.forEach(boxId=>{
    const widgetId=assigned[boxId]||gridDefaults[boxId];
    const fn=gridWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${gridBoxSizes[boxId]}" gs-id="${boxId}">
      <div class="grid-stack-item-content">${fn()}</div>
    </div>`;
  });
  h+=`</div>`;

  window.__northGridSubId=gridPageId;
  return h;
}
'''

new_src = src[:start_idx + 1] + new_block + src[end_idx:]

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(new_src)

print("OK, chars before:", orig_len, "after:", len(new_src), "delta:", len(new_src) - orig_len)
