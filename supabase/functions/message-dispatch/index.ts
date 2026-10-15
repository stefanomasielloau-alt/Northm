// Supabase Edge Function: message-dispatch  (2026-10-15)
// Sends the external COPIES of North messages (the in-app ✉ Messages are already delivered by the database).
// Each organisation brings its own provider account (Configuration > Integrations > Messages & channels):
//   email    Resend | SendGrid | Postmark | Brevo           secret = API key            config: from, reply_to
//   slack    bot (chat.postMessage, DMs by member ID) | incoming webhook (one channel)   secret = xoxb- token | webhook URL
//   teams    Teams Workflows / incoming webhook (one channel)                            secret = webhook URL
//   sms      Twilio                                          secret = auth token         config: account_sid, from_number (or MG… service SID)
//   whatsapp Twilio WhatsApp | Meta WhatsApp Cloud API       secret = auth / access token config: account_sid + from_number | phone_number_id + template_name + template_lang
// Secrets live in public.message_channel_secrets (no browser access at all) and are read here with the service role.
//
//   POST {}                                   -> process queued deliveries (signed-in user: their organisation; service role / cron secret: all)
//   POST {test:true, org_id, channel, to?}    -> send ONE test on that channel (Configure role only); `to` defaults to the caller
//   GET                                       -> { ok, deployed, version }
//
// DEPLOY (no CLI needed): Supabase dashboard > Edge Functions > Deploy a new function > name "message-dispatch" > paste this file > Deploy.
// Then turn "Verify JWT with legacy secret" OFF (this function checks the caller itself).
// Optional secrets (Edge Functions > Secrets): APP_URL (default https://northm.vercel.app) used for "Open in North" links;
// MESSAGE_DISPATCH_SECRET -- if set, a scheduled call with header  x-dispatch-secret: <value>  processes every organisation's queue.
// SCHEDULE: Supabase dashboard > Integrations > Cron > Create job > type "Supabase Edge Function" > message-dispatch, POST,
// every 2 minutes (*/2 * * * *), header Authorization: Bearer <service role key>  (or x-dispatch-secret).
// The app also nudges this function right after a message is sent, so copies normally go out within seconds.
//
// Provider request shapes follow each vendor's public API docs; they are NOT live-tested (no provider accounts existed when
// this was written) -- the first "Send a test" in Configuration is the first real check. Errors are shown there in plain English.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ===== CORE START (pure logic; unit-tested under node -- plain JS so it runs unchanged) =====
var EMAIL_PROVIDERS = ['resend', 'sendgrid', 'postmark', 'brevo']
var MAX_ATTEMPTS = 5
function looksLikeEmail(e) { return typeof e === 'string' && e.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(e) }
function looksLikePhone(p) { return typeof p === 'string' && /^\+[1-9]\d{7,14}$/.test(p) }
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
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
var MODULE_PATH = { CampaignPlanning: function (r) { return 'CampaignPlanning.html' + (r ? '#campaign=' + encodeURIComponent(r) : '') },
  Configuration: function (r) { return 'Configuration.html' + (r ? '#feedback=' + encodeURIComponent(r) : '') },
  Events: function (r) { return 'Events.html' + (r ? '#event=' + encodeURIComponent(r) : '') } }
