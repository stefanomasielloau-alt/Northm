const fs=require('fs'); const {execSync}=require('child_process');
const src=fs.readFileSync('index.ts','utf8'); const a=src.indexOf('// ===== CORE START'), b=src.indexOf('// ===== CORE END');
const core=src.slice(a,b); const M=new Function(core+'\nreturn {cleanInput,looksLikeEmail,fnv,testKey,testEmailText,buildEnvelope,hmacHex,MAX_SUBJECT,MAX_BODY};')();
let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)f++};
let r=M.cleanInput({subject:'Hi\r\nBcc: evil@x.com',body:'Hello {{name}}',flow:'My flow'});
ok(r.ok&&r.subject==='Hi Bcc: evil@x.com'&&!/[\r\n]/.test(r.subject),'line breaks stripped from the subject (no header injection)');
ok(!M.cleanInput(null).ok&&!M.cleanInput({}).ok&&!M.cleanInput({subject:' ',body:'  '}).ok,'empty / non-object input refused');
r=M.cleanInput({body:'just text'}); ok(r.ok&&r.subject==='North flow notification','missing subject falls back like a real run');
r=M.cleanInput({subject:'x'.repeat(500),body:'y'.repeat(50000),flow:'f'.repeat(500)}); ok(r.subject.length===200&&r.body.length===20000&&r.flow.length===120,'sizes capped');
ok(M.looksLikeEmail('a@b.co')&&!M.looksLikeEmail('a@b')&&!M.looksLikeEmail('a b@c.com')&&!M.looksLikeEmail('a@b.com,c@d.com')&&!M.looksLikeEmail('')&&!M.looksLikeEmail(null),'email shape check (rejects lists and spaces)');
const input=M.cleanInput({subject:'Welcome',body:'Hi there',flow:'Onboarding'});
const e=M.buildEnvelope({orgId:'org-1',slug:'acme',userId:'u-1',email:'stef@example.com',input,nowMs:1791590000000});
ok(e.action.type==='email'&&e.action.config.to.length===1&&e.action.config.to[0].email==='stef@example.com','exactly one recipient: the signed-in user');
ok(e.action.config.subject==='[TEST] Welcome'&&/^This is a TEST from Process Maps \(flow: Onboarding\)\. It was sent only to you/.test(e.action.config.body)&&/Hi there$/.test(e.action.config.body),'subject prefixed [TEST]; body starts with the test notice');
ok(e.hub_org_slug==='acme'&&e.org_id==='org-1'&&e.record.type==='none','envelope shape matches real runs (org, slug, empty record)');
const k1=M.testKey('u-1',1791590000000,'s','b'), k2=M.testKey('u-1',1791590030000,'s','b'), k3=M.testKey('u-1',1791590070000,'s','b'), k4=M.testKey('u-1',1791590000000,'s','b2'), k5=M.testKey('u-2',1791590000000,'s','b');
ok(k1===k2&&k1!==k3&&k1!==k4&&k1!==k5,'same content in the same minute = same key (double click sends once); new minute / other content / other user = new key');
ok(e.idempotency_key.length<300,'idempotency key within Hub\'s 300-char limit');
// HMAC compatible with Hub: hex(HMAC_SHA256(secret, ts + '.' + body))
(async()=>{ const {webcrypto}=require('crypto'); const raw=JSON.stringify(e), ts='1791590000', secret='s3cret-key';
 const mine=await M.hmacHex(webcrypto.subtle,secret,ts+'.'+raw);
 const py=execSync('python3 -c "import hmac,hashlib,sys; print(hmac.new(sys.argv[1].encode(),(sys.argv[2]+\'.\'+sys.argv[3]).encode(),hashlib.sha256).hexdigest())" "'+secret+'" '+ts+" '"+raw.replace(/'/g,"'\\''")+"'").toString().trim();
 ok(mine===py,'signature identical to Hub\'s Python HMAC-SHA256 over "timestamp.body"');
 // main handler hardening checks by source inspection
 ok(!/body\??\.to\b|body\??\.email|input\.to\b|input\.email/.test(src.slice(src.indexOf('Deno.serve'))),'handler never reads a recipient from the request');
 ok(/getUser\(userToken\)/.test(src)&&/userData\.user\.email/.test(src),'recipient comes from the verified session');
 console.log(f?'FAILED '+f:'ALL PASS'); process.exit(f?1:0); })();
