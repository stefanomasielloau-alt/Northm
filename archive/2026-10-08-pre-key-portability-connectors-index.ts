// Supabase Edge Function: connectors  (2026-10-08)
// CRM, finance & advertising connectors for North, run from North -- Stef: "app credentials should not be Vercel env
// vars ... always handle like we have done in Hub ... the admin needs to manage it themselves", "CRM & advertising
// connectors should only be in North Config", "add creds as needed .. and an Add Custom API function".
// This replaces the sign-in engine that used to live in Hub-Backend (connectors.py, Vercel environment variables). Each
// ORGANISATION now enters its own app credentials (Client ID / secret, region, etc.) on Configuration -> Integrations ->
// "CRM & advertising connectors". Nothing is set in Vercel or Supabase per organisation.
//
// Storage (see 2026-10-08-migration-connectors.sql), all RLS-on with NO browser access (service role only):
//   connector_apps         the organisation's non-secret settings per connector (+ the definition of custom ones)
//   connector_app_secrets  client secret / developer token / API key, AES-256-GCM encrypted
//   connector_tokens       the sign-in tokens each connection gets, AES-256-GCM encrypted
//
// API (POST JSON, Authorization: Bearer <North session token>; "Admin" = the caller's role has Configuration, roles.config):
//   { action:'list' }                                         -> catalog + this org's state (never any secret)
//   { action:'save', provider, settings, secrets, clear, def }-> save credentials / settings (def only for custom)
//   { action:'remove', provider }                             -> delete credentials, tokens and (custom) the connector
//   { action:'start', provider }                              -> { auth_url } to open in a sign-in window
//   { action:'connect', provider }                            -> client-credentials / API-key connectors: connect now
//   { action:'test', provider }                               -> one cheap read-only call to the provider
//   { action:'disconnect', provider }
// GET {SUPABASE_URL}/functions/v1/connectors?code=..&state=.. is the redirect address every OAuth provider is told about
// (same URL for all connectors). The signed `state` carries org + user + provider (+ PKCE verifier) for 15 minutes; on success or
// failure the browser is sent to North's small connector-done.html page, which tells the Configuration tab and closes the sign-in window
// (Supabase does not serve HTML pages from functions, so the function itself cannot show one).
//
// DEPLOY (no CLI needed): run 2026-10-08-migration-connectors.sql first. Then Supabase dashboard (North project) > Edge
// Functions > Deploy a new function > Via Editor > name it exactly  connectors  > paste this file > then in the function's
// settings turn "Verify JWT" OFF (the provider's redirect cannot carry a login token; this function checks the signed state
// for redirects and the North session token for every other call). SUPABASE_URL / ANON / SERVICE_ROLE are provided
// automatically. NO SECRETS TO SET: encryption and state-signing keys are derived from this project's own service-role key
// (optional override: function secret CONNECTOR_SECRET_KEY, set it BEFORE anyone saves credentials). If the service-role key is
// ever rotated, saved credentials become unreadable and admins simply re-enter them.
//
// Built to the same point as the old Hub engine: credentials -> sign in -> stored encrypted token -> refresh -> "Test". It does
// NOT sync records into North yet (field mapping needs a real connected account). NOT live-tested against any provider --
// no credentials existed for any of them. Changes from the Hub version: Marketo's token request is sent as GET with query
// parameters (as far as I know that is how Marketo documents it; unverified); empty scopes are omitted from the sign-in URL.
// Safety: https + port 443 only, private / internal / IPv6-literal hosts blocked (hostname + DNS where the runtime allows),
// redirects never followed, 20 s timeout, 256 KB reply cap, secrets scrubbed from error text.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ===== CORE START (pure logic; unit-tested under node) =====
type Rec = Record<string, string>
const TIMEOUT_MS = 20000
const MAX_REPLY = 256 * 1024

class CError extends Error {
  code: number
  constructor(message: string, code = 400) { super(message); this.code = code }
}

function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h.includes(':')) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const a = +m[1], b = +m[2]
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))) return true
  }
  return false
}

function checkUrl(raw: string, what = 'address'): URL {
  let u: URL
  try { u = new URL(String(raw || '').trim()) } catch { throw new CError('The ' + what + ' is not a valid URL.', 400) }
  if (u.protocol !== 'https:') throw new CError('The ' + what + ' must start with https://', 400)
  if (u.username || u.password) throw new CError('Do not put a user name or password inside the ' + what + '.', 400)
  if (u.port && u.port !== '443') throw new CError('Only the standard https port (443) is allowed for the ' + what + '.', 400)
  if (blockedHost(u.hostname)) throw new CError('The ' + what + ' points at a private or internal network, which is not allowed.', 400)
  return u
}

function scrub(text: unknown, secrets: string[]): string {
  let t = String(text ?? '')
  for (const s of secrets) if (s && s.length >= 4) t = t.split(s).join('***')
  return t
}

const trim = (v: unknown) => String(v ?? '').trim()
const base = (v: unknown, def = '') => (trim(v) || def).replace(/\/+$/, '')

// ---------- provider catalog ----------
interface Fld { key: string; label: string; secret?: boolean; required?: boolean; url?: boolean; placeholder?: string; help?: string; re?: RegExp }
interface TestSpec { url: string; method?: string; json?: unknown; headers?: Rec; prefix?: string }
interface Prov {
  id: string; name: string; kind: 'oauth2' | 'client_credentials' | 'apikey'
  fields: Fld[]; setup: string
  pkce?: boolean; basic?: boolean; sendScopeOnToken?: boolean; tokenMethod?: 'POST' | 'GET'
  scopeSep?: string; extraAuth?: Rec
  authUrl?: (s: Rec) => string; tokenUrl?: (s: Rec) => string; scopes?: (s: Rec) => string
  test: (s: Rec, tok: any) => TestSpec | null
  custom?: boolean; headerName?: string
}

