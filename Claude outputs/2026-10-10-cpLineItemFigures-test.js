const {chromium}=require('playwright'); const fs=require('fs');
const src=fs.readFileSync('/mnt/user-data/uploads/Northm/CampaignPlanning.html.new','utf8');
const a=src.indexOf('const LI={rows:[]'); const b0=src.indexOf('async function liLoad(scope)'); const b=src.indexOf('\n}\n',b0)+3; const BLOCK=src.slice(a,b);
let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)f++};
ok(a>0&&b0>a&&b>b0,'extracted the real helper block');
(async()=>{ const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const pg=await br.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.setContent('<!doctype html><html><body><div id="main">x</div><div id="d"></div></body></html>');
 await pg.addScriptTag({path:'/home/claude/li/lineItemRollup.js'});
 await pg.addScriptTag({content:`
  const F={mk:v=>'$'+Math.round(v)}; const sum=a=>a.reduce((x,y)=>x+y,0); const byId=(l,id)=>l.find(x=>x.id===id);
  const CFG={campaigns:[{id:'c1',budget:5000},{id:'c2',budget:0}],tasks:[
    {id:'t1',campaignId:'c1',plannedCost:50,committedCost:9999,actualCost:9999},{id:'t2',campaignId:'c1',plannedCost:70,committedCost:250,actualCost:80},{id:'t3',campaignId:'c2',plannedCost:5,committedCost:5,actualCost:5}]};
  const UI={detail:null}; const TASK=cid=>CFG.tasks.filter(t=>t.campaignId===cid);
  function taskPlannedCostMain(t){ return t.plannedCost||0; } function render(){ window.__rn=(window.__rn||0)+1; }
  ${BLOCK}
  window.__t={tkInner,tasksTotal,taskFig,taskFromLines,campFigs,campAllocHtml,paintDetailCosts,liOnRows,liLoad,get LI(){return LI},CFG,UI};
 `});
 const run=(fn,...a)=>pg.evaluate(fn,...a);
 // before load: typed behaviour exactly as today
 let h=await run(()=>__t.tkInner(__t.CFG.tasks[0],'committedCost','in'));
 ok(/<input class="in" value="9999" onchange="setIn\('tasks','t1','committedCost',this.value,'money'\)">/.test(h)&&!/readonly/.test(h),'no lines: box is the same editable input as before');
 ok(await run(()=>__t.tasksTotal('c1','committedCost'))===10249,'no lines: campaign total = typed sums (9999+250)');
 ok(await run(()=>__t.campAllocHtml(__t.CFG.campaigns[0]))==='','no lines: no Allocated tile');
 // load lines through the real liLoad with a fake query
 const lines=[{id:'a',parent_type:'task',parent_id:'t1',planned_amount:1000,committed_amount:600,actual_amount:100},{id:'b',parent_type:'campaign',parent_id:'c1',committed_amount:400,planned_amount:2000,approved_amount:1800}];
 await pg.evaluate(async lines=>{ const mkq=rows=>{ let lo=0,hi=1e9; const q={select(){return q},order(){return q},range(x,y){lo=x;hi=y;return q},then(res){res({data:rows.slice(lo,hi+1)})}}; return q; };
   window.__sb={from:()=>mkq(lines)}; sb=undefined; }, lines).catch(()=>{});
 await pg.evaluate(async lines=>{ const mkq=rows=>{ let lo=0,hi=1e9; const q={select(){return q},order(){return q},range(x,y){lo=x;hi=y;return q},then(res){res({data:rows.slice(lo,hi+1)})}}; return q; };
   globalThis.sb={from:()=>mkq(lines)}; await __t.liLoad(q=>q); },lines);
 ok(await run(()=>__t.LI.loaded&&__t.LI.rows.length===2)&&await run(()=>window.__rn===1),'liLoad reads the lines and re-renders once');
 h=await run(()=>__t.tkInner(__t.CFG.tasks[0],'committedCost','in'));
 ok(/value="600" readonly/.test(h)&&/from line items/.test(h)&&!/onchange/.test(h),'activity with a Committed line: read-only, shows 600, labelled "from line items"');
 h=await run(()=>__t.tkInner(__t.CFG.tasks[0],'plannedCost','in')); ok(/value="1000" readonly/.test(h),'Planned from lines (1000, not typed 50)');
 h=await run(()=>__t.tkInner(__t.CFG.tasks[1],'committedCost','in')); ok(/value="250"/.test(h)&&!/readonly/.test(h),'activity without lines stays editable');
 h=await run(()=>__t.tkInner(__t.CFG.tasks[0],'plannedCost','cel')); ok(/from lines/.test(h),'table cell uses the short label');
 ok(await run(()=>__t.tasksTotal('c1','committedCost'))===600+250+400,'campaign Committed = 600 (t1 lines) + 250 (t2 typed) + 400 (campaign line)');
 ok(await run(()=>__t.tasksTotal('c1','actualCost'))===100+80,'campaign Actual = 100 + 80');
 ok(await run(()=>__t.tasksTotal('c2','committedCost'))===5,'a campaign with no lines is unchanged');
 ok(await run(()=>__t.taskFig(__t.CFG.tasks[0],'plannedCost',true))===1000,'exports: raw planned from lines');
 h=await run(()=>__t.campAllocHtml(__t.CFG.campaigns[0])); ok(/Allocated by line items/.test(h)&&/\$2800/.test(h)&&/\$2200 left of \$5000/.test(h),'Allocated tile: $2800 (campaign line 1800 approved + activity 1000 planned), $2200 left of the $5000 envelope');
 await run(()=>{ __t.CFG.campaigns[0].budget=1000; }); h=await run(()=>__t.campAllocHtml(__t.CFG.campaigns[0])); ok(/\$1800 over \$1000/.test(h),'over the envelope is shown as over');
 await run(()=>{ __t.CFG.campaigns[0].budget=0; }); h=await run(()=>__t.campAllocHtml(__t.CFG.campaigns[0])); ok(/no Budget entered above/.test(h),'no envelope typed: says so');
 await run(()=>{ __t.CFG.campaigns[0].budget=5000; });
 // in-place repaint
 await pg.evaluate(()=>{ document.getElementById('d').innerHTML='<span id="tkBox_plannedCost"></span><span id="tkBox_committedCost"></span><span id="tkBox_actualCost"></span><div id="cK_committed"></div><div id="cK_actual"></div><span id="cK_alloc"></span>'; __t.UI.detail={kind:'activity',id:'t2'}; });
 await run(()=>__t.liOnRows([{id:'z',parent_type:'task',parent_id:'t2',committed_amount:900}],'task','t2'));
 ok(await run(()=>/value="900" readonly/.test(document.getElementById('tkBox_committedCost').innerHTML)),'adding a line to t2 repaints its Committed box in place (900, read-only)');
 ok(await run(()=>/value="80"/.test(document.getElementById('tkBox_actualCost').innerHTML)&&!/readonly/.test(document.getElementById('tkBox_actualCost').innerHTML)),'its Actual box (no actual line) stays typed');
 await run(()=>{ __t.UI.detail={kind:'campaign',id:'c1'}; __t.paintDetailCosts(); });
 ok(await run(()=>document.getElementById('cK_committed').textContent)==='$'+(600+900+400),'campaign tile Committed repainted: 600 + 900 + 400');
 ok(/Allocated/.test(await run(()=>document.getElementById('cK_alloc').innerHTML)),'Allocated tile appears');
 await run(()=>__t.liOnRows([],'task','t2')); await run(()=>{ __t.UI.detail={kind:'activity',id:'t2'}; __t.paintDetailCosts(); });
 ok(/value="250"/.test(await run(()=>document.getElementById('tkBox_committedCost').innerHTML)),'deleting the line returns the box to its typed 250');
 // guard: panel reports before the page loaded the lines -> ignored (would otherwise build a partial index)
 await run(()=>{ __t.LI.loaded=false; __t.LI.idx=null; __t.LI.rows=[]; });
 await run(()=>__t.liOnRows([{id:'q',parent_type:'task',parent_id:'t1',committed_amount:1}],'task','t1')); ok(await run(()=>__t.LI.idx===null),'rows reported before the initial load are ignored');
 // errors / paging
 await pg.evaluate(async()=>{ globalThis.sb={from:()=>({select(){return this},order(){return this},range(){return this},then(res){res({error:{message:'x'}})}})}; window.__rn=0; await __t.liLoad(q=>q); });
 ok(await run(()=>__t.LI.idx===null&&window.__rn===0),'query error: nothing changes, no render, no throw');
 await pg.evaluate(async()=>{ const many=[]; for(let i=0;i<2500;i++) many.push({id:'i'+String(i).padStart(5,'0'),parent_type:'campaign',parent_id:'c1',actual_amount:1});
   globalThis.sb={from:()=>{ let lo=0,hi=1e9; const q={select(){return q},order(){return q},range(x,y){lo=x;hi=y;return q},then(res){res({data:many.slice(lo,hi+1)})}}; return q; }}; await __t.liLoad(q=>q); });
 ok(await run(()=>__t.LI.rows.length)===2500,'2500 lines all read (paged)');
 ok(errs.length===0,'no page errors '+errs.join(';'));
 console.log(f?'FAILED '+f:'ALL PASS'); await br.close(); process.exit(f?1:0); })().catch(e=>{console.error(e);process.exit(2)});
