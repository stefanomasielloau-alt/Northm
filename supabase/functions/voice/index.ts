// Supabase Edge Function: voice  (2026-10-08)
// The organisation's OWN text-to-speech provider for North's Ask Alec read-aloud (Stef: "an organization
// can choose who their provider is ... setups should always be in North, replicating how Hub links up to
// APIs"). Everything lives in North's Supabase project: the settings in public.voice_providers, the API key
// (and any secret headers) in public.voice_provider_secrets, which no browser can read. The browser only ever
// sends text to this function; this function calls the provider and returns audio.
//
//   POST {SUPABASE_URL}/functions/v1/voice      Authorization: Bearer <North user's session token>
//   { action: 'speak', text }                   any signed-in member of the org      -> audio bytes
//   { action: 'test' }                          org admin (role with Configuration)  -> audio bytes
//   { action: 'save', config, api_key?, clear_key?, headers? }   org admin           -> { ok, config }
//   { action: 'remove' }                        org admin                            -> { ok }
//
// Whose org? The caller's own org, taken from their verified JWT -> profiles.org_id (never from the request),
// same as zapier-keygen. "Admin" = the caller's role has the Configuration permission (roles.config), the same
// test Configuration.html's canConfig() uses.
//
// DEPLOY (no CLI needed): run 2026-10-08-migration-voice-provider.sql first. Then Supabase dashboard (North
// project) > Edge Functions > Deploy a new function > Via Editor > name it exactly  voice  > paste this file >
// Deploy. Leave "Enforce JWT verification" ON. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically.
// NO SECRETS TO SET: the API key (and any secret headers) are encrypted with AES-256-GCM before they are stored, using a
// key derived from this project's own service-role key, which Supabase gives the function automatically. Nobody has to
// create or paste anything. (Optional: set a function secret VOICE_SECRET_KEY to use your own key material instead.) If
// the project's service-role key is ever rotated, saved keys become unreadable and admins simply paste them again.
//
// Organisation admins do everything from Configuration -> Integrations -> Voice; this one-time deploy is the platform owner's.
//
// Provider request shapes come from each vendor's public docs and are NOT live-tested (no account existed when
// this was written) -- Configuration -> Voice -> Test is the first real check.
// Safety: https + port 443 only, localhost / private / link-local / IPv6-literal hosts blocked, DNS answers
// checked where the runtime allows it, redirects not followed, 25 s timeout, 4 MB audio cap, key scrubbed from
// error text. Not built: per-user spend limits (anyone signed in can cause one sentence of TTS at a time).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ===== CORE START (pure logic; unit-tested under node) =====
const KINDS = ['openai', 'elevenlabs', 'azure', 'google', 'custom']
const MAX_TEXT = 1200
const MAX_AUDIO = 4 * 1024 * 1024
const TIMEOUT_MS = 25000

class VoiceError extends Error {
  code: number
  constructor(message: string, code = 502) {
    super(message)
    this.code = code
  }
}

function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h.includes(':')) return true // IPv6 literals: refused outright
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const a = +m[1], b = +m[2]
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))) return true
  }
  return false
}

function checkUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new VoiceError('That provider address is not a valid URL.', 400) }
  if (u.protocol !== 'https:') throw new VoiceError('Provider addresses must start with https://', 400)
  if (u.username || u.password) throw new VoiceError('Do not put a user name or password inside the URL -- use the key fields instead.', 400)
  if (u.port && u.port !== '443') throw new VoiceError('Only the standard https port (443) is allowed.', 400)
  if (blockedHost(u.hostname)) throw new VoiceError('That address points at a private or internal network, which is not allowed.', 400)
  return u
}

function scrub(text: unknown, secret: string): string {
  let t = String(text ?? '')
  if (secret && secret.length >= 4) t = t.split(secret).join('***')
  return t
}

const PLACEHOLDER = /\{\{(text|voice|model|language)\}\}/g
const HDR_NAME = /^[A-Za-z0-9-]{1,60}$/
const BLOCKED_HDRS = new Set(['host', 'content-length', 'transfer-encoding', 'connection'])

