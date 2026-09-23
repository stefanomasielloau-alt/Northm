import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageCampaign(){\n"
end_marker = "\n/* ============================================================================\n   MODULE 7 — ACTUALS & HISTORY"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageCampaign(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Campaign calendar" in old_block, "campaign calendar card missing"
assert "Campaigns in scope" in old_block, "campaigns table missing"
assert "Spend by cost bucket" in old_block, "cost bucket chart missing"
assert "Business case" in old_block, "business case card missing"
assert "Pod allocation" in old_block, "pod allocation card missing"
assert "Portfolio business case" in old_block, "portfolio card missing"
assert "Capacity check" in old_block, "capacity check card missing"

new_block = '''function campaignWidgetKpis(){
  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  const budget=sum(camps.map(c=>campaignBudgetMain(c)));
  const fut=[]; for(let i=0;i<12;i++){ const dt=new Date(2026,6+i,1);
    fut.push({key:dt.toISOString().slice(0,7),label:dt.toLocaleDateString('en-AU',{month:'short',year:'2-digit'})}); }
  const conc=fut.map(f=>camps.filter(c=>c.start&&c.end&&c.start.slice(0,7)<=f.key&&c.end.slice(0,7)>=f.key).length);
  const spend=fut.map(f=>sum(camps.filter(c=>c.start&&c.end&&c.start.slice(0,7)<=f.key&&c.end.slice(0,7)>=f.key)
    .map(c=>{const a=(new Date(c.end)-new Date(c.start))/86400000/30.4; return a>0?campaignBudgetMain(c)/a:campaignBudgetMain(c);})));
  const committed=sum(camps.map(campaignCommitted)), actualSpend=sum(camps.map(campaignActualSpend));
  return `<div class="kpis">
    <div class="kpi hl"><div class="k">Budgeted</div><div class="kpi-v">${F.mk(budget)}</div><div class="sub">${camps.length} campaigns in scope</div></div>
    <div class="kpi"><div class="k">Committed</div><div class="kpi-v">${F.mk(committed)}</div><div class="sub">${F.p(budget?committed/budget:0,0)} of budgeted</div></div>
    <div class="kpi"><div class="k">Actual spend</div><div class="kpi-v">${F.mk(actualSpend)}</div>
      <div class="sub" style="color:${actualSpend>budget?'var(--bad)':'var(--ink-3)'}">${F.sp(budget?(actualSpend-budget)/budget:0,0)} vs budgeted</div></div>
    <div class="kpi"><div class="k">Peak concurrency</div><div class="kpi-v">${Math.max.apply(null,conc.concat([0]))}</div><div class="sub">campaigns at once</div></div>
    <div class="kpi"><div class="k">Peak monthly spend</div><div class="kpi-v">${F.mk(Math.max.apply(null,spend.concat([0])))}</div><div class="sub">straight-lined</div></div>
    <div class="kpi"><div class="k">Cost per win</div><div class="kpi-v">${F.mk(CFG.drivers.winTarget?budget/CFG.drivers.winTarget:0)}</div><div class="sub">budget ÷ target</div></div>
  </div>`;
}
function campaignWidgetCalendar(){
  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  const fut=[]; for(let i=0;i<12;i++){ const dt=new Date(2026,6+i,1);
    fut.push({key:dt.toISOString().slice(0,7),label:dt.toLocaleDateString('en-AU',{month:'short',year:'2-digit'})}); }
  const conc=fut.map(f=>camps.filter(c=>c.start&&c.end&&c.start.slice(0,7)<=f.key&&c.end.slice(0,7)>=f.key).length);
  const spend=fut.map(f=>sum(camps.filter(c=>c.start&&c.end&&c.start.slice(0,7)<=f.key&&c.end.slice(0,7)>=f.key)
    .map(c=>{const a=(new Date(c.end)-new Date(c.start))/86400000/30.4; return a>0?campaignBudgetMain(c)/a:campaignBudgetMain(c);})));
  return `<div class="card"><h3>Campaign calendar — next 12 months</h3><div class="bd">
    ${svgLines(fut.map(f=>f.label),[{k:'Campaigns live',v:conc}],{h:170})}
    <div class="lgd"><span><i style="background:${SER[0]}"></i>Campaigns running concurrently</span></div>
    <div class="dv"></div>
    ${svgBars(fut.map((f,i)=>({k:f.label,v:spend[i]})),{h:190,money:true,maxBw:34})}
    <div class="mini" style="margin-top:4px">Spend straight-lined across each campaign's duration. Peak concurrency is the
      input to overlap analysis in module 8 — you cannot attribute lift without knowing what else was running.</div>
  </div></div>`;
}
function campaignWidgetTable(){
  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  const budget=sum(camps.map(c=>campaignBudgetMain(c)));
  const m=verMult()*segBlend();
  const committed=sum(camps.map(campaignCommitted)), actualSpend=sum(camps.map(campaignActualSpend));
  let h=`<div class="card"><h3>Campaigns in scope <span class="sp"></span>
    <span class="mini">Conv. % shown is per-campaign — manual, industry benchmark, or this org's history (Section 6.1)</span></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
    <th>Campaign</th><th>Status</th><th>Activity</th><th>Bucket</th><th>Segment</th><th>Region</th><th>Window</th>
    <th class="n">Days</th><th class="n">Budgeted</th><th class="n">Committed</th><th class="n">Actual</th>
    <th class="n">Var $</th><th class="n">Conv. %</th><th class="n">Implied wins</th><th class="n">Cost/win</th><th>Source</th><th>Activities</th></tr></thead><tbody>
    ${camps.map(c=>{
      const a=act(c.activityId),s=seg(c.segmentId),r=region(c.regionId),b=bucket(c.costBucketId);
      const days=(c.start&&c.end)?Math.round((new Date(c.end)-new Date(c.start))/86400000):0;
      const leads=a&&a.costPer?campaignBudgetMain(c)/a.costPer:0;
      const rate=campExitRate(c,m);
      const wins=leads*rate;
      const cCommitted=campaignCommitted(c), cActual=campaignActualSpend(c);
      const varAmt=cActual-campaignBudgetMain(c);
      return `<tr><td class="lb">${esc(c.name)}</td>
        <td>${ragPillHtml(ragForCampaign(c))}</td>
        <td>${esc(a?a.name:'—')}</td><td><span class="pill n">${esc(b?b.label:'—')}</span></td>
        <td><span class="pill n">${esc(s?s.name:'—')}</span></td>
        <td>${esc(r?r.name:'—')}</td>
        <td class="mini">${F.d(c.start)} → ${F.d(c.end)}</td>
        <td class="n calc">${days||'—'}</td>
        <td class="n calc">${campaignBudgetMain(c)?F.mk(campaignBudgetMain(c)):'—'}</td>
        <td class="n calc">${cCommitted?F.mk(cCommitted):'—'}</td>
        <td class="n calc">${cActual?F.mk(cActual):'—'}</td>
        <td class="n" style="color:${varAmt>0?'var(--bad)':varAmt<0?'var(--ok)':'var(--ink-3)'}">${cActual?F.mk(varAmt):'—'}</td>
        <td class="n">${c.convOverride!=null?`<span class="pill v">${F.p(rate,1)}</span>`:F.p(rate,1)}</td>
        <td class="n calc">${wins?F.n(wins,1):'—'}</td>
        <td class="n calc">${wins?F.mk(campaignBudgetMain(c)/wins):'—'}</td>
        <td><span class="pill ${c.source==='Feed'?'n':'v'}">${esc(c.source)}</span></td>
        <td><a class="btn sm" href="Cursus.html#campaign=${c.id}" target="tool_Cursus">Open →</a></td></tr>`;}).join('')}
    <tr class="tot"><td>Total</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="n"></td>
      <td class="n">${F.mk(budget)}</td><td class="n">${F.mk(committed)}</td><td class="n">${F.mk(actualSpend)}</td>
      <td class="n">${F.mk(actualSpend-budget)}</td><td class="n"></td><td class="n"></td><td class="n"></td><td></td><td></td></tr>
    </tbody></table></div></div></div>`;
  return h;
}
function campaignWidgetCostBucketChart(){
  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  return `<div class="card"><h3>Spend by cost bucket</h3><div class="bd">
    ${svgBars(CFG.costBuckets.map(b=>({k:b.code,v:sum(camps.filter(cm=>cm.costBucketId===b.id).map(cm=>campaignActualSpend(cm)||campaignCommitted(cm)))})).filter(r=>r.v>0),{h:200,money:true})}
    <div class="mini" style="margin-top:6px">Actual where posted, otherwise committed — pulled from a Campaign Planning roll-up import where one exists, otherwise the campaign's own fields. Buckets with no spend in scope are hidden.</div>
  </div></div>`;
}
function campaignWidgetBusinessCase(){
  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  const m=verMult()*segBlend();
  const bizSel=byId(camps,UI.bizCampaignId)||camps[0];
  if(!bizSel) return '<div class="card"><div class="bd"><div class="empty">No campaigns in scope.</div></div></div>';
  UI.bizCampaignId=bizSel.id;
  const a=act(bizSel.activityId), leads=(a&&a.costPer)?campaignBudgetMain(bizSel)/a.costPer:0;
  const rate=campExitRate(bizSel,m), proj=backward(leads*rate,m);
  return `<div class="card"><h3>Business case <span class="sp"></span>
        <select class="in" style="width:auto" onchange="UI.bizCampaignId=this.value;render()">
          ${camps.map(cm=>`<option value="${cm.id}" ${cm.id===bizSel.id?'selected':''}>${esc(cm.name)}</option>`).join('')}</select></h3>
        <div class="bd">
          <div class="kpis">
            <div class="kpi"><div class="k">Budget</div><div class="kpi-v">${F.mk(campaignBudgetMain(bizSel))}</div><div class="sub">${esc(a?a.name:'—')} at ${a&&a.costPer?F.m(a.costPer):'—'}/lead</div></div>
            <div class="kpi"><div class="k">Implied ${esc(entryGate().name)}</div><div class="kpi-v">${F.n(leads,0)}</div><div class="sub">budget ÷ cost per lead</div></div>
            <div class="kpi"><div class="k">Conversion rate</div><div class="kpi-v">${F.p(rate,1)}</div><div class="sub">${bizSel.convOverride!=null?'manual / benchmark':'auto'}</div></div>
            <div class="kpi hl"><div class="k">Projected ${esc(exitGate().name)}</div><div class="kpi-v">${F.n(proj[exitGate().id],1)}</div><div class="sub">at ${F.p(rate,1)} blended</div></div>
          </div>
          <div class="dv"></div>
          <div class="scroll"><table><thead><tr>${gTh()}</tr></thead><tbody><tr>${gTd(proj)}</tr></tbody></table></div>
          <div class="mini" style="margin-top:6px"><b>Business case:</b> budget ${F.mk(campaignBudgetMain(bizSel))} &rarr; ${F.n(leads,0)} ${esc(entryGate().name)}
            at ${a&&a.costPer?F.m(a.costPer):'—'}/lead &rarr; ${F.n(proj[exitGate().id],1)} projected ${esc(exitGate().name)}, using this
            campaign's own conversion rate (set above in Campaigns in scope, or in Admin &gt; Campaigns).</div>
        </div></div>`;
}
function campaignWidgetPreChain(){
  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  const bizSel=byId(camps,UI.bizCampaignId)||camps[0];
  if(!bizSel) return '<div class="card"><div class="bd"><div class="empty">No campaigns in scope.</div></div></div>';
  const a=act(bizSel.activityId);
  const leads=(a&&a.costPer)?campaignBudgetMain(bizSel)/a.costPer:0;
  const preStages=activityPreChain(bizSel.activityId);
  if(!preStages.length) return '<div class="card"><div class="bd"><div class="empty">No pre-entry chain for this activity.</div></div></div>';
  const preVols=preChainVolumes(bizSel.activityId,leads);
  return `<div class="card"><h3>Pre-${esc(entryGate().name)} chain <span class="sp"></span>
              <span class="mini">${esc(a.name)} — channel-specific, feeds into ${esc(entryGate().name)} above</span></h3>
            <div class="bd">
              <div class="scroll"><table><thead><tr>${preStages.map(s=>`<th class="n">${esc(s.name)}</th>`).join('')}
                <th class="n hl">${esc(entryGate().name)}</th></tr></thead><tbody><tr>
                ${preStages.map(s=>`<td class="n calc">${preVols[s.id]!=null?F.n(preVols[s.id],0):'—'}</td>`).join('')}
                <td class="n calc" style="font-weight:700">${F.n(leads,0)}</td></tr></tbody></table></div>
              <div class="mini" style="margin-top:6px">Walked backward from this campaign's implied ${esc(entryGate().name).toLowerCase()} count through
                ${esc(a.name)}'s own stage rates (Admin &gt; Activities). A rate of 0% on any stage stops the chain there rather than
                showing a false number.</div>
            </div></div>`;
}
function campaignWidgetPodAllocation(){
  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  const bizSel=byId(camps,UI.bizCampaignId)||camps[0];
  if(!bizSel) return '<div class="card"><div class="bd"><div class="empty">No campaigns in scope.</div></div></div>';
  const a=act(bizSel.activityId);
  const leads=(a&&a.costPer)?campaignBudgetMain(bizSel)/a.costPer:0;
  const allocs=podAllocationsFor(bizSel.id);
  const shareTotal=campaignPodShareTotal(bizSel.id);
  const shareOk=Math.abs(shareTotal-1)<0.0001;
  return `<div class="card"><h3>Pod allocation <span class="sp"></span>
            <span class="mini">same campaign as Business case above — ${esc(bizSel.name)}</span></h3>
          <div class="bd">
            <p class="mini">Optional: split this campaign's budget and implied ${esc(entryGate().name).toLowerCase()} across specific
              pods by percentage, instead of it only belonging to one region. Reporting only — this doesn't change how
              pod quotas themselves are set elsewhere in Strategy.</p>
            ${!allocs.length?`<div class="empty" style="padding:10px 0">Not split — the full budget stays attributed to
              ${esc(region(bizSel.regionId)?region(bizSel.regionId).name:'its region')} only.</div>`:`
            <div class="scroll"><table><thead><tr><th>Pod</th><th class="n">Share</th><th class="n">Budget</th>
              <th class="n">Implied ${esc(entryGate().name)}</th><th></th></tr></thead><tbody>
              ${allocs.map(al=>{
                return `<tr><td><select class="cel txt" style="width:160px" onchange="setIn('campaignPodAllocations','${al.id}','podId',this.value)">
                    ${P().map(pp=>`<option value="${pp.id}" ${pp.id===al.podId?'selected':''}>${esc(pp.name)}</option>`).join('')}</select></td>
                  <td class="n"><input class="cel w" value="${(al.sharePct*100).toFixed(0)}" onchange="setIn('campaignPodAllocations','${al.id}','sharePct',this.value,'pct')"></td>
                  <td class="n calc">${F.mk(campaignBudgetMain(bizSel)*al.sharePct)}</td>
                  <td class="n calc">${F.n(leads*al.sharePct,0)}</td>
                  <td class="n"><button class="btn sm dgr" onclick="removePodAllocation('${al.id}')">Remove</button></td></tr>`;
              }).join('')}
            </tbody></table></div>
            <div class="note" style="margin-top:8px;${shareOk?'':'border-color:var(--warn);background:var(--warn-bg)'}">
              Shares total ${F.p(shareTotal,0)}${shareOk?'':' — doesn\\'t add to 100%, so the budget/leads split above won\\'t account for the whole campaign'}.</div>`}
            <button class="btn sm pri" style="margin-top:8px" onclick="addPodAllocation('${bizSel.id}')">Add pod</button>
          </div></div>`;
}
function campaignWidgetPortfolio(){
  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  const m=verMult()*segBlend();
  const rows=camps.map(cm=>{
    const a=act(cm.activityId);
    const leads=(a&&a.costPer)?campaignBudgetMain(cm)/a.costPer:0;
    const rate=campExitRate(cm,m);
    const proj=backward(leads*rate,m);
    return {cm,leads,rate,proj};
  });
  const totalBudget=sum(rows.map(r=>campaignBudgetMain(r.cm)));
  const totalLeads=sum(rows.map(r=>r.leads));
  const gateIds=chain().map(g=>g.id);
  const summedProj={};
  gateIds.forEach(gid=>{ summedProj[gid]=sum(rows.map(r=>r.proj[gid]||0)); });
  const totalProj=summedProj[exitGate().id]||0;
  const blendedRate=totalLeads?totalProj/totalLeads:0;
  return `<div class="card"><h3>Portfolio business case <span class="sp"></span>
      <span class="mini">${camps.length} campaign${camps.length===1?'':'s'} in scope</span></h3>
      <div class="bd">
      ${!camps.length?`<div class="empty">No campaigns in scope.</div>`:`
      <div class="kpis">
        <div class="kpi"><div class="k">Total budget</div><div class="kpi-v">${F.mk(totalBudget)}</div></div>
        <div class="kpi"><div class="k">Implied ${esc(entryGate().name)}</div><div class="kpi-v">${F.n(totalLeads,0)}</div><div class="sub">summed across campaigns</div></div>
        <div class="kpi"><div class="k">Blended conversion</div><div class="kpi-v">${F.p(blendedRate,1)}</div><div class="sub">portfolio-weighted, not a simple average</div></div>
        <div class="kpi hl"><div class="k">Projected ${esc(exitGate().name)}</div><div class="kpi-v">${F.n(totalProj,1)}</div></div>
      </div>
      <div class="scroll"><table><thead><tr>${gTh()}</tr></thead><tbody><tr>${gTd(summedProj,1)}</tr></tbody></table></div>
      <div class="mini" style="margin-top:6px">Each campaign's own business case above (budget &rarr; leads &rarr; projected wins, using its own
        conversion rate) summed across every campaign in scope — a leadership-level roll-up of the same maths, not a separate model.</div>`}
      </div></div>`;
}
function campaignWidgetCapacity(){
  const m=verMult()*segBlend();
  let h=`<div class="card"><h3>Capacity check</h3><div class="bd flush"><table><thead><tr>
    <th>Activity</th><th>Route</th><th class="n">Monthly capacity</th><th class="n">Monthly need at plan</th>
    <th class="n">Utilisation</th><th>Status</th><th>Constraint</th></tr></thead><tbody>
    ${A().map(a=>{
      const wins=a.winTarget==null?CFG.drivers.winTarget/A().length:a.winTarget;
      const need=backward(wins,m)[entryGate().id]/12;
      const u=a.capMonth?need/a.capMonth:null;
      const st=!a.capMonth?'n':u>1?'bad':u>0.85?'warn':'ok';
      return `<tr><td class="lb">${esc(a.name)}</td><td>${esc(route(a.routeId)?route(a.routeId).name:'—')}</td>
        <td class="n"><input class="cel w" value="${a.capMonth}" ${readOnly()?'disabled':''} onchange="setIn('activities','${a.id}','capMonth',this.value,'num')"></td>
        <td class="n calc">${F.n(need,0)}</td>
        <td class="n">${u!=null?`<div class="row" style="justify-content:flex-end"><div class="bar" style="width:60px"><i style="width:${clamp(fin(u)*100,0,100)}%;background:${st==='bad'?'var(--bad)':st==='warn'?'var(--warn)':'var(--ok)'}"></i></div><span>${F.p(u,0)}</span></div>`:'—'}</td>
        <td><span class="pill ${st}">${!a.capMonth?'Not tracked':u>1?'Over capacity':u>0.85?'Near limit':'Within capacity'}</span></td>
        <td class="mini">${u>1?'Plan needs '+F.n(need-a.capMonth,0)+' more per month than available':'—'}</td></tr>`;}).join('')}
    </tbody></table></div>
    <div class="bd"><div class="mini"><b>This is the gap the spreadsheet never closed.</b> It would happily require 17,900 leads
      without asking whether anyone could process them. Capacity is what turns a volume requirement into an achievable plan.</div></div></div>`;
  return h;
}
window.campaignWidgetKpis=campaignWidgetKpis;
window.campaignWidgetCalendar=campaignWidgetCalendar;
window.campaignWidgetTable=campaignWidgetTable;
window.campaignWidgetCostBucketChart=campaignWidgetCostBucketChart;
window.campaignWidgetBusinessCase=campaignWidgetBusinessCase;
window.campaignWidgetPreChain=campaignWidgetPreChain;
window.campaignWidgetPodAllocation=campaignWidgetPodAllocation;
window.campaignWidgetPortfolio=campaignWidgetPortfolio;
window.campaignWidgetCapacity=campaignWidgetCapacity;
function pageCampaign(){
  if(calcBlocked()) return blockedPanel('Campaign, cost & capacity');
  let h=`<div class="phead"><div><h1>Campaign, cost &amp; capacity</h1>
    <p>What is running when, what it costs, and whether the plan fits the capacity you have. Activity-level detail —
      suppliers, POs, day-to-day status — is entered in Campaign Planning; this page shows the top-line roll-up.</p></div>
    <div class="sp"></div>
    <a class="btn" href="Cursus.html" target="tool_Cursus">Open Campaign Planning — all campaigns</a>
    <button class="btn" onclick="go('admin','camps')">Manage campaigns</button></div>`;

  const vis=visibleRegions().map(r=>r.id);
  const camps=CFG.campaigns.filter(c=>vis.includes(c.regionId)||c.regionId===unassignedRegionId());
  const bizSel=byId(camps,UI.bizCampaignId)||camps[0];
  const preStages=bizSel?activityPreChain(bizSel.activityId):[];

  const campaignBoxOrder=['box1','box2','box3','box4']
    .concat(bizSel?['box5']:[])
    .concat((bizSel&&preStages.length)?['box6']:[])
    .concat(bizSel?['box7']:[])
    .concat(['box8','box9']);
  const campaignBoxSizes={box1:12,box2:12,box3:12,box4:12,box5:12,box6:12,box7:12,box8:12,box9:12};
  const campaignWidgetFns={
    kpis:campaignWidgetKpis,
    calendar:campaignWidgetCalendar,
    table:campaignWidgetTable,
    costbucketchart:campaignWidgetCostBucketChart,
    businesscase:campaignWidgetBusinessCase,
    prechain:campaignWidgetPreChain,
    podallocation:campaignWidgetPodAllocation,
    portfolio:campaignWidgetPortfolio,
    capacity:campaignWidgetCapacity
  };
  const campaignDefaults={box1:'kpis',box2:'calendar',box3:'table',box4:'costbucketchart',box5:'businesscase',box6:'prechain',box7:'podallocation',box8:'portfolio',box9:'capacity'};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('campaign'):campaignDefaults);

  h+=`<div class="grid-stack" id="ordo-grid-campaign">`;
  campaignBoxOrder.forEach(boxId=>{
    const widgetId=assigned[boxId]||campaignDefaults[boxId];
    const fn=campaignWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${campaignBoxSizes[boxId]}" gs-id="${boxId}">
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
