# Flows runtime — run sheet (phase 2b + 3), 2026-09-29

This switches on **flows that run by themselves** (phase 2b) and **outside apps / agents, push and pull** (phase 3).
Until every step below is done, nothing changes for anyone: Process Maps shows "runtime not installed yet — see run sheet", the **Activate** button stays greyed out, and the old automation rules keep working the way they do today.

Do the steps in order. Each one is safe to repeat.

Supabase project: `rcmocuubeajnqjltuwdv` (North). Hub-Backend: `https://hub-backend-psi.vercel.app`.

---

## 1. Push Northm

The lead commits the new files, then push as usual (GitHub Desktop → Push origin). Vercel redeploys North.

New or changed files:

| File | What it is |
|---|---|
| `Schema.html` | Process Maps UI: Activate/Pause, the "Runs & approvals" page, watches, replay, convert, inbound trigger, connectors |
| `shared/flowEngine.js` | The flow engine, shared by the simulator and the server |
| `supabase/functions/flow-runner/index.ts`, `runner.js`, `flowEngine.js` | The every-minute runner |
| `supabase/functions/flow-inbound/index.ts` | Public URL that outside apps call to start a flow |
| `supabase/functions/flow-approve/index.ts` | Approve/Reject links used in approval emails |
| `Claude outputs/2026-09-29-migration-flows-runtime.sql` | The database migration |
| `Claude outputs/2026-09-29-check-flow-engine-copy.py` | Checks that the two engine copies are identical |

**Rule for later edits:** `supabase/functions/flow-runner/flowEngine.js` must be a byte-for-byte copy of `shared/flowEngine.js`. After changing the engine, copy it over, then run:

```
python "Claude outputs/2026-09-29-check-flow-engine-copy.py"
```

It prints `OK` or tells you which file differs, and exits with an error code if they differ.

## 2. Create three random secrets

Make two long random values. Use any **one** of these:

- **PowerShell:**
  ```
  -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
  ```
- **Git Bash, macOS or Linux:**
  ```
  openssl rand -hex 32
  ```
- **Any browser console (F12):**
  ```
  [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('')
  ```

Run it twice. Call the first value **RUNNER** and the second **DISPATCH**. Keep them in your password manager.

In Supabase Dashboard → **Edge Functions → Secrets** (or *Project Settings → Edge Functions*), add:

| Name | Value |
|---|---|
| `FLOW_RUNNER_SECRET` | RUNNER |
| `FLOW_DISPATCH_SECRET` | DISPATCH |
| `HUB_URL` | `https://hub-backend-psi.vercel.app` |
| `NORTH_URL` *(optional)* | North's web address, ending in `/` (used for "Open in North" links in emails; defaults to `https://northm.vercel.app/`) |
| `FLOW_TZ` *(optional)* | Defaults to `Australia/Sydney`; the time zone for "every Monday 9am"-style triggers |

To do the same with the CLI:

```
supabase secrets set FLOW_RUNNER_SECRET=<RUNNER> FLOW_DISPATCH_SECRET=<DISPATCH> HUB_URL=https://hub-backend-psi.vercel.app --project-ref rcmocuubeajnqjltuwdv
```

## 3. Put the runner secret in the Vault

The every-minute job reads the secret from the Vault. In Supabase → **SQL Editor**, run:

```sql
select vault.create_secret('<RUNNER>', 'flow_runner_secret');
```

- If it says the name already exists, run this instead:
  ```sql
  select vault.update_secret((select id from vault.secrets where name='flow_runner_secret'), '<RUNNER>');
  ```
- Use the **same** RUNNER value as in step 2.

## 4. Run the migration

In the SQL Editor, paste all of `Claude outputs/2026-09-29-migration-flows-runtime.sql` and press Run.

It does the following:

- Turns on the `pg_cron` and `pg_net` extensions.
- Creates the tables `automation_bundles`, `system_triggers`, `flow_watches`, `flow_events`, `flow_runs`, `flow_run_steps`, `flow_waits` and `flow_approvals`. All of them are org-isolated with RLS; watches are visible to their owner only.
- Adds a small "record changed" trigger on campaigns, deals, events, tasks, assets and leads.
  - It **never blocks a save**: if it fails, it only raises a warning.
  - It skips any of those tables that don't exist.
- Schedules two jobs:
  - `flow-runner-tick`, every minute;
  - `flow-runtime-cleanup`, daily. Processed events are kept for 60 days; step logs of finished runs are kept for 180 days.

You can run it again safely.

Check it worked:

```sql
select jobname, schedule, active from cron.job where jobname like 'flow-%';
```

You should see two rows.

## 5. Deploy the three functions — JWT verification OFF for all three

**All three need "Verify JWT" switched OFF**, the runner included:

- **flow-runner:** the cron job sends no user login token. It is protected by the `X-Runner-Secret` header instead.
- **flow-inbound:** outside apps call it. It is protected by a per-flow token.
- **flow-approve:** opened from an email link. It is protected by a one-time token.

**CLI option** (from the Northm folder):

```
supabase functions deploy flow-runner  --no-verify-jwt --project-ref rcmocuubeajnqjltuwdv
supabase functions deploy flow-inbound --no-verify-jwt --project-ref rcmocuubeajnqjltuwdv
supabase functions deploy flow-approve --no-verify-jwt --project-ref rcmocuubeajnqjltuwdv
```