// one pass over every string in a parsed JSON template, so placeholder-looking text inside the spoken text is never expanded twice
function subst(node: any, vals: Record<string, string>): any {
  if (typeof node === 'string') return node.replace(PLACEHOLDER, (_m, k) => vals[k])
  if (Array.isArray(node)) return node.map((x) => subst(x, vals))
  if (node && typeof node === 'object') {
    const out: Record<string, any> = {}
    for (const k of Object.keys(node)) out[k] = subst(node[k], vals)
    return out
  }
  return node
}

function dig(obj: any, path: string): any {
  for (const part of String(path || '').split('.').filter(Boolean)) {
    if (Array.isArray(obj) && /^\d+$/.test(part)) obj = obj[+part]
    else if (obj && typeof obj === 'object' && part in obj) obj = obj[part]
    else throw new VoiceError("The provider's reply did not contain '" + path + "'.", 502)
  }
  return obj
}

function cleanHeaders(extra: any): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(extra || {})) {
    const name = String(k).trim()
    const v = String(extra[k] ?? '')
    if (!HDR_NAME.test(name) || BLOCKED_HDRS.has(name.toLowerCase()) || /[\r\n]/.test(v)) {
      throw new VoiceError("Extra header '" + name.slice(0, 40) + "' is not allowed.", 400)
    }
    out[name] = v
  }
  return out
}

function trimBase(cfg: any, fallback: string): string {
  return String(cfg.base_url || fallback).trim().replace(/\/+$/, '')
}

function escXml(s: string, attr = false): string {
  let t = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (attr) t = t.replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
  return t
}

interface Built { url: string; headers: Record<string, string>; body: string; mode: string; path: string; ct: string }

