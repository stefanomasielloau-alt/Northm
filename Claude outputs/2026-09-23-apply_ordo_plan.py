import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pagePlan(){\n"
end_marker = "\n/* ============================================================================\n   MODULE 3 — GEOGRAPHY & PODS"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pagePlan(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Top-down works up from" in old_block, "phead text missing from captured block"
assert "Reconciliation is a control" in old_block, "rec note missing from captured block"
assert "Time phasing applies the seasonality" in old_block, "phase note missing from captured block"
assert "svgWaterfall(S().map" in old_block, "waterfall section missing from captured block"

new_block = '''function planTopWidgetKpis(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend();
  const top=backward(d.winTarget,m);
  return `<div class="kpis">${c.map((g,i)=>`<div class="kpi ${i===c.length-1?'hl':''}">
      <div class="k">${esc(g.name)}</div><div class="kpi-v">${F.n(top[g.id])}</div>
      <div class="sub">${i===0?'entry':F.p(rateOf(g,m),1)+' in'}</div></div>`).join('')}</div>`;
}
function planTopWidgetFunnel(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend();
  const top=backward(d.winTarget,m);
  return `<div class="card"><h3>Funnel required to land ${F.n(d.winTarget)} ${esc(exitGate().name)}</h3>
      <div class="bd">${svgFunnel(c.map(g=>top[g.id]),c.map(g=>g.name),640)}</div></div>`;
}
function planTopWidgetByStream(){
  const d=CFG.drivers,m=verMult()*segBlend();
  let h=`<div class="card"><h3>By stream</h3><div class="bd flush"><table><thead><tr>
      <th>Stream</th><th class="n">Mix</th>${gTh()}<th class="n">Mktg wins</th><th class="n">ACV</th></tr></thead><tbody>`;
  S().forEach(s=>{
    const v=backward(d.winTarget*s.mix,m);
    h+=`<tr><td class="lb">${esc(s.name)}</td><td class="n">${F.p(s.mix,0)}</td>${gTd(v)}
        <td class="n calc">${F.n(d.winTarget*s.mix*s.mktContrib,1)}</td>
        <td class="n calc">${F.mk(d.winTarget*s.mix*blendedDeal())}</td></tr>`;
  });
  const tt=backward(d.winTarget*streamMixTotal(),m);
  h+=`<tr class="tot"><td>Total</td><td class="n">${F.p(streamMixTotal(),0)}</td>${gTd(tt)}
      <td class="n">${F.n(sum(S().map(s=>d.winTarget*s.mix*s.mktContrib)),1)}</td>
      <td class="n">${F.mk(d.winTarget*streamMixTotal()*blendedDeal())}</td></tr>`;
  h+=`</tbody></table></div></div>`;
  return h;
}
function planTopWidgetWaterfall(){
  const d=CFG.drivers;
  return `<div class="card"><h3>Marketing contribution build-up</h3><div class="bd">
      ${svgWaterfall(S().map(s=>({k:s.name,v:d.winTarget*s.mix*s.mktContrib}))
        .concat([{k:'Total',v:0,total:true}]),{h:200,dec:1})}</div></div>`;
}
function planBotWidgetKpis(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend();
  const bot=forward(d.bottomUpLeads,m);
  return `<div class="kpis">${c.map((g,i)=>`<div class="kpi ${i===c.length-1?'hl':''}">
      <div class="k">${esc(g.name)}</div><div class="kpi-v">${F.n(bot[g.id],i===c.length-1?1:0)}</div>
      <div class="sub">${i===0?'entered':F.p(rateOf(g,m),1)+' in'}</div></div>`).join('')}</div>`;
}
function planBotWidgetEntryVolume(){
  const d=CFG.drivers;
  return `<div class="card"><h3>Entry volume by stream</h3><div class="bd">
      <div class="f"><label>Total ${esc(entryGate().name)} available</label>
        <input class="in v" value="${d.bottomUpLeads}" ${readOnly()?'disabled':''} onchange="SET('drivers.bottomUpLeads',this.value,{type:'num'})"></div>
      ${S().map(s=>`<div class="f"><label>${esc(s.name)}</label>
        <input class="in v" value="${Math.round(d.bottomUpLeads*s.mix)}" disabled>
        <span class="hint">${F.p(s.mix,0)} of entry volume · derived from stream mix</span></div>`).join('')}
      </div></div>`;
}
function planBotWidgetDelivers(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend();
  const bot=forward(d.bottomUpLeads,m);
  return `<div class="card"><h3>What that entry volume delivers</h3><div class="bd">
        ${svgFunnel(c.map(g=>bot[g.id]),c.map(g=>g.name),560)}
        <div class="dv"></div>
        <table><thead><tr><th>Stream</th>${gTh()}<th class="n">Mktg wins</th><th class="n">ACV</th></tr></thead><tbody>
        ${S().map(s=>{const v=forward(d.bottomUpLeads*s.mix,m);
          return `<tr><td class="lb">${esc(s.name)}</td>${gTd(v,1)}
            <td class="n calc">${F.n(v[exitGate().id]*s.mktContrib,1)}</td>
            <td class="n calc">${F.mk(v[exitGate().id]*blendedDeal())}</td></tr>`;}).join('')}
        <tr class="tot"><td>Total</td>${gTd(forward(d.bottomUpLeads*streamMixTotal(),m),1)}
          <td class="n">${F.n(sum(S().map(s=>forward(d.bottomUpLeads*s.mix,m)[exitGate().id]*s.mktContrib)),1)}</td>
          <td class="n">${F.mk(forward(d.bottomUpLeads*streamMixTotal(),m)[exitGate().id]*blendedDeal())}</td></tr>
        </tbody></table></div>`;
}
function planBotWidgetWaterfall(){
  const d=CFG.drivers,m=verMult()*segBlend();
  return `<div class="card"><h3>Marketing contribution build-up — bottom-up</h3><div class="bd">
      ${svgWaterfall(S().map(s=>({k:s.name,v:forward(d.bottomUpLeads*s.mix,m)[exitGate().id]*s.mktContrib}))
        .concat([{k:'Total',v:0,total:true}]),{h:200,dec:1})}
      <div class="mini" style="margin-top:6px">Same build-up as the top-down view (module 2, Top-down tab), computed from
        forward-derived wins instead of the win target — parity between the two directions, not just the same numbers.</div>
    </div></div>`;
}
function planStreamcmpWidgetTable(){
  const d=CFG.drivers,m=verMult()*segBlend(),bot=forward(d.bottomUpLeads,m);
  return `<div class="card"><h3>By stream — top-down vs bottom-up</h3><div class="bd flush"><table><thead><tr>
      <th>Stream</th><th class="n">Mix</th><th class="n">Top-down wins</th><th class="n">Top-down ACV</th>
      <th class="n">Bottom-up wins</th><th class="n">Bottom-up ACV</th><th class="n">Gap (wins)</th><th>Status</th></tr></thead><tbody>
      ${S().map(s=>{
        const tWins=d.winTarget*s.mix, tAcv=tWins*blendedDeal();
        const bVol=forward(d.bottomUpLeads*s.mix,m), bWins=bVol[exitGate().id], bAcv=bWins*blendedDeal();
        const gap=bWins-tWins, pc=tWins?gap/tWins:0;
        const st=Math.abs(pc)<0.1?'ok':Math.abs(pc)<0.25?'warn':'bad';
        return `<tr><td class="lb">${esc(s.name)}</td><td class="n">${F.p(s.mix,0)}</td>
          <td class="n calc">${F.n(tWins,1)}</td><td class="n calc">${F.mk(tAcv)}</td>
          <td class="n calc">${F.n(bWins,1)}</td><td class="n calc">${F.mk(bAcv)}</td>
          <td class="n" style="color:${gap<0?'var(--bad)':'var(--ok)'}">${F.n(gap,1)}</td>
          <td><span class="pill ${st}">${st==='ok'?'Balanced':st==='warn'?'Watch':'Imbalanced'}</span></td></tr>`;}).join('')}
      <tr class="tot"><td>Total</td><td class="n">${F.p(streamMixTotal(),0)}</td>
        <td class="n">${F.n(d.winTarget*streamMixTotal(),1)}</td><td class="n">${F.mk(d.winTarget*streamMixTotal()*blendedDeal())}</td>
        <td class="n">${F.n(bot[exitGate().id]*streamMixTotal(),1)}</td><td class="n">${F.mk(bot[exitGate().id]*streamMixTotal()*blendedDeal())}</td>
        <td class="n"></td><td></td></tr>
      </tbody></table></div></div>`;
}
function planStreamcmpWidgetChart(){
  const d=CFG.drivers,m=verMult()*segBlend();
  return `<div class="card"><h3>Wins by stream — both directions</h3><div class="bd">
      ${svgLines(S().map(s=>s.name),[
        {k:'Top-down',v:S().map(s=>d.winTarget*s.mix)},
        {k:'Bottom-up',v:S().map(s=>forward(d.bottomUpLeads*s.mix,m)[exitGate().id]),dash:true}],{h:220})}
      <div class="lgd"><span><i style="background:${SER[0]}"></i>Top-down</span><span><i style="background:${SER[1]}"></i>Bottom-up</span></div>
    </div></div>`;
}
function planRecWidgetKpis(){
  const d=CFG.drivers,m=verMult()*segBlend();
  const top=backward(d.winTarget,m), bot=forward(d.bottomUpLeads,m);
  const gapWin=bot[exitGate().id]-d.winTarget, gapPct=d.winTarget?gapWin/d.winTarget:0;
  const needed=top[entryGate().id], have=d.bottomUpLeads, entryGap=have-needed;
  return `<div class="kpis">
      <div class="kpi"><div class="k">${esc(entryGate().name)} required</div><div class="kpi-v">${F.n(needed)}</div><div class="sub">top-down</div></div>
      <div class="kpi"><div class="k">${esc(entryGate().name)} available</div><div class="kpi-v">${F.n(have)}</div><div class="sub">bottom-up</div></div>
      <div class="kpi ${entryGap<0?'':'hl'}"><div class="k">Entry gap</div><div class="kpi-v" style="color:${entryGap<0?'var(--bad)':'var(--ok)'}">${F.n(entryGap)}</div><div class="sub">${F.sp(needed?entryGap/needed:0,1)}</div></div>
      <div class="kpi"><div class="k">${esc(exitGate().name)} target</div><div class="kpi-v">${F.n(d.winTarget)}</div><div class="sub">top-down</div></div>
      <div class="kpi"><div class="k">${esc(exitGate().name)} delivered</div><div class="kpi-v">${F.n(bot[exitGate().id],1)}</div><div class="sub">bottom-up</div></div>
      <div class="kpi ${gapWin<0?'':'hl'}"><div class="k">${esc(exitGate().name)} gap</div><div class="kpi-v" style="color:${gapWin<0?'var(--bad)':'var(--ok)'}">${F.n(gapWin,1)}</div><div class="sub">${F.sp(gapPct,1)}</div></div>
    </div>`;
}
function planRecWidgetTable(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend();
  const top=backward(d.winTarget,m), bot=forward(d.bottomUpLeads,m);
  return `<div class="card"><h3>Top-down vs bottom-up by gate</h3><div class="bd flush"><table><thead><tr>
      <th>Gate</th><th class="n">Top-down</th><th class="n">Bottom-up</th><th class="n">Gap</th><th class="n">Gap %</th><th>Status</th></tr></thead><tbody>
      ${c.map(g=>{const t=top[g.id],b=bot[g.id],gp=b-t,pc=t?gp/t:0;
        const st=Math.abs(pc)<0.05?'ok':Math.abs(pc)<0.2?'warn':'bad';
        return `<tr><td class="lb">${esc(g.name)}</td><td class="n calc">${F.n(t)}</td><td class="n calc">${F.n(b,1)}</td>
          <td class="n" style="color:${gp<0?'var(--bad)':'var(--ok)'}">${F.n(gp,1)}</td>
          <td class="n">${F.sp(pc,1)}</td><td><span class="pill ${st}">${st==='ok'?'In tolerance':st==='warn'?'Review':'Breach'}</span></td></tr>`;}).join('')}
      </tbody></table></div></div>`;
}
function planRecWidgetChart(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend();
  const top=backward(d.winTarget,m), bot=forward(d.bottomUpLeads,m);
  return `<div class="card"><h3>Gate comparison</h3><div class="bd">
      ${svgLines(c.map(g=>g.name),[{k:'Top-down',v:c.map(g=>top[g.id])},{k:'Bottom-up',v:c.map(g=>bot[g.id]),dash:true}],{h:220})}
      <div class="lgd"><span><i style="background:${SER[0]}"></i>Top-down</span><span><i style="background:${SER[1]}"></i>Bottom-up</span></div>
    </div></div>`;
}
function planPhaseWidgetTable(){
  const d=CFG.drivers,m=verMult()*segBlend();
  const gr=UI.grain, buckets = gr==='Month'?12:gr==='Quarter'?4:gr==='Half'?2:1;
  const idx=[]; for(let i=0;i<12;i++) idx.push(CFG.seasonality[i]);
  const grp=[];
  for(let b=0;b<buckets;b++){
    const per=12/buckets, sl=idx.slice(b*per,(b+1)*per);
    grp.push({k: gr==='Month'?new Date(2000,(CFG.time.fyStartMonth-1+b)%12,1).toLocaleDateString('en-AU',{month:'short'})
                : gr==='Quarter'?'Q'+(b+1) : gr==='Half'?'H'+(b+1) : UI.fy,
              w: sum(sl)/12});
  }
  const tw=sum(grp.map(g=>g.w));
  return `<div class="card"><h3>Phased plan — ${esc(UI.fy)} · ${esc(gr)}</h3><div class="bd flush"><table><thead><tr>
      <th>Period</th><th class="n">Weight</th>${gTh()}<th class="n">ACV</th><th class="n">Entry lead-time</th></tr></thead><tbody>
      ${grp.map(p=>{const v=backward(d.winTarget*(p.w/tw),m);
        const lag=sum(chain().map(g=>CFG.velocity[g.id]||0));
        return `<tr><td class="lb">${esc(p.k)}</td><td class="n">${F.p(p.w/tw,1)}</td>${gTd(v)}
          <td class="n calc">${F.mk(d.winTarget*(p.w/tw)*blendedDeal())}</td>
          <td class="n calc">${lag} days</td></tr>`;}).join('')}
      <tr class="tot"><td>Total</td><td class="n">100%</td>${gTd(backward(d.winTarget,m))}
        <td class="n">${F.mk(d.winTarget*blendedDeal())}</td><td class="n"></td></tr>
      </tbody></table></div></div>`;
}
function planPhaseWidgetChart(){
  const d=CFG.drivers;
  const gr=UI.grain, buckets = gr==='Month'?12:gr==='Quarter'?4:gr==='Half'?2:1;
  const idx=[]; for(let i=0;i<12;i++) idx.push(CFG.seasonality[i]);
  const grp=[];
  for(let b=0;b<buckets;b++){
    const per=12/buckets, sl=idx.slice(b*per,(b+1)*per);
    grp.push({k: gr==='Month'?new Date(2000,(CFG.time.fyStartMonth-1+b)%12,1).toLocaleDateString('en-AU',{month:'short'})
                : gr==='Quarter'?'Q'+(b+1) : gr==='Half'?'H'+(b+1) : UI.fy,
              w: sum(sl)/12});
  }
  const tw=sum(grp.map(g=>g.w));
  return `<div class="card"><h3>Seasonality applied</h3><div class="bd">
      ${svgBars(grp.map(p=>({k:p.k,v:d.winTarget*(p.w/tw)})),{h:200,dec:1})}</div></div>`;
}
window.planTopWidgetKpis=planTopWidgetKpis;
window.planTopWidgetFunnel=planTopWidgetFunnel;
window.planTopWidgetByStream=planTopWidgetByStream;
window.planTopWidgetWaterfall=planTopWidgetWaterfall;
window.planBotWidgetKpis=planBotWidgetKpis;
window.planBotWidgetEntryVolume=planBotWidgetEntryVolume;
window.planBotWidgetDelivers=planBotWidgetDelivers;
window.planBotWidgetWaterfall=planBotWidgetWaterfall;
window.planStreamcmpWidgetTable=planStreamcmpWidgetTable;
window.planStreamcmpWidgetChart=planStreamcmpWidgetChart;
window.planRecWidgetKpis=planRecWidgetKpis;
window.planRecWidgetTable=planRecWidgetTable;
window.planRecWidgetChart=planRecWidgetChart;
window.planPhaseWidgetTable=planPhaseWidgetTable;
window.planPhaseWidgetChart=planPhaseWidgetChart;
function pagePlan(){
  if(calcBlocked()) return blockedPanel('Planning engine');
  const d=CFG.drivers,m=verMult()*segBlend();
  const bot=forward(d.bottomUpLeads,m);
  let h=`<div class="phead"><div><h1>Planning engine</h1>
    <p>Top-down works up from the ${esc(exitGate().name)} target. Bottom-up works down from ${esc(entryGate().name)} volume. Reconciliation reports the gap rather than hiding it.</p></div></div>`;
  h+=`<div class="tabs">
    <button class="tab ${UI.planTab==='top'?'on':''}" onclick="go('plan','top')">Top-down</button>
    <button class="tab ${UI.planTab==='bot'?'on':''}" onclick="go('plan','bot')">Bottom-up</button>
    <button class="tab ${UI.planTab==='streamcmp'?'on':''}" onclick="go('plan','streamcmp')">Compare by stream</button>
    <button class="tab ${UI.planTab==='rec'?'on':''}" onclick="go('plan','rec')">Reconciliation</button>
    <button class="tab ${UI.planTab==='phase'?'on':''}" onclick="go('plan','phase')">Time phasing</button></div>`;

  const gridPageId='plan_'+UI.planTab;
  const gridBoxOrder={
    top:['box1','box2','box3','box4'],
    bot:['box1','box2','box3','box4'],
    streamcmp:['box1','box2'],
    rec:['box1','box2','box3'],
    phase:['box1','box2']
  }[UI.planTab]||[];
  const gridBoxSizes={
    top:{box1:12,box2:12,box3:12,box4:12},
    bot:{box1:12,box2:4,box3:8,box4:12},
    streamcmp:{box1:12,box2:12},
    rec:{box1:12,box2:12,box3:12},
    phase:{box1:12,box2:12}
  }[UI.planTab]||{};
  const gridWidgetFns={
    top:{kpis:planTopWidgetKpis,funnel:planTopWidgetFunnel,bystream:planTopWidgetByStream,waterfall:planTopWidgetWaterfall},
    bot:{kpis:planBotWidgetKpis,entryvolume:planBotWidgetEntryVolume,delivers:planBotWidgetDelivers,waterfall:planBotWidgetWaterfall},
    streamcmp:{table:planStreamcmpWidgetTable,chart:planStreamcmpWidgetChart},
    rec:{kpis:planRecWidgetKpis,table:planRecWidgetTable,chart:planRecWidgetChart},
    phase:{table:planPhaseWidgetTable,chart:planPhaseWidgetChart}
  }[UI.planTab]||{};
  const gridDefaults={
    top:{box1:'kpis',box2:'funnel',box3:'bystream',box4:'waterfall'},
    bot:{box1:'kpis',box2:'entryvolume',box3:'delivers',box4:'waterfall'},
    streamcmp:{box1:'table',box2:'chart'},
    rec:{box1:'kpis',box2:'table',box3:'chart'},
    phase:{box1:'table',box2:'chart'}
  }[UI.planTab]||{};

  if(UI.planTab==='streamcmp'){
    h+=`<div class="note"><strong>Both directions, one page, by stream.</strong> Top-down asks what each stream's share of the
      ${esc(exitGate().name)} target requires. Bottom-up asks what each stream's share of available ${esc(entryGate().name)} volume
      delivers. Put side by side, a stream that looks fine in Reconciliation's totals can still be badly out of balance here.</div>`;
  }
  if(UI.planTab==='rec'){
    const gapWin=bot[exitGate().id]-d.winTarget, gapPct=d.winTarget?gapWin/d.winTarget:0;
    h+=`<div class="note ${Math.abs(gapPct)<0.05?'g':'b'}"><strong>Reconciliation is a control, not a chart.</strong>
      Bottom-up delivers ${F.n(bot[exitGate().id],1)} ${esc(exitGate().name)} against a ${F.n(d.winTarget)} target —
      a gap of ${F.n(gapWin,1)} (${F.sp(gapPct,1)}). ${Math.abs(gapPct)<0.05?'Within the 5% tolerance.':'Outside tolerance. This must be closed or explained before publish.'}</div>`;
  }
  if(UI.planTab==='phase'){
    const gr=UI.grain;
    h+=`<div class="note"><strong>Time phasing applies the seasonality index.</strong> Grain is <b>${gr}</b> —
      change it in the top bar. Volumes are phased, not divided evenly, and the lag column shows when the entry
      activity has to happen to land the win in that period.</div>`;
  }

  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments(gridPageId):gridDefaults);
  const containerId='ordo-grid-plan-'+UI.planTab;
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
