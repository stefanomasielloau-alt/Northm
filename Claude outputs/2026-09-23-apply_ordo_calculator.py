import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageCalculator(){\n"
end_marker = "\n\n\n/* ============================================================================\n   RELATIONSHIPS (item 23 v1, 2026-09-04)"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageCalculator(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Bottom-up: from volume" in old_block, "bottom-up card missing"
assert "By stream" in old_block, "by-stream card missing"
assert "Scenarios" in old_block, "scenarios card missing"
assert "Reference — the real gate chain" in old_block, "reference card missing"

new_block = '''function calcWidgetTopDown(){
  if(!UI.calc) UI.calc=calcDefaults();
  const k=UI.calc, m=verMult()*segBlend();
  const leadsNeeded = k.rate>0 ? k.targetWins/k.rate : null;
  const totalCost = leadsNeeded!=null ? leadsNeeded*k.costPerLead : null;
  const revenue = k.targetWins*k.avgDeal;
  const costPerWin = (k.targetWins&&totalCost!=null) ? totalCost/k.targetWins : null;
  const roi = totalCost ? revenue/totalCost : null;
  return `<div class="grid g2">
    <div class="card"><h3>Assumptions</h3><div class="bd">
      <div class="f"><label>Target ${esc(exitGate().name)}</label>
        <input class="in v" value="${k.targetWins}" onchange="calcSet('targetWins',this.value)"></div>
      <div class="f"><label>Average deal size</label>
        <input class="in v" value="${k.avgDeal}" onchange="calcSet('avgDeal',this.value)"></div>
      <div class="f"><label>Blended conversion (${esc(entryGate().name)} &rarr; ${esc(exitGate().name)})</label>
        <input class="in v" value="${(k.rate*100).toFixed(2)}" onchange="calcSet('rate',this.value)">
        <span class="hint">Defaults to the live plan's current end-to-end rate — override it for a what-if.</span></div>
      <div class="f"><label>Assumed cost per ${esc(entryGate().name)}</label>
        <input class="in v" value="${k.costPerLead}" onchange="calcSet('costPerLead',this.value)"></div>
    </div></div>
    <div class="card"><h3>Result</h3><div class="bd">
      <div class="kpis">
        <div class="kpi hl"><div class="k">${esc(entryGate().name)} needed</div><div class="kpi-v">${leadsNeeded!=null?F.n(leadsNeeded):'—'}</div><div class="sub">at ${F.p(k.rate,1)} blended</div></div>
        <div class="kpi"><div class="k">Total cost</div><div class="kpi-v">${totalCost!=null?F.mk(totalCost):'—'}</div><div class="sub">${F.mk(k.costPerLead)}/lead</div></div>
        <div class="kpi"><div class="k">Cost per win</div><div class="kpi-v">${costPerWin!=null?F.mk(costPerWin):'—'}</div><div class="sub">blended</div></div>
        <div class="kpi"><div class="k">Projected revenue</div><div class="kpi-v">${F.mk(revenue)}</div><div class="sub">${roi!=null?F.n(roi,1)+'x cost':'—'}</div></div>
      </div>
      <div class="dv"></div>
      <div class="row">
        <button class="btn pri" onclick="pushCalcToPlanner(false)">Push to planner</button>
        <button class="btn" onclick="pushCalcToPlanner(true)">Push + create draft campaign</button>
      </div>
      <div class="mini" style="margin-top:8px">Push to planner sets the live win target and deal size. The second option
        also drops a draft campaign into Campaign &amp; cost with this budget and conversion assumption, ready to refine.</div>
    </div></div>
  </div>`;
}
function calcWidgetBottomUp(){
  if(!UI.calc) UI.calc=calcDefaults();
  const k=UI.calc;
  const entryVolume = k.entryVolume||0;
  const winsExpected = entryVolume*k.rate;
  const buCost = entryVolume*k.costPerLead;
  const buRevenue = winsExpected*k.avgDeal;
  const buCostPerWin = winsExpected ? buCost/winsExpected : null;
  const buRoi = buCost ? buRevenue/buCost : null;
  return `<div class="grid g2">
    <div class="card"><h3>Bottom-up: from volume</h3><div class="bd">
      <div class="f"><label>${esc(entryGate().name)} you expect</label>
        <input class="in v" value="${entryVolume}" onchange="calcSet('entryVolume',this.value)"></div>
      <div class="mini">Uses the same conversion rate, average deal size and cost-per-lead entered in the top-down
        assumptions above — change those there, this side just runs the same numbers forward instead of backward.</div>
    </div></div>
    <div class="card"><h3>Result</h3><div class="bd">
      <div class="kpis">
        <div class="kpi hl"><div class="k">${esc(exitGate().name)} expected</div><div class="kpi-v">${F.n(winsExpected)}</div><div class="sub">at ${F.p(k.rate,1)} blended</div></div>
        <div class="kpi"><div class="k">Total cost</div><div class="kpi-v">${F.mk(buCost)}</div><div class="sub">${F.mk(k.costPerLead)}/lead</div></div>
        <div class="kpi"><div class="k">Cost per win</div><div class="kpi-v">${buCostPerWin!=null?F.mk(buCostPerWin):'—'}</div><div class="sub">blended</div></div>
        <div class="kpi"><div class="k">Projected revenue</div><div class="kpi-v">${F.mk(buRevenue)}</div><div class="sub">${buRoi!=null?F.n(buRoi,1)+'x cost':'—'}</div></div>
      </div>
      <div class="dv"></div>
      <button class="btn" onclick="calcSet('targetWins',${Math.round(winsExpected)||0})">Use ${F.n(winsExpected)} as my top-down target &uarr;</button>
    </div></div>
  </div>`;
}
function calcWidgetByStream(){
  if(!UI.calc) UI.calc=calcDefaults();
  const k=UI.calc;
  const winsExpected = (k.entryVolume||0)*k.rate;
  const streamRows=calcStreamBreakdown(k);
  if(!streamRows.length){
    return `<div class="card"><h3>By stream</h3><div class="bd"><div class="empty">No streams configured yet — add some in Admin &amp; config &rarr; Streams to see a top-down/bottom-up split by source.</div></div></div>`;
  }
  const tdTotal=sum(streamRows.map(r=>r.tdWins)), buTotal=sum(streamRows.map(r=>r.buWins));
  return `<div class="card"><h3>By stream <span class="sp"></span><span class="pill n">split by each stream's configured mix</span></h3>
    <div class="bd"><div class="mini" style="margin-bottom:10px">Same target, rate and cost-per-lead as above, divided across your configured
      streams (Admin &amp; config &rarr; Streams) by their mix share — matching a top-down/bottom-up-by-source view like Stef's
      original funnel calculator. Streams don't have their own conversion rates in North yet, so each one runs the same blended rate.</div>
    <div class="scroll cap"><table><thead><tr><th>Stream</th><th class="n">Mix share</th>
      <th class="n">Top-down: wins</th><th class="n">Top-down: ${esc(entryGate().name)} needed</th>
      <th class="n">Bottom-up: ${esc(entryGate().name)}</th><th class="n">Bottom-up: wins expected</th></tr></thead><tbody>
      ${streamRows.map(r=>`<tr><td class="lb">${esc(r.name)}</td><td class="n calc">${F.p(r.share,1)}</td>
        <td class="n calc">${F.n(r.tdWins)}</td><td class="n calc">${r.tdLeads!=null?F.n(r.tdLeads):'—'}</td>
        <td class="n calc">${F.n(r.buEntry)}</td><td class="n calc">${F.n(r.buWins)}</td></tr>`).join('')}
      <tr style="font-weight:600;border-top:2px solid var(--line)"><td class="lb">Total by stream</td><td class="n">${F.p(1,1)}</td>
        <td class="n calc">${F.n(tdTotal)}</td><td class="n calc">—</td><td class="n calc">—</td><td class="n calc">${F.n(buTotal)}</td></tr>
      <tr><td class="lb">Target</td><td class="n">—</td><td class="n calc">${F.n(k.targetWins||0)}</td><td class="n calc">—</td>
        <td class="n calc">—</td><td class="n calc">${F.n(winsExpected)}</td></tr>
      <tr><td class="lb">Variance</td><td class="n">—</td><td class="n calc" style="color:${tdTotal-(k.targetWins||0)===0?'inherit':'var(--warn)'}">${F.sp(tdTotal-(k.targetWins||0),0)}</td>
        <td class="n calc">—</td><td class="n calc">—</td><td class="n calc" style="color:${buTotal-winsExpected===0?'inherit':'var(--warn)'}">${F.sp(buTotal-winsExpected,0)}</td></tr>
    </tbody></table></div></div></div>`;
}
function calcWidgetScenarios(){
  const sortedScenarios=CFG.calcScenarios.slice().sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  return `<div class="card"><h3>Scenarios <span class="sp"></span><span class="pill n">${CFG.calcScenarios.length} saved</span></h3>
    <div class="bd">
      <div class="row">
        <input class="in" id="calcScenName" placeholder="e.g. FY27 stretch case" style="max-width:300px"
          onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('calcScenBtn').click();}">
        <button class="btn pri" id="calcScenBtn" onclick="
          const el=document.getElementById('calcScenName'); const n=el.value.trim();
          if(!n){toast('Name it first.');return;} saveCalcScenario(n); el.value='';">Save these numbers as a scenario</button>
      </div>
      <div class="mini" style="margin-top:6px">Saves just this calculator's inputs (target, rate, cost, entry volume) under a name so you can
        come back and compare before deciding which one to push to the planner below.</div>
    </div>
    ${sortedScenarios.length?`<div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th>Name</th><th>Saved by</th><th>When</th><th class="n">Target wins</th><th class="n">Rate</th><th></th></tr></thead><tbody>
      ${sortedScenarios.map(sc=>`<tr><td class="lb">${esc(sc.name)}</td><td>${esc(sc.createdBy)}</td>
        <td class="mini">${esc(F.dt(sc.timestamp))}</td><td class="n calc">${F.n(sc.calc.targetWins||0)}</td>
        <td class="n calc">${F.p(sc.calc.rate||0,1)}</td>
        <td class="n"><button class="btn sm" onclick="loadCalcScenario('${sc.id}')">Load</button>
          <button class="btn sm dgr" onclick="removeCalcScenario('${sc.id}')">Remove</button></td></tr>`).join('')}
      </tbody></table></div></div>`:''}
  </div>`;
}
function calcWidgetReference(){
  if(!UI.calc) UI.calc=calcDefaults();
  const k=UI.calc, m=verMult()*segBlend();
  const leadsNeeded = k.rate>0 ? k.targetWins/k.rate : null;
  const detailed = backward(k.targetWins||0, m);
  return `<div class="card"><h3>Reference — the real gate chain for this target</h3>
    <div class="bd flush"><table><thead><tr><th>Gate</th><th class="n">Your blended assumption</th><th class="n">Live plan's actual gates</th><th class="n">Difference</th></tr></thead><tbody>
    ${chain().map(g=>{
      const simple = g.id===exitGate().id ? k.targetWins : g.id===entryGate().id ? leadsNeeded : null;
      const real = detailed[g.id];
      const diff = simple!=null ? simple-real : null;
      return `<tr><td class="lb">${esc(g.name)}</td>
        <td class="n calc">${simple!=null?F.n(simple):'—'}</td>
        <td class="n calc">${F.n(real)}</td>
        <td class="n">${diff!=null?F.sp(real?diff/real:0,0):'—'}</td></tr>`;
    }).join('')}
    </tbody></table></div>
    <div class="bd"><div class="mini">The calculator only knows entry and exit — it can't see the gates in between.
      This shows what the detailed engine's real per-gate rates actually need for the same target, so you can tell
      whether the blended-rate assumption above is optimistic before you push it.</div></div></div>`;
}
window.calcWidgetTopDown=calcWidgetTopDown;
window.calcWidgetBottomUp=calcWidgetBottomUp;
window.calcWidgetByStream=calcWidgetByStream;
window.calcWidgetScenarios=calcWidgetScenarios;
window.calcWidgetReference=calcWidgetReference;
function pageCalculator(){
  if(!UI.calc) UI.calc=calcDefaults();

  let h=`<div class="phead"><div><h1>Quick calculator</h1>
    <p>A handful of numbers for fast what-if thinking, kept separate from the live plan until you push it across.</p></div>
    <div class="sp"></div><button class="btn sm" onclick="calcReset()">Reset to current plan</button></div>`;

  const calculatorBoxSizes={box1:12,box2:12,box3:12,box4:12,box5:12};
  const calculatorWidgetFns={topdown:calcWidgetTopDown,bottomup:calcWidgetBottomUp,bystream:calcWidgetByStream,scenarios:calcWidgetScenarios,reference:calcWidgetReference};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('calculator'):{box1:'topdown',box2:'bottomup',box3:'bystream',box4:'scenarios',box5:'reference'});

  h+=`<div class="grid-stack" id="ordo-grid-calculator">`;
  ['box1','box2','box3','box4','box5'].forEach(boxId=>{
    const widgetId=assigned[boxId]||boxId;
    const fn=calculatorWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${calculatorBoxSizes[boxId]}" gs-id="${boxId}">
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
