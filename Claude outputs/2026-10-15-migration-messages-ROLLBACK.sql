-- ROLLBACK for 2026-10-15-migration-messages.sql
-- WARNING: deletes every message, delivery record, channel setting/credential and personal preference.
-- Attachments in the 'message-attachments' bucket are NOT deleted (delete the bucket in Storage if wanted).
BEGIN;
DROP TRIGGER IF EXISTS tasks_owner_message_trg ON public.tasks;
DROP TRIGGER IF EXISTS campaigns_signoff_message_trg ON public.campaigns;
DROP TRIGGER IF EXISTS feedback_status_message_trg ON public.feedback_items;
DROP FUNCTION IF EXISTS public.messages_on_task_owner();
DROP FUNCTION IF EXISTS public.messages_on_signoff();
DROP FUNCTION IF EXISTS public.messages_on_feedback_status();
DROP FUNCTION IF EXISTS public.generate_my_deadline_messages();
DROP FUNCTION IF EXISTS public.generate_deadline_messages_all();
DROP FUNCTION IF EXISTS public._deadline_messages_for(uuid);
DROP FUNCTION IF EXISTS public.send_message(uuid,text,text,text,text,text,text,uuid,text,jsonb);
DROP FUNCTION IF EXISTS public._post_message(uuid,text,text,text,text,text,text,text,uuid);
DROP FUNCTION IF EXISTS public.message_directory(uuid);
DROP FUNCTION IF EXISTS public.set_message_channel_secret(uuid,text,text);
DROP FUNCTION IF EXISTS public.message_channel_secret_status(uuid);
DROP TABLE IF EXISTS public.message_deliveries;
DROP TABLE IF EXISTS public.user_messages;
DROP FUNCTION IF EXISTS public.messages_queue_deliveries();
DROP FUNCTION IF EXISTS public.user_messages_guard();
DROP TABLE IF EXISTS public.message_channel_secrets;
DROP TABLE IF EXISTS public.message_channel_settings;
DROP TABLE IF EXISTS public.message_prefs;
DROP FUNCTION IF EXISTS public.messages_can_configure();
DROP POLICY IF EXISTS msg_att_read ON storage.objects;
DROP POLICY IF EXISTS msg_att_insert ON storage.objects;
ALTER TABLE public.feedback_items DROP COLUMN IF EXISTS attachments;
COMMIT;
