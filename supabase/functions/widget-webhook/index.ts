// Supabase Edge Function: widget-webhook
// Receives a webhook POST for one External widget and stores its JSON body in that widget's
// custom_widgets.latest_payload, which the 'webhook' widget type displays.
// Originally drafted 2026-09-24 (claude/2026-09-24-functions-widget-webhook-index.ts); moved into
// the repo 2026-09-28 with two small hardening changes: widget id must look like a UUID, and the
// token check is constant-time.
//
// DEPLOY (no CLI needed): Supabase dashboard (North project) > Edge Functions > Deploy a new
// function > "Via Editor" > name it exactly  widget-webhook  > paste this file > Deploy.
// Then open the function > Details/Settings > turn OFF "Enforce JWT verification" (the caller is an
// external system authenticated by the per-widget token below, not a signed-in North user).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.
// Requires the custom_widgets webhook_token + latest_payload columns (run sheet part 1, step 4).
//
// Endpoint: POST {SUPABASE_URL}/functions/v1/widget-webhook/<widget_id>?token=<webhook_token>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('use POST', { status: 405 })

  const url = new URL(req.url)
  const widgetId = url.pathname.split('/').filter(Boolean).pop() || ''
  const token = url.searchParams.get('token') || ''
  if (!UUID_RE.test(widgetId)) return new Response('missing or invalid widget id in URL path', { status: 400 })
  if (!token) return new Response('missing ?token=', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: widget, error: findErr } = await supabase
    .from('custom_widgets').select('id, webhook_token').eq('id', widgetId).maybeSingle()
  if (findErr) return new Response('lookup failed', { status: 500 })
  if (!widget) return new Response('unknown widget id', { status: 404 })
  if (!widget.webhook_token || !safeEqual(widget.webhook_token, token)) {
    return new Response('unauthorized', { status: 401 })
  }

  let payload: unknown
  try { payload = await req.json() } catch { return new Response('body must be valid JSON', { status: 400 }) }

  const { error: updateErr } = await supabase
    .from('custom_widgets').update({ latest_payload: payload }).eq('id', widgetId)
  if (updateErr) return new Response('failed to store payload', { status: 500 })
  return new Response('ok', { status: 200 })
})
