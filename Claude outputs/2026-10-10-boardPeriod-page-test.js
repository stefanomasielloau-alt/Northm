const {chromium}=require('playwright');
const fs=require('fs');
const U='/mnt/user-data/uploads/Northm/';
const oldSrc=fs.readFileSync(U+'archive/2026-10-10-pre-board-period-Strategy.html','utf8'), newSrc=fs.readFileSync(U+'Strategy.html.new','utf8');
const cut=(s,from,to)=>{const a=s.indexOf(from), b=s.indexOf(to,a); if(a<0||b<0) throw new Error('cut fail '+from); return s.slice(a,b);};
const START='/* ---- Board report data, computed once per render', END='function snapshotsWidgetSave(){\n';
const OLD=cut(oldSrc,START,END), NEW=cut(newSrc,START,END);
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
const STUBS=`
window.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.fin=v=>{v=+v;return isFinite(v)?v:0}; window.sum=a=>a.reduce((x,y)=>x+(y||0),0);
window.F={n:(v,d)=>Number(v).toLocaleString('en',{maximumFractionDigits:d||0}),p:(v,d)=>(v*100).toFixed(d||0)+'%',sp:(v,d)=>(v==null||isNaN(v))?'—':(v>=0?'+':'')+(v*100).toFixed(d||0)+'%',mk:v=>'$'+Math.round(v),dt:()=>'1 Jan 2026'};
window.SER=['#3B4CB8','#10AEBF','#E8A317','#D0342C','#7A5AC8','#2E9E5B','#C4559A','#7C879E'];
window.byId=(a,id)=>(a||[]).find(x=>x.id===id);
window.calcBlocked=()=>false; window.blockedPanel=t=>'BLOCKED '+t;
window.verMult=()=>1; window.segBlend=()=>1; window.version=()=>({name:'Forecast'});
window.chain=()=>[{id:'g1',name:'Leads'},{id:'g2',name:'MQL'},{id:'g3',name:'SQL'},{id:'g4',name:'Won'}];
window.exitGate=()=>({id:'g4',name:'Won'});
window.backward=(w,m,rid)=>({g1:w*20,g2:w*8,g3:w*3,g4:w});
window.fyOf=mo=>'FY'+String(mo.m>=7?mo.y+1:mo.y).slice(2); window.fyPos=mo=>((mo.m-7)+12)%12;
window.histSlice=o=>{const r=(o.regionIds||[]).length; const mths=(o.posFrom!=null)?(o.posTo-o.posFrom+1):12; const k=o.fy==='FY27'?1:o.fy==='FY26'?0.8:o.fy==='FY25'?0.6:0; const t=mths/12;
  return {acc:{g1:1800*k*t,g2:700*k*t,g3:260*k*t,g4:90*k*t*(r===1?0.5:1),_acv:1000000*k*t*(r===1?0.5:1)},months:k?mths:0};};
window.visibleRegions=()=>CFG.regions;
window.campaignBudgetMain=c=>c.budget||0; window.campaignCommitted=c=>c.committed||0; window.campaignActualSpend=c=>c.actual||0;
window.boardReportNarrative=()=>'NARRATIVE'; window.boardReportSnapshotView=()=>'SNAPSHOTVIEW';
window.NorthBoardReportAccess={noAccessHtml:()=>'NOACCESS'}; window.render=()=>{window.__renders=(window.__renders||0)+1;};
window.setup=(kind)=>{
  window.UI={fy:'FY27',brAi:null,brViewSnapId:null,page:'boardreport'};
  window.CFG={drivers:{winTarget:100},time:{fyStartMonth:7},seasonality:[1,1,1,1,1,1,1,1,1,1,1,1],regions:[{id:'r1',name:'ANZ',acvTarget:2000000},{id:'r2',name:'ASEAN',acvTarget:1500000}],
   costBuckets:[{id:'b1',code:'EV',label:'Events'},{id:'b2',code:'DG',label:'Digital'}],
   campaigns:[{id:'c1',name:'Launch',regionId:'r1',costBucketId:'b1',budget:50000,committed:40000,actual:45000,signoffStatus:'Submitted',start:'2026-07-01',end:'2026-12-31'},{id:'c2',name:'Webinars',regionId:'r2',costBucketId:'b2',budget:20000,committed:30000,actual:0,signoffStatus:'Approved'}],
   scoringSummary:{dealCount:4,pipelineValue:500000,byStage:{Prospect:2,Won:2},valueByStage:{Prospect:200000,Won:300000}},
   targetsSummary:{filterCount:1,topFilters:[{name:'Tech',industry:'Software',dealValue:50000,currency:'AUD'}]},
   boardReportNotes:[{id:'n1',fy:'FY27',note:'Pipeline',createdBy:'Stef',createdAt:'2026-01-01',visible:true}],
   boardReportSnapshots:[],orgBrand:null,boardReportSheetId:'',boardReportAccess:{enforced:true,allowed:true}};
  if(kind==='empty'){ CFG.campaigns=[]; CFG.scoringSummary={dealCount:0,pipelineValue:0,byStage:{}}; CFG.targetsSummary={filterCount:0,topFilters:[]}; CFG.boardReportNotes=[]; CFG.regions=[]; }
  if(kind==='noaccess'){ CFG.boardReportAccess={enforced:true,allowed:false}; }
};
`;
const NORM=`(html)=>{ const d=document.createElement('div'); d.innerHTML=html;
  const unwrap=el=>{ while(el.firstChild) el.parentNode.insertBefore(el.firstChild,el); el.remove(); };
  d.querySelectorAll('.grid-stack-item-content').forEach(unwrap); d.querySelectorAll('.grid-stack-item').forEach(unwrap); d.querySelectorAll('.grid-stack').forEach(unwrap); d.querySelectorAll('.grid.g2').forEach(unwrap);
  return d.innerHTML.replace(/\\s+/g,' ').replace(/> </g,'><').trim(); }`;
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const mkPage=async(chunk,withBP)=>{ const pg=await b.newPage({viewport:{width:1300,height:900}}); pg.on('pageerror',e=>errs.push(String(e)));
  await pg.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  await pg.setContent('<!doctype html><html><body><div id="main"></div></body></html>');
  await pg.addScriptTag({content:STUBS}); await pg.addScriptTag({path:U+'shared/charts.js'}); await pg.addScriptTag({path:U+'shared/chartsCombo.js'});
  if(withBP) await pg.addScriptTag({path:'/home/claude/bp/boardPeriod.js'});
  await pg.addScriptTag({content:chunk}); await pg.evaluate('window.__norm='+NORM); return pg; };
