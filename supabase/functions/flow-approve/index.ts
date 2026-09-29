// Supabase Edge Function: flow-approve (2026-09-29, Stef: "complete phases 2b and 3")
// The Approve / Reject links in a flow's approval email land here:
//   GET  {SUPABASE_URL}/functions/v1/flow-approve?id=<approval id>&token=<token>&decision=approve|reject
//        -> redirects to North's approve.html confirm page (Supabase serves function HTML as plain text,
//           so the page lives in North; a link preview / mail scanner still can never decide by itself)
//   GET  ...&format=json -> the approval's details as JSON (what approve.html shows)
//   POST ...&format=json (from approve.html's button) -> applies the decision once, answers JSON: the token hash is cleared,
//        so the link can't be reused. The flow-runner resumes the run on its next minute tick.
// Tokens are random, only their SHA-256 hash is stored (flow_approvals.token_hash). DEPLOY with JWT
// verification OFF (the person clicking is reading email, not signed in).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const id = url.searchParams.get('id') || ''
  const token = url.searchParams.get('token') || ''
  const decision = url.searchParams.get('decision') === 'reject' ? 'reject' : 'approve'
  const wantsJson = url.searchParams.get('format') === 'json'
  // 2026-09-29: the email link (no format=json) goes to North's confirm page, which calls back here with format=json
  if (!wantsJson && req.method === 'GET') {
    const north = String(Deno.env.get('NORTH_URL') || 'https://northm.vercel.app/').replace(/\/?$/, '/')
    const to = north + 'approve.html?id=' + encodeURIComponent(id) + '&token=' + encodeURIComponent(token) + '&decision=' + decision
    return new Response(null, { status: 302, headers: { Location: to } })
  }
  if (!UUID_RE.test(id) || !token) return json({ ok: false, state: 'invalid', message: 'This link is not valid.' }, 400)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: ap } = await db.from('flow_approvals').select('id, status, token_hash, action, run_id').eq('id', id).maybeSingle()
  if (!ap) return json({ ok: false, state: 'not_found', message: 'Approval not found.' }, 404)
  if (ap.status !== 'pending' || !ap.token_hash) return json({ ok: false, state: 'decided', status: ap.status, message: 'This request was already ' + ap.status + '.' })
  if (!safeEqual(ap.token_hash, await sha256Hex(token))) return json({ ok: false, state: 'invalid', message: 'This link is not valid.' }, 401)
  const prev = (ap.action || {}).preview || {}
  const what = (prev.type || 'action') + (prev.field ? ' → ' + prev.field : prev.intoField ? ' → ' + prev.intoField : '')
  const rec = ((ap.action || {}).record || {}).name || ''
  if (req.method === 'GET') return json({ ok: true, state: 'pending', decision, what, record: rec, preview: prev })
  if (req.method !== 'POST') return json({ ok: false, message: 'use GET or POST' }, 405)
  const { data: upd } = await db.from('flow_approvals')
    .update({ status: decision === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString(), token_hash: null })
    .eq('id', id).eq('status', 'pending').select('id')
  if (!upd || !upd.length) return json({ ok: false, state: 'decided', message: 'This request was already decided.' })
  return json({ ok: true, state: 'done', decision })
})
