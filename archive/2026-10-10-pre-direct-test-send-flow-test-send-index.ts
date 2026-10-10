// Supabase Edge Function: flow-test-send  (2026-10-10)
// Process Maps -> a flow's Simulate tab -> "Send test email to me".
// Simulate itself never sends anything (by design). This function lets a signed-in person send ONE real copy of an
// email step to THEMSELVES ONLY, so they can see how it will look in an inbox. It can never email anybody else:
//   * the recipient is always the signed-in user's own verified login email (taken from their session token),
//     never from the request;
//   * the subject is prefixed "[TEST] " and the body starts with a one-line notice that it is only a test;
//   * the same email goes out through the same path real flow runs use (Hub-Backend POST /flows/dispatch, HMAC-signed,
//     sent from the organisation's Hub sender account), so a successful test also proves that sending works;
//   * the same content sent again within the same minute is NOT sent twice (idempotency key), so a double click is harmless.
//
//   POST {SUPABASE_URL}/functions/v1/flow-test-send      Authorization: Bearer <North user's session token>
//   { subject, body, flow }                               -> { ok:true, to, detail, replayed? } | { ok:false, error }
//   GET                                                   -> { ok:true, deployed:true, dispatchSecretSet }   (used to show the button)
//
// DEPLOY (no CLI needed): Supabase dashboard (North project) > Edge Functions > Deploy a new function > Via Editor > name it
// exactly  flow-test-send  > paste this file > Deploy. Leave "Enforce JWT verification" ON.
// Secrets: FLOW_DISPATCH_SECRET (already set for flow-runner) and optionally HUB_URL. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically. No database change.
//
// Not built: a per-user daily cap (the minute-level duplicate guard is the only throttle); the sender is the organisation's
// Hub sender account, not the individual user's own mailbox, exactly as for real runs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ===== CORE START (pure logic; unit-tested under node -- plain JS so it runs unchanged) =====
var MAX_SUBJECT = 200, MAX_BODY = 20000
function cleanInput(b) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad request' }
  var subject = String(b.subject == null ? '' : b.subject).replace(/[\r\n]+/g, ' ').trim()
  var body = String(b.body == null ? '' : b.body)
  var flow = String(b.flow == null ? '' : b.flow).replace(/[\r\n]+/g, ' ').trim().slice(0, 120)
  if (!subject && !body.trim()) return { ok: false, error: 'This email step has no subject or text to send.' }
  if (!subject) subject = 'North flow notification'
  return { ok: true, subject: subject.slice(0, MAX_SUBJECT), body: body.slice(0, MAX_BODY), flow: flow }
}
function looksLikeEmail(e) { return typeof e === 'string' && e.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(e) }
function fnv(text) { var h = 0x811c9dc5; for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16) }
function testKey(userId, nowMs, subject, body) { return 'test:' + userId + ':' + Math.floor(nowMs / 60000) + ':' + fnv(subject + '\u0001' + body) }
function testEmailText(input) {
  return {
    subject: '[TEST] ' + input.subject,
    body: 'This is a TEST from Process Maps' + (input.flow ? ' (flow: ' + input.flow + ')' : '') + '. It was sent only to you; nothing went to the real recipients.\n\n' + input.body,
  }
}
function buildEnvelope(a) {
  var t = testEmailText(a.input)
  return {
    org_id: a.orgId, hub_org_slug: a.slug || '', run_id: 'test-' + a.userId, node_id: 'simulate-test',
    idempotency_key: testKey(a.userId, a.nowMs, a.input.subject, a.input.body),
    record: { type: 'none', id: null, name: '', fields: {} },
    action: { type: 'email', config: { to: [{ email: a.email }], subject: t.subject, body: t.body } },
  }
}
async function hmacHex(subtle, secret, text) {
  var key = await subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  var sig = new Uint8Array(await subtle.sign('HMAC', key, new TextEncoder().encode(text)))
  var s = ''; for (var i = 0; i < sig.length; i++) s += sig[i].toString(16).padStart(2, '0'); return s
}
// ===== CORE END =====

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method === 'GET') return json({ ok: true, deployed: true, dispatchSecretSet: !!Deno.env.get('FLOW_DISPATCH_SECRET') })
  if (req.method !== 'POST') return json({ ok: false, error: 'use POST' }, 405)
  const userToken = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!userToken) return json({ ok: false, error: 'not signed in' }, 401)
  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad request' }, 400) }
  const input = cleanInput(body)
  if (!input.ok) return json({ ok: false, error: (input as any).error }, 400)

  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const { data: userData, error: userErr } = await anon.auth.getUser(userToken)
  if (userErr || !userData?.user) return json({ ok: false, error: 'invalid or expired session -- sign in again' }, 401)
  const email = userData.user.email || ''
  if (!looksLikeEmail(email)) return json({ ok: false, error: 'Your login has no email address to send the test to.' }, 400)
  const { data: profile } = await anon.from('profiles').select('org_id').eq('id', userData.user.id).maybeSingle()
  if (!profile?.org_id) return json({ ok: false, error: 'could not resolve your organisation' }, 403)

  const secret = (Deno.env.get('FLOW_DISPATCH_SECRET') || '').trim()
  if (!secret) return json({ ok: false, error: 'FLOW_DISPATCH_SECRET is not set on this function (the same secret flow-runner uses).' }, 501)
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: org } = await svc.from('organizations').select('hub_org_slug').eq('id', profile.org_id).maybeSingle()

  const envelope = buildEnvelope({ orgId: profile.org_id, slug: org?.hub_org_slug || '', userId: userData.user.id, email, input, nowMs: Date.now() })
  const raw = JSON.stringify(envelope)
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = await hmacHex(crypto.subtle, secret, ts + '.' + raw)
  const hub = String(Deno.env.get('HUB_URL') || 'https://hub-backend-psi.vercel.app').replace(/\/+$/, '')
  try {
    const res = await fetch(hub + '/flows/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Flow-Timestamp': ts, 'X-Flow-Signature': sig }, body: raw })
    let j: any = null; try { j = await res.json() } catch { j = null }
    if (j && j.ok) return json({ ok: true, to: email, detail: (j.result && j.result.detail) || 'Sent', replayed: !!j.replayed })
    if (j && j.ok === false) return json({ ok: false, error: String(j.error || ('Hub returned HTTP ' + res.status)).slice(0, 400) })
    return json({ ok: false, error: 'Hub returned HTTP ' + res.status })
  } catch (e) {
    return json({ ok: false, error: 'Hub unreachable: ' + String((e as Error)?.message || e).slice(0, 200) })
  }
})
