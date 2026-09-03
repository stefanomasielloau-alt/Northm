-- 2026-09-03: Slack + Teams incoming-webhook alert targets for Process Maps automations
-- (backlog item 27). Adds the one new column Schema.html now reads/writes on
-- `schema_automations`. Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE schema_automations ADD COLUMN IF NOT EXISTS action_chat_dest_id UUID;

-- action_chat_dest_id: an agent_destinations.id -- deliberately no FK constraint added,
--   matching how agent_dispatches.destination_id is already handled (a loose reference,
--   not a hard foreign key, since agent_destinations rows can be freely added/removed by
--   any Configure-capable user and this must never block that). When set on an
--   "Alert people" automation, and the referenced destination's type is 'slack_webhook' or
--   'teams_webhook' (agent_destinations.type -- no new column needed there, it's a plain
--   text field with a widened set of accepted values), the automation posts a real message
--   to that Slack/Teams incoming webhook URL the moment it fires -- on top of, not instead
--   of, the in-app toast + audit_log alert every "Alert people" automation already produces
--   unconditionally. NULL (the default) means no chat post, same as before this migration.
--   Fire-and-forget from the browser (see sendAutomationChatAlert() in Schema.html) -- no
--   OAuth, no Hub-Backend involvement, just a direct POST to the webhook URL stored in
--   agent_destinations.target.
