// Supabase Edge Function: flow-approve (2026-09-29, Stef: "complete phases 2b and 3")
// The Approve / Reject links in a flow's approval email land here:
//   GET  {SUPABASE_URL}/functions/v1/flow-approve?id=<approval id>&token=<token>&decision=approve|reject
//        -> a tiny confirm page (so a link preview / mail scanner can never decide by itself)
//   POST (same URL, from that page's button) -> applies the decision once: the token hash is cleared,
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
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])
function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#F2F4F8;color:#10182B;margin:0;padding:40px 16px}
.c{max-width:460px;margin:0 auto;background:#fff;border:1px solid #DFE3EB;border-radius:10px;padding:24px}h1{font-size:18px;margin:0 0 10px}
p{font-size:14px;color:#45506B;line-height:1.5}button{font-size:14px;padding:10px 18px;border-radius:6px;border:none;cursor:pointer;color:#fff}
.ok{background:#0E8A5F}.no{background:#D0342C}pre{background:#F6F8FB;padding:10px;border-radius:6px;font-size:12px;white-space:pre-wrap}</style></head>
<body><div class="c">${body}</div></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id') || ''
  const token = url.searchParams.get('token') || ''
  const decision = url.searchParams.get('decision') === 'reject' ? 'reject' : 'approve'
  if (!UUID_RE.test(id) || !token) return page('Invalid link', '<h1>This link is not valid</h1><p>Open Process Maps → Runs &amp; approvals in North instead.</p>', 400)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: ap } = await db.from('flow_approvals').select('id, status, token_hash, action, run_id').eq('id', id).maybeSingle()
  if (!ap) return page('Not found', '<h1>Approval not found</h1>', 404)
  if (ap.status !== 'pending' || !ap.token_hash) return page('Already decided', `<h1>Already decided</h1><p>This request was already <b>${esc(ap.status)}</b>.</p>`)
  if (!safeEqual(ap.token_hash, await sha256Hex(token))) return page('Invalid link', '<h1>This link is not valid</h1>', 401)
  const prev = (ap.action || {}).preview || {}
  const what = esc((prev.type || 'action') + (prev.field ? ' → ' + prev.field : prev.intoField ? ' → ' + prev.intoField : ''))
  const rec = esc(((ap.action || {}).record || {}).name || '')
  if (req.method === 'GET') {
    return page('Confirm', `<h1>${decision === 'approve' ? 'Approve' : 'Reject'} this flow action?</h1>
      <p>Action: <b>${what}</b>${rec ? ' for <b>' + rec + '</b>' : ''}</p><pre>${esc(JSON.stringify(prev, null, 2)).slice(0, 1500)}</pre>
      <form method="POST"><button class="${decision === 'approve' ? 'ok' : 'no'}" type="submit">${decision === 'approve' ? 'Approve' : 'Reject'}</button></form>`)
  }
  if (req.method !== 'POST') return page('Method not allowed', '<h1>Use the button on the confirm page</h1>', 405)
  const { data: upd } = await db.from('flow_approvals')
    .update({ status: decision === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString(), token_hash: null })
    .eq('id', id).eq('status', 'pending').select('id')
  if (!upd || !upd.length) return page('Already decided', '<h1>Already decided</h1>')
  return page('Done', `<h1>${decision === 'approve' ? 'Approved' : 'Rejected'}</h1><p>The flow carries on within a minute. You can close this tab.</p>`)
})