**Dashboard option:**

1. Go to Edge Functions → **Deploy a new function** → name it `flow-runner`.
2. Add three files with exactly these names, pasting the contents from `supabase/functions/flow-runner/`:
   - `index.ts`
   - `runner.js`
   - `flowEngine.js`
3. Deploy, then open the function's **Details/Settings** and switch **Verify JWT / Enforce JWT verification OFF**. Save.
4. Repeat for `flow-inbound` and `flow-approve`. Each of those is a single `index.ts`.

Quick check in a browser:

- Open `https://rcmocuubeajnqjltuwdv.supabase.co/functions/v1/flow-runner`.
- It should show `{"ok":true,"deployed":true,…,"secretSet":true,"dispatchSecretSet":true}`.
- If you see `401` / "Missing authorization header", JWT verification is still on.

## 6. Hub-Backend

1. In Vercel → hub-backend project → **Settings → Environment Variables**, add `FLOW_DISPATCH_SECRET` = DISPATCH (the **same** value as step 2) for Production.
2. Push the Hub-Backend repo. Another agent is building `/flows/dispatch` and `/flows/connectors` there.
3. Redeploy so the new variable is picked up.

## 7. Verify

1. **Hub:** open `https://hub-backend-psi.vercel.app/flows/health` (if Hub exposes it). It should say the dispatch secret is set.
2. **Runner ticking:**
   ```sql
   select status_code, created from net._http_response order by created desc limit 3;
   ```
   Within a minute or two you should see `200`s.
3. **North:** reload Process Maps (hard refresh). The "How this page works" box on *Flows & diagrams* and *Runs & approvals* should say the runtime is installed.
4. **Test flow:**
   1. Build a tiny flow: trigger "Campaign sign-off → enters Submitted", then an action "Log a note", then End.
   2. Make Checks clean, then press **Activate**. The flow shows a green **● Running** pill.
   3. Move one test campaign to *Submitted*.
   4. Within about a minute a run appears on **4 Runs & approvals** with its path lit up on the canvas.
5. **Email/Hub path:** add an "Send an email" action to yourself and repeat. The email arrives through Hub. If it fails, the run shows *Failed* with the reason and a **Retry** button.
6. **Approval:** a "Calculate a field" action waits for approval by default.
   - It appears under "Waiting for approval", and the flow owner gets an email with Approve/Reject links.
   - Approving applies the change once.
7. **Browser drafts:** on *Automation bundles* and *System processes*, press **Move my browser drafts to the database** once. Do it on each browser that has drafts.

## 8. Rollback (stop everything, lose nothing)

```sql
select cron.unschedule('flow-runner-tick');
update public.schema_workflows set flow = jsonb_set(flow, '{status}', '"paused"')
 where flow->>'status' = 'active';
```

- The second statement pauses all active flows. If `schema_workflows` has no `flow` column, pause each flow from its settings panel instead.
- Optionally, stop outside calls by removing `FLOW_DISPATCH_SECRET` in Vercel. Hub then answers 501 and runs fail safely.
- The record-change triggers can stay; they only append to `flow_events`. To remove them too:
  ```sql
  drop trigger if exists flow_capture on public.<table>;
  ```
  for each of: campaigns, augur_deals, eventus_events, tasks, assets, prospectus_leads.
- To turn it back on, re-run the migration (it reschedules the job), then Activate the flows again.

## Things to know

- **Safety limits:**
  - Each action is retried up to 3 times.
  - A flow that does more than 200 actions in an hour is paused automatically and shows as Paused.
  - Hand-offs to other flows stop at depth 5, and a flow can't loop back into itself.
- **Old automation rules** still run the old way: in the browser, only while someone has the page open. Use **Convert to flow** / **Convert all to flows** on *Automation bundles*, check the draft, Activate it, then switch the old rule off.
  - Leaving both on sends things twice.
  - Switching the old rule off before activating means nothing runs.
- **Watches** notify only the person who created them.
- **Inbound webhooks:**
  - The token is shown **once** when generated; only its hash is stored.
  - Generating a new one invalidates the old one.
  - Requests must be POSTs under 64 KB, and the flow must be Active.
- **Connectors** appear in the action list once Hub is updated. Before that the editor says "Connectors appear once Hub is updated".
- Time-based triggers use `FLOW_TZ` (Australia/Sydney by default).

### Hub contract summary (for reference)

- **Signing:**
  - The runner calls `POST {HUB_URL}/flows/dispatch` with the headers `X-Flow-Timestamp` (unix seconds) and `X-Flow-Signature`.
  - `X-Flow-Signature` is the hex HMAC-SHA256 of `"<timestamp>.<raw body>"`, keyed with `FLOW_DISPATCH_SECRET`.
  - Hub rejects requests that are more than 5 minutes old.
- **Idempotency:** the key is `run_id:node_id:attempt`, so a retry never sends twice.
- **Action types:** `email`, `chat`, `webhook`, `http_pull`, `connector`, `agent_push`, `agent_pull`/`ai`.
- **Connector list:** comes from `GET {HUB_URL}/flows/connectors?token=<North login>&org=<hub slug>`.