const CID: Fld = { key: 'client_id', label: 'Client ID', required: true }
const CSEC: Fld = { key: 'client_secret', label: 'Client secret', secret: true, required: true }
const std = [CID, CSEC]
const GOOGLE_EXTRA = { access_type: 'offline', prompt: 'consent' }

const PROVIDERS: Record<string, Prov> = {
  hubspot: {
    id: 'hubspot', name: 'HubSpot', kind: 'oauth2', fields: std,
    authUrl: () => 'https://app.hubspot.com/oauth/authorize', tokenUrl: () => 'https://api.hubapi.com/oauth/v1/token',
    scopes: () => 'oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read',
    test: () => ({ url: 'https://api.hubapi.com/crm/v3/objects/contacts?limit=1' }),
    setup: 'developers.hubspot.com > Apps > Create app > Auth tab: add the redirect URL shown above, tick the scopes listed there (contacts, companies, deals - read).',
  },
  salesforce: {
    id: 'salesforce', name: 'Salesforce', kind: 'oauth2',
    fields: [CID, CSEC, { key: 'login_url', label: 'Login address (optional)', url: true, placeholder: 'https://login.salesforce.com (default)', help: 'Sandbox: https://test.salesforce.com' }],
    authUrl: (s) => base(s.login_url, 'https://login.salesforce.com') + '/services/oauth2/authorize',
    tokenUrl: (s) => base(s.login_url, 'https://login.salesforce.com') + '/services/oauth2/token',
    scopes: () => 'api refresh_token',
    test: (_s, tok) => ({ url: base(tok?.instance_url) + '/services/data/v60.0/limits' }),
    setup: 'Salesforce Setup > App Manager > New Connected App (or External Client App): enable OAuth, add the redirect URL, scopes "api" and "refresh_token". Sandbox: put https://test.salesforce.com in Login address.',
  },
  zoho: {
    id: 'zoho', name: 'Zoho CRM', kind: 'oauth2',
    fields: [CID, CSEC, { key: 'accounts_url', label: 'Accounts address (optional)', url: true, placeholder: 'https://accounts.zoho.com (default)', help: 'Australian data centre: https://accounts.zoho.com.au' }],
    authUrl: (s) => base(s.accounts_url, 'https://accounts.zoho.com') + '/oauth/v2/auth',
    tokenUrl: (s) => base(s.accounts_url, 'https://accounts.zoho.com') + '/oauth/v2/token',
    scopes: () => 'ZohoCRM.modules.READ,ZohoCRM.settings.READ', scopeSep: ',', extraAuth: { access_type: 'offline', prompt: 'consent' },
    test: (_s, tok) => ({ url: base(tok?.api_domain, 'https://www.zohoapis.com') + '/crm/v6/org', prefix: 'Zoho-oauthtoken' }),
    setup: 'api-console.zoho.com > Add Client > Server-based Applications: add the redirect URL. Australian data centre: put https://accounts.zoho.com.au in Accounts address.',
  },
  dynamics: {
    id: 'dynamics', name: 'Microsoft Dynamics 365', kind: 'oauth2', sendScopeOnToken: true,
    fields: [CID, CSEC, { key: 'org_url', label: 'Environment URL', required: true, url: true, placeholder: 'https://yourorg.crm6.dynamics.com' },
      { key: 'tenant_id', label: 'Tenant ID (optional)', re: /^[A-Za-z0-9.-]{1,64}$/, placeholder: 'organizations (default)' }],
    authUrl: (s) => 'https://login.microsoftonline.com/' + (trim(s.tenant_id) || 'organizations') + '/oauth2/v2.0/authorize',
    tokenUrl: (s) => 'https://login.microsoftonline.com/' + (trim(s.tenant_id) || 'organizations') + '/oauth2/v2.0/token',
    scopes: (s) => base(s.org_url) + '/user_impersonation offline_access',
    test: (s) => ({ url: base(s.org_url) + '/api/data/v9.2/WhoAmI' }),
    setup: 'Azure portal > App registrations > New: add the redirect URL (Web), API permissions > Dynamics CRM > user_impersonation, create a client secret. Environment URL is your Dynamics address, e.g. https://yourorg.crm6.dynamics.com.',
  },
  netsuite: {
    id: 'netsuite', name: 'NetSuite', kind: 'oauth2', basic: true,
    fields: [{ key: 'account_id', label: 'Account ID', required: true, re: /^[A-Za-z0-9_-]{3,40}$/, placeholder: '1234567 or 1234567_SB1' }, CID, CSEC],
    authUrl: (s) => 'https://' + trim(s.account_id).toLowerCase().replace(/_/g, '-') + '.app.netsuite.com/app/login/oauth2/authorize.nl',
    tokenUrl: (s) => 'https://' + trim(s.account_id).toLowerCase().replace(/_/g, '-') + '.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token',
    scopes: () => 'rest_webservices',
    test: (s) => ({ url: 'https://' + trim(s.account_id).toLowerCase().replace(/_/g, '-') + '.suitetalk.api.netsuite.com/services/rest/record/v1/customer?limit=1' }),
    setup: 'NetSuite > Setup > Integration > Manage Integrations > New: tick Authorization Code Grant + REST Web Services, add the redirect URL. Enable OAuth 2.0 under Enable Features > SuiteCloud.',
  },
  marketo: {
    id: 'marketo', name: 'Marketo', kind: 'client_credentials', tokenMethod: 'GET',
    fields: [CID, CSEC, { key: 'base_url', label: 'REST endpoint (without /rest)', required: true, url: true, placeholder: 'https://123-ABC-456.mktorest.com' }],
    tokenUrl: (s) => base(s.base_url) + '/identity/oauth/token',
    test: (s) => ({ url: base(s.base_url) + '/rest/v1/leads/describe.json' }),
    setup: 'Marketo Admin > Users & Roles: create an API-only user + role; Admin > LaunchPoint > New Custom Service gives the Client ID/Secret; Admin > Web Services shows the REST endpoint (use it without /rest). No sign-in window: Connect fetches a token straight away.',
  },
  google_ads: {
    id: 'google_ads', name: 'Google Ads', kind: 'oauth2', extraAuth: GOOGLE_EXTRA,
    fields: [{ key: 'developer_token', label: 'Developer token', secret: true, required: true }, CID, CSEC,
      { key: 'api_version', label: 'API version (optional)', re: /^v\d{1,3}$/, placeholder: 'v20 (default)', help: 'Check the current version; change if v20 has been retired.' },
      { key: 'login_customer_id', label: 'Login customer ID (optional)', re: /^[0-9-]{5,20}$/, placeholder: 'manager account id' }],
    authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: () => 'https://oauth2.googleapis.com/token',
    scopes: () => 'https://www.googleapis.com/auth/adwords',
    test: (s) => ({ url: 'https://googleads.googleapis.com/' + (trim(s.api_version) || 'v20') + '/customers:listAccessibleCustomers',
      headers: { 'developer-token': trim(s.developer_token), ...(trim(s.login_customer_id) ? { 'login-customer-id': trim(s.login_customer_id) } : {}) } }),
    setup: 'Google Ads > Tools > API Center: apply for a developer token. Google Cloud console: enable the Google Ads API on an OAuth client (Web application) and add the redirect URL.',
  },
  google_analytics: {
    id: 'google_analytics', name: 'Google Analytics 4', kind: 'oauth2', fields: std, extraAuth: GOOGLE_EXTRA,
    authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: () => 'https://oauth2.googleapis.com/token',
    scopes: () => 'https://www.googleapis.com/auth/analytics.readonly',
    test: () => ({ url: 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=1' }),
    setup: 'Google Cloud console: enable the Google Analytics Admin API and Data API, create an OAuth client (Web application) and add the redirect URL.',
  },
  pipedrive: {
    id: 'pipedrive', name: 'Pipedrive', kind: 'oauth2', fields: std,
    authUrl: () => 'https://oauth.pipedrive.com/oauth/authorize', tokenUrl: () => 'https://oauth.pipedrive.com/oauth/token',
    scopes: () => '',
    test: (_s, tok) => ({ url: base(tok?.api_domain, 'https://api.pipedrive.com') + '/api/v2/deals?limit=1' }),
    setup: 'developers.pipedrive.com > Developer Hub > create a Marketplace app > Settings: add the redirect URL. Scopes are fixed when the app is created, not passed at sign-in: on the app\'s Scopes tab tick "Deals - Read" and "Contacts - Read".',
  },
  airtable: {
    id: 'airtable', name: 'Airtable', kind: 'oauth2', pkce: true, fields: std,
    authUrl: () => 'https://airtable.com/oauth2/v1/authorize', tokenUrl: () => 'https://airtable.com/oauth2/v1/token',
    scopes: () => 'data.records:read schema.bases:read',
    test: () => ({ url: 'https://api.airtable.com/v0/meta/bases' }),
    setup: 'airtable.com/create/oauth > Register new OAuth integration: add the redirect URL, register WITH a client secret (not a public/PKCE-only app), and tick scopes data.records:read and schema.bases:read. PKCE is handled automatically.',
  },
  excel: {
    id: 'excel', name: 'Excel (Microsoft 365)', kind: 'oauth2', fields: std, extraAuth: { prompt: 'consent' },
    authUrl: () => 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: () => 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: () => 'Files.ReadWrite offline_access',
    test: () => ({ url: 'https://graph.microsoft.com/v1.0/me/drive' }),
    setup: 'Azure portal > App registrations > New (or an existing app): add the redirect URL (Web), add the Files.ReadWrite permission, create a client secret. Test only proves Files access works, not that a specific workbook is reachable.',
  },
  monday: {
    id: 'monday', name: 'Monday.com', kind: 'oauth2', fields: std,
    authUrl: () => 'https://auth.monday.com/oauth2/authorize', tokenUrl: () => 'https://auth.monday.com/oauth2/token',
    scopes: () => 'boards:read',
    test: () => ({ url: 'https://api.monday.com/v2', method: 'POST', json: { query: 'query { boards (limit: 1) { id name } }' } }),
    setup: 'developer.monday.com > Developer Center > Build an app > OAuth & Permissions tab: add the redirect URL and tick the boards:read scope.',
  },
  clickup: {
    id: 'clickup', name: 'ClickUp', kind: 'oauth2', fields: std,
    authUrl: () => 'https://app.clickup.com/api', tokenUrl: () => 'https://api.clickup.com/api/v2/oauth/token',
    scopes: () => '',
    test: () => ({ url: 'https://api.clickup.com/api/v2/user' }),
    setup: 'ClickUp Settings > Apps > Create an app, add the redirect URL. ClickUp OAuth has no scope checkboxes; access is whatever workspace(s) the signing-in person picks.',
  },
  xero: {
    id: 'xero', name: 'Xero', kind: 'oauth2', fields: std,
    authUrl: () => 'https://login.xero.com/identity/connect/authorize', tokenUrl: () => 'https://identity.xero.com/connect/token',
    scopes: () => 'offline_access openid accounting.contacts.read accounting.transactions.read',
    test: () => ({ url: 'https://api.xero.com/connections' }),
    setup: 'developer.xero.com/myapps > New app (Web app) > Configuration: add the redirect URL, tick the scopes. One Xero app can reach several organisations (tenants); choosing a tenant is part of the later sync step.',
  },
  myob: {
    id: 'myob', name: 'MYOB', kind: 'oauth2', fields: std, extraAuth: { prompt: 'consent' },
    authUrl: () => 'https://secure.myob.com/oauth2/account/authorize', tokenUrl: () => 'https://secure.myob.com/oauth2/v1/authorize',
    scopes: () => 'sme-company-file sme-customer sme-invoice',
    test: (s) => ({ url: 'https://api.myob.com/accountright', headers: { 'x-myobapi-key': trim(s.client_id), 'x-myobapi-version': 'v2' } }),
    setup: 'developer.myob.com > My Account > My Apps > Add App: add the exact https redirect URL (must match exactly, including any trailing slash). Scope names (sme-company-file / sme-customer / sme-invoice) are taken from MYOB walkthroughs and should be confirmed in the app-creation screen.',
  },
  sage: {
    id: 'sage', name: 'Sage Accounting', kind: 'oauth2', fields: std,
    authUrl: () => 'https://www.sageone.com/oauth2/auth/central', tokenUrl: () => 'https://oauth.accounting.sage.com/token',
    scopes: () => 'readonly',
    test: () => ({ url: 'https://api.accounting.sage.com/v3.1/contacts?items_per_page=1' }),
    setup: 'developerselfservice.sageone.com > app registration: add the redirect URL, select the readonly scope. NOT CONFIRMED for Australia: sources disagree on Sage Business Cloud Accounting coverage; check with a real Sage developer account first.',
  },
}

// ---------- settings / custom definitions ----------
const SLUG = /^[a-z0-9][a-z0-9_]{0,40}$/
const HDR = /^[A-Za-z0-9-]{1,60}$/

function cleanSettings(prov: Prov, input: any): Rec {
  const out: Rec = {}
  for (const f of prov.fields) {
    if (f.secret) continue
    const raw = input && Object.prototype.hasOwnProperty.call(input, f.key) ? trim(input[f.key]) : undefined
    if (raw === undefined) continue
    if (raw.length > 500) throw new CError(f.label + ' is too long.', 400)
    if (raw) {
      if (f.url) checkUrl(raw, f.label.toLowerCase().replace(/\s*\(optional\)/, ''))
      if (f.re && !f.re.test(raw)) throw new CError(f.label.replace(/\s*\(optional\)/, '') + ' does not look right.', 400)
      if (/[\r\n]/.test(raw)) throw new CError(f.label + ' must be one line.', 400)
    }
    out[f.key] = raw
  }
  return out
}

function validateCustomDef(input: any): any {
  const type = trim(input?.type)
  const name = trim(input?.name).slice(0, 60)
  if (!name) throw new CError('Give the connector a name.', 400)
  if (type !== 'oauth2' && type !== 'apikey') throw new CError('Choose OAuth sign-in or API key.', 400)
  const def: any = { type, name, notes: trim(input?.notes).slice(0, 300) }
  if (type === 'apikey') {
    const test = trim(input?.test_url)
    if (!test) throw new CError('Give the address of an endpoint to call with the key.', 400)
    checkUrl(test, 'endpoint address')
    def.test_url = test
    def.method = trim(input?.method).toUpperCase() === 'POST' ? 'POST' : 'GET'
    def.header_name = trim(input?.header_name) || 'Authorization'
    if (!HDR.test(def.header_name)) throw new CError('The auth header name is not valid.', 400)
    def.prefix = trim(input?.prefix).slice(0, 40)
    if (/[\r\n]/.test(def.prefix)) throw new CError('The prefix must be one line.', 400)
  } else {
    for (const [k, label] of [['auth_url', 'sign-in address'], ['token_url', 'token address']] as const) {
      const v = trim(input?.[k]); if (!v) throw new CError('Give the ' + label + '.', 400)
      checkUrl(v, label); def[k] = v
    }
    const test = trim(input?.test_url)
    if (test) { checkUrl(test, 'test address'); def.test_url = test }
    def.scopes = trim(input?.scopes).slice(0, 500)
    if (/[\r\n]/.test(def.scopes)) throw new CError('Scopes must be one line.', 400)
    def.pkce = !!input?.pkce; def.basic = !!input?.basic; def.offline = !!input?.offline
  }
  return def
}

function customProv(id: string, def: any): Prov {
  if (def.type === 'apikey') {
    return { id, name: def.name, kind: 'apikey', custom: true, headerName: def.header_name,
      fields: [{ key: 'api_key', label: 'API key', secret: true, required: true }],
      test: () => ({ url: def.test_url, method: def.method, prefix: def.prefix }),
      setup: def.notes || 'Custom API key connector.' }
  }
  return { id, name: def.name, kind: 'oauth2', custom: true, pkce: !!def.pkce, basic: !!def.basic, extraAuth: def.offline ? GOOGLE_EXTRA : undefined,
    fields: std, authUrl: () => def.auth_url, tokenUrl: () => def.token_url, scopes: () => def.scopes || '',
    test: () => (def.test_url ? { url: def.test_url } : null),
    setup: def.notes || 'Custom OAuth connector. Add the redirect URL shown above to the provider\'s app.' }
}

function slugFor(name: string, taken: Set<string>): string {
  const s = 'custom_' + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'api')
  let id = s, n = 2
  while (taken.has(id)) id = s + '_' + n++
  return id
}

function isReady(prov: Prov, settings: Rec, secretKeys: string[]): boolean {
  return prov.fields.every((f) => !f.required || (f.secret ? secretKeys.includes(f.key) : !!trim(settings[f.key])))
}

// ---------- crypto: state signing + secret encryption ----------
function b64u(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64u(str: string): Uint8Array {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4))
  const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}
