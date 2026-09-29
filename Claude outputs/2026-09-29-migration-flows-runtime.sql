-- 2026-09-29 -- Process Maps phases 2b + 3: flows run automatically (Stef: "complete phases 2b and 3")
-- Run AFTER 2026-09-29-migration-schema-workflows-flow-column.sql (this file adds that column too, harmlessly).
-- Idempotent: safe to run more than once. Step-by-step instructions: 2026-09-29-flows-runtime-run-sheet.md.
--
-- What it creates
--   automation_bundles   multi-action bundles (moved out of browser localStorage)
--   system_triggers      System processes page triggers (moved out of browser localStorage)
--   flow_watches         personal "Watch this" subscriptions (only ever visible to their owner)
--   flow_events          record changes captured by DB triggers + inbound webhook calls (engine input)
--   flow_runs / flow_run_steps / flow_waits / flow_approvals   the runtime's own bookkeeping
--   AFTER INSERT/UPDATE triggers on campaigns, augur_deals, eventus_events, tasks, assets, prospectus_leads
--     that write a flow_events row when a flow-relevant column changes. They can never block a save:
--     any error inside is turned into a WARNING.
--   pg_cron 'flow-runner-tick' (every minute) -> Edge Function flow-runner, secret read from Vault
--   pg_cron 'flow-runtime-cleanup' (daily) -> deletes processed flow_events > 60 days and the step
--     history of finished runs > 180 days (engine-only tables; nothing a person typed is deleted)
-- RLS: every table is org-isolated with the standard North policy; flow_watches is owner-only.
-- The Edge Functions use the service role (bypasses RLS).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.schema_workflows ADD COLUMN IF NOT EXISTS flow jsonb;

-- ---------------------------------------------------------------- tables
CREATE TABLE IF NOT EXISTS public.automation_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  locked boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  process_key text NOT NULL,
  step text,
  rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.flow_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  target_type text NOT NULL DEFAULT 'process' CHECK (target_type IN ('process','flow')),
  target_id text,
  process_key text,
  step text,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  channels jsonb NOT NULL DEFAULT '{"inapp":true,"email":false}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.flow_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  record_id text,
  op text,
  old jsonb,
  new jsonb,
  kind text NOT NULL DEFAULT 'change' CHECK (kind IN ('change','inbound','manual')),
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_events_unprocessed_idx ON public.flow_events (id) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS flow_events_org_created_idx ON public.flow_events (org_id, created_at);

