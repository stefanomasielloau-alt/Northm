import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageActuals(){\n"
end_marker = "\n/* ============================================================================\n   MODULE 8 — INSIGHT"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageActuals(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Plan vs actual" in old_block, "plan vs actual card missing"
assert "Multi-year trend" in old_block, "trend chart missing"
assert "Actual by region" in old_block, "region chart missing"
assert "Monthly detail" in old_block, "monthly detail card missing"

new_block = '''function actualsWidgetKpis(){
  const c=chain(),m=verMult()*segBlend(),vis=visibleRegions().map(r=>r.id);
  const cur=histSlice({fy:UI.fy,regionIds:vis}).acc;
  const plan=backward(CFG.drivers.winTarget,m);
  return `<div class="kpis">
    ${c.map((g,i)=>`<div class="kpi ${i===c.length-1?'hl':''}"><div class="k">${esc(g.name)} actual</div>
      <div class="kpi-v">${F.n(cur[g.id])}</div>
      <div class="sub">plan ${F.n(plan[g.id])} · ${F.sp(plan[g.id]?(cur[g.id]-plan[g.id])/plan[g.id]:0,0)}</div></div>`).join('')}
    <div class="kpi"><div class="k">Cost</div><div class="kpi-v">${F.mk(cur._cost)}</div><div class="sub">actual spend</div></div>
  </div>`;
}
function actualsWidgetPlanVsActual(){
  const c=chain(),m=verMult()*segBlend(),vis=visibleRegions().map(r=>r.id);
  const cur=histSlice({fy:UI.fy,regionIds:vis}).acc;
  const plan=backward(CFG.drivers.winTarget,m);
  return `<div class="card"><h3>Plan vs actual — ${esc(UI.fy)}</h3><div class="bd flush"><table><thead><tr>
    <th>Gate</th><th class="n">Plan</th><th class="n">Actual</th><th class="n">Variance</th><th class="n">Var %</th>
    <th class="n">Plan rate</th><th class="n">Actual rate</th><th>Status</th></tr></thead><tbody>
    ${c.map((g,i)=>{
      const p=plan[g.id],a=cur[g.id],v=a-p,pc=p?v/p:0;
      const ar=i>0&&cur[c[i-1].id]?a/cur[c[i-1].id]:null;
      const st=Math.abs(pc)<0.1?'ok':Math.abs(pc)<0.25?'warn':'bad';
      return `<tr><td class="lb">${esc(g.name)}</td><td class="n calc">${F.n(p)}</td><td class="n calc">${F.n(a)}</td>
        <td class="n" style="color:${v<0?'var(--bad)':'var(--ok)'}">${F.n(v)}</td><td class="n">${F.sp(pc,1)}</td>
        <td class="n calc">${i===0?'—':F.p(rateOf(g,m),1)}</td><td class="n calc">${ar!=null?F.p(ar,1):'—'}</td>
        <td><span class="pill ${st}">${st==='ok'?'On plan':st==='warn'?'Watch':'Off plan'}</span></td></tr>`;}).join('')}
    </tbody></table></div></div>`;
}
function actualsWidgetTrendChart(){
  const vis=visibleRegions().map(r=>r.id);
  const fys=['FY25','FY26','FY27'];
  return `<div class="card"><h3>Multi-year trend — ${esc(exitGate().name)}</h3><div class="bd">
      ${svgLines(fys,[{k:'Actual',v:fys.map(f=>histSlice({fy:f,regionIds:vis}).acc[exitGate().id])},
                      {k:'Plan',v:fys.map(()=>CFG.drivers.winTarget),dash:true}],{h:200})}
      <div class="lgd"><span><i style="background:${SER[0]}"></i>Actual</span><span><i style="background:${SER[1]}"></i>Plan</span></div></div></div>`;
}
function actualsWidgetRegionChart(){
  return `<div class="card"><h3>Actual by region — ${esc(UI.fy)}</h3><div class="bd">
      ${svgBars(visibleRegions().map(r=>({k:r.name,v:histSlice({fy:UI.fy,regionIds:[r.id]}).acc[exitGate().id]})),{h:200,dec:0})}</div></div>`;
}
function actualsWidgetMonthlyDetail(){
  const vis=visibleRegions().map(r=>r.id);
  const cur=histSlice({fy:UI.fy,regionIds:vis}).acc;
  return `<div class="card"><h3>Monthly detail — ${esc(UI.fy)}</h3><div class="bd flush"><div class="scroll cap"><table><thead><tr>
    <th>Month</th><th>Quarter</th>${gTh()}<th class="n">Cost</th><th class="n">ACV</th><th class="n">Season idx</th></tr></thead><tbody>
    ${MONTHS.filter(mo=>fyOf(mo)===UI.fy).map(mo=>{
      const a=histSlice({monthKey:mo.key,regionIds:vis}).acc;
      return `<tr><td class="lb">${esc(mo.label)}</td><td>${qtrOf(mo)}</td>${gTd(a)}
        <td class="n calc">${F.mk(a._cost)}</td><td class="n calc">${F.mk(a._acv)}</td>
        <td class="n calc">${(CFG.seasonality[fyPos(mo)]??1).toFixed(2)}</td></tr>`;}).join('')}
    <tr class="tot"><td>Total</td><td></td>${gTd(cur)}<td class="n">${F.mk(cur._cost)}</td>
      <td class="n">${F.mk(cur._acv)}</td><td class="n"></td></tr>
    </tbody></table></div></div></div>`;
}
window.actualsWidgetKpis=actualsWidgetKpis;
window.actualsWidgetPlanVsActual=actualsWidgetPlanVsActual;
window.actualsWidgetTrendChart=actualsWidgetTrendChart;
window.actualsWidgetRegionChart=actualsWidgetRegionChart;
window.actualsWidgetMonthlyDetail=actualsWidgetMonthlyDetail;
function pageActuals(){
  if(calcBlocked()) return blockedPanel('Actuals & history');
  let h=`<div class="phead"><div><h1>Actuals &amp; history</h1>
    <p>${MONTHS.length} months of sample history. Replace with the CRM and marketing feeds — the shape is what matters here.</p></div>
    <div class="sp"></div><span class="pill v">Sample data</span></div>`;
  h+=`<div class="note w"><strong>This is synthetic.</strong> Generated deterministically so the numbers are stable between
    reloads, with growth, seasonality and noise applied. Data <em>types</em> and member names are real; values are not.</div>`;
  h+=histBanner();

  const actualsBoxSizes={box1:12,box2:12,box3:6,box4:6,box5:12};
  const actualsWidgetFns={kpis:actualsWidgetKpis,planvsactual:actualsWidgetPlanVsActual,trendchart:actualsWidgetTrendChart,regionchart:actualsWidgetRegionChart,monthlydetail:actualsWidgetMonthlyDetail};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('actuals'):{box1:'kpis',box2:'planvsactual',box3:'trendchart',box4:'regionchart',box5:'monthlydetail'});

  h+=`<div class="grid-stack" id="ordo-grid-actuals">`;
  ['box1','box2','box3','box4','box5'].forEach(boxId=>{
    const widgetId=assigned[boxId]||boxId;
    const fn=actualsWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${actualsBoxSizes[boxId]}" gs-id="${boxId}">
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
