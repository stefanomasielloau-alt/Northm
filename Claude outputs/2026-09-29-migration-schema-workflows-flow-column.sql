-- 2026-09-29 -- Process Maps phase 2a (Stef: "merge Diagrams and Process rules into one FLOW CANVAS")
-- Adds schema_workflows.flow (jsonb): flow meta for a workflow row --
--   {kind:'flow'|'diagram', builtin:<processKey>|null, scope:'org', locked:bool, owner_id,
--    version:int, status:'draft'|'ready', lastSimulation:{at,result,issues:[]}, bundles:[...]}
-- Idempotent and safe to re-run. No new table, so no new RLS policy or grants are needed:
-- schema_workflows keeps its existing RLS org-isolation policy and grants, and those
-- cover the new column automatically.
-- App behaviour (Schema.html): it checks for this column once when the page loads.
--   * Before this runs: flow meta is saved inside the nodes jsonb as a hidden node
--     {id:'__flow__',kind:'meta',config:{...}}, so flows still save and load.
--   * After this runs: flow meta is saved to this column. Any hidden meta node is read
--     once and dropped the next time that flow is saved. Nothing is lost either way.

BEGIN;

ALTER TABLE public.schema_workflows ADD COLUMN IF NOT EXISTS flow jsonb;

COMMIT;

NOTIFY pgrst, 'reload schema';