// cfg = public settings; sec = { api_key, headers }
function buildRequest(cfg: any, sec: any, text: string): Built {
  const kind = cfg.kind
  const key = String(sec.api_key || '')
  const model = String(cfg.model || '').trim()
  const voice = String(cfg.voice || '').trim()
  const lang = String(cfg.language || '').trim()
  if (kind === 'openai') {
    const base = trimBase(cfg, 'https://api.openai.com')
    const url = base.endsWith('/audio/speech') ? base : base.endsWith('/v1') ? base + '/audio/speech' : base + '/v1/audio/speech'
    return {
      url, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'tts-1', voice: voice || 'alloy', input: text, response_format: 'mp3' }),
      mode: 'audio', path: '', ct: 'audio/mpeg',
    }
  }
  if (kind === 'elevenlabs') {
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(voice)) throw new VoiceError('ElevenLabs needs a voice id (letters and numbers).', 400)
    const base = trimBase(cfg, 'https://api.elevenlabs.io')
    return {
      url: base + '/v1/text-to-speech/' + voice + '?output_format=mp3_44100_128',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model || 'eleven_multilingual_v2' }),
      mode: 'audio', path: '', ct: 'audio/mpeg',
    }
  }
  if (kind === 'azure') {
    const region = String(cfg.region || '').trim().toLowerCase()
    if (!/^[a-z0-9-]{3,40}$/.test(region)) throw new VoiceError('Azure needs a region such as australiaeast.', 400)
    if (!/^[A-Za-z0-9._:-]{3,80}$/.test(voice)) throw new VoiceError('Azure needs a voice name such as en-AU-NatashaNeural.', 400)
    let fallback = voice.split('-').slice(0, 2).join('-')
    if (!/^[A-Za-z]{2,3}-[A-Za-z0-9]{2,8}$/.test(fallback)) fallback = 'en-AU'
    const xmlLang = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang) ? lang : fallback
    const ssml = "<speak version='1.0' xml:lang='" + escXml(xmlLang, true) + "'><voice name='" + escXml(voice, true) + "'>" + escXml(text) + '</voice></speak>'
    return {
      url: 'https://' + region + '.tts.speech.microsoft.com/cognitiveservices/v1',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'NorthAskAlec' },
      body: ssml, mode: 'audio', path: '', ct: 'audio/mpeg',
    }
  }
  if (kind === 'google') {
    const base = trimBase(cfg, 'https://texttospeech.googleapis.com')
    const v: Record<string, string> = { languageCode: lang || 'en-AU' }
    if (voice) v.name = voice
    return {
      url: base + '/v1/text:synthesize?key=' + encodeURIComponent(key),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { text }, voice: v, audioConfig: { audioEncoding: 'MP3' } }),
      mode: 'json_base64', path: 'audioContent', ct: 'audio/mpeg',
    }
  }
  if (kind === 'custom') {
    const baseRaw = String(cfg.base_url || '').trim()
    if (!baseRaw) throw new VoiceError('Custom providers need an address (URL).', 400)
    const vals: Record<string, string> = { voice, model, language: lang }
    let url = baseRaw.replace(PLACEHOLDER, (_m, k) => (k === 'text' ? '' : encodeURIComponent(vals[k] || '')))
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...cleanHeaders(sec.headers) }
    const style = String(cfg.auth_style || 'bearer').toLowerCase()
    const name = String(cfg.auth_name || '').trim()
    if (style === 'bearer') headers.Authorization = 'Bearer ' + key
    else if (style === 'header') {
      if (!HDR_NAME.test(name)) throw new VoiceError('Custom auth needs a header name such as X-Api-Key.', 400)
      headers[name] = String(cfg.auth_prefix || '') + key
    } else if (style === 'query') {
      if (!/^[A-Za-z0-9_.-]{1,60}$/.test(name)) throw new VoiceError('Custom auth needs a query parameter name such as api_key.', 400)
      url += (url.includes('?') ? '&' : '?') + encodeURIComponent(name) + '=' + encodeURIComponent(key)
    } else if (style !== 'none') throw new VoiceError('Unknown auth style.', 400)
    const tpl = String(cfg.body_template || '').trim() || '{"text": "{{text}}"}'
    let parsed: any
    try { parsed = JSON.parse(tpl) } catch { throw new VoiceError('The request body template is not valid JSON.', 400) }
    const body = JSON.stringify(subst(parsed, { text, voice, model, language: lang }))
    const mode = cfg.response_kind === 'json_base64' ? 'json_base64' : 'audio'
    const path = String(cfg.response_path || '').trim()
    if (mode === 'json_base64' && !path) throw new VoiceError('Say which field of the reply holds the base64 audio (e.g. audio.content).', 400)
    return { url, headers, body, mode, path, ct: String(cfg.content_type || 'audio/mpeg').trim() }
  }
  throw new VoiceError('Unknown provider type.', 400)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// returns { audio, contentType }