const errs=[];
const po=await mkPage(OLD,false), pn=await mkPage(NEW,true);
// A. golden: full year, no comparison -> same report; only the new controls card + period line differ
for(const kind of ['normal','empty','noaccess']){
  const o=await po.evaluate(k=>{setup(k);return __norm(pageBoardReport())},kind);
  const n=await pn.evaluate(k=>{setup(k);const h=pageBoardReport(); const d=document.createElement('div'); d.innerHTML=h; d.querySelectorAll('.card.no-print').forEach(c=>{ if(/Period &|Period & comparison/.test(c.querySelector('h3')&&c.querySelector('h3').textContent)) c.remove(); }); d.querySelectorAll('.mini').forEach(m=>{ if(/^Period:/.test(m.textContent)) m.remove(); }); return __norm(d.innerHTML)},kind);
  let same=o===n; if(!same){ let i=0; while(i<o.length&&o[i]===n[i]) i++; console.log('  OLD:',o.slice(Math.max(0,i-100),i+160),'\n  NEW:',n.slice(Math.max(0,i-100),i+160)); }
  ok(same,'"'+kind+'": full year, no comparison = identical to the old report (len '+o.length+')');
}
// B. Q2 numbers
let B=await pn.evaluate(()=>{setup('normal');UI.brPeriod={type:'q2'};UI.brCompare=0;UI._brSelLoaded=true;const B=brCompute();return {plan:B.plan.g4,act:B.actualAcc.g4,share:B.share,bud:B.budgeted,com:B.committed,spent:B.actualSpend,label:brLabel(),acv:B.revenue,cmp:B.cmp.length}});
ok(B.share===0.25&&B.plan===25,'Q2: plan = 25% of the year target: '+B.plan);
ok(B.act===22.5&&B.acv===250000,'Q2: actuals use only the 3 months: '+B.act+' / '+B.acv);
ok(B.bud===30000&&B.com===27500&&B.spent===22500,'Q2: spend pro-rated by dates (Launch half in period, undated Webinars 3/12): '+JSON.stringify([B.bud,B.com,B.spent]));
ok(B.label==='FY27 · Q2 (Jul–Sep)'||/FY27 · Q2/.test(B.label),'label: '+B.label);
// C. compare
B=await pn.evaluate(()=>{setup('normal');UI.brPeriod={type:'q2'};UI.brCompare=3;UI._brSelLoaded=true;const B=brCompute();return {cmp:B.cmp.map(c=>({fy:c.fy,hasData:c.hasData,g4:c.acc.g4,rev:c.revenue,spend:c.spend})),cur:B.curSpendDated}});
ok(B.cmp.length===3&&B.cmp.map(c=>c.fy).join()==='FY26,FY25,FY24','compare 3 = FY26, FY25, FY24');
ok(B.cmp[0].hasData&&Math.abs(B.cmp[0].g4-18)<1e-9&&B.cmp[1].hasData&&!B.cmp[2].hasData,'prior years: FY26 18, FY25 has data, FY24 flagged no data');
ok(B.cmp[0].spend===B.cur*0+B.cmp[0].spend&&B.cmp[0].spend===0,'prior-year spend counts only campaigns dated in that year (none) = 0');
let html=await pn.evaluate(()=>{setup('normal');UI.brPeriod={type:'q2'};UI.brCompare=2;UI._brSelLoaded=true;return pageBoardReport()});
const txt=await pn.evaluate(h=>{const d=document.createElement('div');d.innerHTML=h;return d.innerText.replace(/\s+/g,' ')},html);
ok(/vs FY26 · Q2 \(.*?\): 18 \+25%/.test(txt),'KPI shows "vs FY26 · Q2 (...): 18 +25%"');
ok(/vs FY26 · Q2.*?\$200000 \+25%/.test(txt)||/vs FY26 · Q2 \(.*?\): \$200000/.test(txt),'revenue comparison shown');
ok(/FY26 · Q2 \(.*?\)Change/.test(txt.replace(/\s/g,' ').replace(/ /g,'')||'')||/FY26 · Q2.*Change/.test(txt),'funnel table gets a column pair per prior year');
ok(/Period: FY27 · Q2/.test(txt)&&/compared with FY26/.test(txt),'printed period line names the period and the comparison');
ok(/Period &amp; comparison/.test(html)&&/no-print/.test(html.slice(html.indexOf('Period &amp; comparison')-120,html.indexOf('Period &amp; comparison'))),'controls card is no-print');
// no data year
const nd=await pn.evaluate(()=>{setup('normal');UI.brPeriod={type:'q2'};UI.brCompare=3;UI._brSelLoaded=true;const d=document.createElement('div');d.innerHTML=pageBoardReport();return d.innerText.replace(/\s+/g,' ')});
ok(/vs FY24 · Q2.*no recorded data/.test(nd),'year with no data says "no recorded data" instead of a fake change');
// D. controls reflect selection
const c1=await pn.evaluate(()=>{setup('normal');UI.brPeriod={type:'custom',from:2,to:4};UI.brCompare=1;UI._brSelLoaded=true;const d=document.createElement('div');d.innerHTML=pageBoardReport();return {type:d.querySelector('#brPeriodType').value,cmp:d.querySelector('#brCompareSel').value,selects:d.querySelectorAll('.card.no-print select').length}});
ok(c1.type==='custom'&&c1.cmp==='1'&&c1.selects>=4,'custom range shows From/To selects ('+JSON.stringify(c1)+')');
const c2=await pn.evaluate(()=>{setup('normal');UI.brPeriod={type:'month',month:5};UI._brSelLoaded=true;const d=document.createElement('div');d.innerHTML=pageBoardReport();return d.querySelectorAll('.card.no-print select').length});
ok(c2>=3,'single month shows a Month select');
// E. payload for PPTX / save
const pl=await pn.evaluate(()=>{setup('normal');UI.brPeriod={type:'q2'};UI.brCompare=1;UI._brSelLoaded=true;pageBoardReport();const p=UI._brPayload;return {fy:p.fy,pl:p.periodLabel,cmp:p.comparison,ex:p.kpis.exitPlan,ac:p.kpis.exitActual,fun:p.funnel.length}});
ok(/^FY27 · Q2/.test(pl.fy)&&pl.pl===pl.fy&&pl.cmp.length===1&&pl.cmp[0].fy==='FY26'&&pl.ex===25,'PPTX payload carries the period, plan 25 and the comparison: '+JSON.stringify(pl).slice(0,160));
// F. setters + settings roundtrip
const st=await pn.evaluate(()=>{setup('normal');UI._brSelLoaded=true;brSetPeriodType('custom');brSetPeriodField('to',4);brSetCompare(2);const s=brSettings();const r1=__renders; brApplySettings({sel:{type:'h2'},cmp:1}); return {s,after:brSettings(),per:brPer().label,renders:__renders}});
ok(st.s.sel.type==='custom'&&st.s.sel.to===4&&st.s.cmp===2&&st.after.sel.type==='h2'&&st.after.cmp===1&&/H2/.test(st.per)&&st.renders>=4,'settings get/apply roundtrip and each change re-renders');
const bad=await pn.evaluate(()=>{setup('normal');UI._brSelLoaded=true;brSetCompare(9);const a=UI.brCompare;brSetCompare('x');return [a,UI.brCompare]});
ok(bad[0]===3&&bad[1]===0,'compare clamps to 0..3');
// G. ytd
const y=await pn.evaluate(()=>{setup('normal');UI.brPeriod={type:'ytd'};UI._brSelLoaded=true;const n=new Date(),mo={y:n.getFullYear(),m:n.getMonth()+1};return {to:brPer().to,cur:fyOf(mo),pos:fyPos(mo)}});
ok(y.cur==='FY27'?y.to===y.pos:(y.to===11||y.to===0),'year to date ends at the current fiscal month (FY27 now? '+y.cur+', to='+y.to+')');
ok(errs.length===0,'no page errors '+errs.join(';'));
console.log(f?'FAILED '+f:'ALL PASS'); await b.close(); process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
