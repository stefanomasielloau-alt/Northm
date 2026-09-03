/* Shared hand-rolled SVG chart toolkit (extracted 2026-09-03 from Ordo.html -- see the
   per-file-architecture proposal doc, claude/2026-09-03-north-per-file-architecture-proposal.md,
   for why). Loaded via a plain <script src="shared/charts.js"> tag (no build step, no bundler,
   same Option 2 pattern as shared/convertToMain.js), placed before each page's own inline
   <script> block so the functions are normal globals by the time the rest of the page's code
   runs. No dependencies of its own beyond ordinary browser JS, but every function here reads
   these globals from the HOST PAGE at call time (not at load time, so load order doesn't
   matter -- function bodies aren't evaluated until something actually calls a chart function):
     esc(s)      -- HTML-escape a string (every North file already defines this)
     F.n/F.p/F.mk -- number/percent/money formatters (every North file already defines F)
     sum(arr)    -- array sum (every North file already defines this)
     fin(v)      -- coerce to a finite number, 0 otherwise
     SER         -- an 8-color palette array for multi-series charts
   Ordo.html already defines fin/SER for its own use elsewhere (fin backs clamp(), used well
   beyond charts) so they stay defined there, not duplicated here. A page that doesn't already
   have fin/SER (Reportus.html) needs its own small definitions alongside this script tag --
   see Reportus.html's own comment where those are added.

   Six chart types, each a pure function: data + options in, an inline <svg>...</svg> string
   out. No canvas, no external chart library -- consistent with North's no-build-step,
   no-dependency architecture. Behaviour is byte-for-byte identical to the versions that lived
   in Ordo.html before this extraction; only the file they live in changed. */

