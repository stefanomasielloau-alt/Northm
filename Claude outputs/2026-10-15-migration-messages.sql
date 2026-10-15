-- 2026-10-15 -- Messages (in-app inbox in every module) + delivery outbox for email / Slack / Teams / SMS / WhatsApp
-- + issue-log replies + automatic messages (task assigned, due/overdue, sign-off waiting, issue status changes).
-- Stef: "when a Task / alert / note / deadline is set or waiting for a person they should receive a message (Email / Slack
-- ... whatever comms is set up). There should also be a Messages function in the top menu of all modules ... see all
-- messages, respond, mark as read, actioned ... time stamped." Also: monitor the issue log, update the person who logged it,
-- ask for screenshots / video when needed.
-- Additive, safe to re-run. Rollback: 2026-10-15-migration-messages-ROLLBACK.sql
BEGIN;

-- 1. Messages ------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name  text NOT NULL DEFAULT '',
  kind         text NOT NULL DEFAULT 'message' CHECK (kind IN ('message','task','deadline','approval','mention','issue','alert','system')),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body         text NOT NULL DEFAULT '' CHECK (char_length(body) <= 8000),
  link_module  text, link_record text, link_label text,
  thread_id    uuid, parent_id uuid,
  status       text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','actioned','archived')),
  read_at      timestamptz, actioned_at timestamptz,
  attachments  jsonb NOT NULL DEFAULT '[]'::jsonb,
  dedupe_key   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS user_messages_recipient_idx ON public.user_messages (recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS user_messages_sender_idx ON public.user_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_messages_thread_idx ON public.user_messages (thread_id);
ALTER TABLE public.user_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_messages_select ON public.user_messages;
CREATE POLICY user_messages_select ON public.user_messages FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR sender_id = auth.uid());
DROP POLICY IF EXISTS user_messages_update ON public.user_messages;
CREATE POLICY user_messages_update ON public.user_messages FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
-- no INSERT/DELETE policies: messages are created only through send_message() / the triggers below, and never deleted by users (archive instead)
GRANT SELECT, UPDATE ON public.user_messages TO authenticated;
GRANT ALL ON public.user_messages TO service_role;

-- the recipient may only change the status fields
CREATE OR REPLACE FUNCTION public.user_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'authenticated' AND (NEW.org_id, NEW.recipient_id, NEW.sender_id, NEW.sender_name, NEW.kind, NEW.title, NEW.body,
       NEW.link_module, NEW.link_record, NEW.link_label, NEW.thread_id, NEW.parent_id, NEW.attachments, NEW.dedupe_key, NEW.created_at)
     IS DISTINCT FROM (OLD.org_id, OLD.recipient_id, OLD.sender_id, OLD.sender_name, OLD.kind, OLD.title, OLD.body,
       OLD.link_module, OLD.link_record, OLD.link_label, OLD.thread_id, OLD.parent_id, OLD.attachments, OLD.dedupe_key, OLD.created_at) THEN
    RAISE EXCEPTION 'Only the status of a message can be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.status <> 'unread' AND NEW.read_at IS NULL THEN NEW.read_at := now(); END IF;
  IF NEW.status = 'unread' THEN NEW.read_at := NULL; END IF;
  IF NEW.status = 'actioned' AND NEW.actioned_at IS NULL THEN NEW.actioned_at := now(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_messages_guard_trg ON public.user_messages;
CREATE TRIGGER user_messages_guard_trg BEFORE UPDATE ON public.user_messages FOR EACH ROW EXECUTE FUNCTION public.user_messages_guard();

-- 2. Per-person delivery preferences ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_prefs (
  user_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email         text, phone text, slack_user_id text,
  channels      jsonb NOT NULL DEFAULT '{"email":true}'::jsonb,   -- {"email":true,"slack":false,"teams":false,"sms":false,"whatsapp":false}
  muted_kinds   jsonb NOT NULL DEFAULT '[]'::jsonb,               -- e.g. ["deadline"] = in-app only for that kind
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_prefs_own ON public.message_prefs;
CREATE POLICY message_prefs_own ON public.message_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.message_prefs TO authenticated;
GRANT ALL ON public.message_prefs TO service_role;

-- 3. Organisation channels (non-secret settings) + secrets (never readable from the browser) ---------------------
CREATE OR REPLACE FUNCTION public.messages_can_configure() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin()
      OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id = p.role_id WHERE p.id = auth.uid() AND COALESCE(r.config,false));
$$;
GRANT EXECUTE ON FUNCTION public.messages_can_configure() TO authenticated;

CREATE TABLE IF NOT EXISTS public.message_channel_settings (
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('email','slack','teams','sms','whatsapp')),
  enabled    boolean NOT NULL DEFAULT false,
  provider   text NOT NULL DEFAULT '',     -- email: resend|sendgrid|postmark|brevo; slack: bot|webhook; teams: webhook; sms: twilio; whatsapp: twilio|meta
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- from, reply_to, default_channel, account_sid, from_number, phone_number_id ... (no secrets)
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, channel)
);
ALTER TABLE public.message_channel_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcs_select ON public.message_channel_settings;
CREATE POLICY mcs_select ON public.message_channel_settings FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()) OR public.is_platform_admin());
DROP POLICY IF EXISTS mcs_write ON public.message_channel_settings;
CREATE POLICY mcs_write ON public.message_channel_settings FOR ALL TO authenticated
  USING ((org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()) OR public.is_platform_admin()) AND public.messages_can_configure())
  WITH CHECK ((org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()) OR public.is_platform_admin()) AND public.messages_can_configure());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_channel_settings TO authenticated;
