// Action: "Trigger a North Flow" -- reuses the flows runtime's existing inbound-webhook endpoint
// (flow-inbound), already live since 2026-09-29. Needs no new backend code: the only things new
// here are the apikey header this app bakes in (fixes the 401 any caller hits without it -- see the
// backlog's "flow-inbound requires a Supabase apikey header" item) and wrapping it as a Zap action.
//
// flow_id and webhook_token come from Process Maps -- when you set a flow's trigger to "Inbound
// webhook", North shows both once. The API key field (same one from Connect an Account) isn't
// actually required by this call -- flow-inbound authenticates purely via flow_id + webhook_token --
// but keeping auth consistent across every action/trigger in this app avoids a confusing
// "why does this one action not need my key" question later.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbW9jdXViZWFqbnFqbHR1d2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMTgzNTQsImV4cCI6MjEwMTg5NDM1NH0.rZuoKPmmkpNe8Ug8Gu_KmpoKyibigJccdpoRGcLt3pY'

const perform = (z, bundle) => {
  const url = `https://rcmocuubeajnqjltuwdv.supabase.co/functions/v1/flow-inbound/${bundle.inputData.flow_id}?token=${encodeURIComponent(bundle.inputData.webhook_token)}`
  return z.request({
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: bundle.inputData.payload_json ? JSON.parse(bundle.inputData.payload_json) : {},
  }).then((response) => response.json)
}

module.exports = {
  key: 'trigger_flow',
  noun: 'Flow',
  display: {
    label: 'Trigger a North Flow',
    description: 'Starts a North flow whose trigger is set to "Inbound webhook" in Process Maps, passing along whatever data the Zap has.',
  },
  operation: {
    perform,
    inputFields: [
      { key: 'flow_id', label: 'Flow ID', required: true, helpText: 'From Process Maps, when the flow\'s trigger is set to "Inbound webhook".' },
      { key: 'webhook_token', label: 'Webhook Token', required: true, type: 'password', helpText: 'Shown once in Process Maps when the inbound-webhook trigger is created.' },
      { key: 'payload_json', label: 'Data (JSON)', required: false, helpText: 'Optional JSON object to send as the flow event\'s payload. Leave blank to send an empty body.' },
    ],
    sample: { ok: true, queued: true },
  },
}