const enc = (s: string) => new TextEncoder().encode(s)
async function sha256(s: string): Promise<Uint8Array> { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s))) }

async function hmacKey(material: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey('raw', await sha256('north-connectors-state-v1:' + material) as any, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}
async function signState(payload: any, key: CryptoKey): Promise<string> {
  const body = b64u(enc(JSON.stringify(payload)))
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(body)))
  return body + '.' + b64u(sig)
}
async function readState(state: string, key: CryptoKey, now = Date.now()): Promise<any | null> {
  const i = String(state || '').lastIndexOf('.'); if (i < 1) return null
  const body = state.slice(0, i)
  let ok = false
  try { ok = await crypto.subtle.verify('HMAC', key, unb64u(state.slice(i + 1)) as any, enc(body)) } catch { return null }
  if (!ok) return null
  let data: any
  try { data = JSON.parse(new TextDecoder().decode(unb64u(body))) } catch { return null }
  if (!data || now / 1000 - Number(data.t || 0) > 900) return null
  return data
}

async function aesKey(material: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey('raw', await sha256('north-connectors-v1:' + material) as any, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function encryptBlob(obj: unknown, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc(JSON.stringify(obj))))
  return 'v1:' + b64u(iv) + ':' + b64u(ct)
}
async function decryptBlob(payload: string, key: CryptoKey): Promise<any> {
  const [v, iv, ct] = String(payload || '').split(':')
  if (v !== 'v1' || !iv || !ct) throw new CError('Saved credentials are in an unknown format. Save them again.', 500)
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) as any }, key, unb64u(ct) as any)
    return JSON.parse(new TextDecoder().decode(pt))
  } catch { throw new CError('Saved credentials could not be decrypted (the project key changed?). Enter them again and save.', 500) }
}

