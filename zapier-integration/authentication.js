// North's Zapier integration -- API key auth.
// The key itself is NOT a third-party credential -- North mints it for you. Get one by calling the
// zapier-keygen Edge Function with your own North session token (see the setup checklist doc for the
// exact curl, since there's no admin-UI button for it yet -- flagged as a fast follow, not built this
// pass). Paste the returned `nk_...` value into Zapier's "Connect an Account" screen.
const testAuth = (z, bundle) =>
  z.request({
    url: 'https://rcmocuubeajnqjltuwdv.supabase.co/functions/v1/zapier-poll-runs',
    params: { limit: 1 },
    headers: { 'X-Api-Key': bundle.authData.api_key },
  }).then((response) => {
    if (response.status === 401) {
      throw new Error('That API key was rejected -- generate a fresh one (see the setup checklist).')
    }
    return response.json
  })

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'North API Key',
      required: true,
      type: 'password',
      helpText: 'Generate one by calling the zapier-keygen endpoint with your North session token -- see the setup checklist doc. Looks like `nk_...`.',
    },
  ],
  test: testAuth,
  connectionLabel: 'North',
}
