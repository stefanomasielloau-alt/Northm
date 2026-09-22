import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageDrivers(){\n"
end_marker = "\nfunction adoptObserved(){"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageDrivers(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
# sanity: make sure we're grabbing the real, known-shape body (guards against drift)
assert "calcBlocked()" in old_block, "calcBlocked guard missing from captured block"
assert "Global drivers" in old_block, "Global drivers card missing from captured block"
assert "Rate library" in old_block, "Rate library card missing from captured block"
assert "Segment rate multipliers" in old_block, "Segment rate multipliers missing"
assert "Stream marketing contribution" in old_block, "Stream marketing contribution missing"

new_block = '''function driversWidgetKpis(){
  const d=CFG.drivers;
  return `<div class="kpis">
    <div class="kpi hl"><div class="k">Win target</div><div class="kpi-v">${F.n(d.winTarget)}</div><div class="sub">${esc(exitGate().name)} · ${esc(UI.fy)}</div></div>
    <div class="kpi"><div class="k">Projected revenue</div><div class="kpi-v">${F.mk(d.projectedRevenue)}</div><div class="sub">per year</div></div>
    <div class="kpi"><div class="k">Avg deal (base)</div><div class="kpi-v">${F.mk(d.avgDealSize)}</div><div class="sub">before segment blend</div></div>
    <div class="kpi"><div class="k">Avg deal (blended)</div><div class="kpi-v">${F.mk(blendedDeal())}</div><div class="sub">segment weighted</div></div>
    <div class="kpi"><div class="k">Implied wins</div><div class="kpi-v">${F.n(d.projectedRevenue/blendedDeal(),0)}</div><div class="sub">revenue ÷ blended deal</div></div>
    <div class="kpi"><div class="k">End-to-end rate</div><div class="kpi-v">${F.p(cumRate(exitGate().id),2)}</div><div class="sub">${esc(entryGate().name)} → ${esc(exitGate().name)}</div></div>
  </div>`;
}
function driversWidgetGlobal(){
  const d=CFG.drivers,ro=readOnly()?'disabled':'';
  return `<div class="card"><h3>Global drivers</h3><div class="bd">
      <div class="f"><label>Average deal size</label>
        <input class="in v" value="${d.avgDealSize}" ${ro} onchange="SET('drivers.avgDealSize',this.value,{type:'money'})">
        <span class="hint">Base. Segment deal multipliers apply on top.</span></div>
      <div class="f"><label>Projected sales revenue per year</label>
        <input class="in v" value="${d.projectedRevenue}" ${ro} onchange="SET('drivers.projectedRevenue',this.value,{type:'money'})"></div>
      <div class="f"><label>${esc(exitGate().name)} target for the year</label>
        <input class="in v" value="${d.winTarget}" ${ro} onchange="SET('drivers.winTarget',this.value,{type:'num'})">
        <span class="hint">The number the whole model plans backwards from.</span></div>
      <div class="f"><label>Bottom-up entry volume (${esc(entryGate().name)})</label>
        <input class="in v" value="${d.bottomUpLeads}" ${ro} onchange="SET('drivers.bottomUpLeads',this.value,{type:'num'})"></div>
      <div class="dv"></div>
      <div class="mini"><b>Reconciliation.</b> Revenue ÷ blended deal = ${F.n(d.projectedRevenue/blendedDeal(),0)} wins
        vs a ${F.n(d.winTarget)} entered target.
        ${Math.abs(d.projectedRevenue/blendedDeal()-d.winTarget)<5
          ? '<span class="pill ok">Ties</span>'
          : '<span class="pill warn">Gap of '+F.n(Math.abs(d.projectedRevenue/blendedDeal()-d.winTarget),0)+'</span>'}</div>
    </div></div>`;
}
function driversWidgetRateLibrary(){
  const c=chain(),ro=readOnly()?'disabled':'';
  const obs=observedRates({fy:null});
  let h=`<div class="card"><h3>Rate library <span class="sp"></span>
      <button class="btn sm" ${ro} onclick="adoptObserved()">Adopt observed rates</button></h3>
      <div class="bd flush"><table><thead><tr><th>Gate</th><th class="n">Published rate</th>
        <th class="n">Observed in history</th><th>Evidence</th><th class="n">Delta</th><th class="n">Cumulative</th></tr></thead><tbody>`;
  c.forEach((g,i)=>{
    if(i===0){ h+=`<tr><td class="lb">${esc(g.name)}</td><td class="n mini">entry</td><td class="n mini">—</td>
      <td class="mini">—</td><td class="n">—</td><td class="n calc">100%</td></tr>`; return; }
    const o=obs[g.id]||{},cb=confBand(o.n);
    const delta=(o.rate!=null)?(g.rate-o.rate):null;
    h+=`<tr><td class="lb">${esc(g.name)}</td>
      <td class="n"><input class="cel w ${g.rate===0?'bad':''}" value="${(g.rate*100).toFixed(1)}" ${ro} onchange="setIn('gates','${g.id}','rate',this.value,'pct')"></td>
      <td class="n calc">${o.rate!=null?F.p(o.rate,1):'—'}</td>
      <td><span class="pill ${cb.cls}">${cb.label}</span></td>
      <td class="n">${delta!=null?`<span class="pill ${Math.abs(delta)>0.05?'warn':'ok'}">${F.sp(delta,1)}</span>`:'—'}</td>
      <td class="n calc">${F.p(cumRate(g.id),2)}</td></tr>`;
  });
  h+=`</tbody></table></div>
    <div class="bd"><div class="mini"><b>Evidence bands.</b> A rate backed by 8 observations is shown differently from one
      backed by 4,000. Adopting observed rates overwrites the published rate and logs the change.</div></div></div>`;
  return h;
}
function driversWidgetSegmentMultipliers(){
  return `<div class="card"><h3>Segment rate multipliers</h3><div class="bd">
      ${svgBars(G().map(s=>({k:s.name,v:s.rateMult,k2:F.p(s.mix,0)+' of mix'})),{h:180,dec:2})}
      <div class="mini" style="margin-top:6px">Blended multiplier <b>${segBlend().toFixed(3)}</b> — applied to every published rate.</div>
    </div></div>`;
}
function driversWidgetStreamContribution(){
  return `<div class="card"><h3>Stream marketing contribution</h3><div class="bd">
      ${svgBars(S().map(s=>({k:s.name,v:CFG.drivers.winTarget*s.mix*s.mktContrib,k2:F.p(s.mktContrib,0)})),{h:180,dec:1})}
      <div class="mini" style="margin-top:6px">Marketing-attributed wins by stream. Total
        <b>${F.n(sum(S().map(s=>CFG.drivers.winTarget*s.mix*s.mktContrib)),1)}</b>.</div>
    </div></div>`;
}
window.driversWidgetKpis=driversWidgetKpis;
window.driversWidgetGlobal=driversWidgetGlobal;
window.driversWidgetRateLibrary=driversWidgetRateLibrary;
window.driversWidgetSegmentMultipliers=driversWidgetSegmentMultipliers;
window.driversWidgetStreamContribution=driversWidgetStreamContribution;
function pageDrivers(){
  if(calcBlocked()) return blockedPanel('Drivers & rate library');
  let h=`<div class="phead"><div><h1>Drivers &amp; rate library</h1>
    <p>Global assumptions, and the published rate for every gate with the evidence behind it.</p></div>
    <div class="sp"></div>${readOnly()?'<span class="pill warn">Read only — '+esc(version().name)+'</span>':''}</div>`;
  h+=vBanner();

  const driversBoxSizes={box1:12,box2:4,box3:8,box4:6,box5:6};
  const driversWidgetFns={
    kpis:driversWidgetKpis,
    global:driversWidgetGlobal,
    ratelibrary:driversWidgetRateLibrary,
    segmentmult:driversWidgetSegmentMultipliers,
    streamcontrib:driversWidgetStreamContribution
  };
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('drivers'):{box1:'kpis',box2:'global',box3:'ratelibrary',box4:'segmentmult',box5:'streamcontrib'});

  h+=`<div class="grid-stack" id="ordo-grid-drivers">`;
  ['box1','box2','box3','box4','box5'].forEach(boxId=>{
    const widgetId=assigned[boxId]||boxId;
    const fn=driversWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${driversBoxSizes[boxId]}" gs-id="${boxId}">
      <div class="grid-stack-item-content">${fn()}</div>
    </div>`;
  });
  h+=`</div>`;
  return h;
}
'''

new_src = src[:start_idx + 1] + new_block.rstrip('\n') + src[end_idx:]

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(new_src)

print("OK, chars before:", orig_len, "after:", len(new_src), "delta:", len(new_src) - orig_len)
