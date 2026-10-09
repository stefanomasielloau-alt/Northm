const {chromium}=require('/home/claude/.npm-global/lib/node_modules/playwright');
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await b.newPage({viewport:{width:1000,height:700}});
const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
await pg.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await pg.setContent('<!doctype html><html><head></head><body><div id="a"></div><div id="b"></div></body></html>');
// host globals as the real pages define them
await pg.evaluate(()=>{
  window.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.fin=v=>{v=+v;return isFinite(v)?v:0};
  window.sum=a=>a.reduce((x,y)=>x+y,0);
  window.F={n:(v,d)=>Number(v).toFixed(d||0),p:(v,d)=>(v*100).toFixed(d||0)+'%',mk:v=>'$'+Math.round(v)};
  window.SER=['#3B4CB8','#10AEBF','#E8A317','#D0342C','#7A5AC8','#2E9E5B','#C4559A','#7C879E'];
});
await pg.addScriptTag({path:'/mnt/user-data/uploads/Northm/shared/charts.js'});
// snapshot every ORIGINAL chart output BEFORE loading the new file
const orig=await pg.evaluate(()=>({
  bars:svgBars([{k:'A',v:3},{k:'B',v:9}],{h:200,money:true}),
  stack:svgStack(['a','b'],[{k:'x',v:[1,2]},{k:'y',v:[3,4]}],{h:200}),
  lines:svgLines(['a','b','c'],[{k:'p',v:[1,5,2]}],{h:170}),
  funnel:svgFunnel([100,50,10],['a','b','c'],600),
  water:svgWaterfall([{k:'a',v:5},{k:'b',v:-2},{k:'t',total:true}],{}),
  heat:svgHeat(['r1'],['c1','c2'],[[1,2]],{}),
}));
await pg.addScriptTag({path:'chartsCombo.js'});
const after=await pg.evaluate(()=>({
  bars:svgBars([{k:'A',v:3},{k:'B',v:9}],{h:200,money:true}),
  stack:svgStack(['a','b'],[{k:'x',v:[1,2]},{k:'y',v:[3,4]}],{h:200}),
  lines:svgLines(['a','b','c'],[{k:'p',v:[1,5,2]}],{h:170}),
  funnel:svgFunnel([100,50,10],['a','b','c'],600),
  water:svgWaterfall([{k:'a',v:5},{k:'b',v:-2},{k:'t',total:true}],{}),
  heat:svgHeat(['r1'],['c1','c2'],[[1,2]],{}),
}));
for(const k of Object.keys(orig)) ok(orig[k]===after[k],'existing '+k+' output byte-identical after loading chartsCombo.js');
ok(await pg.evaluate(()=>['svgCombo','comboLegend','chartPick'].every(n=>typeof window[n]==='function')),'new functions defined');

// ---- svgCombo structure
const r=await pg.evaluate(()=>{
  const cats=['Jul','Aug','Sep','Oct'];
  const svg=svgCombo(cats,[{k:'Spend',type:'bar',v:[1000,2000,1500,500]},{k:'Live',type:'line',axis:'right',v:[1,3,2,1]}],{money:true,h:210});
  const d=document.createElement('div');d.innerHTML=svg;
  const q=s=>d.querySelectorAll(s).length;
  return {rects:q('rect'),poly:q('polyline'),circ:q('circle'),titles:q('title'),
    firstTitle:d.querySelector('rect title').textContent, rightLabels:[...d.querySelectorAll('text[text-anchor="start"]')].map(t=>t.textContent),
    leftLabels:[...d.querySelectorAll('text[text-anchor="end"]')].map(t=>t.textContent), svg:svg.length};
});
ok(r.rects===4,'4 bars drawn ('+r.rects+')');
ok(r.poly===1&&r.circ===4,'1 line with 4 points');
ok(r.titles===8,'every bar and point has a hover tooltip ('+r.titles+')');
ok(r.firstTitle==='Spend — Jul: $1000','tooltip text uses label, category and formatted value ('+r.firstTitle+')');
ok(r.rightLabels.length===4&&r.rightLabels[0]==='3'&&r.rightLabels[3]==='0','right axis scaled to its own series (0..3): '+r.rightLabels.join(','));
ok(r.leftLabels[0]==='$2000','left axis scaled to bars (0..$2000): '+r.leftLabels.join(','));

// grouped bars + null handling + escaping + empty
const r2=await pg.evaluate(()=>{
  const g=svgCombo(['<b>x</b>','y'],[{k:'A',v:[1,2]},{k:'B',v:[2,null]}],{});
  const e=svgCombo([],[],{}); const e2=svgCombo(['a'],[],{});
  const d=document.createElement('div');d.innerHTML=g;
  return {rects:d.querySelectorAll('rect').length, hasRawTag:g.indexOf('<b>x</b>')>=0, escaped:g.indexOf('&lt;b&gt;x&lt;/b&gt;')>=0,e:e,e2:e2};
});
ok(r2.rects===3,'grouped bars skip null value (3 rects)');
ok(!r2.hasRawTag&&r2.escaped,'category labels are HTML-escaped');
ok(r2.e.indexOf('<svg')===0&&r2.e2.indexOf('<svg')===0,'empty input returns a harmless svg, no throw');