function messageLink(appUrl, m) {
  var base = String(appUrl || 'https://northm.vercel.app').replace(/\/+$/, '')
  if (!m || !m.link_module) return base + '/index.html'
  var f = MODULE_PATH[m.link_module]
  return base + '/' + (f ? f(m.link_record || '') : String(m.link_module).replace(/[^A-Za-z]/g, '') + '.html')
}
// one plain-text rendering used by every channel
function renderText(m, link) {
  var title = String(m.title || 'Message').replace(/[\r\n]+/g, ' ').slice(0, 200)
  var from = m.sender_name ? 'From ' + m.sender_name + ': ' : ''
  var body = String(m.body || '').slice(0, 3500)
  return { title: title, text: from + title + (body ? '\n\n' + body : '') + '\n\nOpen in North: ' + link, short: (from + title).slice(0, 120) + ' ' + link }
}
function emailRequest(provider, key, cfg, to, subject, text, idemKey) {
  var from = parseFrom(cfg.from), replyTo = cfg.reply_to ? parseFrom(cfg.reply_to) : null
  if (!from) return { error: 'The From address is missing or not valid (Configuration > Messages & channels > Email).' }
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">' + escHtml(text).replace(/\r?\n/g, '<br>') + '</div>'
  var p = String(provider || 'resend').toLowerCase()
  if (p === 'resend') { var rb = { from: fromHeader(from), to: [to], subject: subject, text: text, html: html }; if (replyTo) rb.reply_to = replyTo.email
    return { url: 'https://api.resend.com/emails', headers: { 'Authorization': 'Bearer ' + key, 'Idempotency-Key': String(idemKey).slice(0, 256) }, body: rb } }
  if (p === 'sendgrid') { var sb = { personalizations: [{ to: [{ email: to }] }], from: from.name ? { email: from.email, name: from.name } : { email: from.email }, subject: subject,
      content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }] }; if (replyTo) sb.reply_to = { email: replyTo.email }
    return { url: 'https://api.sendgrid.com/v3/mail/send', headers: { 'Authorization': 'Bearer ' + key }, body: sb } }
  if (p === 'postmark') { var pb = { From: fromHeader(from), To: to, Subject: subject, TextBody: text, HtmlBody: html, MessageStream: 'outbound' }; if (replyTo) pb.ReplyTo = replyTo.email
    return { url: 'https://api.postmarkapp.com/email', headers: { 'X-Postmark-Server-Token': key, 'Accept': 'application/json' }, body: pb } }
  if (p === 'brevo') { var bb = { sender: from.name ? { email: from.email, name: from.name } : { email: from.email }, to: [{ email: to }], subject: subject, textContent: text, htmlContent: html }
    if (replyTo) bb.replyTo = { email: replyTo.email }
    return { url: 'https://api.brevo.com/v3/smtp/email', headers: { 'api-key': key, 'Accept': 'application/json' }, body: bb } }
  return { error: 'Email provider "' + provider + '" is not supported (use ' + EMAIL_PROVIDERS.join(', ') + ').' }
}
// Build the HTTP request for one delivery. setting = {provider, config}, secret = string, dest = address/ID/number.
// Returns { url, headers, body, form? } or { error }.
function buildRequest(channel, setting, secret, dest, r, idemKey) {
  var cfg = (setting && setting.config) || {}, provider = String((setting && setting.provider) || '').toLowerCase()
  if (!secret) return { error: 'No credential saved for ' + channel + ' (Configuration > Messages & channels).' }
  if (channel === 'email') {
    if (!looksLikeEmail(dest)) return { error: 'Not a valid email address.' }
    return emailRequest(provider || 'resend', secret, cfg, dest, '[North] ' + r.title, r.text, idemKey)
  }
  if (channel === 'slack') {
    if (provider === 'webhook' || /^https:\/\/hooks\.slack\.com\//.test(secret)) {
      if (!/^https:\/\/hooks\.slack\.com\//.test(secret)) return { error: 'The Slack webhook URL should start with https://hooks.slack.com/' }
      return { url: secret, headers: {}, body: { text: r.text } }
    }
    if (!dest) return { error: 'No Slack member ID or fallback channel.' }
    return { url: 'https://slack.com/api/chat.postMessage', headers: { 'Authorization': 'Bearer ' + secret }, body: { channel: dest, text: r.text, unfurl_links: false } }
  }
  if (channel === 'teams') {
    if (!/^https:\/\//.test(secret)) return { error: 'The Teams webhook URL should start with https://' }
    var link = (r.text.match(/Open in North: (\S+)$/) || [])[1] || ''
    return { url: secret, headers: {}, body: { type: 'message', text: r.title, attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
      body: [{ type: 'TextBlock', text: r.title, weight: 'Bolder', wrap: true }, { type: 'TextBlock', text: r.text.replace(/\n\nOpen in North: \S+$/, ''), wrap: true }],
      actions: link ? [{ type: 'Action.OpenUrl', title: 'Open in North', url: link }] : [] } }] } }
  }
  if (channel === 'sms' || (channel === 'whatsapp' && provider !== 'meta')) {
    if (!looksLikePhone(dest)) return { error: 'Not a valid mobile number (use international format, e.g. +61400111222).' }
    var sid = String(cfg.account_sid || ''), from = String(cfg.from_number || '')
    if (!/^AC[0-9a-fA-F]{32}$/.test(sid)) return { error: 'The Twilio Account SID looks wrong (starts with AC, 34 characters).' }
    if (!from) return { error: 'No From number / sender set.' }
    var form = { To: channel === 'whatsapp' ? 'whatsapp:' + dest : dest, Body: channel === 'sms' ? r.short.slice(0, 600) : r.text.slice(0, 1500) }
    if (channel === 'sms' && /^MG/.test(from)) form.MessagingServiceSid = from; else form.From = channel === 'whatsapp' && !/^whatsapp:/.test(from) ? 'whatsapp:' + from : from
    return { url: 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', headers: { 'Authorization': 'Basic ' + btoa(sid + ':' + secret) }, form: form }
  }
  if (channel === 'whatsapp' && provider === 'meta') {
    if (!looksLikePhone(dest)) return { error: 'Not a valid mobile number (use international format, e.g. +61400111222).' }
    var pid = String(cfg.phone_number_id || ''); if (!/^\d{5,30}$/.test(pid)) return { error: 'The WhatsApp phone number ID is missing.' }
    var to = dest.replace(/^\+/, ''), body
    if (cfg.template_name) body = { messaging_product: 'whatsapp', to: to, type: 'template', template: { name: String(cfg.template_name), language: { code: String(cfg.template_lang || 'en') },
      components: [{ type: 'body', parameters: [{ type: 'text', text: r.text.replace(/\s*\n+\s*/g, ' ').slice(0, 1000) }] }] } }
    else body = { messaging_product: 'whatsapp', to: to, type: 'text', text: { body: r.text.slice(0, 4000), preview_url: false } }
    return { url: 'https://graph.facebook.com/v19.0/' + pid + '/messages', headers: { 'Authorization': 'Bearer ' + secret }, body: body }
  }
  return { error: 'Channel "' + channel + '" is not supported.' }
}
// plain-English error from any provider reply; the secret is scrubbed out
function providerError(status, text, secret) {
  var msg = ''
  try { var j = JSON.parse(text); msg = j.message || j.Message || (j.error && (j.error.message || j.error)) || (j.errors && j.errors[0] && (j.errors[0].message || j.errors[0])) || j.name || '' } catch (e) { msg = String(text || '').slice(0, 200) }
  if (typeof msg !== 'string') msg = JSON.stringify(msg)
  if (secret) msg = msg.split(secret).join('[secret]')
  var hint = status === 401 || status === 403 || msg === 'invalid_auth' || msg === 'not_authed' ? ' (check the saved key / token)' : msg === 'channel_not_found' ? ' (check the Slack member / channel ID, and that the app can message it)' : ''
  return ('Provider said ' + (status ? 'HTTP ' + status : '') + (msg ? ': ' + msg.slice(0, 220) : '') + hint).trim()
}
// Slack answers HTTP 200 with {ok:false,error} -- treat that as a failure
function okResponse(channel, status, text) {
  if (status < 200 || status >= 300) return false
  if (channel === 'slack') { try { var j = JSON.parse(text); if (j && j.ok === false) return false } catch (e) { /* webhook answers "ok" */ } }
  return true
}
// ===== CORE END =====

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-dispatch-secret', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const URL_ = Deno.env.get('SUPABASE_URL')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://northm.vercel.app', CRON_SECRET = Deno.env.get('MESSAGE_DISPATCH_SECRET') || ''
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