GRANT ALL ON public.message_channel_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.message_channel_secrets (
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('email','slack','teams','sms','whatsapp')),
  secret     text NOT NULL,                 -- API key / bot token / auth token / webhook URL. Read only by the message-dispatch function (service role).
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, channel)
);
ALTER TABLE public.message_channel_secrets ENABLE ROW LEVEL SECURITY;   -- no policies: the browser can never read or write it directly
REVOKE ALL ON public.message_channel_secrets FROM authenticated, anon;
GRANT ALL ON public.message_channel_secrets TO service_role;
CREATE OR REPLACE FUNCTION public.set_message_channel_secret(p_org uuid, p_channel text, p_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.messages_can_configure() OR NOT (p_org IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Only a Configure role can change message channel credentials' USING ERRCODE = '42501'; END IF;
  IF p_secret IS NULL OR btrim(p_secret) = '' THEN DELETE FROM public.message_channel_secrets WHERE org_id = p_org AND channel = p_channel; RETURN; END IF;
  INSERT INTO public.message_channel_secrets (org_id, channel, secret, updated_at) VALUES (p_org, p_channel, btrim(p_secret), now())
  ON CONFLICT (org_id, channel) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now();
END $$;
CREATE OR REPLACE FUNCTION public.message_channel_secret_status(p_org uuid) RETURNS TABLE(channel text, is_set boolean, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.channel, true, s.updated_at FROM public.message_channel_secrets s
   WHERE s.org_id = p_org AND (p_org IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()) OR public.is_platform_admin());
$$;
GRANT EXECUTE ON FUNCTION public.set_message_channel_secret(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.message_channel_secret_status(uuid) TO authenticated;

-- 4. Delivery outbox (one row per message per external channel) -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_deliveries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid NOT NULL REFERENCES public.user_messages(id) ON DELETE CASCADE,
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('email','slack','teams','sms','whatsapp')),
  destination  text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','skipped')),
  attempts     int NOT NULL DEFAULT 0,
  last_error   text, provider_ref text,
  created_at   timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
  UNIQUE (message_id, channel)
);
CREATE INDEX IF NOT EXISTS message_deliveries_queue_idx ON public.message_deliveries (status, created_at);
ALTER TABLE public.message_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS md_select ON public.message_deliveries;
CREATE POLICY md_select ON public.message_deliveries FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR ((org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()) OR public.is_platform_admin()) AND public.messages_can_configure()));
GRANT SELECT ON public.message_deliveries TO authenticated;
GRANT ALL ON public.message_deliveries TO service_role;

