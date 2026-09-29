// Supabase Edge Function: flow-inbound (2026-09-29, Stef: "complete phases 2b and 3")
// Public endpoint an outside app calls to start a flow whose trigger is "Inbound webhook":
//   POST {SUPABASE_URL}/functions/v1/flow-inbound/<flow_id>?token=<token>   (JSON body, max 64 KB)
// The token is generated in Process Maps (shown once); only its SHA-256 hash is stored, in the
// flow's meta (schema_workflows.flow.inbound_token_hash). Compared hashed + constant-time.
// Stores the call as a flow_events row (kind 'inbound'); the flow-runner picks it up within a minute.
// Returns 202. DEPLOY with JWT verification OFF (the caller is an outside system).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 64 * 1024

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
async function sha256Hex(t: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('use POST', { status: 405 })
  const url = new URL(req.url)
  const flowId = url.pathname.split('/').filter(Boolean).pop() || ''
  const token = url.searchParams.get('token') || ''
  if (!UUID_RE.test(flowId)) return new Response('missing or invalid flow id in URL path', { status: 400 })
  if (!token) return new Response('missing ?token=', { status: 401 })
  const len = Number(req.headers.get('content-length') || '0')
  if (len > MAX_BYTES) return new Response('payload too large (max 64 KB)', { status: 413 })
  const raw = await req.text()
  if (new TextEncoder().encode(raw).length > MAX_BYTES) return new Response('payload too large (max 64 KB)', { status: 413 })
  let body: unknown = {}
  if (raw.trim()) { try { body = JSON.parse(raw) } catch { return new Response('body must be valid JSON', { status: 400 }) } }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: wf, error } = await db.from('schema_workflows').select('id, org_id, nodes, flow').eq('id', flowId).maybeSingle()
  if (error) return new Response('lookup failed', { status: 500 })
  if (!wf) return new Response('unknown flow', { status: 404 })
  const meta = (wf as any).flow || (((wf as any).nodes || []).find((n: any) => n && n.id === '__flow__') || {}).config || {}
  const expected = String(meta.inbound_token_hash || '')
  const got = await sha256Hex(token)
  if (!expected || !safeEqual(expected, got)) return new Response('unauthorized', { status: 401 })
  if (meta.status !== 'active') return new Response('flow is not active', { status: 409 })
  const { error: insErr } = await db.from('flow_events').insert({
    org_id: (wf as any).org_id, source_table: 'inbound', record_id: null, op: 'INBOUND', kind: 'inbound',
    payload: { flow_id: flowId, body, received_at: new Date().toISOString() },
  })
  if (insErr) return new Response('failed to store the event', { status: 500 })
  return new Response(JSON.stringify({ ok: true, queued: true }), { status: 202, headers: { 'Content-Type': 'application/json' } })
})