CREATE TABLE IF NOT EXISTS public.flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flow_id text NOT NULL,                       -- schema_workflows.id, or 'rule:<system_triggers.id>'
  record_type text,
  record_id text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','waiting','done','failed','awaiting_approval','cancelled')),
  current_nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  state jsonb,
  dedupe_key text UNIQUE,
  trigger_node text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_check_at timestamptz,
  error text
);
CREATE INDEX IF NOT EXISTS flow_runs_org_status_idx ON public.flow_runs (org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS flow_runs_record_idx ON public.flow_runs (org_id, record_id, status);
CREATE INDEX IF NOT EXISTS flow_runs_check_idx ON public.flow_runs (status, next_check_at);

CREATE TABLE IF NOT EXISTS public.flow_run_steps (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  flow_id text,
  node_id text,
  kind text,
  outcome text,
  detail text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_run_steps_run_idx ON public.flow_run_steps (run_id, at);
CREATE INDEX IF NOT EXISTS flow_run_steps_rate_idx ON public.flow_run_steps (flow_id, kind, at);

CREATE TABLE IF NOT EXISTS public.flow_waits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  node_id text,
  due_at timestamptz NOT NULL,
  until jsonb,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_waits_due_idx ON public.flow_waits (due_at) WHERE done = false;

CREATE TABLE IF NOT EXISTS public.flow_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  node_id text,
  action jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  token_hash text,
  decided_by uuid,
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_approvals_status_idx ON public.flow_approvals (org_id, status);

-- ---------------------------------------------------------------- RLS
ALTER TABLE public.automation_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_triggers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_watches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_run_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_waits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_approvals    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  -- standard org isolation (same shape as custom_widgets / the new-table template)
  FOREACH t IN ARRAY ARRAY['automation_bundles','system_triggers','flow_runs','flow_run_steps','flow_waits','flow_approvals'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_isolation', t);
    EXECUTE format('CREATE POLICY %I ON public.%I USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid())) WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))', t || '_org_isolation', t);
  END LOOP;
END $$;

-- flow_events: people may READ their org's history (Replay); only DB triggers / the service role write.
DROP POLICY IF EXISTS flow_events_org_read ON public.flow_events;
CREATE POLICY flow_events_org_read ON public.flow_events FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- flow_watches: strictly personal -- a user sees and changes only their own watches (admins are not special).
DROP POLICY IF EXISTS flow_watches_owner ON public.flow_watches;
CREATE POLICY flow_watches_owner ON public.flow_watches
  USING (user_id = auth.uid() AND org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (user_id = auth.uid() AND org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- ---------------------------------------------------------------- grants (Oct 30 2026 Data API rule)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_bundles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_triggers   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_watches      TO authenticated;
GRANT SELECT                         ON public.flow_events       TO authenticated;
GRANT SELECT, UPDATE                 ON public.flow_runs         TO authenticated;   -- Retry / Cancel from Runs & approvals
GRANT SELECT                         ON public.flow_run_steps    TO authenticated;
GRANT SELECT                         ON public.flow_waits        TO authenticated;
GRANT SELECT, UPDATE                 ON public.flow_approvals    TO authenticated;   -- Approve / Reject (gated to canConfig in the app)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_bundles, public.system_triggers, public.flow_watches, public.flow_events,
  public.flow_runs, public.flow_run_steps, public.flow_waits, public.flow_approvals TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------- change capture
CREATE OR REPLACE FUNCTION public.flow_capture_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n jsonb; o jsonb; k text; changed boolean := false;
  watched text[] := ARRAY['status','stage','signoff_status','execution_status','value','budget','actual','committed','stock','low_stock_at','due_date','alert_threshold_pct'];
BEGIN
  BEGIN
    -- drop big values (long text, attachments, blobs) so events stay small
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO n FROM jsonb_each(to_jsonb(NEW)) WHERE length(value::text) <= 2000;
    IF TG_OP = 'UPDATE' THEN
      SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO o FROM jsonb_each(to_jsonb(OLD)) WHERE length(value::text) <= 2000;
      FOREACH k IN ARRAY watched LOOP
        IF (o -> k) IS DISTINCT FROM (n -> k) THEN changed := true; EXIT; END IF;
      END LOOP;
    ELSE
      o := NULL; changed := true;
    END IF;
    IF changed AND (n ->> 'org_id') IS NOT NULL THEN
      INSERT INTO public.flow_events (org_id, source_table, record_id, op, old, new, kind)
      VALUES ((n ->> 'org_id')::uuid, TG_TABLE_NAME, n ->> 'id', TG_OP, o, n, 'change');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'flow_capture_change on % skipped: %', TG_TABLE_NAME, SQLERRM;   -- never block the user's save
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.flow_capture_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaigns','augur_deals','eventus_events','tasks','assets','prospectus_leads'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS flow_capture ON public.%I', t);
      EXECUTE format('CREATE TRIGGER flow_capture AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.flow_capture_change()', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------- scheduling (outside the transaction)
-- Needs the Vault secret 'flow_runner_secret' (run sheet step 3). Until it exists the header is empty
-- and the runner answers 401 -- harmless.
DO $$ BEGIN PERFORM cron.unschedule('flow-runner-tick'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('flow-runner-tick', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://rcmocuubeajnqjltuwdv.supabase.co/functions/v1/flow-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Runner-Secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'flow_runner_secret' LIMIT 1), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);

DO $$ BEGIN PERFORM cron.unschedule('flow-runtime-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('flow-runtime-cleanup', '17 3 * * *', $cron$
  DELETE FROM public.flow_events WHERE processed_at IS NOT NULL AND created_at < now() - interval '60 days';
  DELETE FROM public.flow_run_steps s USING public.flow_runs r
   WHERE s.run_id = r.id AND r.status IN ('done','cancelled') AND s.at < now() - interval '180 days';
$cron$);

NOTIFY pgrst, 'reload schema';
