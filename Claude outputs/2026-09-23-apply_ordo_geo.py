import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageGeo(){\n"
end_marker = "\n/* ============================================================================\n   MODULE 4 — SEGMENT & AUDIENCE"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageGeo(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Scope isolation active" in old_block, "scope isolation note missing"
assert "Gap analysis by region" in old_block, "gap analysis card missing"
assert "Region × stream funnel" in old_block, "stream funnel card missing"
assert "Pod breakdown" in old_block, "pod breakdown card missing"
assert "Rate override" in old_block, "rate override card missing"
assert "Stream mix override" in old_block, "stream mix override card missing"
assert "Rep breakdown" in old_block, "rep breakdown card missing"

new_block = '''function geoWidgetKpis(){
  const d=CFG.drivers,vis=visibleRegions(),deal=blendedDeal();
  const totAe=sum(vis.map(r=>r.aeHeads)),totAcv=sum(vis.map(r=>r.acvTarget));
  return `<div class="kpis">
    <div class="kpi hl"><div class="k">ACV target</div><div class="kpi-v">${F.mk(totAcv)}</div><div class="sub">${vis.length} regions</div></div>
    <div class="kpi"><div class="k">Projected revenue</div><div class="kpi-v">${F.mk(d.projectedRevenue)}</div><div class="sub">driver</div></div>
    <div class="kpi"><div class="k">Variance</div><div class="kpi-v" style="color:${totAcv>d.projectedRevenue?'var(--bad)':'var(--ok)'}">${F.sp(d.projectedRevenue?(totAcv-d.projectedRevenue)/d.projectedRevenue:0,1)}</div><div class="sub">target vs projected</div></div>
    <div class="kpi"><div class="k">AE headcount</div><div class="kpi-v">${F.n(totAe)}</div><div class="sub">across scope</div></div>
    <div class="kpi"><div class="k">ACV per AE</div><div class="kpi-v">${F.mk(totAe?totAcv/totAe:0)}</div><div class="sub">quota implied</div></div>
    <div class="kpi"><div class="k">Wins needed</div><div class="kpi-v">${F.n(totAcv/deal,0)}</div><div class="sub">at ${F.mk(deal)} blended</div></div>
  </div>`;
}
function geoWidgetGapAnalysis(){
  const c=chain(),d=CFG.drivers,m=verMult()*segBlend(),vis=visibleRegions(),deal=blendedDeal();
  const totAe=sum(vis.map(r=>r.aeHeads)),totAcv=sum(vis.map(r=>r.acvTarget));
  let h=`<div class="card"><h3>Gap analysis by region</h3><div class="bd flush"><div class="scroll"><table><thead><tr>
    <th>Region</th><th class="n">AE</th><th class="n">ACV target</th><th class="n">Wins needed</th>
    ${gTh()}<th class="n">Demand potential</th><th class="n">Variance</th><th>Status</th></tr></thead><tbody>`;
  let acc={}; c.forEach(g=>acc[g.id]=0); let accPot=0;
  vis.forEach(r=>{
    const wins=r.acvTarget/deal, v=backward(wins,m,r.id);
    const pot=v[exitGate().id]*deal, varr=r.acvTarget?(pot-r.acvTarget)/r.acvTarget:0;
    c.forEach(g=>acc[g.id]+=v[g.id]); accPot+=pot;
    const st=varr<-0.1?'bad':varr<0?'warn':'ok';
    h+=`<tr><td class="lb">${esc(r.name)}${regionHasOverrides(r.id)?' <span class="pill n" title="This region has its own gate rates">own rates</span>':''}</td><td class="n">${r.aeHeads}</td>
      <td class="n"><input class="cel" value="${r.acvTarget}" ${canWriteRegion(r.id)&&!readOnly()?'':'disabled'} onchange="setIn('regions','${r.id}','acvTarget',this.value,'money')"></td>
      <td class="n calc">${F.n(wins,0)}</td>${gTd(v)}
      <td class="n calc">${F.mk(pot)}</td>
      <td class="n" style="color:${varr<0?'var(--bad)':'var(--ok)'}">${F.sp(varr,1)}</td>
      <td><span class="pill ${st}">${st==='ok'?'Achievable':st==='warn'?'Tight':'Short'}</span></td></tr>`;
  });
  h+=`<tr class="tot"><td>Total</td><td class="n">${F.n(totAe)}</td><td class="n">${F.mk(totAcv)}</td>
    <td class="n">${F.n(totAcv/deal,0)}</td>${gTd(acc)}<td class="n">${F.mk(accPot)}</td>
    <td class="n">${F.sp(totAcv?(accPot-totAcv)/totAcv:0,1)}</td><td></td></tr>`;
  h+=`</tbody></table></div></div></div>`;
  return h;
}
function geoWidgetStreamFunnel(){
  const c=chain(),m=verMult()*segBlend(),vis=visibleRegions(),deal=blendedDeal();
  let h=`<div class="card"><h3>Region × stream funnel</h3><div class="bd"><div class="mini">Each region's demand potential,
    split by stream using that region's own stream mix where it has one, the global mix otherwise — crossed with every gate,
    not just the entry gate. Edit a region's own stream mix below, under its Pod breakdown.</div></div>
    <div class="bd flush"><div class="scroll"><table><thead><tr><th>Region / stream</th><th class="n">Mix</th>
      <th class="n">Wins</th>${gTh()}<th class="n">ACV</th></tr></thead><tbody>
    ${(()=>{
      const rows=[];
      vis.forEach(r=>{
        rows.push({group:r.name+(regionStreamsHaveOverrides(r.id)?' — own stream mix':'')});
        const wins=r.acvTarget/deal;
        effectiveRegionStreams(r.id).forEach(x=>{
          const v=backward(wins*x.mix,m,r.id);
          rows.push({stream:x.stream,mix:x.mix,override:x.override,v:v,acv:wins*x.mix*deal});
        });
      });
      return rows.map(row=>{
        if(row.group) return `<tr class="gp"><td colspan="${c.length+4}">${esc(row.group)}</td></tr>`;
        return `<tr><td class="lb">${esc(row.stream.name)}${row.override?' <span class="pill n">override</span>':''}</td>
          <td class="n">${F.p(row.mix,0)}</td><td class="n calc">${F.n(row.v[exitGate().id],1)}</td>${gTd(row.v)}
          <td class="n calc">${F.mk(row.acv)}</td></tr>`;
      }).join('');
    })()}
    </tbody></table></div></div></div>`;
  return h;
}
function geoWidgetWinsChart(){
  const vis=visibleRegions(),deal=blendedDeal();
  return `<div class="card"><h3>Wins needed by region</h3><div class="bd">
      ${svgBars(vis.map(r=>({k:r.name,v:r.acvTarget/deal,k2:F.n(r.aeHeads)+' AE'})),{h:200})}</div></div>`;
}
function geoWidgetAcvChart(){
  const vis=visibleRegions();
  return `<div class="card"><h3>ACV target vs demand potential</h3><div class="bd">
      ${svgStack(vis.map(r=>r.name),[{k:'Target',v:vis.map(r=>r.acvTarget)}],{money:true,h:200})}
      <div class="lgd"><span><i style="background:${SER[0]}"></i>ACV target by region</span></div></div></div>`;
}
function geoWidgetPodBreakdown(){
  const m=verMult()*segBlend(),vis=visibleRegions(),deal=blendedDeal();
  const rSel=vis.find(r=>r.id===UI.regionId)||vis[0];
  if(!rSel) return '<div class="card"><div class="bd"><div class="empty">No regions visible.</div></div></div>';
  UI.regionId=rSel.id;
  const pods=P(rSel.id),tot=podShareTotal(rSel.id),wins=rSel.acvTarget/deal;
  return `<div class="card"><h3>Pod breakdown <span class="sp"></span>
      <select class="in" style="width:auto" onchange="UI.regionId=this.value;render()">
        ${vis.map(r=>`<option value="${r.id}" ${r.id===rSel.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select>
      <span class="pill ${Math.abs(tot-1)<0.0001?'ok':'bad'}">Allocation ${F.p(tot,0)}</span></h3>
      <div class="bd flush"><table><thead><tr><th>Pod</th><th class="n">Share</th><th></th>
        <th class="n">Wins</th>${gTh()}<th class="n">ACV</th></tr></thead><tbody>
      ${pods.map(p=>{const v=backward(wins*p.share,m,rSel.id);
        return `<tr><td class="lb">${esc(p.name)}</td>
          <td class="n"><input class="cel w" value="${(p.share*100).toFixed(0)}" ${canWriteRegion(rSel.id)&&!readOnly()?'':'disabled'} onchange="setIn('pods','${p.id}','share',this.value,'pct')"></td>
          <td><div class="bar" style="width:90px"><i style="width:${clamp(p.share*100,0,100)}%"></i></div></td>
          <td class="n calc">${F.n(wins*p.share,1)}</td>${gTd(v)}
          <td class="n calc">${F.mk(wins*p.share*deal)}</td></tr>`;}).join('')}
      <tr class="tot"><td>${esc(rSel.name)} total</td><td class="n">${F.p(tot,0)}</td><td></td>
        <td class="n">${F.n(wins*tot,1)}</td>${gTd(backward(wins*tot,m,rSel.id))}<td class="n">${F.mk(wins*tot*deal)}</td></tr>
      </tbody></table></div></div>`;
}
function geoWidgetRateOverride(){
  const c=chain(),vis=visibleRegions();
  const rSel=vis.find(r=>r.id===UI.regionId)||vis[0];
  if(!rSel) return '<div class="card"><div class="bd"><div class="empty">No regions visible.</div></div></div>';
  UI.regionId=rSel.id;
  return `<div class="card"><h3>Rate override — ${esc(rSel.name)} <span class="sp"></span>
      <span class="pill ${regionHasOverrides(rSel.id)?'warn':'n'}">${regionHasOverrides(rSel.id)?'Using its own rates':'Using global rates'}</span></h3>
      <div class="bd"><div class="mini">Blank = this region follows the global rate below (Drivers &rsaquo; Rate library). Type a number to
        override just that gate for ${esc(rSel.name)} — pods and reps in this region inherit it automatically. Clear the box (or use reset)
        to go back to global.</div></div>
      <div class="bd flush"><table><thead><tr><th>Gate</th><th class="n">Global rate</th>
        <th class="n">${esc(rSel.name)} rate</th><th class="n">Delta</th><th></th></tr></thead><tbody>
      ${c.filter(g=>!g.entry).map(g=>{
        const ov=regionGateRateFor(rSel.id,g.id), delta=ov!=null?ov-g.rate:0;
        return `<tr><td class="lb">${esc(g.name)}</td>
          <td class="n calc">${F.p(g.rate,0)}</td>
          <td class="n"><input class="cel w" placeholder="${F.p(g.rate,0)}" value="${ov!=null?(ov*100).toFixed(0):''}"
            ${canWriteRegion(rSel.id)&&!readOnly()?'':'disabled'}
            onchange="setRegionGateRate('${rSel.id}','${g.id}',this.value)"></td>
          <td class="n" style="color:${ov==null?'inherit':delta>0?'var(--ok)':delta<0?'var(--bad)':'inherit'}">${ov!=null?F.sp(delta,0):'—'}</td>
          <td>${ov!=null&&canWriteRegion(rSel.id)&&!readOnly()?`<a href="#" class="mini" onclick="resetRegionGateRate('${rSel.id}','${g.id}');return false;">reset to global</a>`:''}</td></tr>`;
      }).join('')}
      </tbody></table></div></div>`;
}
function geoWidgetStreamMixOverride(){
  const vis=visibleRegions();
  const rSel=vis.find(r=>r.id===UI.regionId)||vis[0];
  if(!rSel) return '<div class="card"><div class="bd"><div class="empty">No regions visible.</div></div></div>';
  UI.regionId=rSel.id;
  return `<div class="card"><h3>Stream mix override — ${esc(rSel.name)} <span class="sp"></span>
      <span class="pill ${Math.abs(regionStreamMixTotal(rSel.id)-1)<0.0001?'ok':'warn'}">${esc(rSel.name)} mix totals ${F.p(regionStreamMixTotal(rSel.id),0)}</span></h3>
      <div class="bd"><div class="mini">Blank = this region follows the global stream mix below (Admin &rsaquo; Streams). Type a number to override
        just that stream for ${esc(rSel.name)} — feeds the Region × stream funnel above (pod and rep breakdowns stay by geography, not by
        stream). Unlike the global mix, a region total off 100% is shown here, not blocked — useful mid-edit, worth fixing before you rely on the numbers.</div></div>
      <div class="bd flush"><table><thead><tr><th>Stream</th><th class="n">Global mix</th>
        <th class="n">${esc(rSel.name)} mix</th><th></th></tr></thead><tbody>
      ${S().map(s=>{
        const ov=regionStreamMixFor(rSel.id,s.id);
        return `<tr><td class="lb">${esc(s.name)}</td>
          <td class="n calc">${F.p(s.mix,0)}</td>
          <td class="n"><input class="cel w" placeholder="${F.p(s.mix,0)}" value="${ov!=null?(ov*100).toFixed(0):''}"
            ${canWriteRegion(rSel.id)&&!readOnly()?'':'disabled'}
            onchange="setRegionStreamMix('${rSel.id}','${s.id}',this.value)"></td>
          <td>${ov!=null&&canWriteRegion(rSel.id)&&!readOnly()?`<a href="#" class="mini" onclick="resetRegionStreamMix('${rSel.id}','${s.id}');return false;">reset to global</a>`:''}</td></tr>`;
      }).join('')}
      </tbody></table></div></div>`;
}
function geoWidgetRepBreakdown(){
  const m=verMult()*segBlend(),vis=visibleRegions(),deal=blendedDeal();
  const rSel=vis.find(r=>r.id===UI.regionId)||vis[0];
  if(!rSel) return '<div class="card"><div class="bd"><div class="empty">No regions visible.</div></div></div>';
  UI.regionId=rSel.id;
  const pods=P(rSel.id),wins=rSel.acvTarget/deal;
  const pSel = pods.find(p=>p.id===UI.repPodId) || pods[0];
  if(!pSel) return '<div class="card"><div class="bd"><div class="empty">No pods in this region yet.</div></div></div>';
  UI.repPodId=pSel.id;
  const reps=REP(pSel.id), repTot=repShareTotal(pSel.id), podWins=wins*pSel.share;
  let h=`<div class="card"><h3>Rep breakdown <span class="sp"></span>
        <select class="in" style="width:auto" onchange="UI.repPodId=this.value;render()">
          ${pods.map(p=>`<option value="${p.id}" ${p.id===pSel.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
        ${reps.length?`<span class="pill ${Math.abs(repTot-1)<0.0001?'ok':'bad'}">Allocation ${F.p(repTot,0)}</span>`:''}</h3>`;
  if(!reps.length){
    h+=`<div class="bd"><div class="empty">No reps added under ${esc(pSel.name)} yet — add one in Admin &rsaquo; Geography to split its
      ${F.n(podWins,1)} wins by name.</div></div>`;
  } else {
    h+=`<div class="bd flush"><table><thead><tr><th>Rep</th><th class="n">Share of pod</th><th></th>
      <th class="n">Wins</th>${gTh()}<th class="n">ACV</th></tr></thead><tbody>
    ${reps.map(x=>{const v=backward(podWins*x.share,m,rSel.id);
      return `<tr><td class="lb">${esc(x.name)}</td>
        <td class="n"><input class="cel w" value="${(x.share*100).toFixed(0)}" ${canWriteRegion(rSel.id)&&!readOnly()?'':'disabled'} onchange="setIn('reps','${x.id}','share',this.value,'pct')"></td>
        <td><div class="bar" style="width:90px"><i style="width:${clamp(x.share*100,0,100)}%"></i></div></td>
        <td class="n calc">${F.n(podWins*x.share,1)}</td>${gTd(v)}
        <td class="n calc">${F.mk(podWins*x.share*deal)}</td></tr>`;}).join('')}
    <tr class="tot"><td>${esc(pSel.name)} total</td><td class="n">${F.p(repTot,0)}</td><td></td>
      <td class="n">${F.n(podWins*repTot,1)}</td>${gTd(backward(podWins*repTot,m,rSel.id))}<td class="n">${F.mk(podWins*repTot*deal)}</td></tr>
    </tbody></table></div>`;
    h+=`<div class="bd"><div class="mini">Rolls up: rep shares of pod → pod share of region (above) → region ACV target
      (top of page). Change any share and every level above recalculates — nothing here is a separate, disconnected number.</div></div>`;
  }
  h+=`</div>`;
  return h;
}
window.geoWidgetKpis=geoWidgetKpis;
window.geoWidgetGapAnalysis=geoWidgetGapAnalysis;
window.geoWidgetStreamFunnel=geoWidgetStreamFunnel;
window.geoWidgetWinsChart=geoWidgetWinsChart;
window.geoWidgetAcvChart=geoWidgetAcvChart;
window.geoWidgetPodBreakdown=geoWidgetPodBreakdown;
window.geoWidgetRateOverride=geoWidgetRateOverride;
window.geoWidgetStreamMixOverride=geoWidgetStreamMixOverride;
window.geoWidgetRepBreakdown=geoWidgetRepBreakdown;
function pageGeo(){
  if(calcBlocked()) return blockedPanel('Geography & pods');
  const vis=visibleRegions();
  let h=`<div class="phead"><div><h1>Geography &amp; pods</h1>
    <p>Region and pod funnels, plus the gap between ACV target and the demand the funnel can actually produce.</p></div>
    <div class="sp"></div><span class="pill ${vis.length<R().length?'warn':'n'}">${vis.length} of ${R().length} regions visible to ${esc(user().name)}</span></div>`;
  if(vis.length<R().length) h+=`<div class="note w"><strong>Scope isolation active.</strong>
    ${esc(user().name)} is a ${esc(roleName())} with cross-region visibility off, so only
    ${vis.map(r=>esc(r.name)).join(', ')} resolves. Switch the Role selector to compare.</div>`;
  h+=`<div class="note"><strong>Sign convention.</strong> Variance is <em>(demand potential − ACV target) ÷ ACV target</em>.
    Negative means the funnel cannot produce the target — that is the risk case, shown red.
    The spreadsheet version had this the other way round.</div>`;

  const rSel=vis.find(r=>r.id===UI.regionId)||vis[0];
  const pods=rSel?P(rSel.id):[];
  const pSel=pods.find(p=>p.id===UI.repPodId)||pods[0];

  const geoBoxOrder=['box1','box2','box3','box4','box5']
    .concat(rSel?['box6','box7','box8']:[])
    .concat(pSel?['box9']:[]);
  const geoBoxSizes={box1:12,box2:12,box3:12,box4:6,box5:6,box6:12,box7:12,box8:12,box9:12};
  const geoWidgetFns={
    kpis:geoWidgetKpis,
    gapanalysis:geoWidgetGapAnalysis,
    streamfunnel:geoWidgetStreamFunnel,
    winschart:geoWidgetWinsChart,
    acvchart:geoWidgetAcvChart,
    podbreakdown:geoWidgetPodBreakdown,
    rateoverride:geoWidgetRateOverride,
    streammixoverride:geoWidgetStreamMixOverride,
    repbreakdown:geoWidgetRepBreakdown
  };
  const geoDefaults={box1:'kpis',box2:'gapanalysis',box3:'streamfunnel',box4:'winschart',box5:'acvchart',box6:'podbreakdown',box7:'rateoverride',box8:'streammixoverride',box9:'repbreakdown'};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('geo'):geoDefaults);

  h+=`<div class="grid-stack" id="ordo-grid-geo">`;
  geoBoxOrder.forEach(boxId=>{
    const widgetId=assigned[boxId]||geoDefaults[boxId];
    const fn=geoWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${geoBoxSizes[boxId]}" gs-id="${boxId}">
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
