// Board report layout refactor: (A) content identical to the original page (golden compare),
// (B) real GridStack + grid.js: positions, hide, print flow follows layout.
const {chromium}=require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs=require('fs');
const U='/mnt/user-data/uploads/Northm/';
const oldSrc=fs.readFileSync(U+'Strategy.html','utf8'), newSrc=fs.readFileSync(U+'Strategy.html.new','utf8');
const cut=(s,from,to)=>{const a=s.indexOf(from), b=s.indexOf(to,a); if(a<0||b<0) throw new Error('cut fail '+from); return s.slice(a,b);};
const OLD=cut(oldSrc,'function pageBoardReport(){\n','function snapshotsWidgetSave(){\n').replace('function pageBoardReport(){','function pageBoardReportOLD(){');
const NEW=cut(newSrc,'/* ---- Board report data, computed once per render','function snapshotsWidgetSave(){\n');
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};

const STUBS=`
window.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.fin=v=>{v=+v;return isFinite(v)?v:0}; window.sum=a=>a.reduce((x,y)=>x+y,0);
window.F={n:(v,d)=>Number(v).toLocaleString('en',{maximumFractionDigits:d||0}),p:(v,d)=>(v*100).toFixed(d||0)+'%',sp:(v,d)=>(v>=0?'+':'')+(v*100).toFixed(d||0)+'%',mk:v=>'$'+Math.round(v),dt:()=>'1 Jan 2026'};
window.SER=['#3B4CB8','#10AEBF','#E8A317','#D0342C','#7A5AC8','#2E9E5B','#C4559A','#7C879E'];
window.byId=(a,id)=>(a||[]).find(x=>x.id===id);
window.calcBlocked=()=>false; window.blockedPanel=t=>'BLOCKED '+t;
window.verMult=()=>1; window.segBlend=()=>1; window.version=()=>({name:'Forecast'});
window.chain=()=>[{id:'g1',name:'Leads'},{id:'g2',name:'MQL'},{id:'g3',name:'SQL'},{id:'g4',name:'Won'}];
window.exitGate=()=>({id:'g4',name:'Won'});
window.backward=(w,m,rid)=>({g1:w*20,g2:w*8,g3:w*3,g4:w});
window.histSlice=o=>{const r=(o.regionIds||[]).length; const k=o.fy==='FY27'?1:o.fy==='FY26'?0.8:0.6; return {acc:{g1:1800*k/r*(r),g2:700*k,g3:260*k,g4:90*k*(r===1?0.5:1),_acv:1000000*k*(r===1?0.5:1)},months:12};};
window.visibleRegions=()=>CFG.regions;
window.campaignBudgetMain=c=>c.budget||0; window.campaignCommitted=c=>c.committed||0; window.campaignActualSpend=c=>c.actual||0;
window.boardReportNarrative=()=>'NARRATIVE';
window.boardReportSnapshotView=()=>'SNAPSHOTVIEW';
window.NorthBoardReportAccess={noAccessHtml:()=>'NOACCESS'};
window.svgPlaceholder=1;
window.setup=(kind)=>{
  window.UI={fy:'FY27',brAi:null,brViewSnapId:null,page:'boardreport'};
  window.CFG={drivers:{winTarget:100},regions:[{id:'r1',name:'ANZ',acvTarget:2000000},{id:'r2',name:'ASEAN',acvTarget:1500000}],
   costBuckets:[{id:'b1',code:'EV',label:'Events'},{id:'b2',code:'DG',label:'Digital'}],
   campaigns:[{id:'c1',name:'Launch',regionId:'r1',costBucketId:'b1',budget:50000,committed:40000,actual:45000,signoffStatus:'Submitted'},{id:'c2',name:'Webinars',regionId:'r2',costBucketId:'b2',budget:20000,committed:30000,actual:0,signoffStatus:'Approved'}],
   scoringSummary:{dealCount:4,pipelineValue:500000,byStage:{Prospect:2,Won:2},valueByStage:{Prospect:200000,Won:300000}},
   targetsSummary:{filterCount:1,topFilters:[{name:'Tech',industry:'Software',dealValue:50000,currency:'AUD'}]},
   boardReportNotes:[{id:'n1',fy:'FY27',note:'Pipeline <b>strong</b>',createdBy:'Stef',createdAt:'2026-01-01',visible:true}],
   boardReportSnapshots:[],orgBrand:null,boardReportSheetId:'',boardReportAccess:{enforced:true,allowed:true}};
  if(kind==='empty'){ CFG.campaigns=[]; CFG.scoringSummary={dealCount:0,pipelineValue:0,byStage:{}}; CFG.targetsSummary={filterCount:0,topFilters:[]}; CFG.boardReportNotes=[]; CFG.regions=[]; }
  if(kind==='ai'){ UI.brAi={status:'done',text:'AI wrote this',error:''}; }
  if(kind==='aierr'){ UI.brAi={status:'error',text:'',error:'boom'}; }
  if(kind==='noaccess'){ CFG.boardReportAccess={enforced:true,allowed:false}; }
  if(kind==='snap'){ CFG.boardReportSnapshots=[{id:'s1',name:'Q1 pack',fy:'FY27',createdAt:'2026-02-01',createdBy:'Stef'}]; UI.brViewSnapId='s1'; }
};
`;