async function sendOne(req: any, secret: string, channel: string) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000)
  try {
    const init: any = { method: 'POST', signal: ctl.signal, redirect: 'error', headers: { ...req.headers } }
    if (req.form) { init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; init.body = new URLSearchParams(req.form).toString() }
    else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(req.body) }
    const res = await fetch(req.url, init); const text = await res.text()
    if (okResponse(channel, res.status, text)) { let ref = ''; try { const j = JSON.parse(text); ref = j.id || j.sid || j.MessageID || j.ts || (j.messages && j.messages[0] && j.messages[0].id) || '' } catch (e) { /* plain text */ } return { ok: true, ref: String(ref).slice(0, 120) } }
    return { ok: false, error: providerError(res.status, text, secret) }
  } catch (e) {
    const m = String((e as Error)?.name === 'AbortError' ? 'timed out after 20 seconds' : ((e as Error)?.message || e)).split(secret).join('[secret]').slice(0, 200)
    return { ok: false, error: 'Provider unreachable: ' + m }
  } finally { clearTimeout(timer) }
}
async function orgChannel(org: string, channel: string) {
  const [s, k] = await Promise.all([
    admin.from('message_channel_settings').select('*').eq('org_id', org).eq('channel', channel).maybeSingle(),
    admin.from('message_channel_secrets').select('secret').eq('org_id', org).eq('channel', channel).maybeSingle()])
  return { setting: s.data, secret: (k.data && k.data.secret) || '' }
}
async function processQueue(orgFilter: string | null) {
  let q = admin.from('message_deliveries').select('*').eq('status', 'queued').lt('attempts', MAX_ATTEMPTS).order('created_at', { ascending: true }).limit(50)
  if (orgFilter) q = q.eq('org_id', orgFilter)
  const { data: rows, error } = await q; if (error) return { ok: false, error: error.message }
  let sent = 0, failed = 0; const cache: Record<string, any> = {}
  for (const d of rows || []) {
    const claim = await admin.from('message_deliveries').update({ status: 'sending', attempts: d.attempts + 1 }).eq('id', d.id).eq('status', 'queued').select('id')
    if (!claim.data || !claim.data.length) continue   // another run took it
    const { data: m } = await admin.from('user_messages').select('*').eq('id', d.message_id).maybeSingle()
    if (!m) { await admin.from('message_deliveries').update({ status: 'skipped', last_error: 'message no longer exists' }).eq('id', d.id); continue }
    const key = d.org_id + '|' + d.channel; if (!cache[key]) cache[key] = await orgChannel(d.org_id, d.channel)
    const { setting, secret } = cache[key]
    if (!setting || !setting.enabled) { await admin.from('message_deliveries').update({ status: 'skipped', last_error: 'channel switched off' }).eq('id', d.id); continue }
    const r = renderText(m, messageLink(APP_URL, m))
    const req = buildRequest(d.channel, setting, secret, d.destination, r, 'north-msg-' + d.id)
    const out = (req as any).error ? { ok: false, error: (req as any).error, permanent: true } : await sendOne(req, secret, d.channel)
    if (out.ok) { sent++; await admin.from('message_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), provider_ref: (out as any).ref || null, last_error: null }).eq('id', d.id) }
    else { failed++; const final = (out as any).permanent || d.attempts + 1 >= MAX_ATTEMPTS
      await admin.from('message_deliveries').update({ status: final ? 'failed' : 'queued', last_error: (out as any).error }).eq('id', d.id) }
  }
  return { ok: true, processed: (rows || []).length, sent, failed }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method === 'GET') return json({ ok: true, deployed: true, version: 'message-dispatch-2026-10-15' })
  if (req.method !== 'POST') return json({ ok: false, error: 'use POST' }, 405)
  let body: any = {}; try { body = await req.json() } catch { body = {} }
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const isSystem = (token && token === SERVICE) || (CRON_SECRET && req.headers.get('x-dispatch-secret') === CRON_SECRET)
  if (isSystem && !body.test) return json(await processQueue(null))
  if (!token) return json({ ok: false, error: 'not signed in' }, 401)
  const user = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: u, error: ue } = await user.auth.getUser(token)
  if (ue || !u?.user) return json({ ok: false, error: 'invalid or expired session -- sign in again' }, 401)
  const { data: prof } = await admin.from('profiles').select('id,org_id,email,name').eq('id', u.user.id).maybeSingle()
  if (!prof) return json({ ok: false, error: 'no profile' }, 403)
  if (!body.test) return json(await processQueue(prof.org_id))

  // ---- test send (Configure role only) ----
  const { data: canCfg } = await user.rpc('messages_can_configure')
  if (!canCfg) return json({ ok: false, error: 'Only a Configure role can send channel tests.' }, 403)
  const org = String(body.org_id || prof.org_id), channel = String(body.channel || '')
  if (org !== prof.org_id) { const { data: pa } = await user.rpc('is_platform_admin'); if (!pa) return json({ ok: false, error: 'not your organisation' }, 403) }
  const { setting, secret } = await orgChannel(org, channel)
  if (!setting) return json({ ok: false, error: 'Save the channel settings first.' })
  const { data: pr } = await admin.from('message_prefs').select('*').eq('user_id', prof.id).maybeSingle()
  let to = String(body.to || '').trim()
  if (!to) to = channel === 'email' ? ((pr && pr.email) || prof.email || '') : channel === 'slack' ? ((pr && pr.slack_user_id) || (setting.config || {}).default_channel || '') : channel === 'teams' ? 'webhook' : ((pr && pr.phone) || '')
  const r = renderText({ title: 'Test message from North', body: 'If you can read this, ' + channel + ' copies of North messages are working for your organisation.', sender_name: prof.name || '' }, APP_URL + '/index.html')
  const rq = buildRequest(channel, setting, secret, to, r, 'north-test-' + prof.id + '-' + Math.floor(Date.now() / 60000))
  if ((rq as any).error) return json({ ok: false, error: (rq as any).error })
  const out = await sendOne(rq, secret, channel)
  return json(out.ok ? { ok: true, detail: 'sent to ' + (channel === 'teams' ? 'the Teams channel' : to) } : { ok: false, error: (out as any).error })
})
