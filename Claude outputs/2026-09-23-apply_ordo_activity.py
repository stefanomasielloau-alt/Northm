import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageActivity(){\n"
end_marker = "\n/* ============================================================================\n   MODULE 6 — CAMPAIGN, COST & CAPACITY"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageActivity(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Activity funnel" in old_block, "activity funnel card missing"
assert "Entry volume by activity" in old_block, "entry volume chart missing"
assert "Cost per win by activity" in old_block, "cost per win chart missing"
assert "resetWinTarget" in old_block, "reset-to-auto link missing"

new_block = '''function activityWidgetKpis(){
  const d=CFG.drivers,c=chain(),m=verMult()*segBlend(),acts=A();
  const totWins=d.winTarget;
  const base=acts.length?1/acts.length:0;
  const winOf=a=>a.winTarget==null?totWins*base:a.winTarget;
  let tacc={}; c.forEach(g=>tacc[g.id]=0); let tcost=0;
  CFG.routes.forEach(rt=>{
    const ra=acts.filter(a=>a.routeId===rt.id);
    ra.forEach(a=>{
      const wins=winOf(a), v=backward(wins,m);
      const cost=v[entryGate().id]*a.costPer;
      c.forEach(g=>tacc[g.id]+=v[g.id]); tcost+=cost;
    });
  });
  return `<div class="kpis">
    <div class="kpi hl"><div class="k">Wins planned</div><div class="kpi-v">${F.n(totWins)}</div><div class="sub">across ${acts.length} activities</div></div>
    ${c.slice(0,3).map(g=>`<div class="kpi"><div class="k">${esc(g.name)} required</div><div class="kpi-v">${F.n(tacc[g.id])}</div><div class="sub">total</div></div>`).join('')}
    <div class="kpi"><div class="k">Total cost</div><div class="kpi-v">${F.mk(tcost)}</div><div class="sub">at planned volume</div></div>
    <div class="kpi"><div class="k">Cost per win</div><div class="kpi-v">${F.mk(totWins?tcost/totWins:0)}</div><div class="sub">blended</div></div>
  </div>`;
}
function activityWidgetFunnel(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend(),acts=A();
  const totWins=d.winTarget;
  const base=acts.length?1/acts.length:0;
  const winOf=a=>a.winTarget==null?totWins*base:a.winTarget;
  let tacc={}; c.forEach(g=>tacc[g.id]=0); let tcost=0;
  const rows=[];
  CFG.routes.forEach(rt=>{
    const ra=acts.filter(a=>a.routeId===rt.id); if(!ra.length)return;
    rows.push({group:rt.name});
    ra.forEach(a=>{
      const auto=a.winTarget==null, wins=winOf(a), v=backward(wins,m);
      const cost=v[entryGate().id]*a.costPer;
      c.forEach(g=>tacc[g.id]+=v[g.id]); tcost+=cost;
      rows.push({a:a,wins:wins,v:v,cost:cost,auto:auto});
    });
  });
  const plannedWins=sum(rows.filter(r=>r.a).map(r=>r.wins));
  const winGap=plannedWins-totWins;
  let h=`<div class="card"><h3>Activity funnel <span class="sp"></span>
    ${Math.abs(winGap)<0.5
      ? '<span class="pill ok">Wins tie to target</span>'
      : '<span class="pill warn">Gap of '+F.n(Math.abs(winGap),0)+(winGap>0?' over target':' under target')+'</span>'}</h3>
    <div class="bd flush"><div class="scroll"><table><thead><tr>
      <th>Activity</th><th class="n">Wins</th>${gTh()}<th class="n">Cost/lead</th><th class="n">Cost</th>
      <th class="n">Cost/win</th><th class="n">Capacity</th><th>Fit</th></tr></thead><tbody>`;
  rows.forEach(r=>{
    if(r.group){ h+=`<tr class="gp"><td colspan="${c.length+8}">${esc(r.group)}</td></tr>`; return; }
    const need=r.v[entryGate().id]/12, cap=r.a.capMonth;
    const fit=cap?need/cap:null;
    const st=!cap?'n':fit>1?'bad':fit>0.85?'warn':'ok';
    h+=`<tr><td class="lb">${esc(r.a.name)}</td>
      <td class="n"><input class="cel w" value="${r.wins.toFixed(1)}" ${readOnly()?'disabled':''} onchange="setIn('activities','${r.a.id}','winTarget',this.value,'num')">
        ${r.auto||readOnly()?'':'<div class="mini" style="text-align:right;margin-top:2px"><a href="#" onclick="resetWinTarget(\\'${r.a.id}\\');return false;">reset to auto</a></div>'}</td>
      ${gTd(r.v)}
      <td class="n calc">${r.a.costPer?F.m(r.a.costPer):'—'}</td>
      <td class="n calc">${r.cost?F.mk(r.cost):'—'}</td>
      <td class="n calc">${r.cost&&r.wins?F.mk(r.cost/r.wins):'—'}</td>
      <td class="n calc">${cap?F.n(cap)+'/mo':'—'}</td>
      <td>${cap?`<span class="pill ${st}">${F.p(fit,0)}</span>`:'<span class="pill n">not tracked</span>'}</td></tr>`;
  });
  h+=`<tr class="tot"><td>Total</td><td class="n">${F.n(totWins)}</td>${gTd(tacc)}
    <td class="n"></td><td class="n">${F.mk(tcost)}</td><td class="n">${F.mk(totWins?tcost/totWins:0)}</td>
    <td class="n"></td><td></td></tr>`;
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function activityWidgetEntryChart(){
  const d=CFG.drivers,m=verMult()*segBlend(),acts=A();
  const totWins=d.winTarget;
  const base=acts.length?1/acts.length:0;
  const winOf=a=>a.winTarget==null?totWins*base:a.winTarget;
  return `<div class="card"><h3>Entry volume by activity</h3><div class="bd">
      ${svgBars(acts.map(a=>({k:a.name.split(' ')[0],v:backward(winOf(a),m)[entryGate().id]})),{h:200})}</div></div>`;
}
function activityWidgetCostChart(){
  const m=verMult()*segBlend(),acts=A();
  return `<div class="card"><h3>Cost per win by activity</h3><div class="bd">
      ${svgBars(acts.filter(a=>a.costPer).map(a=>({k:a.name.split(' ')[0],v:a.costPer/cumRate(exitGate().id,m)})),{h:200,money:true})}
      <div class="mini" style="margin-top:6px">Cost per ${esc(entryGate().name)} ÷ end-to-end conversion. Activities with no cost tracked are excluded.</div></div></div>`;
}
window.activityWidgetKpis=activityWidgetKpis;
window.activityWidgetFunnel=activityWidgetFunnel;
window.activityWidgetEntryChart=activityWidgetEntryChart;
window.activityWidgetCostChart=activityWidgetCostChart;
function pageActivity(){
  if(calcBlocked()) return blockedPanel('Activity plan');
  const acts=A();
  if(!acts.find(a=>a.id===UI.activityId)) UI.activityId=acts[0].id;
  let h=`<div class="phead"><div><h1>Activity plan</h1>
    <p>Wins by activity, and the volume each one has to generate. Rates differ by activity — a web lead is not an event lead.</p></div></div>`;
  h+=`<div class="note"><strong>Read this the way the spreadsheet intended.</strong> Enter the wins you want from each activity.
    Everything to the left is what that requires. Route grouping (inbound / outbound / partner) is restored here —
    it existed in the spreadsheet and was lost in the Anaplan rebuild.</div>`;

  const activityBoxSizes={box1:12,box2:12,box3:6,box4:6};
  const activityWidgetFns={kpis:activityWidgetKpis,funnel:activityWidgetFunnel,entrychart:activityWidgetEntryChart,costchart:activityWidgetCostChart};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('activity'):{box1:'kpis',box2:'funnel',box3:'entrychart',box4:'costchart'});

  h+=`<div class="grid-stack" id="ordo-grid-activity">`;
  ['box1','box2','box3','box4'].forEach(boxId=>{
    const widgetId=assigned[boxId]||boxId;
    const fn=activityWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${activityBoxSizes[boxId]}" gs-id="${boxId}">
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
