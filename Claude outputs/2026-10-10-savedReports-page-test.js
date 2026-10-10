const {chromium}=require('playwright'); const fs=require('fs');
const src=fs.readFileSync('/mnt/user-data/uploads/Northm/Reporting.html.new','utf8');
const a=src.indexOf('const SR={list:null'), b=src.indexOf('window.pageSavedReports=pageSavedReports;');
if(a<0||b<0) throw new Error('cut'); const CHUNK=src.slice(a,b+'window.pageSavedReports=pageSavedReports;'.length);
let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)f++};
const STUBS=`
window.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.F={dt:s=>String(s||'').slice(0,10)}; window.toasts=[]; window.toast=m=>toasts.push(m); window.audits=[]; window.recordReportView=(w,d)=>audits.push(w+'|'+d);
window.uid=()=>'new-'+(++window.__u); window.__u=0;
window.UI={page:'saved',openTile:null}; window.CFG={isSuperAdmin:false,boardReportAccess:{enforced:true,allowed:true}};
window._orgId='org1'; window._myProfile={id:'me',name:'Meg',role_id:'rMem'};
window.ROLES={rMem:{id:'rMem',publish:false,config:false},rPub:{id:'rPub',publish:true,config:false},rCfg:{id:'rCfg',publish:false,config:true}};
window.myRole=()=>ROLES[_myProfile.role_id];
window.reportScopeName=()=>'own_org'; window.reportScopeLabel=()=> 'Your organisation';
window.rpPart=(p,w)=>'<div class="card" data-part="'+p+'.'+w+'">PART '+p+'.'+w+'</div>';
window.render=()=>{ document.getElementById('main').innerHTML=pageSavedReports(); window.__renders=(window.__renders||0)+1; };
window.confirm=()=>true;
/* fake supabase emulating the table's RLS rules */
window.DB={saved_reports:[
 {id:'a1',org_id:'org1',owner_id:'me',owner_name:'Meg',name:'My private',description:'d',visibility:'private',definition:{v:1,tiles:['dashboards.kpis'],board:null},created_at:'2026-10-01',updated_at:'2026-10-02'},
 {id:'a2',org_id:'org1',owner_id:'boss',owner_name:'Bo',name:'Exec <b>pack</b>',description:'',visibility:'public',definition:{v:1,tiles:['dashboards.deals'],board:{fy:'FY27',sel:{type:'q2'},cmp:1}},created_at:'2026-10-03',updated_at:'2026-10-04'},
 {id:'a3',org_id:'org1',owner_id:'boss',owner_name:'Bo',name:'Boss private',description:'',visibility:'private',definition:{v:1,tiles:['reports.log'],board:null},created_at:'2026-10-05',updated_at:'2026-10-05'}]};
window.FAIL=null; window.MISSING=false; window.CALLS=[];
const can=()=>({pub:!!(ROLES[_myProfile.role_id].publish||ROLES[_myProfile.role_id].config),mod:!!ROLES[_myProfile.role_id].config});
window.sb={from(t){ const S={op:'select',payload:null,filters:[],sel:false};
  const run=()=>{ CALLS.push({t,op:S.op,payload:S.payload,filters:S.filters.map(x=>x.join('='))});
    if(MISSING) return {data:null,error:{code:'42P01',message:'relation "saved_reports" does not exist'}};
    if(FAIL) return {data:null,error:FAIL};
    const me=_myProfile.id, rows=DB.saved_reports, m=r=>S.filters.every(([k,v])=>r[k]===v);
    const visible=r=>r.org_id==='org1'&&(r.visibility==='public'||r.owner_id===me);
    if(S.op==='select') return {data:rows.filter(m).filter(visible).sort((x,y)=>String(y.updated_at).localeCompare(String(x.updated_at))),error:null};
    if(S.op==='insert'){ const p=S.payload; if(p.owner_id!==me||(p.visibility==='public'&&!can().pub)) return {data:null,error:{code:'42501',message:'new row violates row-level security policy'}}; rows.push(Object.assign({created_at:'2026-10-10',updated_at:'2026-10-10'},p)); return {data:[{id:p.id}],error:null}; }
    const mine=rows.filter(m).filter(r=>r.owner_id===me||(r.visibility==='public'&&can().mod));
    if(S.op==='update'){ const hit=[]; mine.forEach(r=>{ const np=Object.assign({},r,S.payload); if(np.visibility==='public'&&r.owner_id===me&&!can().pub){ return; } Object.assign(r,S.payload,{updated_at:'2026-10-11'}); hit.push({id:r.id}); }); if(S.payload.visibility==='public'&&!can().pub&&mine.length) return {data:null,error:{code:'42501',message:'row-level security'}}; return {data:hit,error:null}; }
    if(S.op==='delete'){ const ids=mine.map(r=>r.id); DB.saved_reports=rows.filter(r=>!ids.includes(r.id)); return {data:ids.map(id=>({id})),error:null}; }
  };
  const o={select(){ S.sel=true; return o; },insert(p){S.op='insert';S.payload=p;return o;},update(p){S.op='update';S.payload=p;return o;},delete(){S.op='delete';return o;},eq(k,v){S.filters.push([k,v]);return o;},order(){return o;},then(res,rej){ return Promise.resolve().then(run).then(res,rej); }}; return o; }};
`;
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const pg=await b.newPage({viewport:{width:1300,height:900}});
const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
await pg.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await pg.setContent('<!doctype html><html><head><style>.mask{position:fixed;inset:0}</style></head><body><div id="main"></div></body></html>');
await pg.addScriptTag({content:STUBS}); await pg.addScriptTag({path:'/home/claude/sr/savedReports.js'}); await pg.addScriptTag({content:CHUNK});
const T=sel=>pg.$eval(sel,e=>e.innerText.replace(/\s+/g,' '));
const reset=(role)=>pg.evaluate(r=>{ _myProfile.role_id=r; SR.list=null;SR.loading=false;SR.error='';SR.missing=false;SR.editing=null;SR.viewId=null;SR.busy=false; FAIL=null;MISSING=false;CALLS.length=0;toasts.length=0;audits.length=0; render(); },role);
const settle=()=>pg.waitForFunction(()=>!SR.loading&&SR.list!==null);
// 1 list + privacy
await reset('rMem'); await settle(); await pg.waitForTimeout(50);
let txt=await T('#main');
ok(/My private/.test(txt)&&/Exec <b>pack<\/b>/.test(txt),'my private report + others\' public report listed (name shown as text)');
ok(!/Boss private/.test(txt),'someone else\'s PRIVATE report is not shown');
ok(await pg.$$eval('#main table',t=>t.length)===2&&/My reports 1/.test(txt)&&/Shared reports 1/.test(txt),'two tables: My reports (1) and Shared reports (1)');
ok(await pg.evaluate(()=>!document.querySelector('#main b')||![...document.querySelectorAll('#main b')].some(x=>x.textContent==='pack')),'report name HTML is escaped (no injected <b>)');
const rowBtns=await pg.$$eval('#main tr',rs=>rs.map(r=>r.innerText.replace(/\s+/g,' ')));
ok(!rowBtns.find(r=>/Exec/.test(r)&&/Edit|Delete/.test(r)),'no Edit/Delete buttons on someone else\'s public report (plain member)');
ok(rowBtns.find(r=>/Exec/.test(r)&&/Copy/.test(r)),'Copy is offered on it');
// 2 new report validation
await pg.click('text=+ New report'); await pg.waitForSelector('#srName');
await pg.click('#srSaveBtn'); ok(/Give the report a name/.test(await T('.modal')),'empty name is refused');
await pg.fill('#srName','Weekly numbers'); await pg.click('#srSaveBtn'); ok(/Pick at least one tile/.test(await T('.modal')),'no tiles and no board setting is refused');
ok(await pg.$eval('input[name="srVis"][value="public"]',e=>e.disabled),'Public option disabled for a member without Publish/Configure');
ok(await pg.evaluate(()=>CALLS.every(c=>c.op==='select')),'nothing sent to the database while invalid');
// 3 create private
await pg.fill('#srName','  Weekly   numbers '); await pg.fill('#srDesc','for Monday');
await pg.check('text=KPI tiles'); await pg.check('text=Deals by stage'); await pg.click('#srSaveBtn');
await pg.waitForFunction(()=>!SR.editing&&!SR.busy&&DB.saved_reports.some(r=>r.name==='Weekly numbers'));
const ins=await pg.evaluate(()=>CALLS.filter(c=>c.op==='insert').pop().payload);
ok(ins.owner_id==='me'&&ins.org_id==='org1'&&ins.visibility==='private'&&ins.name==='Weekly numbers'&&ins.description==='for Monday'&&JSON.stringify(ins.definition.tiles)==='["dashboards.kpis","dashboards.deals"]'&&ins.definition.board===null,'insert payload: owner, org, private, tidy name, tiles: '+JSON.stringify(ins).slice(0,170));
await settle(); await pg.waitForTimeout(50); ok(/Weekly numbers/.test(await T('#main'))&&/My reports 2/.test(await T('#main')),'new report appears under My reports');
ok(await pg.evaluate(()=>audits.some(a=>/saved report created\|Weekly numbers \(private\)/.test(a))&&toasts.includes('Report saved.')),'audit entry and confirmation recorded');
// 4 edit own: add board setting
await pg.evaluate(()=>srEdit(DB.saved_reports.find(r=>r.name==='Weekly numbers').id)); await pg.waitForSelector('#srName');
await pg.check('#srBoardOn'); await pg.selectOption('#srBoardType','custom'); await pg.waitForSelector('text=From');
ok(await pg.$$eval('.modal select',s=>s.length)>=5,'custom period shows From/To selects');
await pg.click('#srSaveBtn'); await pg.waitForFunction(()=>!SR.editing&&!SR.busy);
const up=await pg.evaluate(()=>CALLS.filter(c=>c.op==='update').pop());
const wid=await pg.evaluate(()=>DB.saved_reports.find(r=>r.name==='Weekly numbers').id);
ok(up.payload.definition.board&&up.payload.definition.board.sel.type==='custom'&&up.filters.includes('id='+wid),'update sends the board setting for that report only');
// 5 view
await pg.evaluate(()=>srOpen('a2')); txt=await T('#main');
ok(/PART dashboards.deals/.test(txt)&&/Quarter 2, compared with 1 earlier year/.test(txt),'viewer renders chosen tiles via the normal tile builders and the board setting');
const href=await pg.$eval('#main a[href^="Strategy.html"]',a=>a.getAttribute('href')); ok(/page=boardreport&br=/.test(href)&&JSON.parse(decodeURIComponent(href.split('br=')[1])).fy==='FY27','Board link carries FY and period');
ok(/figures your own access allows/.test(txt),'viewer states that data follows the viewer\'s own access');
ok(await pg.evaluate(()=>audits.some(a=>/report viewed\|Saved report · Exec/.test(a))),'opening a report is recorded in the report log');
await pg.evaluate(()=>{CFG.boardReportAccess={enforced:true,allowed:false}; render();}); ok(/approved roles only/.test(await T('#main'))&&!(await pg.$('#main a[href^="Strategy.html"]')),'Board link replaced by a notice when Board report access is not allowed'); await pg.evaluate(()=>{CFG.boardReportAccess={enforced:true,allowed:true};});
await pg.evaluate(()=>srBack());
// 6 copy
await pg.evaluate(()=>srCopy('a2')); await pg.waitForSelector('#srName'); ok((await pg.$eval('#srName',e=>e.value))==='Exec <b>pack</b> (copy)'&&await pg.$eval('input[name="srVis"][value="private"]',e=>e.checked),'Copy opens a PRIVATE draft named "... (copy)"'); await pg.evaluate(()=>srCloseEditor());
// 7 delete own and forced delete of someone else's
await pg.evaluate(()=>srDelete(DB.saved_reports.find(r=>r.name==='Weekly numbers').id)); await settle(); await pg.waitForTimeout(50);
ok(!(await pg.evaluate(()=>DB.saved_reports.some(r=>r.name==='Weekly numbers'))),'own report deleted');
await pg.evaluate(()=>srDelete('a2')); await pg.waitForTimeout(100);
ok(await pg.evaluate(()=>DB.saved_reports.some(r=>r.id==='a2')&&toasts.some(t=>/permission/i.test(t))),'deleting someone else\'s public report is refused by the database and says so');
// 8 publisher
await reset('rPub'); await settle(); await pg.waitForTimeout(50);
await pg.click('text=+ New report'); await pg.waitForSelector('#srName'); ok(!(await pg.$eval('input[name="srVis"][value="public"]',e=>e.disabled)),'Publish role can choose Public');
await pg.fill('#srName','Shared snapshot'); await pg.check('text=Headcount summary'); await pg.check('input[name="srVis"][value="public"]'); await pg.click('#srSaveBtn');
await pg.waitForFunction(()=>DB.saved_reports.some(r=>r.name==='Shared snapshot')&&!SR.editing);
ok(await pg.evaluate(()=>DB.saved_reports.find(r=>r.name==='Shared snapshot').visibility==='public'),'saved as public');
// 9 moderator
await reset('rCfg'); await settle(); await pg.waitForTimeout(50);
ok(/Exec/.test(await T('#main'))&&(await pg.$$eval('#main tr',rs=>rs.map(r=>r.innerText).find(r=>/Exec/.test(r)&&/Delete/.test(r)))),'Configure role sees Edit/Delete on public reports (moderation)');
ok(!/Boss private/.test(await T('#main')),'...but still never sees someone else\'s private report');
// 10 missing table
await reset('rMem'); await pg.evaluate(()=>{MISSING=true; SR.list=null; render();}); await settle(); await pg.waitForTimeout(50);
txt=await T('#main'); ok(/one-time database setup/.test(txt)&&!(await pg.$('text=+ New report')),'table missing: plain setup note, no New button, no crash');
// 11 server error is shown and retryable
await reset('rMem'); await pg.evaluate(()=>{FAIL={message:'boom'};SR.list=null;render();}); await settle(); await pg.waitForTimeout(50);
ok(/boom/.test(await T('#main'))&&/Try again/.test(await T('#main')),'load error shown with Try again');
// 12 RLS rejection on save shows a friendly message
await reset('rMem'); await settle(); await pg.waitForTimeout(50);
await pg.evaluate(()=>{ SR.editing=srDraftFrom(null); SR.editing.name='X'; SR.editing.tiles=['reports.log']; SR.editing.visibility='public'; render(); });
await pg.click('#srSaveBtn'); ok(/needs a role with Publish or Configure/.test(await T('.modal'))&&await pg.evaluate(()=>!DB.saved_reports.some(r=>r.name==='X')),'forced Public by a member is refused (screen check, and the fake database refuses too)');
ok(errs.length===0,'no page errors '+errs.join(';'));
console.log(f?'FAILED '+f:'ALL PASS'); await b.close(); process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
