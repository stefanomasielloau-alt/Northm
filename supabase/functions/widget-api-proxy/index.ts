// Supabase Edge Function: widget-api-proxy  (2026-09-28)
// Server-side fetch for "Live API" External widgets whose URL the browser can't call directly
// (CORS). The caller must be a signed-in North user; the widget's URL is read from custom_widgets
// using the CALLER's own JWT, so row-level security guarantees they can only proxy widgets that
// belong to their own organisation. The URL is never taken from the request body.
//
// DEPLOY (no CLI needed): Supabase dashboard (North project) > Edge Functions > Deploy a new
// function > Via Editor > name it exactly  widget-api-proxy  > paste this file > Deploy.
// Leave "Enforce JWT verification" ON for this one (unlike widget-webhook).
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.
//
// Safety: https only, blocks localhost / private / link-local / metadata addresses, 10s timeout,
// 1 MB response cap, JSON only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const [a, b] = [+m[1], +m[2]]
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return true
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  const auth = req.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'not signed in' }, 401)

  let widgetId = ''
  try { widgetId = String((await req.json()).widget_id || '') } catch { return json({ error: 'bad request' }, 400) }
  if (!/^[0-9a-f-]{36}$/i.test(widgetId)) return json({ error: 'bad widget id' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: w, error } = await supabase.from('custom_widgets').select('id,type,url').eq('id', widgetId).maybeSingle()
  if (error) return json({ error: 'lookup failed' }, 500)
  if (!w) return json({ error: 'widget not found for your organisation' }, 404)
  if (w.type !== 'api') return json({ error: 'only Live API widgets can use the proxy' }, 400)

  let target: URL
  try { target = new URL(w.url) } catch { return json({ error: 'widget URL is not valid' }, 400) }
  if (target.protocol !== 'https:') return json({ error: 'only https URLs are allowed' }, 400)
  if (blockedHost(target.hostname)) return json({ error: 'that address is not allowed' }, 400)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  try {
    const r = await fetch(target.toString(), { headers: { Accept: 'application/json' }, redirect: 'error', signal: ctrl.signal })
    const text = await r.text()
    if (text.length > 1_000_000) return json({ error: 'response too large (over 1 MB)' }, 502)
    if (!r.ok) return json({ error: `upstream HTTP ${r.status}` }, 502)
    try { return json({ data: JSON.parse(text) }) } catch { return json({ error: 'upstream did not return JSON' }, 502) }
  } catch (e) {
    return json({ error: (e as Error).name === 'AbortError' ? 'upstream timed out' : 'upstream request failed' }, 502)
  } finally { clearTimeout(timer) }
})