// ---------- provider HTTP ----------
type DoFetch = (url: string, init: any) => Promise<Response>
type DnsOk = (host: string) => Promise<boolean>
interface Reply { status: number; ok: boolean; text: string }

async function safeFetch(url: string, init: any, doFetch: DoFetch, dnsOk: DnsOk, secrets: string[]): Promise<Reply> {
  const u = checkUrl(url, 'provider address')
  if (!(await dnsOk(u.hostname))) throw new CError('The provider address points at a private or internal network, which is not allowed.', 400)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await doFetch(u.toString(), { ...init, redirect: 'manual', signal: ctrl.signal })
    if (r.status >= 300 && r.status < 400) throw new CError('The provider tried to redirect the request, which is not followed.', 502)
    const buf = new Uint8Array(await r.arrayBuffer())
    if (buf.length > MAX_REPLY) throw new CError('The provider reply was unexpectedly large.', 502)
    return { status: r.status, ok: r.ok, text: new TextDecoder().decode(buf) }
  } catch (e) {
    if (e instanceof CError) throw e
    throw new CError((e as Error).name === 'AbortError' ? 'The provider took too long to answer.' : 'Could not reach the provider: ' + scrub((e as Error).message, secrets).slice(0, 160), 502)
  } finally { clearTimeout(timer) }
}