const NORM=`(html,kind)=>{
  const d=document.createElement('div'); d.innerHTML=html;
  const unwrap=el=>{ while(el.firstChild) el.parentNode.insertBefore(el.firstChild,el); el.remove(); };
  d.querySelectorAll('.grid-stack-item-content').forEach(unwrap);
  d.querySelectorAll('.grid-stack-item').forEach(unwrap);
  d.querySelectorAll('.grid-stack').forEach(unwrap);
  d.querySelectorAll('.grid.g2').forEach(unwrap);
  return d.innerHTML.replace(/\\s+/g,' ').replace(/> </g,'><').trim();
}`;
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await b.newPage({viewport:{width:1300,height:900}});
const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
await pg.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await pg.setContent('<!doctype html><html><head></head><body><div id="main"></div></body></html>');
await pg.addScriptTag({content:STUBS});
await pg.addScriptTag({path:U+'shared/charts.js'});
await pg.addScriptTag({path:'chartsCombo.js'});
await pg.addScriptTag({content:OLD});
await pg.addScriptTag({content:NEW});
await pg.evaluate('window.__norm='+NORM);
// ---------- A. golden compare
for(const kind of ['normal','empty','ai','aierr','noaccess','snap']){
  const r=await pg.evaluate((kind)=>{ setup(kind); const o=pageBoardReportOLD(); setup(kind); const n=pageBoardReport(); return {o:__norm(o),n:__norm(n),olen:o.length,nlen:n.length}; },kind);
  let same=r.o===r.n;
  if(!same){ let i=0; while(i<r.o.length&&r.o[i]===r.n[i]) i++; console.log('  first diff at',i,'\n  OLD:',r.o.slice(Math.max(0,i-80),i+120),'\n  NEW:',r.n.slice(Math.max(0,i-80),i+120)); }
  ok(same,'scenario "'+kind+'": new page content identical to original (length '+r.o.length+')');
}
// NEW has grid; noaccess/snapshot have no grid
const g=await pg.evaluate(()=>{ setup('normal'); const h=pageBoardReport(); setup('noaccess'); const na=pageBoardReport(); const sub1=window.__northGridSubId; window.__northGridSubId=null; setup('snap'); const sn=pageBoardReport(); const sub2=window.__northGridSubId; window.__northGridSubId=null; setup('normal'); pageBoardReport(); return {boxes:(h.match(/gs-id="box\d+"/g)||[]).length,hasGrid:h.indexOf('id="ordo-grid-boardreport"')>0,naGrid:na.indexOf('grid-stack')>=0,snGrid:sn.indexOf('grid-stack')>=0,sub1,sub2,normalSub:window.__northGridSubId||null}; });
ok(g.boxes===10&&g.hasGrid,'10 boxes in the board-report grid');
ok(!g.naGrid&&g.sub1==='boardreport_view','no-access page has no grid and hides Edit layout buttons');
ok(!g.snGrid&&g.sub2==='boardreport_view','saved-history view has no grid and hides Edit layout buttons');
ok(g.normalSub===null,'live page leaves grid id alone (uses boardreport)');
ok(await pg.evaluate(()=>{ setup('normal'); pageBoardReport(); return window.__brMemo===undefined && typeof _brMemo!=='undefined' && _brMemo===null; }),'memo cleared after the page is built');
ok(await pg.evaluate(()=>{ setup('normal'); const a=boardReportWidgetBridge(); return /Gap to target by region/.test(a)&&/ACV target/.test(a); }),'a widget works on its own (used from another page / swap picker)');
ok(errs.length===0,'no page errors in A '+errs.join('|'));

