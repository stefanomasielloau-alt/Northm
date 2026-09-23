import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageSnapshots(){\n"
end_marker = "\n\n\n/* ============================================================================\n   MODULE — DASHBOARD (landing page)"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageSnapshots(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "Save a snapshot" in old_block, "save card missing"
assert "Saved snapshots" in old_block, "saved table missing"
assert "Compare — current plan vs snapshots vs actual" in old_block, "compare card missing"

new_block = '''function snapshotsWidgetSave(){
  const ro=readOnly()?'disabled':'';
  return `<div class="card"><h3>Save a snapshot</h3><div class="bd">
    <div class="row">
      <input class="in" id="snapName" placeholder="e.g. FY27 board-approved plan" style="max-width:340px" ${ro}
        onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('snapBtn').click();}">
      <button class="btn pri" id="snapBtn" ${ro} onclick="
        const el=document.getElementById('snapName'); const n=el.value.trim();
        if(!n){toast('Name it first.');return;} saveSnapshot(n); el.value='';">Save current plan as snapshot</button>
    </div>
    <div class="mini" style="margin-top:6px">Captures every module as it stands right now — drivers, gates, geography,
      segments, activities, campaigns, cost and cost buckets. Reverting swaps all of it back in one step.</div>
  </div></div>`;
}
function snapshotsWidgetSaved(){
  const ro=readOnly()?'disabled':'';
  const sorted=CFG.snapshots.slice().sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  return `<div class="card"><h3>Saved snapshots <span class="sp"></span>
    <span class="pill n">${CFG.snapshots.length} saved</span></h3>
    <div class="bd flush"><div class="scroll cap"><table><thead><tr>
      <th>Name</th><th>Created by</th><th>Timestamp</th><th></th></tr></thead><tbody>
      ${sorted.length?sorted.map(s=>`<tr><td><input class="cel txt" style="width:280px" value="${esc(s.name)}" ${ro}
          onchange="setIn('snapshots','${s.id}','name',this.value)"></td>
        <td>${esc(s.createdBy)}</td><td class="mini">${esc(F.dt(s.timestamp))}</td>
        <td class="n"><button class="btn sm" ${ro} onclick="revertSnapshot('${s.id}')">Revert to this</button>
          <button class="btn sm" onclick="openOverlay('${s.id}')">Overlay &amp; choose changes</button>
          <button class="btn sm dgr" ${ro} onclick="removeSnapshot('${s.id}')">Remove</button></td></tr>`).join('')
        :`<tr><td colspan="4" class="empty">No snapshots yet — save one above.</td></tr>`}
    </tbody></table></div></div></div>`;
}
function snapshotsWidgetCompare(){
  const c=chain(),vis=visibleRegions().map(r=>r.id),m=verMult()*segBlend();
  const current=backward(CFG.drivers.winTarget,m);
  const actualAcc=histSlice({fy:UI.fy,regionIds:vis}).acc;
  const sorted=CFG.snapshots.slice().sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  const compareSet=sorted.slice(0,3);
  const snapVols=compareSet.map(s=>({s:s,vol:snapshotGateVolumes(s)}));
  const gateMismatch=compareSet.some(s=>{
    const sids=(s.data.gates||[]).map(g=>g.id).sort().join(',');
    const cids=CFG.gates.map(g=>g.id).sort().join(',');
    return sids!==cids;
  });
  let h=`<div class="card"><h3>Compare — current plan vs snapshots vs actual</h3>`;
  if(gateMismatch) h+=`<div class="note w"><strong>The gate set has changed since one of these snapshots was saved.</strong>
    Cells that can't be matched to today's gates show <b>—</b> rather than a silent zero.</div>`;
  if(!compareSet.length) h+=`<div class="bd"><div class="empty">Save at least one snapshot above to see a comparison.</div></div>`;
  else h+=`<div class="bd flush"><div class="scroll"><table><thead><tr><th>Gate</th><th class="n">Current plan</th>
      ${snapVols.map(x=>`<th class="n">${esc(x.s.name)}<div class="mini" style="font-weight:400">${esc(F.dt(x.s.timestamp))}</div></th>`).join('')}
      <th class="n">Actual (${esc(UI.fy)})</th></tr></thead><tbody>
      ${c.map(g=>`<tr><td class="lb">${esc(g.name)}</td><td class="n calc">${F.n(current[g.id])}</td>
        ${snapVols.map(x=>`<td class="n calc">${F.n(x.vol?x.vol[g.id]:null)}</td>`).join('')}
        <td class="n calc">${F.n(actualAcc[g.id])}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  h+=`</div>`;
  return h;
}
window.snapshotsWidgetSave=snapshotsWidgetSave;
window.snapshotsWidgetSaved=snapshotsWidgetSaved;
window.snapshotsWidgetCompare=snapshotsWidgetCompare;
function pageSnapshots(){
  if(calcBlocked()) return blockedPanel('Snapshots');

  let h=`<div class="phead"><div><h1>Snapshots</h1>
    <p>Save a named, timestamped copy of the whole plan. Revert to one, or compare it side by side against the
      current plan and actuals — the last three saved snapshots are shown below.</p></div></div>`;

  const snapshotsBoxSizes={box1:12,box2:12,box3:12};
  const snapshotsWidgetFns={save:snapshotsWidgetSave,saved:snapshotsWidgetSaved,compare:snapshotsWidgetCompare};
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('snapshots'):{box1:'save',box2:'saved',box3:'compare'});

  h+=`<div class="grid-stack" id="ordo-grid-snapshots">`;
  ['box1','box2','box3'].forEach(boxId=>{
    const widgetId=assigned[boxId]||boxId;
    const fn=snapshotsWidgetFns[widgetId]||(()=>'<div class="card"><div class="bd">Unknown widget.</div></div>');
    h+=`<div class="grid-stack-item" gs-w="${snapshotsBoxSizes[boxId]}" gs-id="${boxId}">
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