// stacked
const r3=await pg.evaluate(()=>{
  const g=svgCombo(['a','b'],[{k:'A',v:[1,2]},{k:'B',v:[3,4]}],{stack:true,labels:true,h:200});
  const d=document.createElement('div');d.innerHTML=g;
  const rs=[...d.querySelectorAll('rect')].map(r=>[+r.getAttribute('y'),+r.getAttribute('height')]);
  const tot=[...d.querySelectorAll('text[font-weight="750"]')].map(t=>t.textContent);
  return {n:rs.length,stacked:Math.abs((rs[0][0])-(rs[2][0]+rs[2][1]))<0.01, tot};
});
ok(r3.n===4&&r3.stacked,'stack: second segment sits directly on top of first');
ok(r3.tot.join(',')==='4,6','stack: totals labelled (4,6)');

// area
ok(await pg.evaluate(()=>/<polygon/.test(svgCombo(['a','b'],[{k:'x',type:'area',v:[1,2]}],{}))),'area series draws a filled polygon');

// ---- chartPick switch
await pg.evaluate(()=>{
  window.__html=chartPick('t1',['a','b','c'],[{k:'Spend',type:'bar',v:[10,20,30]},{k:'Live',type:'line',axis:'right',v:[1,2,3]}],{money:true});
  document.getElementById('a').innerHTML=window.__html;
});
const cnt=()=>pg.evaluate(()=>({r:document.querySelectorAll('#a rect').length,p:document.querySelectorAll('#a polyline').length,lg:document.querySelectorAll('#a .lgd span').length,
  pressed:[...document.querySelectorAll('#a button[aria-pressed="true"]')].map(b=>b.textContent).join('')}));
let c=await cnt(); ok(c.r===3&&c.p===1&&c.pressed==='Combo','default view = Combo (3 bars + 1 line)');
ok(c.lg===2,'legend shows both series');
await pg.click('#a button[data-ncp-view="lines"]'); c=await cnt(); ok(c.r===0&&c.p===2&&c.pressed==='Lines','click Lines -> 2 lines, no bars');
await pg.click('#a button[data-ncp-view="bars"]'); c=await cnt(); ok(c.r===6&&c.p===0&&c.pressed==='Bars','click Bars -> grouped bars, no lines');
await pg.click('#a button[data-ncp-view="stack"]'); c=await cnt(); ok(c.r===6&&c.pressed==='Stacked','click Stacked -> stacked bars');
await pg.click('#a button[data-ncp-view="combo"]'); c=await cnt(); ok(c.r===3&&c.p===1,'click Combo -> back to original');
// remembered after "re-render"
await pg.click('#a button[data-ncp-view="lines"]');
await pg.evaluate(()=>{ document.getElementById('b').innerHTML=chartPick('t1',['a','b','c'],[{k:'Spend',type:'bar',v:[10,20,30]},{k:'Live',type:'line',axis:'right',v:[1,2,3]}],{money:true}); });
ok(await pg.evaluate(()=>document.querySelectorAll('#b polyline').length===2),'choice remembered across re-render (same id)');
// stale handler safety: unknown id
ok(await pg.evaluate(()=>{ const bt=document.createElement('button'); bt.setAttribute('data-ncp-view','bars'); bt.setAttribute('data-ncp-id','nope'); document.body.appendChild(bt); bt.click(); return true; }),'click on unknown chart id is a no-op');
// storage blocked
const pg2=await b.newPage();
await pg2.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await pg2.setContent('<!doctype html><html><body><div id="a"></div></body></html>');
await pg2.addScriptTag({path:'chartsCombo.js'});
const r4=await pg2.evaluate(()=>{ Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}}); try{ document.getElementById('a').innerHTML=chartPick('z',['a'],[{k:'s',v:[1]}],{}); document.querySelector('#a button[data-ncp-view="lines"]').click(); return document.querySelectorAll('#a polyline').length; }catch(e){ return 'THREW '+e; } });
ok(r4===0||r4===1,'works with no host globals and blocked storage ('+r4+')');
ok(errs.length===0,'no page errors '+errs.join('|'));
await pg.evaluate(()=>{document.getElementById('a').innerHTML=chartPick('shot',['Jul 26','Aug 26','Sep 26','Oct 26','Nov 26','Dec 26'],[{k:'Spend per month',type:'bar',v:[12000,18000,26000,24000,15000,9000]},{k:'Campaigns live',type:'line',axis:'right',v:[2,3,5,5,3,2]}],{money:true,h:210});});
await pg.screenshot({path:'combo.png',clip:{x:0,y:0,width:700,height:330}});
await b.close();
console.log(f?('FAILED '+f):'ALL PASS');process.exit(f?1:0);
})();
