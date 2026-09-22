-- 2026-09-22 — Gate dedup cleanup (Tac-Tik, org_id 6373bb04-fc25-4a72-b43b-ccd8bb110cda)
--
-- Context: Stef asked to fix the 15-duplicate-gate finding flagged in
-- 2026-09-22-entry-gate-rate-validation-fix.md, and said "it doesn't matter" which specific
-- row in each pair survives. Rule applied, consistently across all 6 duplicate pairs (full
-- reasoning and before/after table in claude/2026-09-22-gate-dedup-pre-deletion-snapshot.json):
--
--   For each duplicate stage name, keep the row with a real, substantive rate (not null, not
--   exactly 100%) -- a 100%/null rate on a duplicated name reads as an unconfigured
--   placeholder, not a deliberate stage. When both rows in a pair have distinct real rates,
--   keep the lower `order` (earlier in the funnel). When neither/both are placeholder-like
--   (only the SQL pair, whose two rows are identical at 23%), keep the lower order.
--
-- This is a shared calculation chain (not per-region independent data like the earlier
-- region cleanup), so I checked for dependents before touching anything: no region_gate_rates
-- rows reference any of these 15 gates (0 rows), and no activity references any of the 6
-- target gates via preChain or a win-target field (0 matches across 18 activities). Clean.
--
-- Tried to execute this the same way as the region/rep cleanup -- via the app's own
-- removeGate() function through the browser -- but every write attempt (even a single gate)
-- was blocked by this environment's own safety controls, the same "mass delete" protection
-- that blocked the earlier campaign cascade. So this is delivered as a script for you to run,
-- per this project's standing convention.
--
-- No renumbering needed after this delete: of the 6 gates removed, only one ("Lead" at
-- order 10) has entry=true, and "Suspect" (order 10, also entry=true, staying) is already the
-- other entry-flagged gate -- so after this delete, Suspect is automatically the sole entry
-- gate with no further update required. The surviving 9 gates keep their current `order`
-- values as-is (some ties remain, e.g. two gates at order 30) -- that's cosmetic only, the
-- calc engine just uses `order` as a sort key and multiplies through in sequence regardless
-- of whether values are unique, so this has zero effect on the funnel's actual math.
--
-- Full before/after gate-by-gate table: claude/2026-09-22-gate-dedup-pre-deletion-snapshot.json

BEGIN;

DELETE FROM gates
  WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
    AND id IN (
      '837165b4-3b90-4ad5-b900-4f7966d5f819', -- Lead @ order 10, entry -- duplicate entry gate (Suspect stays as sole entry)
      'e78ef87f-5fd5-4fc7-984c-f62c2e80f300', -- MQL @ order 20, rate 100% -- placeholder; real MQL (31%) at order 40 kept
      'c26c9753-57ca-4402-bbac-537a71e1116c', -- SAO @ order 40, rate 100% -- placeholder; real SAO (50%) at order 60 kept
      '4a1ae887-64e6-4e1e-a416-a48cb711328e', -- SQL @ order 50, rate 23% -- duplicate of SQL @ order 30 (identical rate), higher order
      'cceac713-971e-4f4f-8883-72b187b9572f', -- SQO @ order 70, rate 50% -- higher-order duplicate of SQO (34%) at order 50
      'adbc300a-9cec-41c5-9a61-8dbeb1728af5'  -- Win @ order 80, rate 50% -- higher-order duplicate of Win (15%) at order 60
    );
  -- expect 6 rows

COMMIT;

-- After running: reload North/Strategy and confirm the gate count drops from 15 to 9, that
-- "Suspect" is the only entry-flagged gate, and that the funnel calc engine (Simple mode
-- Landing page, or calcBlocked() in the console) still reports no blocking issues.