-- queue external copies when a message is created (only for channels the org has switched on AND the person wants)
CREATE OR REPLACE FUNCTION public.messages_queue_deliveries() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr record; s record; dest text; want boolean;
BEGIN
  SELECT * INTO pr FROM public.message_prefs WHERE user_id = NEW.recipient_id;
  IF pr.user_id IS NOT NULL AND pr.muted_kinds ? NEW.kind THEN RETURN NEW; END IF;
  FOR s IN SELECT * FROM public.message_channel_settings WHERE org_id = NEW.org_id AND enabled LOOP
    want := COALESCE((COALESCE(pr.channels, '{"email":true}'::jsonb) ->> s.channel)::boolean, s.channel = 'email');
    IF NOT want THEN CONTINUE; END IF;
    dest := CASE s.channel
      WHEN 'email' THEN COALESCE(NULLIF(btrim(pr.email),''), (SELECT p.email FROM public.profiles p WHERE p.id = NEW.recipient_id))
      WHEN 'slack' THEN COALESCE(NULLIF(btrim(pr.slack_user_id),''), s.config->>'default_channel')
      WHEN 'teams' THEN 'webhook'
      ELSE NULLIF(btrim(pr.phone),'') END;
    INSERT INTO public.message_deliveries (message_id, org_id, recipient_id, channel, destination, status, last_error)
    VALUES (NEW.id, NEW.org_id, NEW.recipient_id, s.channel, COALESCE(dest,''), CASE WHEN COALESCE(dest,'') = '' THEN 'skipped' ELSE 'queued' END,
            CASE WHEN COALESCE(dest,'') = '' THEN 'No address for this person on this channel (Messages › My settings)' END)
    ON CONFLICT (message_id, channel) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_messages_queue_trg ON public.user_messages;
CREATE TRIGGER user_messages_queue_trg AFTER INSERT ON public.user_messages FOR EACH ROW EXECUTE FUNCTION public.messages_queue_deliveries();