async function synthesize(cfg: any, sec: any, text: string, doFetch: (url: string, init: any) => Promise<Response>, dnsOk: (host: string) => Promise<boolean>) {
  text = String(text || '').trim()
  if (!text) throw new VoiceError('Nothing to read.', 400)
  if (text.length > MAX_TEXT) throw new VoiceError('That text is longer than ' + MAX_TEXT + ' characters.', 400)
  if (!sec.api_key && cfg.auth_style !== 'none') throw new VoiceError('No API key is saved for the organisation voice.', 400)
  const b = buildRequest(cfg, sec, text)
  const u = checkUrl(b.url)
  if (!(await dnsOk(u.hostname))) throw new VoiceError('That address points at a private or internal network, which is not allowed.', 400)
  const secret = String(sec.api_key || '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let r: Response
  let buf: Uint8Array
  try {
    r = await doFetch(u.toString(), { method: 'POST', headers: b.headers, body: b.body, redirect: 'manual', signal: ctrl.signal })
    if (r.status >= 300 && r.status < 400) throw new VoiceError('The provider tried to redirect the request, which is not followed.', 502)
    const len = Number(r.headers.get('content-length') || 0)
    if (len > MAX_AUDIO) throw new VoiceError("The provider's audio was larger than the 4 MB limit.", 502)
    buf = new Uint8Array(await r.arrayBuffer())
  } catch (e) {
    if (e instanceof VoiceError) throw e
    throw new VoiceError((e as Error).name === 'AbortError' ? 'The provider took too long to answer.' : 'Could not reach the provider: ' + scrub((e as Error).message, secret).slice(0, 200), 502)
  } finally { clearTimeout(timer) }
  if (buf.length > MAX_AUDIO) throw new VoiceError("The provider's audio was larger than the 4 MB limit.", 502)
  const ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!r.ok) {
    const txt = scrub(new TextDecoder().decode(buf.subarray(0, 2000)), secret).trim().slice(0, 300)
    throw new VoiceError('Provider said HTTP ' + r.status + ': ' + (txt || r.statusText), 502)
  }
  if (b.mode === 'json_base64') {
    let audio: Uint8Array
    try {
      const obj = JSON.parse(new TextDecoder().decode(buf))
      audio = b64ToBytes(String(dig(obj, b.path)))
    } catch (e) {
      if (e instanceof VoiceError) throw e
      throw new VoiceError("The provider's reply was not the JSON-with-audio shape expected.", 502)
    }
    if (!audio.length) throw new VoiceError('The provider returned empty audio.', 502)
    return { audio, contentType: b.ct }
  }
  if (!buf.length) throw new VoiceError('The provider returned empty audio.', 502)
  if (ct && !(ct.startsWith('audio/') || ct === 'application/octet-stream' || ct === 'binary/octet-stream')) {
    throw new VoiceError('The provider replied with ' + ct + ' instead of audio: ' + scrub(new TextDecoder().decode(buf.subarray(0, 200)), secret), 502)
  }
  return { audio: buf, contentType: ct.startsWith('audio/') ? ct : b.ct }
}

// ---- settings validation (admin save) ----
const CFG_FIELDS: Array<[string, number]> = [['model', 120], ['voice', 120], ['language', 20], ['region', 40], ['auth_name', 60], ['auth_prefix', 40]]

function validateConfig(input: any): Record<string, any> {
  const kind = String(input.kind || '').trim().toLowerCase()
  if (!KINDS.includes(kind)) throw new VoiceError('Pick a provider type.', 400)
  const cfg: Record<string, any> = { kind, label: String(input.label || '').trim().slice(0, 60) }
  for (const [f, n] of CFG_FIELDS) cfg[f] = String(input[f] || '').trim().slice(0, n)
  const base = String(input.base_url || '').trim()
  if (base) {
    let u: URL
    try { u = new URL(base) } catch { throw new VoiceError('The address must be a full https:// URL.', 400) }
    if (u.protocol !== 'https:' || u.username || u.password) throw new VoiceError('The address must be a full https:// URL with no user name or password in it.', 400)
    if (u.port && u.port !== '443') throw new VoiceError('Only the standard https port (443) is allowed.', 400)
    if (blockedHost(u.hostname)) throw new VoiceError('That address points at a private or internal network, which is not allowed.', 400)
  }
  cfg.base_url = base.slice(0, 500)
  cfg.auth_style = 'bearer'
  cfg.body_template = ''
  cfg.response_kind = 'audio'
  cfg.response_path = ''
  cfg.content_type = 'audio/mpeg'
  if (kind === 'custom') {
    if (!base) throw new VoiceError('Custom providers need an address (URL).', 400)
    const style = String(input.auth_style || 'bearer').toLowerCase()
    if (!['bearer', 'header', 'query', 'none'].includes(style)) throw new VoiceError('Unknown auth style.', 400)
    cfg.auth_style = style
    if (style === 'header' && !HDR_NAME.test(cfg.auth_name)) throw new VoiceError('Custom auth needs a header name such as X-Api-Key.', 400)
    if (style === 'query' && !/^[A-Za-z0-9_.-]{1,60}$/.test(cfg.auth_name)) throw new VoiceError('Custom auth needs a query parameter name such as api_key.', 400)
    const tpl = String(input.body_template || '').trim()
    if (tpl.length > 4000) throw new VoiceError('The body template is too long (4000 characters max).', 400)
    if (tpl) { try { JSON.parse(tpl) } catch { throw new VoiceError('The request body template is not valid JSON.', 400) } }
    cfg.body_template = tpl
    cfg.response_kind = input.response_kind === 'json_base64' ? 'json_base64' : 'audio'
    cfg.response_path = String(input.response_path || '').trim().slice(0, 120)
    if (cfg.response_kind === 'json_base64' && !cfg.response_path) throw new VoiceError('Say which field of the reply holds the base64 audio (e.g. audio.content).', 400)
    cfg.content_type = String(input.content_type || 'audio/mpeg').trim().slice(0, 60)
  }
  if (kind === 'azure') {
    if (!/^[a-z0-9-]{3,40}$/.test(cfg.region.toLowerCase())) throw new VoiceError('Azure needs a region such as australiaeast.', 400)
    if (!/^[A-Za-z0-9._:-]{3,80}$/.test(cfg.voice)) throw new VoiceError('Azure needs a voice name such as en-AU-NatashaNeural.', 400)
  }
  if (kind === 'elevenlabs' && !/^[A-Za-z0-9_-]{4,64}$/.test(cfg.voice)) throw new VoiceError('ElevenLabs needs a voice id (letters and numbers).', 400)
  return cfg
}

