import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageSegment(){\n"
end_marker = "\n/* ---- history resolution banner"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageSegment(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Derived plan by segment" in old_block, "derived plan card missing"
assert "Entry volume required by segment" in old_block, "entry chart missing"
assert "ACV contribution by segment" in old_block, "acv chart missing"
assert "Observed rate by segment" in old_block, "observed rate card missing"

new_block = '''function segmentWidgetKpis(){
  const d=CFG.drivers,segs=G();
  const tot=segMixTotal();
  return `<div class="kpis">
    <div class="kpi hl"><div class="k">Blended rate mult.</div><div class="kpi-v">${segBlend().toFixed(3)}</div><div class="sub">mix weighted</div></div>
    <div class="kpi"><div class="k">Blended deal size</div><div class="kpi-v">${F.mk(blendedDeal())}</div><div class="sub">vs ${F.mk(d.avgDealSize)} base</div></div>
    <div class="kpi"><div class="k">Segments</div><div class="kpi-v">${segs.length}</div><div class="sub">deliberately coarse</div></div>
    <div class="kpi"><div class="k">Addressable</div><div class="kpi-v">${F.n(sum(segs.map(s=>s.addressable)))}</div><div class="sub">accounts</div></div>
    <div class="kpi"><div class="k">Engaged</div><div class="kpi-v">${F.n(sum(segs.map(s=>s.engaged)))}</div><div class="sub">accounts touched</div></div>
    <div class="kpi"><div class="k">Mix total</div><div class="kpi-v" style="color:${Math.abs(tot-1)<0.0001?'var(--ok)':'var(--bad)'}">${F.p(tot,0)}</div><div class="sub">must be 100%</div></div>
  </div>`;
}
function segmentWidgetDerivedPlan(){
  const c=chain(),d=CFG.drivers,vm=verMult(),segs=G();
  const tot=segMixTotal();
  let h=`<div class="card"><h3>Derived plan by segment — ${esc(UI.fy)}</h3><div class="bd flush"><div class="scroll"><table><thead><tr>
    <th>Segment</th><th>Tier</th><th class="n">Mix</th><th class="n">Rate ×</th><th class="n">Wins</th>
    ${gTh()}<th class="n">Deal size</th><th class="n">ACV</th></tr></thead><tbody>`;
  let acc={}; c.forEach(g=>acc[g.id]=0); let accAcv=0;
  segs.forEach(s=>{
    const wins=d.winTarget*s.mix, v=backward(wins,vm*s.rateMult);
    const dz=d.avgDealSize*s.dealMult, acv=wins*dz;
    c.forEach(g=>acc[g.id]+=v[g.id]); accAcv+=acv;
    h+=`<tr><td class="lb">${esc(s.name)}</td><td><span class="pill n">${esc(s.tier)}</span></td>
      <td class="n">${F.p(s.mix,0)}</td><td class="n calc">${s.rateMult.toFixed(2)}</td>
      <td class="n calc">${F.n(wins,1)}</td>${gTd(v)}
      <td class="n calc">${F.mk(dz)}</td><td class="n calc">${F.mk(acv)}</td></tr>`;
  });
  h+=`<tr class="tot"><td>Total</td><td></td><td class="n">${F.p(tot,0)}</td><td class="n">${segBlend().toFixed(3)}</td>
    <td class="n">${F.n(d.winTarget*tot,1)}</td>${gTd(acc)}<td class="n">${F.mk(blendedDeal())}</td><td class="n">${F.mk(accAcv)}</td></tr>`;
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function segmentWidgetEntryChart(){
  const d=CFG.drivers,vm=verMult(),segs=G();
  return `<div class="card"><h3>Entry volume required by segment</h3><div class="bd">
      ${svgBars(segs.map(s=>({k:s.name,v:backward(d.winTarget*s.mix,vm*s.rateMult)[entryGate().id],k2:F.p(s.mix,0)+' mix'})),{h:200})}
      <div class="mini" style="margin-top:6px">Enterprise needs disproportionately more ${esc(entryGate().name)} per win because its rate multiplier is below 1.</div>
    </div></div>`;
}
function segmentWidgetAcvChart(){
  const d=CFG.drivers,segs=G();
  return `<div class="card"><h3>ACV contribution by segment</h3><div class="bd">
      ${svgWaterfall(segs.map(s=>({k:s.name,v:d.winTarget*s.mix*d.avgDealSize*s.dealMult}))
        .concat([{k:'Total',v:0,total:true}]),{money:true,h:200})}</div></div>`;
}
function segmentWidgetObservedRate(){
  const segs=G();
  return `<div class="card"><h3>Observed rate by segment — from ${MONTHS.length} months of history</h3><div class="bd flush"><table><thead><tr>
    <th>Segment</th>${chain().slice(1).map(g=>`<th class="n">${esc(g.name)}</th>`).join('')}<th>Evidence</th></tr></thead><tbody>
    ${segs.map(s=>{const o=observedRates({segmentIds:[s.id]});
      const n=Math.min.apply(null,chain().slice(1).map(g=>(o[g.id]||{}).n||0));
      const cb=confBand(n);
      return `<tr><td class="lb">${esc(s.name)}</td>
        ${chain().slice(1).map(g=>`<td class="n calc">${o[g.id]&&o[g.id].rate!=null?F.p(o[g.id].rate,1):'—'}</td>`).join('')}
        <td><span class="pill ${cb.cls}">${cb.label}</span></td></tr>`;}).join('')}
    <tr class="tot"><td>Published (base)</td>
      ${chain().slice(1).map(g=>`<td class="n">${F.p(g.rate,1)}</td>`).join('')}<td></td></tr>
    </tbody></table></div>
    <div class="bd"><div class="mini"><b>This is the upgrade path.</b> When these observed rates diverge enough from
      base × multiplier, swap the multiplier for an independent per-segment rate set. No regrain needed — the fact key already carries segment.</div></div></div>`;
}
window.segmentWidgetKpis=segmentWidgetKpis;
window.segmentWidgetDerivedPlan=segmentWidgetDerivedPlan;
window.segmentWidgetEntryChart=segmentWidgetEntryChart;
window.segmentWidgetAcvChart=segmentWidgetAcvChart;
window.segmentWidgetObservedRate=segmentWidgetObservedRate;
function pageSegment(){
  if(calcBlocked()) return blockedPanel('Segment & audience');
  let h=`<div class="phead"><div><h1>Segment &amp; audience</h1>
    <p>Derived from segment mix and rate multipliers. No targets are entered here — that keeps planner input burden flat while still giving you segmented rates and segmented history.</p></div></div>`;
  const sqlGate=CFG.gates.find(g=>g.code==='SQL');
  h+=`<div class="note"><strong>Why this module exists.</strong> A blended ${F.p(sqlGate?sqlGate.rate:0.23,0)} rate across
    Enterprise and SMB is the average of two real numbers and describes neither. Segment is a key on the fact grain, so this
    view is a read of stored data — not a separate plan to maintain.</div>`;

  const segmentBoxSizes={box1:12,box2:12,box3:6,box4:6,box5:12};
  const segmentWidgetFns={kpis:segmentWidgetKpis,derivedplan:segmentWidgetDerivedPlan,entrychart:segmentWidgetEntryChart,acvchart:segmentWidgetAcvChart,observedrate:segmentWidgetObservedRate};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('segment'):{box1:'kpis',box2:'derivedplan',box3:'entrychart',box4:'acvchart',box5:'observedrate'});

  h+=`<div class="grid-stack" id="ordo-grid-segment">`;
  ['box1','box2','box3','box4','box5'].forEach(boxId=>{
    const widgetId=assigned[boxId]||boxId;
    const fn=segmentWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${segmentBoxSizes[boxId]}" gs-id="${boxId}">
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
