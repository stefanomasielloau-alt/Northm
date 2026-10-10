const {chromium}=require('playwright'); let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const pg=await b.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.setContent('<!doctype html><html><body><div id="a"></div></body></html>');
 await pg.addScriptTag({path:'/mnt/user-data/uploads/Northm/shared/budgetLines.js.new'});
 const r=await pg.evaluate(async()=>{
   const rows=[{id:'i1',org_id:'o1',parent_type:'task',parent_id:'t1',category_id:null,description:'x',planned_amount:100,quoted_amount:null,approved_amount:null,committed_amount:60,actual_amount:null,sort_order:1,created_at:'2026-01-01'}];
   const mk=t=>{ const q={_t:t,select(){return q},eq(){return q},order(){return q},maybeSingle(){return Promise.resolve({data:null})},update(p){ q._u=p; return q},insert(p){q._i=p;return q},delete(){q._d=1;return q},single(){return q},
     then(res,rej){ let d=[]; if(t==='budget_line_items') d=rows; if(t==='budget_line_categories') d=[]; if(q._u){ Object.assign(rows[0],q._u); d=[rows[0]]; } return Promise.resolve({data:d,error:null}).then(res,rej);} }; return q; };
   const sb={from:mk}; const calls=[]; 
   const h=NorthBudgetLines.mount(document.getElementById('a'),{sb,orgId:'o1',parentType:'task',parentId:'t1',canEdit:true,onRows:(items,pt,pid)=>calls.push([items.length,pt,pid,items[0]&&items[0].planned_amount])});
   await new Promise(r=>setTimeout(r,200));
   const afterLoad=calls.slice();
   // edit planned amount in the table
   const inp=document.querySelector('[data-f="planned_amount"]')||document.querySelector('input[data-field="planned_amount"]')||[...document.querySelectorAll('input')].find(i=>i.value==='100');
   let edited=false; if(inp){ inp.focus(); inp.value='250'; inp.dispatchEvent(new Event('change',{bubbles:true})); inp.dispatchEvent(new Event('blur',{bubbles:true})); edited=true; await new Promise(r=>setTimeout(r,300)); }
   return {afterLoad,edited,calls:calls.slice(),inputs:[...document.querySelectorAll('input')].map(i=>i.value).slice(0,6)};
 });
 console.log(JSON.stringify(r));
 ok(r.afterLoad.length>=1&&r.afterLoad[0][0]===1&&r.afterLoad[0][1]==='task'&&r.afterLoad[0][2]==='t1','onRows fires after load with the rows and the parent');
 ok(r.edited&&r.calls.length>r.afterLoad.length&&r.calls[r.calls.length-1][3]===250,'onRows fires again after an edit with the new amount');
 ok(errs.length===0,'no page errors '+errs.join(';'));
 console.log(f?'FAILED '+f:'ALL PASS'); await b.close(); process.exit(f?1:0); })().catch(e=>{console.error(e);process.exit(2)});