-- 5. Posting messages --------------------------------------------------------------------------------------------
-- internal (triggers / system): not callable from the browser
CREATE OR REPLACE FUNCTION public._post_message(p_recipient uuid, p_kind text, p_title text, p_body text, p_link_module text, p_link_record text,
  p_link_label text, p_dedupe text, p_sender uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_id uuid; v_name text;
BEGIN
  SELECT org_id INTO v_org FROM public.profiles WHERE id = p_recipient; IF v_org IS NULL THEN RETURN NULL; END IF;
  IF p_sender IS NOT NULL THEN SELECT name INTO v_name FROM public.profiles WHERE id = p_sender; END IF;
  INSERT INTO public.user_messages (org_id, recipient_id, sender_id, sender_name, kind, title, body, link_module, link_record, link_label, dedupe_key)
  VALUES (v_org, p_recipient, p_sender, COALESCE(v_name, 'North'), p_kind, left(p_title, 200), left(COALESCE(p_body,''), 8000), p_link_module, p_link_record, p_link_label, p_dedupe)
  ON CONFLICT (recipient_id, dedupe_key) DO NOTHING RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public._post_message(uuid,text,text,text,text,text,text,text,uuid) FROM PUBLIC, authenticated, anon;

-- from the browser: a person messages / replies to / @mentions someone in their organisation (platform admins: any org)
CREATE OR REPLACE FUNCTION public.send_message(p_recipient uuid, p_title text, p_body text DEFAULT '', p_kind text DEFAULT 'message',
  p_link_module text DEFAULT NULL, p_link_record text DEFAULT NULL, p_link_label text DEFAULT NULL, p_parent uuid DEFAULT NULL,
  p_dedupe text DEFAULT NULL, p_attachments jsonb DEFAULT '[]'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); my_org uuid; r_org uuid; v_name text; v_thread uuid; v_id uuid; par record;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  SELECT org_id, name INTO my_org, v_name FROM public.profiles WHERE id = me;
  SELECT org_id INTO r_org FROM public.profiles WHERE id = p_recipient;
  IF r_org IS NULL THEN RAISE EXCEPTION 'unknown recipient'; END IF;
  IF r_org IS DISTINCT FROM my_org AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'You can only message people in your organisation' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('message','mention','issue','alert','task','approval') THEN p_kind := 'message'; END IF;
  IF p_kind = 'issue' AND NOT (public.is_platform_admin() OR public.messages_can_configure()) THEN p_kind := 'message'; END IF;
  IF (SELECT count(*) FROM public.user_messages WHERE sender_id = me AND created_at > now() - interval '1 hour') >= 300 THEN
    RAISE EXCEPTION 'Too many messages in the last hour -- try again later'; END IF;
  IF p_parent IS NOT NULL THEN
    SELECT * INTO par FROM public.user_messages WHERE id = p_parent AND (recipient_id = me OR sender_id = me);
    IF par.id IS NULL THEN RAISE EXCEPTION 'You cannot reply to that message' USING ERRCODE = '42501'; END IF;
    v_thread := COALESCE(par.thread_id, par.id);
    IF p_link_module IS NULL THEN p_link_module := par.link_module; p_link_record := par.link_record; p_link_label := par.link_label; END IF;
  END IF;
  IF jsonb_typeof(p_attachments) <> 'array' OR jsonb_array_length(p_attachments) > 10 THEN p_attachments := '[]'::jsonb; END IF;
  INSERT INTO public.user_messages (org_id, recipient_id, sender_id, sender_name, kind, title, body, link_module, link_record, link_label, thread_id, parent_id, attachments, dedupe_key)
  VALUES (r_org, p_recipient, me, COALESCE(v_name,''), p_kind, left(COALESCE(NULLIF(btrim(p_title),''),'Message'), 200), left(COALESCE(p_body,''), 8000),
          left(p_link_module,40), left(p_link_record,200), left(p_link_label,200), v_thread, p_parent, p_attachments, left(p_dedupe,300))
  ON CONFLICT (recipient_id, dedupe_key) DO NOTHING RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.send_message(uuid,text,text,text,text,text,text,uuid,text,jsonb) TO authenticated;

-- people a user may message (same org; platform admins also see the org they are viewing)
CREATE OR REPLACE FUNCTION public.message_directory(p_org uuid DEFAULT NULL) RETURNS TABLE(id uuid, name text, org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.org_id FROM public.profiles p
   WHERE p.org_id = COALESCE(CASE WHEN public.is_platform_admin() THEN p_org END, (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
     AND COALESCE(p.name,'') <> '' ORDER BY p.name;
$$;
GRANT EXECUTE ON FUNCTION public.message_directory(uuid) TO authenticated;

-- 6. Automatic messages -------------------------------------------------------------------------------------------
-- a) an activity / task is assigned to someone (owner text matches a person's name in the organisation)
CREATE OR REPLACE FUNCTION public.messages_on_task_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who uuid;
BEGIN
  IF COALESCE(btrim(NEW.owner),'') = '' OR (TG_OP = 'UPDATE' AND lower(btrim(COALESCE(OLD.owner,''))) = lower(btrim(NEW.owner))) THEN RETURN NEW; END IF;
  SELECT id INTO who FROM public.profiles WHERE org_id = NEW.org_id AND lower(btrim(name)) = lower(btrim(NEW.owner)) LIMIT 1;
  IF who IS NULL OR who = auth.uid() THEN RETURN NEW; END IF;
  PERFORM public._post_message(who, 'task', 'Assigned to you: ' || COALESCE(NEW.name,'activity'),
    'You are now the owner of this activity' || CASE WHEN NEW.due_date IS NOT NULL THEN ' (due ' || to_char(NEW.due_date,'DD Mon YYYY') || ')' ELSE '' END || '.',
    'CampaignPlanning', COALESCE(NEW.campaign_id::text,''), NEW.name, 'assign:' || NEW.id || ':' || lower(btrim(NEW.owner)), auth.uid());
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;  -- messaging must never block saving an activity
END $$;
DROP TRIGGER IF EXISTS tasks_owner_message_trg ON public.tasks;
CREATE TRIGGER tasks_owner_message_trg AFTER INSERT OR UPDATE OF owner ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.messages_on_task_owner();

-- b) campaign sign-off: submitted -> people who can approve (Publish / Configure roles); decided -> the campaign owner
CREATE OR REPLACE FUNCTION public.messages_on_signoff() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.signoff_status IS NOT DISTINCT FROM OLD.signoff_status THEN RETURN NEW; END IF;
  IF NEW.signoff_status = 'Submitted' THEN
    FOR p IN SELECT pr.id FROM public.profiles pr JOIN public.roles r ON r.id = pr.role_id
              WHERE pr.org_id = NEW.org_id AND (COALESCE(r.publish,false) OR COALESCE(r.config,false)) AND pr.id IS DISTINCT FROM auth.uid() LOOP
      PERFORM public._post_message(p.id, 'approval', 'Sign-off waiting: ' || COALESCE(NEW.name,'campaign'),
        'This campaign was submitted for sign-off and is waiting for an approver.', 'CampaignPlanning', NEW.id::text, NEW.name,
        'signoff:' || NEW.id || ':' || to_char(now(),'YYYYMMDDHH24MI'), auth.uid());
    END LOOP;
  ELSIF NEW.signoff_status IN ('Approved','Rejected') AND NEW.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    PERFORM public._post_message(NEW.owner_id, 'approval', 'Sign-off ' || lower(NEW.signoff_status) || ': ' || COALESCE(NEW.name,'campaign'),
      'Your campaign was ' || lower(NEW.signoff_status) || '.', 'CampaignPlanning', NEW.id::text, NEW.name,
      'signoff-result:' || NEW.id || ':' || NEW.signoff_status || ':' || to_char(now(),'YYYYMMDDHH24MI'), auth.uid());
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campaigns_signoff_message_trg ON public.campaigns;
CREATE TRIGGER campaigns_signoff_message_trg AFTER UPDATE OF signoff_status ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.messages_on_signoff();

-- c) issue log: screenshots / video, and the reporter hears about every status change
ALTER TABLE public.feedback_items ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.messages_on_feedback_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lbl text;
BEGIN
  IF NEW.reporter_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.reporter_id = auth.uid() THEN RETURN NEW; END IF;
  lbl := CASE NEW.status WHEN 'in_progress' THEN 'being worked on' WHEN 'on_hold' THEN 'on hold' WHEN 'feature_gap' THEN 'logged as a feature request'
                         WHEN 'completed' THEN 'fixed / completed' ELSE COALESCE(NEW.status,'updated') END;
  PERFORM public._post_message(NEW.reporter_id, 'issue', 'Your issue FB-' || lpad(COALESCE(NEW.seq,0)::text,4,'0') || ' is ' || lbl,
    'You reported: "' || left(COALESCE(NEW.comment,''), 300) || '"' || CASE WHEN NEW.status = 'completed' THEN E'\n\nPlease check it and reply here if it is not right.' ELSE '' END,
    'Configuration', NEW.id::text, 'FB-' || lpad(COALESCE(NEW.seq,0)::text,4,'0'), 'fb-status:' || NEW.id || ':' || NEW.status, auth.uid());
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feedback_status_message_trg ON public.feedback_items;
CREATE TRIGGER feedback_status_message_trg AFTER UPDATE OF status ON public.feedback_items FOR EACH ROW EXECUTE FUNCTION public.messages_on_feedback_status();

-- d) due / overdue: activities owned by the person (owner name), campaigns they own ending within 7 days
CREATE OR REPLACE FUNCTION public._deadline_messages_for(p_user uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me record; t record; c record; n int := 0; v uuid;
BEGIN
  SELECT id, org_id, name INTO me FROM public.profiles WHERE id = p_user; IF me.id IS NULL THEN RETURN 0; END IF;
  IF COALESCE(btrim(me.name),'') <> '' THEN
    FOR t IN SELECT id, name, due_date, campaign_id FROM public.tasks
              WHERE org_id = me.org_id AND lower(btrim(COALESCE(owner,''))) = lower(btrim(me.name)) AND due_date IS NOT NULL
                AND due_date BETWEEN current_date - 30 AND current_date + 2 AND COALESCE(status,'') NOT IN ('Completed','Cancelled','Done') LOOP
      v := public._post_message(me.id, 'deadline',
        CASE WHEN t.due_date < current_date THEN 'Overdue: ' ELSE 'Due ' || CASE WHEN t.due_date = current_date THEN 'today' ELSE to_char(t.due_date,'DD Mon') END || ': ' END || COALESCE(t.name,'activity'),
        'Activity due ' || to_char(t.due_date,'DD Mon YYYY') || '.', 'CampaignPlanning', COALESCE(t.campaign_id::text,''), t.name,
        'due:' || t.id || ':' || t.due_date || ':' || CASE WHEN t.due_date < current_date THEN 'late' ELSE 'soon' END, NULL);
      IF v IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END IF;
  FOR c IN SELECT id, name, end_date FROM public.campaigns WHERE org_id = me.org_id AND owner_id = me.id AND end_date BETWEEN current_date AND current_date + 7 LOOP
    v := public._post_message(me.id, 'deadline', 'Campaign ends ' || to_char(c.end_date,'DD Mon') || ': ' || COALESCE(c.name,'campaign'),
      'Your campaign ends on ' || to_char(c.end_date,'DD Mon YYYY') || '. Check actuals and results are up to date.', 'CampaignPlanning', c.id::text, c.name,
      'camp-end:' || c.id || ':' || c.end_date, NULL);
    IF v IS NOT NULL THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
EXCEPTION WHEN others THEN RETURN n;
END $$;
REVOKE ALL ON FUNCTION public._deadline_messages_for(uuid) FROM PUBLIC, authenticated, anon;
CREATE OR REPLACE FUNCTION public.generate_my_deadline_messages() RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public._deadline_messages_for(auth.uid()); $$;
GRANT EXECUTE ON FUNCTION public.generate_my_deadline_messages() TO authenticated;
CREATE OR REPLACE FUNCTION public.generate_deadline_messages_all() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; n int := 0; BEGIN FOR p IN SELECT id FROM public.profiles LOOP n := n + public._deadline_messages_for(p.id); END LOOP; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.generate_deadline_messages_all() FROM PUBLIC, authenticated, anon;

-- 7. Attachments (screenshots / video on issues and replies): private bucket, files under <org_id>/...
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('message-attachments', 'message-attachments', false, 52428800)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS msg_att_read ON storage.objects;
CREATE POLICY msg_att_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'message-attachments' AND ((storage.foldername(name))[1] IN (SELECT org_id::text FROM public.profiles WHERE id = auth.uid()) OR public.is_platform_admin()));
DROP POLICY IF EXISTS msg_att_insert ON storage.objects;
CREATE POLICY msg_att_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'message-attachments' AND ((storage.foldername(name))[1] IN (SELECT org_id::text FROM public.profiles WHERE id = auth.uid()) OR public.is_platform_admin()));

COMMIT;

-- 8. Optional, run separately (each is safe to skip):
-- a) live badge updates:      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_messages;
-- b) daily due/overdue sweep for everyone (needs the pg_cron extension, Database > Extensions):
--      SELECT cron.schedule('north-deadline-messages', '0 21 * * *', $$SELECT public.generate_deadline_messages_all()$$);   -- 21:00 UTC = 08:00 Sydney (AEDT)
--    Without it, each person's due/overdue messages are created the first time they open North each day.
-- c) send queued email / Slack / Teams / SMS / WhatsApp copies every 2 minutes: Supabase Dashboard > Integrations > Cron >
--    new job > "Supabase Edge Function" > message-dispatch, POST, schedule */2 * * * *   (see the function's header).
-- Checks:
--   SELECT count(*) FROM public.user_messages;     -- 0 after a fresh run
--   SELECT public.generate_my_deadline_messages(); -- as a signed-in user, via the app
