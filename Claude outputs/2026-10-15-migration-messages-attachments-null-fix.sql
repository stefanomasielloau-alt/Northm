-- 2026-10-15 North Messages: hardening found in live testing.
-- send_message() failed with "null value in column attachments" when a caller passed p_attachments => null
-- (the app always sends a list, so normal use was not affected). Treat null as "no attachments".
-- Safe to run more than once. Rollback: 2026-10-15-migration-messages-attachments-null-fix-ROLLBACK.sql
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
  IF p_attachments IS NULL OR jsonb_typeof(p_attachments) <> 'array' OR jsonb_array_length(p_attachments) > 10 THEN p_attachments := '[]'::jsonb; END IF;
  INSERT INTO public.user_messages (org_id, recipient_id, sender_id, sender_name, kind, title, body, link_module, link_record, link_label, thread_id, parent_id, attachments, dedupe_key)
  VALUES (r_org, p_recipient, me, COALESCE(v_name,''), p_kind, left(COALESCE(NULLIF(btrim(p_title),''),'Message'), 200), left(COALESCE(p_body,''), 8000),
          left(p_link_module,40), left(p_link_record,200), left(p_link_label,200), v_thread, p_parent, p_attachments, left(p_dedupe,300))
  ON CONFLICT (recipient_id, dedupe_key) DO NOTHING RETURNING id INTO v_id;
  RETURN v_id;
END $$;