function svgFunnel(vals,labels,w){
  w=w||620; vals=(vals||[]).map(fin); const h=170,n=vals.length,max=Math.max.apply(null,vals.concat([1]));
  const gap=8,bw=(w-gap*(n-1))/n; let s='';
  vals.forEach((v,i)=>{
    const x=i*(bw+gap), hh=Math.max(3,(v/max)*104), y=26+(104-hh)/2;
    const nx=i<n-1?Math.max(3,(vals[i+1]/max)*104):hh;
    const ny=26+(104-nx)/2;
    s+=`<polygon points="${x},${y} ${x+bw},${ny} ${x+bw},${ny+nx} ${x},${y+hh}" fill="${SER[i%SER.length]}" opacity=".88"/>`;
    s+=`<text x="${x+bw/2}" y="${18}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#10182B">${F.n(v)}</text>`;
    s+=`<text x="${x+bw/2}" y="${150}" text-anchor="middle" font-size="10" font-weight="700" fill="#7C879E">${esc(labels[i])}</text>`;
    if(i>0&&vals[i-1]>0) s+=`<text x="${x+bw/2}" y="${163}" text-anchor="middle" font-size="9" fill="#7C879E">${F.p(v/vals[i-1],0)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${s}</svg>`;
}
function svgBars(rows,opts){
  opts=opts||{}; rows=(rows||[]).map(r=>({k:r.k,k2:r.k2,c:r.c,v:Math.max(0,fin(r.v))}));
  if(!rows.length) return '<svg viewBox="0 0 10 10" width="100%" height="10"></svg>'; const w=opts.w||620,h=opts.h||210,pl=opts.pl||46,pb=30,pt=14;
  const max=Math.max.apply(null,rows.map(r=>r.v).concat([1]));
  const n=rows.length,iw=w-pl-10,bw=Math.min(opts.maxBw||54,iw/n*0.66),step=iw/n;
  let s=`<line x1="${pl}" y1="${h-pb}" x2="${w-6}" y2="${h-pb}" stroke="#DFE3EB"/>`;
  for(let k=0;k<=3;k++){
    const y=pt+(h-pb-pt)*(k/3), v=max*(1-k/3);
    s+=`<line x1="${pl}" y1="${y}" x2="${w-6}" y2="${y}" stroke="#EEF1F6"/>`;
    s+=`<text x="${pl-6}" y="${y+3}" text-anchor="end" font-size="9" fill="#7C879E">${opts.money?F.mk(v):F.n(v)}</text>`;
  }
  rows.forEach((r,i)=>{
    const bh=Math.max(1,(r.v/max)*(h-pb-pt)),x=pl+step*i+(step-bw)/2,y=h-pb-bh;
    s+=`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2.5" fill="${r.c||SER[i%SER.length]}" opacity=".9"/>`;
    s+=`<text x="${x+bw/2}" y="${y-4}" text-anchor="middle" font-size="9.5" font-weight="750" fill="#45506B">${opts.money?F.mk(r.v):F.n(r.v,opts.dec||0)}</text>`;
    s+=`<text x="${x+bw/2}" y="${h-pb+13}" text-anchor="middle" font-size="9" fill="#7C879E">${esc(r.k)}</text>`;
    if(r.k2) s+=`<text x="${x+bw/2}" y="${h-pb+23}" text-anchor="middle" font-size="8.5" fill="#A8B1C4">${esc(r.k2)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${s}</svg>`;
}
function svgStack(cats,series,opts){
  opts=opts||{}; series=(series||[]).map(s=>({k:s.k,v:(s.v||[]).map(v=>Math.max(0,fin(v)))})); const w=opts.w||620,h=opts.h||220,pl=46,pb=30,pt=14;
  const totals=cats.map((_,i)=>sum(series.map(s=>s.v[i]||0)));
  const max=Math.max.apply(null,totals.concat([1]));
  const n=cats.length,iw=w-pl-10,bw=Math.min(50,iw/n*0.62),step=iw/n;
  let s=`<line x1="${pl}" y1="${h-pb}" x2="${w-6}" y2="${h-pb}" stroke="#DFE3EB"/>`;
  for(let k=0;k<=3;k++){
    const y=pt+(h-pb-pt)*(k/3);
    s+=`<line x1="${pl}" y1="${y}" x2="${w-6}" y2="${y}" stroke="#EEF1F6"/>`;
    s+=`<text x="${pl-6}" y="${y+3}" text-anchor="end" font-size="9" fill="#7C879E">${opts.money?F.mk(max*(1-k/3)):F.n(max*(1-k/3))}</text>`;
  }
  cats.forEach((c,i)=>{
    let acc=0; const x=pl+step*i+(step-bw)/2;
    series.forEach((sr,j)=>{
      const v=sr.v[i]||0, bh=(v/max)*(h-pb-pt);
      if(bh>0.5){ s+=`<rect x="${x}" y="${h-pb-acc-bh}" width="${bw}" height="${bh}" fill="${SER[j%SER.length]}" opacity=".9"/>`; }
      acc+=bh;
    });
    s+=`<text x="${x+bw/2}" y="${h-pb-acc-4}" text-anchor="middle" font-size="9.5" font-weight="750" fill="#45506B">${opts.money?F.mk(totals[i]):F.n(totals[i])}</text>`;
    s+=`<text x="${x+bw/2}" y="${h-pb+13}" text-anchor="middle" font-size="9" fill="#7C879E">${esc(c)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${s}</svg>`;
}
function svgLines(cats,series,opts){
  opts=opts||{}; series=(series||[]).map(s=>({k:s.k,c:s.c,dash:s.dash,v:(s.v||[]).map(v=>v==null?null:fin(v))})); const w=opts.w||620,h=opts.h||210,pl=46,pb=28,pt=14;
  const all=[].concat.apply([],series.map(s=>s.v)).filter(v=>v!=null&&!isNaN(v));
  const max=Math.max.apply(null,all.concat([1])),min=opts.zero===false?Math.min.apply(null,all.concat([0])):0;
  const rg=(max-min)||1,iw=w-pl-12,step=cats.length>1?iw/(cats.length-1):0;
  const X=i=>pl+step*i, Y=v=>pt+(h-pb-pt)*(1-(v-min)/rg);
  let s='';
  for(let k=0;k<=3;k++){
    const y=pt+(h-pb-pt)*(k/3);
    s+=`<line x1="${pl}" y1="${y}" x2="${w-6}" y2="${y}" stroke="#EEF1F6"/>`;
    s+=`<text x="${pl-6}" y="${y+3}" text-anchor="end" font-size="9" fill="#7C879E">${opts.pct?F.p(max-rg*(k/3),0):opts.money?F.mk(max-rg*(k/3)):F.n(max-rg*(k/3))}</text>`;
  }
  series.forEach((sr,j)=>{
    const col=sr.c||SER[j%SER.length];
    const pts=sr.v.map((v,i)=>(v==null||isNaN(v))?null:X(i)+','+Y(v)).filter(Boolean).join(' ');
    s+=`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${sr.dash?1.6:2.1}" ${sr.dash?'stroke-dasharray="4 3"':''} stroke-linejoin="round"/>`;
    sr.v.forEach((v,i)=>{ if(v==null||isNaN(v))return; s+=`<circle cx="${X(i)}" cy="${Y(v)}" r="2.8" fill="#fff" stroke="${col}" stroke-width="1.8"/>`; });
  });
  cats.forEach((c,i)=>{ if(cats.length>14&&i%2)return;
    s+=`<text x="${X(i)}" y="${h-pb+13}" text-anchor="middle" font-size="8.5" fill="#7C879E">${esc(c)}</text>`; });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${s}</svg>`;
}
function svgWaterfall(items,opts){
  opts=opts||{}; items=(items||[]).map(i=>({k:i.k,total:i.total,v:fin(i.v)})); const w=opts.w||620,h=opts.h||210,pl=52,pb=30,pt=16;
  let run=0; const tops=[];
  items.forEach(it=>{ if(it.total){tops.push({a:0,b:run});} else {tops.push({a:run,b:run+it.v}); run+=it.v;} });
  const max=Math.max.apply(null,tops.map(t=>Math.max(t.a,t.b)).concat([1]));
  const n=items.length,iw=w-pl-10,bw=Math.min(46,iw/n*0.6),step=iw/n;
  let s=`<line x1="${pl}" y1="${h-pb}" x2="${w-6}" y2="${h-pb}" stroke="#DFE3EB"/>`;
  for(let k=0;k<=3;k++){
    const y=pt+(h-pb-pt)*(k/3);
    s+=`<line x1="${pl}" y1="${y}" x2="${w-6}" y2="${y}" stroke="#EEF1F6"/>`;
    s+=`<text x="${pl-6}" y="${y+3}" text-anchor="end" font-size="9" fill="#7C879E">${opts.money?F.mk(max*(1-k/3)):F.n(max*(1-k/3))}</text>`;
  }
  const Y=v=>pt+(h-pb-pt)*(1-v/max);
  items.forEach((it,i)=>{
    const t=tops[i],x=pl+step*i+(step-bw)/2;
    const y0=Y(Math.max(t.a,t.b)),y1=Y(Math.min(t.a,t.b));
    s+=`<rect x="${x}" y="${y0}" width="${bw}" height="${Math.max(1.5,y1-y0)}" rx="2" fill="${it.total?'#3B4CB8':(it.v<0?'#D0342C':'#10AEBF')}" opacity=".9"/>`;
    s+=`<text x="${x+bw/2}" y="${y0-4}" text-anchor="middle" font-size="9.5" font-weight="750" fill="#45506B">${opts.money?F.mk(it.total?t.b:it.v):F.n(it.total?t.b:it.v,opts.dec||0)}</text>`;
    s+=`<text x="${x+bw/2}" y="${h-pb+13}" text-anchor="middle" font-size="8.5" fill="#7C879E">${esc(it.k)}</text>`;
    if(i<n-1&&!items[i+1].total) s+=`<line x1="${x+bw}" y1="${Y(t.b)}" x2="${pl+step*(i+1)+(step-bw)/2}" y2="${Y(t.b)}" stroke="#A8B1C4" stroke-dasharray="2 2"/>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${s}</svg>`;
}
function svgHeat(rowLabels,colLabels,matrix,opts){
  opts=opts||{}; matrix=(matrix||[]).map(r=>(r||[]).map(v=>v==null?null:fin(v))); const cw=opts.cw||44,rh=24,pl=opts.pl||96,pt=22;
  const w=pl+cw*colLabels.length+10,h=pt+rh*rowLabels.length+8;
  const flat=[].concat.apply([],matrix).filter(v=>v!=null&&!isNaN(v));
  const mn=Math.min.apply(null,flat),mx=Math.max.apply(null,flat),rg=(mx-mn)||1;
  let s='';
  colLabels.forEach((c,j)=>{ s+=`<text x="${pl+cw*j+cw/2}" y="${pt-7}" text-anchor="middle" font-size="9" font-weight="700" fill="#7C879E">${esc(c)}</text>`; });
  rowLabels.forEach((r,i)=>{
    s+=`<text x="${pl-8}" y="${pt+rh*i+rh/2+3.5}" text-anchor="end" font-size="9.5" font-weight="650" fill="#45506B">${esc(r)}</text>`;
    colLabels.forEach((c,j)=>{
      const v=matrix[i][j]; const t=v==null?0:(v-mn)/rg;
      const col=v==null?'#F2F4F8':`rgba(16,174,191,${0.10+t*0.80})`;
      s+=`<rect x="${pl+cw*j}" y="${pt+rh*i}" width="${cw-2}" height="${rh-2}" rx="2.5" fill="${col}"/>`;
      if(v!=null) s+=`<text x="${pl+cw*j+(cw-2)/2}" y="${pt+rh*i+rh/2+3.5}" text-anchor="middle" font-size="8.8" font-weight="700" fill="${t>0.6?'#fff':'#10182B'}">${opts.pct?F.p(v,0):F.n(v,opts.dec||0)}</text>`;
    });
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${s}</svg>`;
}
