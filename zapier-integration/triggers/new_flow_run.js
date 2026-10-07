// Trigger: "New Flow Run" -- polls zapier-poll-runs. Covers both "a flow ran" and "a flow needs
// approval" (status includes 'awaiting_approval') -- one generic trigger rather than one per module,
// so a new North module never needs a new Zapier trigger to go with it.
const perform = (z, bundle) => {
  const params = { limit: 100 }
  // Zapier's own de-dupe (by `id`) means we don't strictly need `since`, but it keeps the payload
  // small on orgs with a lot of flow activity.
  if (bundle.meta.page === 0 && !bundle.meta.isLoadingSample) {
    // no-op placeholder for a future cursor strategy; left simple for this first pass
  }
  return z.request({
    url: 'https://rcmocuubeajnqjltuwdv.supabase.co/functions/v1/zapier-poll-runs',
    params,
    headers: { 'X-Api-Key': bundle.authData.api_key },
  }).then((response) => {
    const runs = (response.json && response.json.runs) || []
    return runs.map((r) => ({ id: r.id, ...r }))
  })
}

module.exports = {
  key: 'new_flow_run',
  noun: 'Flow Run',
  display: {
    label: 'New Flow Run',
    description: 'Triggers when a North flow runs or changes status (running, done, failed, or awaiting your approval).',
  },
  operation: {
    type: 'polling',
    perform,
    sample: {
      id: 'sample-run-id',
      flow_id: 'sample-flow-id',
      record_type: 'augur_deals',
      record_id: 'sample-record-id',
      status: 'done',
      started_at: '2026-10-06T00:00:00Z',
      updated_at: '2026-10-06T00:05:00Z',
      error: null,
    },
  },
}
