// 2026-09-24 -- Supabase Edge Function: receives a webhook POST for one External widget and
// stores its JSON body into that widget's custom_widgets.latest_payload column, which the
// 'webhook' widget type then just displays (see shared/grid.js resolveWidget()'s 'external.'
// branch -- renderJsonPayload(cw.latestPayload)).
//
// NOT YET DEPLOYED -- this file only exists here; deploying it is a step Stef needs to run
// himself (this cloud session has no Supabase project access / CLI credentials):
//   1. Copy this file into your repo at supabase/functions/widget-webhook/index.ts
//   2. From the repo root, with the Supabase CLI installed and `supabase link`ed to this
//      project: `supabase functions deploy widget-webhook --no-verify-jwt`
//      (--no-verify-jwt because the caller here is an external system, not a signed-in North
//      user -- auth is the per-widget token below instead, checked against the DB, not a
//      Supabase JWT)
//   3. Run 2026-09-24-migration-custom-widgets-add-webhook-columns.sql FIRST if you haven't --
//      this function's UPDATE will fail without the latest_payload/webhook_token columns.
//
// Endpoint shape once deployed: POST {SUPABASE_URL}/functions/v1/widget-webhook/<widget_id>?token=<webhook_token>
// Body: any JSON. Exactly what a widget's row in Admin & config > Widget library > External
// widgets shows as its "URL / endpoint" once you add a Webhook-type widget.
//
// Auth model: a per-widget random token (generated when the widget is created, stored in
// custom_widgets.webhook_token) checked against the ?token= query param. Not a secret Stef has to
// manage globally -- each widget gets its own, and removing the widget row invalidates it
// automatically (nothing left to match against). Good enough for a first pass; if this needs to
// protect something sensitive later, a per-org shared secret or IP allowlist could be layered on.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('use POST', { status: 405 })
  }

  const url = new URL(req.url)
  const widgetId = url.pathname.split('/').filter(Boolean).pop()
  const token = url.searchParams.get('token')
  if (!widgetId) return new Response('missing widget id in URL path', { status: 400 })
  if (!token) return new Response('missing ?token=', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role -- bypasses RLS, needed since the
                                                  // caller is an external system, not a signed-in user
  )

  const { data: widget, error: findErr } = await supabase
    .from('custom_widgets')
    .select('id, webhook_token')
    .eq('id', widgetId)
    .maybeSingle()

  if (findErr) return new Response('lookup failed', { status: 500 })
  if (!widget) return new Response('unknown widget id', { status: 404 })
  if (!widget.webhook_token || widget.webhook_token !== token) {
    return new Response('unauthorized', { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return new Response('body must be valid JSON', { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('custom_widgets')
    .update({ latest_payload: payload })
    .eq('id', widgetId)

  if (updateErr) return new Response('failed to store payload', { status: 500 })
  return new Response('ok', { status: 200 })
})
