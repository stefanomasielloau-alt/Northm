const {chromium}=require('playwright'); const fs=require('fs');
const U='/mnt/user-data/uploads/Northm/';
const rep=fs.readFileSync(U+'Reporting.html.new','utf8'), cp=fs.readFileSync(U+'CampaignPlanning.html.new','utf8');
let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)f++};
// slice the new Deals-by-stage block out of Reporting
const a=rep.indexOf('  const stageKeys = Object.keys(dealsByStage)'), b=rep.indexOf('  return P;',a);
const DEALS=rep.slice(a,b);
const c1=cp.indexOf('function pageEffectiveness(){'), c2=cp.indexOf('function pagePartners(){'); const EFF=cp.slice(c1,c2);
(async()=>{ const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const pg=await br.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.route('http://t.local/**',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
 await pg.goto('http://t.local/p');
 // page-style top-level consts (NOT on window), like every North page
 await pg.addScriptTag({content:`const F={mk:v=>{v=Number(v)||0;return Math.abs(v)>=1e6?'$'+(v/1e6).toFixed(1)+'M':Math.abs(v)>=1e3?'$'+(v/1e3).toFixed(0)+'k':'$'+Math.round(v)},n:(v,d)=>String(Math.round(v)),p:v=>Math.round(v*100)+'%',d:x=>x,dt:x=>x};
   const SER=['#10AEBF','#3B4CB8'];const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const sum=a=>a.reduce((x,y)=>x+y,0);
   const fin=v=>(v==null||typeof v!=='number'||!isFinite(v))?0:v;const clamp=(v,a,b)=>Math.max(a,Math.min(b,fin(v)));const UI={dealsSwap:false}; function render(){window.__rendered=(window.__rendered||0)+1}`});
 await pg.addScriptTag({path:U+'shared/charts.js'});
 await pg.addScriptTag({path:U+'shared/chartsCombo.js.new'});
 ok(await pg.evaluate(()=>typeof window.F==='undefined'),'precondition: F is a top-level const, not a window property (as on the real pages)');
 const svg=await pg.evaluate(()=>svgCombo(['A','B'],[{k:'Value',v:[1250000,2500000]},{k:'Deals',v:[2,5],type:'line',axis:'right'}],{money:true}));
 ok(/\$2\.5M|\$1\.9M|\$1\.3M/.test(svg)&&!/\$1250000|\$2500000/.test(svg),'axis labels use the page money formatter (e.g. $2.5M), not raw digits');
 ok(/#10AEBF/i.test(svg),'series colours come from the page palette');
 // Deals by stage block
 await pg.evaluate((DEALS)=>{ window.runDeals=(deals,swap)=>{ UI.dealsSwap=swap; const CFG={deals}; const dealsByStage={},dealsValByStage={};
     CFG.deals.forEach(d=>{ const k=d.stage||'—'; dealsByStage[k]=(dealsByStage[k]||0)+1; dealsValByStage[k]=(dealsValByStage[k]||0)+(Number(d.value)||0); });
     const P={}; eval(DEALS.replace(/^  return P;.*/m,'')); return P.deals; };
   window.toggleDealsSwap=()=>{UI.dealsSwap=!UI.dealsSwap;render();}; },DEALS);
 const deals=[{stage:'Qualify',value:100000},{stage:'Qualify',value:50000},{stage:'Proposal',value:400000},{stage:'Closed Won',value:250000}];
 let h=await pg.evaluate(d=>runDeals(d,false),deals);
 ok(/Deals by stage/.test(h)&&/ncp/.test(h),'combo chart rendered through chartPick');
 ok(/Show deals as bars/.test(h),'swap button offered');
 ok(/Bars: deal value \(left axis\)\. Line: number of deals/.test(h),'caption explains value=bars, deals=line');
 ok(/<td class="n">2<\/td><td class="n">\$150k<\/td>/.test(h)&&/<td class="n">1<\/td><td class="n">\$400k<\/td>/.test(h),'table shows Count and Value per stage');
 ok(/<polyline|<path/.test(h)&&/<rect/.test(h),'has both bars and a line');
 h=await pg.evaluate(d=>runDeals(d,true),deals);
 ok(/Show value as bars/.test(h)&&/Bars: number of deals/.test(h),'swapped: deals bars, value line');
 await pg.evaluate(()=>{UI.dealsSwap=false;window.__rendered=0;toggleDealsSwap();}); ok(await pg.evaluate(()=>window.__rendered===1&&UI.dealsSwap===true),'swap button flips state and re-renders');
 h=await pg.evaluate(()=>runDeals([],false)); ok(/No deals yet/.test(h)&&!/ncp/.test(h),'no deals: empty message, no chart');
 // fallback when combo not loaded
 await pg.evaluate(()=>{ window.__cp=window.chartPick; window.chartPick=undefined; }); 
 h=await pg.evaluate(d=>runDeals(d,false),deals); ok(!/ncp/.test(h)&&/<svg/.test(h)&&!/toggleDealsSwap/.test(h),'without chartsCombo.js: old count bars and no swap button');
 // Effectiveness link
 await pg.evaluate((EFF)=>{ window.openedD=[]; window.openDetail=(k,id)=>openedD.push([k,id]);
   window.CFG={wonDeals:[{campaignId:'c1',value:1000}],campaigns:[{id:'c1',name:'Spring <Launch>'},{id:'c2',name:'Idle'}]};
   window.tasksTotal=(id,k)=>id==='c1'?500:0; (0,eval)('window.pageEffectiveness='+EFF.replace(/^function pageEffectiveness/,'function')); },EFF);
 h=await pg.evaluate(()=>pageEffectiveness());
 ok(/openDetail\('campaign','c1'\)/.test(h)&&!/openDetail\('campaign','c2'\)/.test(h),'campaign name is a link that opens its detail (rows with data only)');
 ok(/Spring &lt;Launch&gt; &rarr;/.test(h),'name still escaped');
 await pg.evaluate(h=>{document.body.innerHTML=h},h); await pg.click('a[title="Open this campaign"]'); ok(await pg.evaluate(()=>JSON.stringify(openedD))==='[["campaign","c1"]]','clicking opens campaign c1');
 ok(errs.length===0,'no page errors '+errs.join(';'));
 console.log(f?'FAILED '+f:'ALL PASS'); await br.close(); process.exit(f?1:0); })().catch(e=>{console.error(e);process.exit(2)});