// ---------- B. real GridStack + grid.js
const html=`<!doctype html><html><head><link rel="stylesheet" href="file://${U}assets/vendor/gridstack/gridstack.min.css"><style>body{font-family:sans-serif;margin:0}.card{border:1px solid #dfe3eb;border-radius:6px;margin-bottom:14px;background:#fff}.card h3{margin:0;padding:6px 10px;font-size:14px}.bd{padding:8px 10px}.bd.flush{padding:0}table{border-collapse:collapse;width:100%}td,th{padding:3px 8px;font-size:12px;border-top:1px solid #eee}.kpis{display:flex;gap:8px}.kpi{border:1px solid #ddd;padding:8px;flex:1}.mini{font-size:11px;color:#667}.grid-stack-item-content{overflow:hidden}.no-print{}@media print{.no-print,.btn,.gs-item-handle{display:none!important}}</style><style>${require('fs').readFileSync('realgridcss.txt','utf8')}</style></head><body>
<div class="ctxbar"><button id="grid-edit-toggle">Edit layout</button><button id="grid-reset">Reset layout</button><button id="grid-addtile" style="display:none">Add</button></div><div id="main" style="width:1200px"></div></body></html>`;
fs.writeFileSync('/tmp/brgrid.html',html);
const pg2=await b.newPage({viewport:{width:1300,height:1000}});
const errs2=[];pg2.on('pageerror',e=>errs2.push(String(e)));
await pg2.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await pg2.goto('file:///tmp/brgrid.html');
await pg2.addScriptTag({content:STUBS});
await pg2.addScriptTag({path:U+'shared/charts.js'});
await pg2.addScriptTag({path:'chartsCombo.js'});
await pg2.addScriptTag({content:NEW});
await pg2.evaluate(()=>{ window.render=()=>{ document.getElementById('main').innerHTML=pageBoardReport(); window.northGridAfterRender('boardreport'); }; window.toast=()=>{}; window.CFG_=null; });
await pg2.addScriptTag({path:U+'assets/vendor/gridstack/gridstack-all.js'});
await pg2.addScriptTag({path:U+'shared/grid.js.new'});
await pg2.evaluate(()=>{ setup('normal'); document.getElementById('main').innerHTML=pageBoardReport(); window.northGridAfterRender('boardreport'); });
await pg2.waitForTimeout(800);
const st=await pg2.evaluate(()=>{ const g=document.getElementById('ordo-grid-boardreport'); const its=[...g.querySelectorAll(':scope > .grid-stack-item')]; const rects=its.map(e=>e.getBoundingClientRect()); let overlap=0; for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],c=rects[j]; if(a.left<c.right-1&&c.left<a.right-1&&a.top<c.bottom-1&&c.top<a.bottom-1)overlap++;} return {n:its.length,hasAttrs:its.every(e=>e.hasAttribute('gs-x')&&e.hasAttribute('gs-y')),overlap,gridObj:!!g.gridstack,btns:[document.getElementById('grid-edit-toggle').style.display,document.getElementById('grid-reset').style.display],order:its.map(e=>e.getAttribute('gs-id')+'@'+e.getAttribute('gs-x')+','+e.getAttribute('gs-y')+' w'+e.getAttribute('gs-w')),clipped:its.filter(e=>{const c=e.querySelector('.grid-stack-item-content');if(!c)return false;const kids=[...c.querySelectorAll('.card')];const bottom=Math.max(...kids.map(k=>k.getBoundingClientRect().bottom),0);return bottom>c.getBoundingClientRect().bottom+2}).length,dbg:its.map(e=>{const c=e.querySelector('.grid-stack-item-content');return e.getAttribute('gs-id')+':'+Math.round(c.clientHeight)+'/'+Math.round(c.scrollHeight)}).join(' ')}; });
console.log('  layout:',st.order.join(' | '));console.log('  heights:',st.dbg);
ok(st.n===10&&st.hasAttrs&&st.gridObj,'GridStack initialised on the board report (10 boxes with positions)');
ok(st.overlap===0,'no boxes overlap on screen ('+st.overlap+')');
ok(st.btns.every(x=>x!=='none'),'Edit layout / Reset layout buttons shown for the live Board report');
ok(st.clipped===0,'no box content is clipped on screen ('+st.clipped+')');
ok(/box6@0,\d+ w6/.test(st.order.join(' '))&&/box7@6,\d+ w6/.test(st.order.join(' ')),'Targets and Scoring sit side by side (6 + 6)');
// print flow in default layout
const pf=async()=>pg2.evaluate(()=>{ window.dispatchEvent(new Event('beforeprint')); const fl=document.querySelector('.br-print-flow'); const cells=fl?[...fl.children]:[]; const r={n:cells.length,titles:cells.map(c=>((c.querySelector('h3')||c.querySelector('.k')||{}).textContent||'?').trim().slice(0,28)),widths:cells.map(c=>c.style.width),hidden:document.getElementById('ordo-grid-boardreport').classList.contains('br-print-hide'),handles:fl?fl.querySelectorAll('.gs-item-handle').length:0}; return r; });
const after=async()=>pg2.evaluate(()=>{ window.dispatchEvent(new Event('afterprint')); return {flow:!!document.querySelector('.br-print-flow'),hidden:document.getElementById('ordo-grid-boardreport').classList.contains('br-print-hide')}; });
let p1=await pf();
console.log('  print order:',p1.titles.join(' > '));
ok(p1.n===10&&p1.handles===0,'print copy has all 10 sections and no edit handles');
ok(p1.titles[0].length>0&&/Targets/.test(p1.titles[5])&&/Scoring/.test(p1.titles[6]),'print order = on-screen order (Targets then Scoring)');
ok(p1.widths[5]==='calc(50% - 8px)'&&p1.widths[6]==='calc(50% - 8px)'&&p1.widths[0]==='calc(100% - 8px)','print widths follow box widths');
await pg2.emulateMedia({media:'print'});
const vis=await pg2.evaluate(()=>({flow:getComputedStyle(document.querySelector('.br-print-flow')).display,grid:getComputedStyle(document.getElementById('ordo-grid-boardreport')).display}));
ok(vis.flow==='flex'&&vis.grid==='none','in print media the flowing copy shows and the absolute grid is hidden');
await pg2.screenshot({path:'brprint.png',fullPage:true});
await pg2.emulateMedia({media:'screen'});
let a1=await after(); ok(!a1.flow&&!a1.hidden,'after printing the copy is removed and the grid is shown again');
// hide a section via the real Edit layout UI, then move another
await pg2.click('#grid-edit-toggle'); await pg2.waitForTimeout(300);
const hideBtn=await pg2.$('.gs-hide-btn[data-gs-hide="box5"]');
ok(!!hideBtn,'edit mode shows Hide button on each box');
if(hideBtn){ await hideBtn.click(); await pg2.waitForTimeout(700); }
const left=await pg2.evaluate(()=>document.querySelectorAll('#ordo-grid-boardreport > .grid-stack-item').length);
ok(left===9,'hiding a section removes its box (9 left)');
await pg2.evaluate(()=>{ const g=document.getElementById('ordo-grid-boardreport'); const el=g.querySelector('[gs-id="box10"]'); g.gridstack.update(el,{x:0,y:0}); });
await pg2.waitForTimeout(300);
let p2=await pf();
console.log('  print order after hide+move:',p2.titles.join(' > '));
ok(p2.n===9&&!p2.titles.some(t=>/Campaign highlights/.test(t)),'hidden section is not printed');
ok(/What changed/.test(p2.titles[0]),'a section moved to the top prints first');
await after();
ok(errs2.length===0,'no page errors in B '+errs2.join('|'));
await b.close();
console.log(f?('FAILED '+f):'ALL PASS');process.exit(f?1:0);
})();
