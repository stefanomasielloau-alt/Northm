// Supabase Edge Function: zapier-keygen (2026-10-06, Stef: Zapier integration, "build to the
// credential point just like the other connectors").
// Mints a durable API key for the calling org, for Zapier (or any future reversed integration)
// to authenticate with. DEPLOY WITH JWT VERIFICATION ON (the default) -- unlike flow-inbound, the
// caller here IS a North user, proving who they are with their own session token, same as every
// other authenticated call North's own frontend already makes.
//
//   POST {SUPABASE_URL}/functions/v1/zapier-keygen
//   Authorization: Bearer <north user's session access_token>
//   -> { ok: true, api_key: "nk_...", label: "Zapier" }   (the raw key is shown ONCE; only its
//      SHA-256 hash is stored in api_keys.key_hash -- same one-time-reveal pattern as the inbound
//      webhook token in Process Maps)
//
// Rotation/revocation: not built this pass (flagged in the setup checklist) -- calling this again
// mints an additional key rather than replacing one, so multiple Zaps/tools can each hold their own.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function sha256Hex(t: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
function randomKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const b64url = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'nk_' + b64url
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('use POST', { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  const userToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!userToken) return new Response('missing Authorization: Bearer <token>', { status: 401 })

  let label = 'Zapier'
  try {
    const raw = await req.text()
    if (raw.trim()) {
      const body = JSON.parse(raw)
      if (body && typeof body.label === 'string' && body.label.trim()) label = body.label.trim().slice(0, 60)
    }
  } catch {
    return new Response('body must be valid JSON', { status: 400 })
  }

  // Verify the caller's own session token and find their org, using the ANON client (respects RLS;
  // this call only ever needs to know who the caller is, not bypass anything).
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const { data: userData, error: userErr } = await anon.auth.getUser(userToken)
  if (userErr || !userData?.user) return new Response('invalid or expired session', { status: 401 })

  const { data: profile, error: profErr } = await anon.from('profiles').select('org_id').eq('id', userData.user.id).maybeSingle()
  if (profErr || !profile?.org_id) return new Response('could not resolve your org', { status: 403 })

  const rawKey = randomKey()
  const keyHash = await sha256Hex(rawKey)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { error: insErr } = await admin.from('api_keys').insert({
    org_id: profile.org_id, label, key_hash: keyHash, created_by: userData.user.id,
  })
  if (insErr) return new Response('failed to store the key', { status: 500 })

  return new Response(JSON.stringify({ ok: true, api_key: rawKey, label }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
})
