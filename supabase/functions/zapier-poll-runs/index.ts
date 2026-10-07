// Supabase Edge Function: zapier-poll-runs (2026-10-06, Stef: Zapier integration, "build to the
// credential point just like the other connectors").
// Polling trigger source for Zapier's "New Flow Run" trigger. DEPLOY WITH JWT VERIFICATION OFF --
// the caller is an outside system authenticating with its own org API key (X-Api-Key header), not
// a North user session; same reasoning as flow-inbound.
//
//   GET {SUPABASE_URL}/functions/v1/zapier-poll-runs?since=<ISO8601>&limit=100
//   X-Api-Key: <nk_... from zapier-keygen>
//   -> { ok: true, runs: [ { id, flow_id, record_type, record_id, status, started_at, updated_at,
//        error }, ... ] }   newest (by updated_at) first -- Zapier's own polling convention.
//
// Returns flow_runs only (not flow_approvals separately) for this first pass: a run's own `status`
// already includes 'awaiting_approval', so one trigger covers "a flow ran" and "a flow needs your
// approval" without needing two separate poll endpoints. Splitting into a dedicated "Needs approval"
// trigger later is a filter on this same data, not a new table or a schema change.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function sha256Hex(t: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('use GET', { status: 405 })
  const url = new URL(req.url)
  const apiKey = req.headers.get('X-Api-Key') || ''
  if (!apiKey || !apiKey.startsWith('nk_')) return new Response('missing or invalid X-Api-Key', { status: 401 })

  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200)
  const since = url.searchParams.get('since') || ''

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const keyHash = await sha256Hex(apiKey)
  const { data: keyRow, error: keyErr } = await db.from('api_keys').select('id, org_id, revoked_at')
    .eq('key_hash', keyHash).is('revoked_at', null).maybeSingle()
  if (keyErr) return new Response('key lookup failed', { status: 500 })
  if (!keyRow) return new Response('unauthorized', { status: 401 })

  // best-effort last_used_at touch; never blocks the actual response
  db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id).then(() => {}, () => {})

  let q = db.from('flow_runs').select('id, flow_id, record_type, record_id, status, started_at, updated_at, error')
    .eq('org_id', keyRow.org_id).order('updated_at', { ascending: false }).limit(limit)
  if (since) q = q.gt('updated_at', since)

  const { data: runs, error: runsErr } = await q
  if (runsErr) return new Response('query failed', { status: 500 })

  return new Response(JSON.stringify({ ok: true, runs: runs || [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
})
