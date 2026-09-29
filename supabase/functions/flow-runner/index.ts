// Supabase Edge Function: flow-runner (2026-09-29, Stef: "complete phases 2b and 3")
// Called every minute by pg_cron (job 'flow-runner-tick', see
// "Claude outputs/2026-09-29-migration-flows-runtime.sql") with header X-Runner-Secret.
// Per tick it claims new flow_events, starts runs for ACTIVE flows / system triggers / watches,
// checks time-based triggers, advances waiting runs and due waits, applies decided approvals,
// runs in-North actions directly (service role) and sends everything outside North to
// Hub-Backend POST /flows/dispatch (HMAC-signed; contract summary in the run sheet).
//
// DEPLOY: see "Claude outputs/2026-09-29-flows-runtime-run-sheet.md". JWT verification must be
// OFF for this function (pg_cron sends no user JWT; the X-Runner-Secret header is the auth).
// Files: index.ts (this), runner.js (logic, shared with the Node test harness) and flowEngine.js
// (a byte-identical copy of Northm/shared/flowEngine.js -- check with
// "Claude outputs/2026-09-29-check-flow-engine-copy.py").
// Secrets: FLOW_RUNNER_SECRET, FLOW_DISPATCH_SECRET, HUB_URL (optional), FLOW_TZ (optional,
// default Australia/Sydney), NORTH_URL (optional). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
// provided automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import './flowEngine.js'
import { tick, safeEqual } from './runner.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-runner-secret, authorization, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const FE = (globalThis as any).FlowEngine
  // GET = health check used by Process Maps to tell whether the runtime is installed (no secret, no work done).
  if (req.method === 'GET') return json({ ok: true, deployed: true, engine: FE ? FE.VERSION : null, secretSet: !!Deno.env.get('FLOW_RUNNER_SECRET'), dispatchSecretSet: !!Deno.env.get('FLOW_DISPATCH_SECRET') })
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)
  const secret = Deno.env.get('FLOW_RUNNER_SECRET') || ''
  if (!secret) return json({ error: 'FLOW_RUNNER_SECRET is not set' }, 501)
  if (!safeEqual(req.headers.get('x-runner-secret') || '', secret)) return json({ error: 'unauthorized' }, 401)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  try {
    const stats = await tick({
      SUPABASE_URL: Deno.env.get('SUPABASE_URL'), HUB_URL: Deno.env.get('HUB_URL'), NORTH_URL: Deno.env.get('NORTH_URL'),
      FLOW_DISPATCH_SECRET: Deno.env.get('FLOW_DISPATCH_SECRET'), FLOW_TZ: Deno.env.get('FLOW_TZ'), BUDGET_MS: 40000,
    }, { db, fetch, crypto: globalThis.crypto, now: () => Date.now(), log: console })
    return json({ ok: true, stats })
  } catch (e) {
    console.error('flow-runner tick failed', e)
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500)
  }
})
