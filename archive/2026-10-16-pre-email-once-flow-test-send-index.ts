// Supabase Edge Function: flow-test-send  (2026-10-10, v2 -- sends DIRECTLY from North's Supabase, no Hub)
// Process Maps -> a flow's Simulate tab -> "Send test email to me".
// Simulate itself never sends anything (by design). This function lets a signed-in person send ONE real copy of an
// email step to THEMSELVES ONLY, so they can see how it will look in an inbox. It can never email anybody else:
//   * the recipient is always the signed-in user's own verified login email (taken from their session token),
//     never from the request;
//   * the subject is prefixed "[TEST] " and the body starts with a one-line notice that it is only a test;
//   * the email is sent by THIS function, straight to the email provider's web API (Resend, SendGrid, Postmark or Brevo)
//     using a key kept as a Supabase function secret -- Hub is not involved at all;
//   * the same content sent again within the same minute is NOT sent twice (in-memory guard + the provider's own
//     idempotency where it has one), and each person is capped at 10 test emails an hour.
//
//   POST {SUPABASE_URL}/functions/v1/flow-test-send      Authorization: Bearer <North user's session token>
//   { subject, body, flow }                               -> { ok:true, to, detail, replayed? } | { ok:false, error }
//   GET                                                   -> { ok:true, deployed:true, provider, providerReady, fromSet }
//
// DEPLOY (no CLI needed): Supabase dashboard (North project) > Edge Functions > flow-test-send > Code > replace with this
// file > Deploy. Turn "Verify JWT with legacy secret" OFF (this function checks the user's login itself).
// SECRETS (Edge Functions > Secrets), set by the platform owner -- never typed into chat:
//   EMAIL_PROVIDER   resend | sendgrid | postmark | brevo        (default resend)
//   EMAIL_API_KEY    the provider's API key (postmark: the Server API token)
//   EMAIL_FROM       e.g.  North <notifications@your-verified-domain.com>   (the address must be verified at the provider)
//   EMAIL_REPLY_TO   optional
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically. No database change.
//
// Provider request shapes come from each vendor's public docs; they are NOT live-tested (no provider account existed
// when this was written) -- the first real test email is the first real check.
// Not built: per-organisation sender settings in Configuration (this uses one platform-level sender), and sending the real
// flow steps from North (flow-runner still sends real runs through Hub).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ===== CORE START (pure logic; unit-tested under node -- plain JS so it runs unchanged) =====
var MAX_SUBJECT = 200, MAX_BODY = 20000
var PROVIDERS = ['resend', 'sendgrid', 'postmark', 'brevo']
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
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function htmlFromText(text) { return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;white-space:normal">' + escHtml(text).replace(/\r?\n/g, '<br>') + '</div>' }
// "Name <a@b.com>" or "a@b.com" -> { name, email } (null if not usable). Names are stripped of control characters and quotes.
function parseFrom(raw) {
  var s = String(raw == null ? '' : raw).trim()
  if (!s || /[\r\n]/.test(s)) return null
  var m = s.match(/^(.*?)<\s*([^<>\s]+)\s*>$/)
  var name = '', email = s
  if (m) { name = m[1].replace(/["\u0000-\u001f]/g, '').trim(); email = m[2] }
  if (!looksLikeEmail(email)) return null
  return { name: name.slice(0, 100), email: email }
}
function fromHeader(p) { return p.name ? p.name + ' <' + p.email + '>' : p.email }
// One request per provider: { url, headers, body (object) }. cfg = { provider, key, from:{name,email}, replyTo:{name,email}|null }
function buildProviderRequest(cfg, m) {
  var p = String(cfg.provider || 'resend').toLowerCase()
  var html = htmlFromText(m.text)
  if (p === 'resend') {
    var rb = { from: fromHeader(cfg.from), to: [m.to], subject: m.subject, text: m.text, html: html }
    if (cfg.replyTo) rb.reply_to = cfg.replyTo.email
    return { url: 'https://api.resend.com/emails', headers: { 'Authorization': 'Bearer ' + cfg.key, 'Idempotency-Key': m.idemKey.slice(0, 256) }, body: rb }
  }
  if (p === 'sendgrid') {
    var sb = { personalizations: [{ to: [{ email: m.to }] }], from: cfg.from.name ? { email: cfg.from.email, name: cfg.from.name } : { email: cfg.from.email },
      subject: m.subject, content: [{ type: 'text/plain', value: m.text }, { type: 'text/html', value: html }] }
    if (cfg.replyTo) sb.reply_to = { email: cfg.replyTo.email }
    return { url: 'https://api.sendgrid.com/v3/mail/send', headers: { 'Authorization': 'Bearer ' + cfg.key }, body: sb }
  }
  if (p === 'postmark') {
    var pb = { From: fromHeader(cfg.from), To: m.to, Subject: m.subject, TextBody: m.text, HtmlBody: html, MessageStream: 'outbound' }
    if (cfg.replyTo) pb.ReplyTo = cfg.replyTo.email
    return { url: 'https://api.postmarkapp.com/email', headers: { 'X-Postmark-Server-Token': cfg.key, 'Accept': 'application/json' }, body: pb }
  }
  if (p === 'brevo') {
    var bb = { sender: cfg.from.name ? { email: cfg.from.email, name: cfg.from.name } : { email: cfg.from.email }, to: [{ email: m.to }],
      subject: m.subject, textContent: m.text, htmlContent: html }
    if (cfg.replyTo) bb.replyTo = { email: cfg.replyTo.email }
    return { url: 'https://api.brevo.com/v3/smtp/email', headers: { 'api-key': cfg.key, 'Accept': 'application/json' }, body: bb }
  }
  return null
}
// Plain-English error from a provider reply; the key is scrubbed out of any text.
function providerError(status, text, key) {
  var msg = ''
  try { var j = JSON.parse(text); msg = j.message || j.Message || (j.error && (j.error.message || j.error)) || (j.errors && j.errors[0] && j.errors[0].message) || j.name || '' } catch (e) { msg = '' }
  if (typeof msg !== 'string') msg = JSON.stringify(msg)
  if (!msg) msg = String(text || '').slice(0, 200)
  if (key) msg = msg.split(key).join('[key]')
  var hint = status === 401 || status === 403 ? ' (check EMAIL_API_KEY, and that the From address/domain is verified at the provider)' : status === 422 || status === 400 ? ' (check EMAIL_FROM is a verified sender)' : ''
  return ('Email provider said HTTP ' + status + (msg ? ': ' + msg.slice(0, 220) : '') + hint)
}
// Best-effort limits kept in memory (reset when the function restarts): duplicate guard + hourly cap per person.
function makeGuard(max, windowMs) {
  var seen = {}, hits = {}
  return function (userId, key, nowMs) {
    for (var k in seen) if (nowMs - seen[k] > 120000) delete seen[k]
    if (seen[key]) return 'duplicate'
    var arr = (hits[userId] || []).filter(function (t) { return nowMs - t < windowMs })
    if (arr.length >= max) { hits[userId] = arr; return 'limit' }
    arr.push(nowMs); hits[userId] = arr; seen[key] = nowMs
    return 'ok'
  }
}
// ===== CORE END =====

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const guard = makeGuard(10, 3600000)

function emailConfig() {
  const provider = (Deno.env.get('EMAIL_PROVIDER') || 'resend').trim().toLowerCase()
  const key = (Deno.env.get('EMAIL_API_KEY') || '').trim()
  const from = parseFrom(Deno.env.get('EMAIL_FROM') || '')
  const rt = (Deno.env.get('EMAIL_REPLY_TO') || '').trim()
  const replyTo = rt ? parseFrom(rt) : null
  return { provider, key, from, replyTo }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const cfg = emailConfig()
  if (req.method === 'GET') return json({ ok: true, deployed: true, version: 'direct-2026-10-10', provider: cfg.provider, providerKnown: PROVIDERS.indexOf(cfg.provider) >= 0, providerReady: !!cfg.key, fromSet: !!cfg.from })
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

  if (PROVIDERS.indexOf(cfg.provider) < 0) return json({ ok: false, error: 'EMAIL_PROVIDER "' + cfg.provider + '" is not supported. Use resend, sendgrid, postmark or brevo.' }, 501)
  if (!cfg.key) return json({ ok: false, error: 'Sending is not set up yet: the platform owner needs to add the EMAIL_API_KEY secret to the flow-test-send function (see 2026-10-10-flow-test-send-direct-setup.md).' }, 501)
  if (!cfg.from) return json({ ok: false, error: 'Sending is not set up yet: the EMAIL_FROM secret is missing or is not a valid address (use  North <notifications@your-domain.com>).' }, 501)

  const t = testEmailText(input)
  const idemKey = testKey(userData.user.id, Date.now(), input.subject, input.body)
  const g = guard(userData.user.id, idemKey, Date.now())
  if (g === 'duplicate') return json({ ok: true, to: email, detail: 'Already sent a moment ago', replayed: true })
  if (g === 'limit') return json({ ok: false, error: 'You have sent 10 test emails in the last hour. Try again later.' }, 429)

  const req2 = buildProviderRequest(cfg, { to: email, subject: t.subject, text: t.body, idemKey })
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000)
  try {
    const res = await fetch(req2!.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...req2!.headers }, body: JSON.stringify(req2!.body), signal: ctl.signal, redirect: 'error' })
    const text = await res.text()
    if (res.ok) return json({ ok: true, to: email, detail: 'Sent by ' + cfg.provider + ' from ' + cfg.from.email })
    return json({ ok: false, error: providerError(res.status, text, cfg.key) })
  } catch (e) {
    const msg = String((e as Error)?.name === 'AbortError' ? 'timed out after 20 seconds' : ((e as Error)?.message || e)).split(cfg.key).join('[key]').slice(0, 200)
    return json({ ok: false, error: 'Email provider unreachable: ' + msg })
  } finally { clearTimeout(timer) }
})