function providerError(what: string, r: Reply, secrets: string[]): CError {
  let why = ''
  try { const j = JSON.parse(r.text); why = String(j.error_description || j.error?.message || j.error || j.message || '') } catch { /* not JSON */ }
  why = scrub(why, secrets).replace(/\s+/g, ' ').trim().slice(0, 140)
  return new CError(what + ' (HTTP ' + r.status + (why ? ': ' + why : '') + ').', 400)
}

function flat(s: Rec, secret: Rec): Rec { return { ...s, ...secret } }
const secretsOf = (m: Rec) => [m.client_secret, m.api_key, m.developer_token].filter(Boolean)

async function tokenRequest(prov: Prov, merged: Rec, fields: Rec, doFetch: DoFetch, dnsOk: DnsOk): Promise<any> {
  const url = prov.tokenUrl!(merged)
  const all: Rec = { ...fields }
  const headers: Rec = { Accept: 'application/json' }
  if (prov.basic) headers.Authorization = 'Basic ' + btoa(trim(merged.client_id) + ':' + trim(merged.client_secret))
  else { all.client_id = trim(merged.client_id); all.client_secret = trim(merged.client_secret) }
  const secrets = secretsOf(merged)
  let r: Reply
  if (prov.tokenMethod === 'GET') {
    r = await safeFetch(url + (url.includes('?') ? '&' : '?') + new URLSearchParams(all).toString(), { method: 'GET', headers }, doFetch, dnsOk, secrets)
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    r = await safeFetch(url, { method: 'POST', headers, body: new URLSearchParams(all).toString() }, doFetch, dnsOk, secrets)
  }
  if (!r.ok) throw providerError('The provider refused the credentials', r, secrets)
  let j: any
  try { j = JSON.parse(r.text) } catch { throw new CError('The provider did not return a token in the expected form.', 502) }
  if (!j || !j.access_token) throw new CError('The provider did not return an access token.', 502)
  return j
}

async function buildAuthUrl(prov: Prov, merged: Rec, redirectUri: string, state: string, verifier: string): Promise<string> {
  const sep = prov.scopeSep || ' '
  const scopes = prov.scopes ? prov.scopes(merged) : ''
  const params: Rec = { client_id: trim(merged.client_id), redirect_uri: redirectUri, response_type: 'code', state }
  if (scopes) params.scope = sep === ' ' ? scopes : scopes.replace(/ /g, sep)
  Object.assign(params, prov.extraAuth || {})
  if (prov.pkce && verifier) { params.code_challenge = b64u(await sha256(verifier)); params.code_challenge_method = 'S256' }
  const u = checkUrl(prov.authUrl!(merged), 'sign-in address')
  return u.toString() + (u.search ? '&' : '?') + new URLSearchParams(params).toString()
}

async function exchangeCode(prov: Prov, merged: Rec, code: string, redirectUri: string, verifier: string, doFetch: DoFetch, dnsOk: DnsOk) {
  const f: Rec = { grant_type: 'authorization_code', code, redirect_uri: redirectUri }
  if (prov.sendScopeOnToken && prov.scopes) f.scope = prov.scopes(merged)
  if (prov.pkce && verifier) f.code_verifier = verifier
  return await tokenRequest(prov, merged, f, doFetch, dnsOk)
}

async function refreshToken(prov: Prov, merged: Rec, tok: any, doFetch: DoFetch, dnsOk: DnsOk): Promise<any | null> {
  try {
    if (prov.kind === 'client_credentials') return await tokenRequest(prov, merged, { grant_type: 'client_credentials' }, doFetch, dnsOk)
    if (prov.kind !== 'oauth2' || !tok?.refresh_token) return null
    const f: Rec = { grant_type: 'refresh_token', refresh_token: tok.refresh_token }
    if (prov.sendScopeOnToken && prov.scopes) f.scope = prov.scopes(merged)
    const n = await tokenRequest(prov, merged, f, doFetch, dnsOk)
    n.refresh_token = n.refresh_token || tok.refresh_token
    for (const k of ['instance_url', 'api_domain']) if (tok[k] && !n[k]) n[k] = tok[k]
    return n
  } catch { return null }
}