// merge submitted secrets with saved ones: blank api_key keeps; clear_key removes; header value '' keeps that header's saved value
function mergeSecrets(cur: any, input: any, kind: string, authStyle: string): { api_key: string; headers: Record<string, string> } {
  let key = String(input.api_key || '').trim()
  if (input.clear_key) key = ''
  else if (!key) key = String(cur?.api_key || '')
  if (!key && !(kind === 'custom' && authStyle === 'none')) throw new VoiceError("Paste the provider's API key.", 400)
  const headers: Record<string, string> = {}
  if (kind === 'custom') {
    const inH = input.headers && typeof input.headers === 'object' ? input.headers : {}
    if (Object.keys(inH).length > 10) throw new VoiceError('At most 10 extra headers.', 400)
    for (const k of Object.keys(inH)) {
      const v = String(inH[k] ?? '')
      headers[k] = v === '' ? String(cur?.headers?.[k] ?? '') : v
    }
    cleanHeaders(headers)
  }
  return { api_key: key, headers }
}

async function deriveKey(material: string): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('north-voice-v1:' + material)))
  return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encryptBlob(obj: unknown, key: CryptoKey): Promise<{ payload: string; encrypted: boolean }> {
  const json = JSON.stringify(obj)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)))
  return { payload: 'v1:' + bytesToB64(iv) + ':' + bytesToB64(ct), encrypted: true }
}
async function decryptBlob(payload: string, key: CryptoKey): Promise<any> {
  if (payload.startsWith('v1:')) {
    const [, iv, ct] = payload.split(':')
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(iv) as any }, key, b64ToBytes(ct) as any)
      return JSON.parse(new TextDecoder().decode(pt))
    } catch { throw new VoiceError('The saved key could not be decrypted (the project key changed?). Paste the key again and save.', 500) }
  }
  throw new VoiceError('The saved key is in an unknown format. Save it again.', 500)
}
// ===== CORE END =====

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function loadAesKey(): Promise<CryptoKey> {
  const material = (Deno.env.get('VOICE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (!material) throw new VoiceError('No key material is available to encrypt the saved key.', 500)
  return await deriveKey(material)
}

// where the runtime lets us resolve DNS, refuse hosts whose answers are private; otherwise rely on the hostname checks
async function dnsPublic(host: string): Promise<boolean> {
  const d = (globalThis as any).Deno
  if (!d || typeof d.resolveDns !== 'function' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return true
  try {
    for (const t of ['A', 'AAAA']) {
      let ans: string[] = []
      try { ans = await d.resolveDns(host, t) } catch { ans = [] }
      for (const ip of ans) { if (blockedHost(String(ip))) return false }
    }
  } catch { /* resolver unavailable: fall back to hostname checks */ }
  return true
}

const PUBLIC_COLS = 'org_id,enabled,kind,label,model,voice,language,region,base_url,auth_style,auth_name,auth_prefix,body_template,response_kind,response_path,content_type,header_names,has_key,encrypted,updated_at'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)
  const authHeader = req.headers.get('Authorization') || ''
  const userToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!userToken) return json({ error: 'not signed in' }, 401)
  let body: any
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const action = String(body?.action || '')

  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const { data: userData, error: userErr } = await anon.auth.getUser(userToken)
  if (userErr || !userData?.user) return json({ error: 'invalid or expired session' }, 401)
  const { data: profile } = await anon.from('profiles').select('org_id,role_id').eq('id', userData.user.id).maybeSingle()
  if (!profile?.org_id) return json({ error: 'could not resolve your organisation' }, 403)
  const orgId = profile.org_id as string
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const requireAdmin = async (): Promise<Response | null> => {
    const { data: role } = profile.role_id ? await anon.from('roles').select('config').eq('id', profile.role_id).maybeSingle() : { data: null }
    return role?.config ? null : json({ error: 'Only people whose role has Configuration access can change the voice settings.' }, 403)
  }
  const loadAll = async () => {
    const { data: cfg } = await svc.from('voice_providers').select('*').eq('org_id', orgId).maybeSingle()
    if (!cfg) return { cfg: null, sec: null as any }
    const { data: s } = await svc.from('voice_provider_secrets').select('payload').eq('org_id', orgId).maybeSingle()
    const sec = s?.payload ? await decryptBlob(s.payload, await loadAesKey()) : { api_key: '', headers: {} }
    return { cfg, sec }
  }

  try {
    if (action === 'speak' || action === 'test') {
      if (action === 'test') { const deny = await requireAdmin(); if (deny) return deny }
      const { cfg, sec } = await loadAll()
      if (!cfg || (action === 'speak' && !cfg.enabled)) return json({ error: 'No organisation voice is set up.' }, 404)
      const text = action === 'test' ? "This is a test of your organisation's voice for Ask Alec." : String(body.text || '')
      const { audio, contentType } = await synthesize(cfg, sec, text, fetch, dnsPublic)
      return new Response(audio as any, { status: 200, headers: { ...CORS, 'Content-Type': contentType, 'Cache-Control': 'no-store' } })
    }
    if (action === 'save') {
      const deny = await requireAdmin(); if (deny) return deny
      const cfg = validateConfig(body.config || {})
      const { data: cur } = await svc.from('voice_providers').select('*').eq('org_id', orgId).maybeSingle()
      const { data: s } = await svc.from('voice_provider_secrets').select('payload').eq('org_id', orgId).maybeSingle()
      const aes = await loadAesKey()
      const curSec = s?.payload ? await decryptBlob(s.payload, aes).catch(() => ({})) : {}
      const sec = mergeSecrets(curSec, { api_key: body.api_key, clear_key: body.clear_key, headers: body.headers }, cfg.kind, cfg.auth_style)
      const { payload, encrypted } = await encryptBlob(sec, aes)
      const row = {
        org_id: orgId, enabled: body.enabled !== false, ...cfg, header_names: Object.keys(sec.headers),
        has_key: !!sec.api_key, encrypted, updated_at: new Date().toISOString(), updated_by: userData.user.id,
      }
      const { error: e1 } = await svc.from('voice_provider_secrets').upsert({ org_id: orgId, payload, updated_at: row.updated_at }, { onConflict: 'org_id' })
      if (e1) return json({ error: 'could not store the key' }, 500)
      const { data: saved, error: e2 } = await svc.from('voice_providers').upsert(row, { onConflict: 'org_id' }).select(PUBLIC_COLS).maybeSingle()
      if (e2) return json({ error: 'could not store the settings' }, 500)
      return json({ ok: true, config: saved, replaced: !!cur })
    }
    if (action === 'remove') {
      const deny = await requireAdmin(); if (deny) return deny
      await svc.from('voice_provider_secrets').delete().eq('org_id', orgId)
      await svc.from('voice_providers').delete().eq('org_id', orgId)
      return json({ ok: true, removed: true })
    }
    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    if (e instanceof VoiceError) return json({ error: e.message }, e.code)
    return json({ error: 'voice function failed' }, 500)
  }
})
