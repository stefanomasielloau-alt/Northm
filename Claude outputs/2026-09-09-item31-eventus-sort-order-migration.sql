-- 2026-09-09 (backlog item 31, step 1 of build): add sort_order to
-- eventus_events, same pattern as eventus_event_venues.sort_order already
-- uses -- needed for drag-to-reorder in the new nested Events Table/Board/
-- Gantt views. Additive only, defaults existing rows to 0 (they'll sort
-- by name/date until someone drags a row, same as any other module's
-- first rollout of this column).

ALTER TABLE eventus_events ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Verify:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'eventus_events' AND column_name = 'sort_order';
