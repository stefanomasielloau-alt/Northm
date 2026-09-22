import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageDashboard(){\n"
end_marker = "\n\n/* ============================================================================\n   MODULE — QUICK CALCULATOR"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageDashboard(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Funnel — plan vs actual" in old_block, "funnel card missing"
assert "Spend by cost bucket" in old_block, "cost bucket chart missing"
assert "Regions at a glance" in old_block, "regions table missing"
assert "Plan drift vs baseline snapshot" in old_block, "drift card missing"

new_block = '''function dashboardWidgetKpis(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend();
  const visAll=visibleRegions();
  const vis = UI.dashRegionId ? visAll.filter(r=>r.id===UI.dashRegionId) : visAll;
  const visIds=vis.map(r=>r.id);
  const podShare = (UI.dashPodId && byId(CFG.pods,UI.dashPodId)) ? byId(CFG.pods,UI.dashPodId).share : 1;
  const deal=blendedDeal();
  const plan=backward(d.winTarget,m);
  const actualAcc=histSlice({fy:UI.fy,regionIds:visIds}).acc;
  const winVar=plan[exitGate().id]?(actualAcc[exitGate().id]-plan[exitGate().id])/plan[exitGate().id]:0;
  const winSt=Math.abs(winVar)<0.1?'ok':Math.abs(winVar)<0.25?'warn':'bad';

  const camps=CFG.campaigns.filter(cm=>visIds.includes(cm.regionId)||(!UI.dashRegionId&&cm.regionId===unassignedRegionId()));
  const budgeted=sum(camps.map(cm=>campaignBudgetMain(cm))), committed=sum(camps.map(campaignCommitted)), actualSpend=sum(camps.map(campaignActualSpend));
  const spendVar=budgeted?(actualSpend-budgeted)/budgeted:0;
  const spendSt=actualSpend<=budgeted?'ok':spendVar<0.1?'warn':'bad';

  const totAcv=sum(vis.map(r=>r.acvTarget))*podShare;
  const accPot=sum(vis.map(r=>{ const wins=r.acvTarget/deal; return backward(wins,m,r.id)[exitGate().id]*deal; }))*podShare;
  const acvVar=totAcv?(accPot-totAcv)/totAcv:0;
  const acvSt=acvVar>-0.05?'ok':acvVar>-0.15?'warn':'bad';

  return `<div class="kpis">
    <div class="kpi hl"><div class="k">${esc(exitGate().name)} — plan vs actual</div>
      <div class="kpi-v">${F.n(actualAcc[exitGate().id])}<span class="mini"> / ${F.n(plan[exitGate().id])}</span></div>
      <div class="sub" style="color:${winSt==='bad'?'var(--bad)':winSt==='warn'?'var(--warn)':'var(--ok)'}">${F.sp(winVar,0)} vs plan · ${esc(UI.fy)}</div></div>
    <div class="kpi"><div class="k">Budgeted</div><div class="kpi-v">${F.mk(budgeted)}</div><div class="sub">${camps.length} campaigns in scope</div></div>
    <div class="kpi"><div class="k">Committed</div><div class="kpi-v">${F.mk(committed)}</div><div class="sub">${F.p(budgeted?committed/budgeted:0,0)} of budgeted</div></div>
    <div class="kpi"><div class="k">Actual spend</div><div class="kpi-v">${F.mk(actualSpend)}</div>
      <div class="sub" style="color:${spendSt==='bad'?'var(--bad)':spendSt==='warn'?'var(--warn)':'var(--ok)'}">${F.sp(spendVar,0)} vs budgeted</div></div>
    <div class="kpi"><div class="k">ACV target vs demand potential</div><div class="kpi-v">${F.mk(accPot)}<span class="mini"> / ${F.mk(totAcv)}</span></div>
      <div class="sub" style="color:${acvSt==='bad'?'var(--bad)':acvSt==='warn'?'var(--warn)':'var(--ok)'}">${F.sp(acvVar,0)} potential vs target</div></div>
  </div>`;
}
function dashboardWidgetFunnel(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend();
  const visAll=visibleRegions();
  const vis = UI.dashRegionId ? visAll.filter(r=>r.id===UI.dashRegionId) : visAll;
  const visIds=vis.map(r=>r.id);
  const plan=backward(d.winTarget,m);
  const actualAcc=histSlice({fy:UI.fy,regionIds:visIds}).acc;
  return `<div class="card"><h3>Funnel — plan vs actual <span class="sp"></span>
      <button class="btn sm" onclick="go('actuals')">Drilldown</button></h3>
      <div class="bd flush"><table><thead><tr><th>Gate</th><th class="n">Plan</th><th class="n">Actual</th><th class="n">Var %</th><th>Status</th></tr></thead><tbody>
      ${c.map(g=>{ const p=plan[g.id],a=actualAcc[g.id],pc=p?(a-p)/p:0;
        const st=Math.abs(pc)<0.1?'ok':Math.abs(pc)<0.25?'warn':'bad';
        return `<tr><td class="lb">${esc(g.name)}</td><td class="n calc">${F.n(p)}</td><td class="n calc">${F.n(a)}</td>
          <td class="n">${F.sp(pc,0)}</td><td><span class="pill ${st}">${st==='ok'?'On plan':st==='warn'?'Watch':'Off plan'}</span></td></tr>`;}).join('')}
      </tbody></table></div></div>`;
}
function dashboardWidgetCostBucketChart(){
  const visAll=visibleRegions();
  const vis = UI.dashRegionId ? visAll.filter(r=>r.id===UI.dashRegionId) : visAll;
  const visIds=vis.map(r=>r.id);
  const camps=CFG.campaigns.filter(cm=>visIds.includes(cm.regionId)||(!UI.dashRegionId&&cm.regionId===unassignedRegionId()));
  return `<div class="card"><h3>Spend by cost bucket <span class="sp"></span>
      <button class="btn sm" onclick="go('campaign')">Drilldown</button></h3><div class="bd">
      ${svgBars(CFG.costBuckets.map(b=>({k:b.code,v:sum(camps.filter(cm=>cm.costBucketId===b.id).map(cm=>campaignActualSpend(cm)||campaignCommitted(cm)))})).filter(r=>r.v>0),{h:200,money:true})}
      <div class="mini" style="margin-top:6px">Actual where posted, otherwise committed.</div>
    </div></div>`;
}
function dashboardWidgetRegions(){
  const m=verMult()*segBlend();
  const visAll=visibleRegions();
  const vis = UI.dashRegionId ? visAll.filter(r=>r.id===UI.dashRegionId) : visAll;
  const deal=blendedDeal();
  return `<div class="card"><h3>Regions at a glance <span class="sp"></span>
    <button class="btn sm" onclick="go('geo')">Drilldown</button></h3>
    <div class="bd flush"><table><thead><tr><th>Region</th><th class="n">ACV target</th><th class="n">Demand potential</th><th class="n">Variance</th><th>Status</th></tr></thead><tbody>
    ${vis.map(r=>{ const wins=r.acvTarget/deal, pot=backward(wins,m,r.id)[exitGate().id]*deal, varr=r.acvTarget?(pot-r.acvTarget)/r.acvTarget:0;
      const st=varr<-0.1?'bad':varr<0?'warn':'ok';
      return `<tr><td class="lb">${esc(r.name)}${regionHasOverrides(r.id)?' <span class="pill n">own rates</span>':''}</td><td class="n calc">${F.mk(r.acvTarget)}</td><td class="n calc">${F.mk(pot)}</td>
        <td class="n">${F.sp(varr,0)}</td><td><span class="pill ${st}">${st==='ok'?'Achievable':st==='warn'?'Tight':'Short'}</span></td></tr>`;}).join('')}
    </tbody></table></div></div>`;
}
function dashboardWidgetDrift(){
  const d=CFG.drivers;
  const visAll=visibleRegions();
  const vis = UI.dashRegionId ? visAll.filter(r=>r.id===UI.dashRegionId) : visAll;
  const visIds=vis.map(r=>r.id);
  const camps=CFG.campaigns.filter(cm=>visIds.includes(cm.regionId)||(!UI.dashRegionId&&cm.regionId===unassignedRegionId()));
  const budgeted=sum(camps.map(cm=>campaignBudgetMain(cm)));
  const baseline=byId(CFG.snapshots,UI.baselineSnapId)||CFG.snapshots[0]||null;
  let h=`<div class="card"><h3>Plan drift vs baseline snapshot <span class="sp"></span>
    ${CFG.snapshots.length?`<select class="in" style="width:auto" onchange="UI.baselineSnapId=this.value;render()">
      ${CFG.snapshots.map(s=>`<option value="${s.id}" ${baseline&&s.id===baseline.id?'selected':''}>${esc(s.name)}</option>`).join('')}
    </select>`:''}
    <button class="btn sm" onclick="go('snapshots')">Open snapshots</button></h3>`;
  if(!baseline){
    h+=`<div class="bd"><div class="empty">No snapshot saved yet — save one from the Snapshots page to track drift against a baseline.</div></div>`;
  } else {
    const bTarget=baseline.data.drivers.winTarget;
    const bCamps=(baseline.data.campaigns||[]);
    const bBudget=sum(bCamps.map(cm=>campaignBudgetMain(cm)));
    const tDrift=bTarget?(d.winTarget-bTarget)/bTarget:0;
    const bDrift=bBudget?(budgeted-bBudget)/bBudget:0;
    h+=`<div class="kpis">
      <div class="kpi"><div class="k">${esc(exitGate().name)} target drift</div><div class="kpi-v">${F.n(d.winTarget)}<span class="mini"> / ${F.n(bTarget)}</span></div>
        <div class="sub" style="color:${tDrift===0?'var(--ink-3)':'var(--warn)'}">${F.sp(tDrift,1)} since "${esc(baseline.name)}"</div></div>
      <div class="kpi"><div class="k">Budgeted drift</div><div class="kpi-v">${F.mk(budgeted)}<span class="mini"> / ${F.mk(bBudget)}</span></div>
        <div class="sub" style="color:${bDrift===0?'var(--ink-3)':'var(--warn)'}">${F.sp(bDrift,1)} since "${esc(baseline.name)}" · ${F.dt(baseline.timestamp)}</div></div>
    </div>`;
  }
  h+=`</div>`;
  return h;
}
window.dashboardWidgetKpis=dashboardWidgetKpis;
window.dashboardWidgetFunnel=dashboardWidgetFunnel;
window.dashboardWidgetCostBucketChart=dashboardWidgetCostBucketChart;
window.dashboardWidgetRegions=dashboardWidgetRegions;
window.dashboardWidgetDrift=dashboardWidgetDrift;
function pageDashboard(){
  if(calcBlocked()) return blockedPanel('Dashboard');
  const d=CFG.drivers,m=verMult()*segBlend();
  const visAll=visibleRegions();
  /* "Viewing" scope: a page-level drill into region/pod, not a global nav-bar filter (that stayed to
     Role/Version/FY/Grain, which every page reads consistently — region/pod only makes sense on pages
     built around it). Narrowing to a region genuinely re-scopes campaigns and actuals below; narrowing
     further to a pod can only scale the ACV/demand-potential math, since campaigns aren't tracked at
     pod granularity in Strategy — flagged inline rather than pretending otherwise. */
  if(UI.dashRegionId && !visAll.some(r=>r.id===UI.dashRegionId)) UI.dashRegionId=null;
  if(!UI.dashRegionId) UI.dashPodId=null;
  const podScope = UI.dashPodId ? byId(CFG.pods,UI.dashPodId) : null;
  if(podScope && podScope.regionId!==UI.dashRegionId) UI.dashPodId=null;
  const vis = UI.dashRegionId ? visAll.filter(r=>r.id===UI.dashRegionId) : visAll;
  const visIds=vis.map(r=>r.id);
  const deal=blendedDeal();
  const plan=backward(d.winTarget,m);
  const actualAcc=histSlice({fy:UI.fy,regionIds:visIds}).acc;
  const winVar=plan[exitGate().id]?(actualAcc[exitGate().id]-plan[exitGate().id])/plan[exitGate().id]:0;
  const winSt=Math.abs(winVar)<0.1?'ok':Math.abs(winVar)<0.25?'warn':'bad';

  const camps=CFG.campaigns.filter(cm=>visIds.includes(cm.regionId)||(!UI.dashRegionId&&cm.regionId===unassignedRegionId()));
  const budgeted=sum(camps.map(cm=>campaignBudgetMain(cm))), actualSpend=sum(camps.map(campaignActualSpend));
  const spendVar=budgeted?(actualSpend-budgeted)/budgeted:0;
  const spendSt=actualSpend<=budgeted?'ok':spendVar<0.1?'warn':'bad';

  const podShare = (UI.dashPodId && byId(CFG.pods,UI.dashPodId)) ? byId(CFG.pods,UI.dashPodId).share : 1;
  const totAcv=sum(vis.map(r=>r.acvTarget))*podShare;
  const accPot=sum(vis.map(r=>{ const wins=r.acvTarget/deal; return backward(wins,m,r.id)[exitGate().id]*deal; }))*podShare;
  const acvVar=totAcv?(accPot-totAcv)/totAcv:0;
  const acvSt=acvVar>-0.05?'ok':acvVar>-0.15?'warn':'bad';

  const rank={ok:0,warn:1,bad:2};
  const overall=[winSt,spendSt,acvSt].sort((a,b)=>rank[b]-rank[a])[0];
  const overallLabel=overall==='ok'?'On track':overall==='warn'?'Watch':'Off track';

  let h=`<div class="phead"><div><h1>Dashboard</h1>
    <p>How the plan is tracking right now — funnel, spend, ACV and drift since your last named snapshot, in one look.</p></div>
    <div class="sp"></div>
    ${CFG.aiScreenInterpreterEnabled?`<button class="btn sm" onclick="askAlex()" title="AI explanation of this screen -- summary numbers only, never raw records">✨ Ask Alec</button>`:''}
    <span class="pill ${overall}" style="font-size:12px;padding:4px 12px">${overallLabel}</span></div>`;

  h+=`<div class="card"><div class="bd" style="padding:10px 14px"><div class="row" style="gap:10px;flex-wrap:wrap">
    <span class="lbl">Viewing</span>
    <select class="in" style="width:auto" onchange="UI.dashRegionId=this.value||null;UI.dashPodId=null;render()">
      <option value="">All regions I can see (${visAll.length})</option>
      ${visAll.map(r=>`<option value="${r.id}" ${UI.dashRegionId===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}
    </select>
    ${UI.dashRegionId?`<select class="in" style="width:auto" onchange="UI.dashPodId=this.value||null;render()">
      <option value="">All pods in ${esc(region(UI.dashRegionId).name)}</option>
      ${P(UI.dashRegionId).map(pd=>`<option value="${pd.id}" ${UI.dashPodId===pd.id?'selected':''}>${esc(pd.name)}</option>`).join('')}
    </select>`:''}
    ${podScope?`<span class="mini">Pod view scales ACV target &amp; demand potential by ${esc(podScope.name)}'s ${F.p(podScope.share,0)} share — campaigns and actuals below are not tracked at pod level, so they still show all of ${esc(region(UI.dashRegionId).name)}.</span>`:''}
  </div></div></div>`;

  const dashboardBoxSizes={box1:12,box2:6,box3:6,box4:12,box5:12};
  const dashboardWidgetFns={kpis:dashboardWidgetKpis,funnel:dashboardWidgetFunnel,costbucketchart:dashboardWidgetCostBucketChart,regions:dashboardWidgetRegions,drift:dashboardWidgetDrift};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('dashboard'):{box1:'kpis',box2:'funnel',box3:'costbucketchart',box4:'regions',box5:'drift'});

  h+=`<div class="grid-stack" id="ordo-grid-dashboard">`;
  ['box1','box2','box3','box4','box5'].forEach(boxId=>{
    const widgetId=assigned[boxId]||boxId;
    const fn=dashboardWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${dashboardBoxSizes[boxId]}" gs-id="${boxId}">
      <div class="grid-stack-item-content">${fn()}</div>
    </div>`;
  });
  h+=`</div>`;
  return h;
}
'''

new_src = src[:start_idx + 1] + new_block + src[end_idx:]

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(new_src)

print("OK, chars before:", orig_len, "after:", len(new_src), "delta:", len(new_src) - orig_len)