// one cheap read-only call; returns the HTTP status or throws CError (with .code 401/403 preserved as 'auth' flag)
async function callTest(prov: Prov, merged: Rec, tok: any, doFetch: DoFetch, dnsOk: DnsOk): Promise<{ status: number; authFailed: boolean }> {
  const spec = prov.test(merged, tok)
  if (!spec || !spec.url) throw new CError('No test address is set for this connector, so it cannot be tested.', 400)
  const secrets = [...secretsOf(merged), String(tok?.access_token || '')]
  const headers: Rec = { Accept: 'application/json', ...(spec.headers || {}) }
  if (prov.kind === 'apikey') {
    const v = (spec.prefix ? spec.prefix + ' ' : '') + trim(merged.api_key)
    headers[prov.headerName || 'Authorization'] = v
  } else headers.Authorization = (spec.prefix || 'Bearer') + ' ' + String(tok?.access_token || '')
  let body: string | undefined
  if (spec.json !== undefined) { body = JSON.stringify(spec.json); headers['Content-Type'] = 'application/json' }
  const r = await safeFetch(spec.url, { method: spec.method || 'GET', headers, body }, doFetch, dnsOk, secrets)
  if (r.ok) return { status: r.status, authFailed: false }
  if (r.status === 401 || r.status === 403) return { status: r.status, authFailed: true }
  throw providerError(prov.name + ' test call failed', r, secrets)
}

function safeReturnOrigin(origin: string | null): string | null {
  if (!origin) return null
  try {
    const u = new URL(origin)
    if (u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))) return u.origin
  } catch { /* fall through */ }
  return null
}
// ===== CORE END =====

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const text = (msg: string, status = 200) => new Response(msg, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } })

const material = () => (Deno.env.get('CONNECTOR_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
async function getAes(): Promise<CryptoKey> {
  const m = material(); if (!m) throw new CError('No key material is available to encrypt credentials.', 500)
  return await aesKey(m)
}
async function getHmac(): Promise<CryptoKey> {
  const m = material(); if (!m) throw new CError('No key material is available to sign sign-in links.', 500)
  return await hmacKey(m)
}
const redirectUri = () => String(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '') + '/functions/v1/connectors'

async function dnsPublic(host: string): Promise<boolean> {
  const d = (globalThis as any).Deno
  if (!d || typeof d.resolveDns !== 'function' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return true
  try {
    for (const t of ['A', 'AAAA']) {
      let ans: string[] = []
      try { ans = await d.resolveDns(host, t) } catch { ans = [] }
      for (const ip of ans) { if (blockedHost(String(ip))) return false }
    }
  } catch { /* resolver unavailable: hostname checks only */ }
  return true
}

const MAX_CUSTOM = 20

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // ---- load a connector (definition + this org's saved settings and secrets) ----
  const loadProvider = async (orgId: string, pid: string) => {
    const { data: app } = await svc.from('connector_apps').select('*').eq('org_id', orgId).eq('provider', pid).maybeSingle()
    let prov: Prov | undefined = PROVIDERS[pid]
    if (!prov && app?.kind === 'custom' && app.def) prov = customProv(pid, app.def)
    if (!prov) throw new CError('Unknown connector.', 404)
    const { data: s } = await svc.from('connector_app_secrets').select('payload').eq('org_id', orgId).eq('provider', pid).maybeSingle()
    const sec: Rec = s?.payload ? await decryptBlob(s.payload, await getAes()) : {}
    const settings: Rec = app?.settings || {}
    return { prov, app, settings, sec, merged: flat(settings, sec) }
  }
  const loadToken = async (orgId: string, pid: string) => {
    const { data } = await svc.from('connector_tokens').select('data_enc,connected_by,connected_at').eq('org_id', orgId).eq('provider', pid).maybeSingle()
    if (!data?.data_enc) return { tok: null as any, row: data }
    return { tok: await decryptBlob(data.data_enc, await getAes()), row: data }
  }
  const saveToken = async (orgId: string, pid: string, tok: any, userId: string | null) => {
    const { data: ex } = await svc.from('connector_tokens').select('connected_by,connected_at').eq('org_id', orgId).eq('provider', pid).maybeSingle()
    const clean: any = {}; for (const k of Object.keys(tok || {})) if (!k.startsWith('_')) clean[k] = tok[k]
    clean._obtained_at = Math.floor(Date.now() / 1000)
    const now = new Date().toISOString()
    const { error } = await svc.from('connector_tokens').upsert({
      org_id: orgId, provider: pid, data_enc: await encryptBlob(clean, await getAes()),
      connected_by: userId || ex?.connected_by || null, connected_at: ex?.connected_at || now, disconnected_at: null, updated_at: now,
    }, { onConflict: 'org_id,provider' })
    if (error) throw new CError('Could not store the connection.', 500)
  }
  const view = (prov: Prov, app: any, sec: Rec, connected: boolean, connectedAt: string | null) => {
    const settings: Rec = app?.settings || {}
    const set = Object.keys(sec).filter((k) => !!sec[k])
    return {
      id: prov.id, name: prov.name, kind: prov.kind, custom: !!prov.custom, fields: prov.fields, setup: prov.setup, pkce: !!prov.pkce,
      def: prov.custom ? app?.def || null : null, settings, secrets_set: set,
      ready: isReady(prov, settings, set), connected, connected_at: connected ? connectedAt : null,
    }
  }

  // ================= provider redirect (GET) =================
  if (req.method === 'GET') {
    const u = new URL(req.url)
    const state = u.searchParams.get('state') || '', code = u.searchParams.get('code') || '', perr = u.searchParams.get('error') || ''
    if (!state && !code && !perr) return text('North connectors function is running. Sign-in redirects arrive here.')
    let st: any = null
    try { st = await readState(state, await getHmac()) } catch { st = null }
    if (!st) return text('This sign-in link has expired or is not valid. Close this window and start again from North: Configuration > Integrations.', 400)
    const back = (ok: boolean, msg = '') => new Response(null, { status: 302, headers: {
      Location: st.r + '/connector-done.html#cr=' + (ok ? 'ok' : 'err') + '&p=' + encodeURIComponent(st.p) + (msg ? '&m=' + encodeURIComponent(msg.slice(0, 160)) : ''),
      'Cache-Control': 'no-store' } })
    try {
      if (perr || !code) return back(false, 'The provider did not return an authorisation code' + (perr ? ' (' + perr.slice(0, 60) + ')' : '') + '.')
      const { prov, merged } = await loadProvider(st.o, st.p)
      if (prov.kind !== 'oauth2') return back(false, 'This connector does not use a sign-in window.')
      const tok = await exchangeCode(prov, merged, code, redirectUri(), st.v || '', fetch, dnsPublic)
      await saveToken(st.o, st.p, tok, st.u || null)
      return back(true)
    } catch (e) {
      return back(false, e instanceof CError ? e.message : 'Sign-in failed.')
    }
  }
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  // ================= North's own calls (POST) =================
  const userToken = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!userToken) return json({ error: 'not signed in' }, 401)
  let body: any
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const action = String(body?.action || '')
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const { data: userData, error: userErr } = await anon.auth.getUser(userToken)
  if (userErr || !userData?.user) return json({ error: 'invalid or expired session' }, 401)
  const userId = userData.user.id
  const { data: profile } = await anon.from('profiles').select('org_id,role_id').eq('id', userId).maybeSingle()
  if (!profile?.org_id) return json({ error: 'could not resolve your organisation' }, 403)
  const orgId = profile.org_id as string
  const { data: role } = profile.role_id ? await anon.from('roles').select('config').eq('id', profile.role_id).maybeSingle() : { data: null }
  if (!role?.config) return json({ error: 'Only people whose role has Configuration access can manage connectors.' }, 403)

  try {
    if (action === 'list') {
      const [ra, rs, rt] = await Promise.all([
        svc.from('connector_apps').select('*').eq('org_id', orgId),
        svc.from('connector_app_secrets').select('provider,payload').eq('org_id', orgId),
        svc.from('connector_tokens').select('provider,data_enc,connected_at').eq('org_id', orgId),
      ])
      if (ra.error || rs.error || rt.error) throw new CError('Connector storage is not installed yet. The platform owner needs to run 2026-10-08-migration-connectors.sql once (see 2026-10-08-connectors-setup.md).', 503)
      const apps = ra.data, secs = rs.data, toks = rt.data
      const aes = await getAes()
      const appBy: Record<string, any> = {}; for (const a of apps || []) appBy[a.provider] = a
      const tokBy: Record<string, any> = {}; for (const t of toks || []) tokBy[t.provider] = t
      const secBy: Record<string, Rec> = {}
      const bad: string[] = []
      for (const s of secs || []) { try { secBy[s.provider] = await decryptBlob(s.payload, aes) } catch { secBy[s.provider] = {}; bad.push(s.provider) } }
      const items: any[] = []
      const push = (prov: Prov) => items.push(view(prov, appBy[prov.id], secBy[prov.id] || {}, !!tokBy[prov.id]?.data_enc, tokBy[prov.id]?.connected_at || null))
      for (const id of Object.keys(PROVIDERS)) push(PROVIDERS[id])
      for (const a of apps || []) if (a.kind === 'custom' && a.def) push(customProv(a.provider, a.def))
      return json({ ok: true, redirect_uri: redirectUri(), connectors: items, unreadable: bad, max_custom: MAX_CUSTOM })
    }

    const pid0 = trim(body.provider)

    if (action === 'save') {
      const { data: apps } = await svc.from('connector_apps').select('provider,kind').eq('org_id', orgId)
      const taken = new Set<string>((apps || []).map((a: any) => a.provider))
      let pid = pid0, def: any = null
      if (pid === 'new_custom') {
        if ((apps || []).filter((a: any) => a.kind === 'custom').length >= MAX_CUSTOM) throw new CError('You can add up to ' + MAX_CUSTOM + ' custom connectors.', 400)
        def = validateCustomDef(body.def)
        pid = slugFor(def.name, new Set([...taken, ...Object.keys(PROVIDERS)]))
      } else if (!PROVIDERS[pid] && !(SLUG.test(pid) && pid.startsWith('custom_') && taken.has(pid))) throw new CError('Unknown connector.', 404)
      const cur = pid0 === 'new_custom' ? null : await loadProvider(orgId, pid)
      if (!def && cur?.prov.custom) {
        def = cur.app.def
        if (body.def) { const nd = validateCustomDef({ ...body.def, type: def.type }); def = nd }
      }
      const prov = def ? customProv(pid, def) : PROVIDERS[pid]
      const prevSettings: Rec = cur?.settings || {}
      const settings: Rec = { ...prevSettings, ...cleanSettings(prov, body.settings) }
      for (const k of Object.keys(settings)) if (!settings[k]) delete settings[k]
      const sec: Rec = { ...(cur?.sec || {}) }
      let newSecret = false
      for (const f of prov.fields) {
        if (!f.secret) continue
        const v = trim(body.secrets?.[f.key])
        if (v) { if (v.length > 2000 || /[\r\n]/.test(v)) throw new CError(f.label + ' is not valid.', 400); sec[f.key] = v; newSecret = true }
      }
      for (const k of Array.isArray(body.clear) ? body.clear : []) { if (prov.fields.some((f) => f.secret && f.key === k)) { delete sec[k]; newSecret = true } }
      const now = new Date().toISOString()
      const changed = newSecret || JSON.stringify(prevSettings) !== JSON.stringify(settings) || (!!def && JSON.stringify(cur?.app?.def || null) !== JSON.stringify(def))
      const e1 = await svc.from('connector_apps').upsert({
        org_id: orgId, provider: pid, kind: prov.custom ? 'custom' : 'builtin', name: prov.name, settings, def: def || null, updated_by: userId, updated_at: now,
      }, { onConflict: 'org_id,provider' })
      if (e1.error) throw new CError(/does not exist|schema cache/i.test(e1.error.message || '') ? 'Connector storage is not installed yet. The platform owner needs to run 2026-10-08-migration-connectors.sql once.' : 'Could not store the settings.', 500)
      const e2 = await svc.from('connector_app_secrets').upsert({ org_id: orgId, provider: pid, payload: await encryptBlob(sec, await getAes()), updated_at: now }, { onConflict: 'org_id,provider' })
      if (e2.error) throw new CError('Could not store the credentials.', 500)
      let dropped = false
      if (changed) {
        const { data: t } = await svc.from('connector_tokens').select('data_enc').eq('org_id', orgId).eq('provider', pid).maybeSingle()
        if (t?.data_enc) { await svc.from('connector_tokens').update({ data_enc: null, disconnected_at: now, updated_at: now }).eq('org_id', orgId).eq('provider', pid); dropped = true }
      }
      const { data: app } = await svc.from('connector_apps').select('*').eq('org_id', orgId).eq('provider', pid).maybeSingle()
      const { data: t2 } = await svc.from('connector_tokens').select('data_enc,connected_at').eq('org_id', orgId).eq('provider', pid).maybeSingle()
      return json({ ok: true, connector: view(prov, app, sec, !!t2?.data_enc, t2?.connected_at || null), disconnected: dropped })
    }

    if (!pid0) throw new CError('Which connector?', 400)
    const L = await loadProvider(orgId, pid0)
    const { prov, merged } = L

    if (action === 'remove') {
      await svc.from('connector_tokens').delete().eq('org_id', orgId).eq('provider', pid0)
      await svc.from('connector_app_secrets').delete().eq('org_id', orgId).eq('provider', pid0)
      await svc.from('connector_apps').delete().eq('org_id', orgId).eq('provider', pid0)
      return json({ ok: true })
    }
    if (action === 'disconnect') {
      const now = new Date().toISOString()
      await svc.from('connector_tokens').update({ data_enc: null, disconnected_at: now, updated_at: now }).eq('org_id', orgId).eq('provider', pid0)
      return json({ ok: true })
    }
    const ready = isReady(prov, L.settings, Object.keys(L.sec).filter((k) => !!L.sec[k]))

    if (action === 'start') {
      if (prov.kind !== 'oauth2') throw new CError(prov.name + " doesn't use a sign-in window. Use Connect instead.", 400)
      if (!ready) throw new CError('Enter and save all the required credentials for ' + prov.name + ' first.', 400)
      const ret = safeReturnOrigin(req.headers.get('origin'))
      if (!ret) throw new CError('Could not tell which address North is running at.', 400)
      const verifier = prov.pkce ? b64u(crypto.getRandomValues(new Uint8Array(48))) : ''
      const state = await signState({ o: orgId, u: userId, p: pid0, n: b64u(crypto.getRandomValues(new Uint8Array(8))), t: Math.floor(Date.now() / 1000), ...(verifier ? { v: verifier } : {}), r: ret }, await getHmac())
      return json({ ok: true, auth_url: await buildAuthUrl(prov, merged, redirectUri(), state, verifier) })
    }
    if (action === 'connect') {
      if (prov.kind === 'oauth2') throw new CError(prov.name + ' uses a sign-in window. Use Sign in instead.', 400)
      if (!ready) throw new CError('Enter and save all the required credentials for ' + prov.name + ' first.', 400)
      if (prov.kind === 'client_credentials') {
        let tok: any
        try { tok = await tokenRequest(prov, merged, { grant_type: 'client_credentials' }, fetch, dnsPublic) }
        catch (e) { throw new CError(prov.name + ' rejected the credentials' + (e instanceof CError ? ': ' + e.message : '.'), 400) }
        await saveToken(orgId, pid0, tok, userId)
        return json({ ok: true })
      }
      const r = await callTest(prov, merged, {}, fetch, dnsPublic)
      if (r.authFailed) throw new CError(prov.name + ' rejected the key (HTTP ' + r.status + ').', 400)
      await saveToken(orgId, pid0, { apikey: true, verified_status: r.status }, userId)
      return json({ ok: true, status: r.status })
    }
    if (action === 'test') {
      const { tok } = await loadToken(orgId, pid0)
      if (!tok) throw new CError(prov.name + ' is not connected.', 400)
      let r = await callTest(prov, merged, tok, fetch, dnsPublic)
      if (!r.authFailed) return json({ ok: true, status: r.status })
      if (prov.kind === 'apikey') throw new CError(prov.name + ' rejected the key (HTTP ' + r.status + ').', 400)
      const fresh = await refreshToken(prov, merged, tok, fetch, dnsPublic)
      if (!fresh) throw new CError(prov.name + ' test call was refused (HTTP ' + r.status + ') and the token could not be refreshed. Sign in again.', 400)
      await saveToken(orgId, pid0, fresh, null)
      r = await callTest(prov, merged, fresh, fetch, dnsPublic)
      if (r.authFailed) throw new CError(prov.name + ' test call failed (HTTP ' + r.status + ') even after refreshing the token.', 400)
      return json({ ok: true, status: r.status, refreshed: true })
    }
    throw new CError('Unknown action.', 400)
  } catch (e) {
    if (e instanceof CError) return json({ error: e.message }, e.code)
    console.error('connectors error', (e as Error)?.message)
    return json({ error: 'Something went wrong in the connectors function.' }, 500)
  }
})

// For the future sync step (not wired to anything yet): a valid access token for an org's connection, refreshed if older than 50 min.
// async function getAccessToken(svc, orgId, pid) { ... }  -- add when record syncing is built.
