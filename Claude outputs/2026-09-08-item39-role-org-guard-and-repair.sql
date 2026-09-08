-- Item 39 -- Role/org data integrity: THIRD recurrence, real root-cause guard + one-time repair
-- 2026-09-08
--
-- BACKGROUND. This is the third time roles have ended up reassigned to Tac-Tik:
--   1. 2026-09-03 -- all 10 roles across every org reassigned to Tac-Tik. Root-caused to
--      setRoleOrg()'s per-row "Organization" dropdown (a skippable confirm()), fixed with a
--      hard block on moving a role that still has users.
--   2. 2026-09-06/07 -- recurred for zero-user roles (a skippable confirm() was still
--      enough), fixed by requiring the destination org's exact name to be TYPED.
--   3. 2026-09-08 (THIS incident) -- recurred again, this time hitting roles Stef had just
--      created (BG Admin/Manager/Planner/Super User/Viewer, for Bodgit&Scarpa) plus
--      "Admin (RLS test org)" (for the RLS Script Test org) -- all reset back to Tac-Tik.
--
-- WHAT'S DIFFERENT THIS TIME, AND WHY IT MATTERS: forensics (live browser session, direct
-- Supabase queries) found ZERO "move role to organization" audit_log entries with Tac-Tik
-- as the destination -- ever. Every legitimate move via the app's setRoleOrg() logs that
-- exact audit line, so if the app's UI had done this, there would be a trail. There isn't
-- one. That means incidents #1 and #2's fixes -- both entirely inside setRoleOrg()'s
-- client-side JS -- were fixing a path that was never the (or at least not the only) real
-- cause. Something is changing roles.org_id WITHOUT going through the app at all -- almost
-- certainly a raw SQL statement run directly against Supabase (this project's own
-- established convention has Stef running many delivered SQL files directly in Supabase's
-- SQL editor; an old/miscopied one re-run, or a manual exploratory UPDATE, would do this
-- and leave no trace in audit_log, since raw SQL never calls the app's logAudit()).
--
-- THE ACTUAL FIX: a database-level guard that makes this structurally impossible from ANY
-- source -- the app, a raw SQL UPDATE, anything -- not just another client-side speed bump.
--   1. A BEFORE UPDATE trigger on `roles` rejects any change to org_id unless a
--      transaction-local flag (app.allow_role_org_change) is set to 'true' first.
--   2. The ONLY thing that sets that flag is the new move_role_to_org() function below --
--      itself gated to Super Admins (server-side, via platform_admin_level(), not just the
--      client's CFG.isSuperAdmin check) and to roles with zero current users (matching
--      setRoleOrg()'s existing hard block). Norma.html's setRoleOrg() now calls this RPC
--      instead of updating org_id directly (see the matching Northm commit).
--   3. Any OTHER attempt to change org_id -- a raw `UPDATE roles SET org_id = ...` typed
--      directly into Supabase's SQL editor, an old script re-run, anything -- now gets a
--      loud Postgres error naming the role and the attempted old->new org_id, instead of
--      silently succeeding with no trace. If this happens a fourth time, we'll finally see
--      exactly what did it.
--
-- Safe to run any time. Does not touch RLS policies or any other table.

CREATE OR REPLACE FUNCTION guard_roles_org_id_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    IF current_setting('app.allow_role_org_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'roles.org_id cannot be changed directly (role "%" [%]: % -> %). Use move_role_to_org() -- the app''s "move role to organization" action already calls it.',
        OLD.name, OLD.id, OLD.org_id, NEW.org_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_roles_org_id_change ON roles;
CREATE TRIGGER trg_guard_roles_org_id_change
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION guard_roles_org_id_change();

-- The one sanctioned way to change a role's org from here on, from any caller.
-- SECURITY DEFINER so it can flip the guard flag and write org_id regardless of the
-- caller's own RLS grants, but it re-checks Super Admin status itself server-side first --
-- this is a net tightening, not a bypass, since today org_id updates go through the
-- client's ordinary authenticated RLS grant with only a client-side isSuperAdmin check.
CREATE OR REPLACE FUNCTION move_role_to_org(p_role_id uuid, p_new_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_user_count int;
  v_role_name text;
BEGIN
  SELECT (is_platform_admin() OR platform_admin_level() IS NOT NULL) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only a Super Admin can move a role to a different organization.';
  END IF;

  SELECT name INTO v_role_name FROM roles WHERE id = p_role_id;
  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role % not found.', p_role_id;
  END IF;

  SELECT count(*) INTO v_user_count FROM profiles WHERE role_id = p_role_id;
  IF v_user_count > 0 THEN
    RAISE EXCEPTION 'Cannot move "%" -- % user(s) still hold this role. Reassign them to a different role first.', v_role_name, v_user_count;
  END IF;

  PERFORM set_config('app.allow_role_org_change', 'true', true); -- true = transaction-local (resets after commit)
  UPDATE roles SET org_id = p_new_org_id WHERE id = p_role_id;
END;
$$;

GRANT EXECUTE ON FUNCTION move_role_to_org(uuid, uuid) TO authenticated;

-- ============================================================================
-- ONE-TIME DATA REPAIR for this incident's 6 misplaced roles.
-- These specific role ids and destination orgs were confirmed live on 2026-09-08:
--   - The 5 "BG *" roles belong to Bodgit&Scarpa: their real users (Bruce Rawsthorne,
--     David Dockrill, Claudia/nightly-test) already have profiles.org_id correctly set to
--     Bodgit&Scarpa -- only the ROLE row's org_id was wrong. Moving the role back does not
--     change anyone's own org, it just re-aligns the role with the org it's actually used in.
--   - "Admin (RLS test org)" belongs to RLS Script Test: its one user (RLS Script Tester)
--     is likewise already correctly on that org.
-- This bypasses move_role_to_org()'s zero-users check on purpose (that check is for
-- ordinary future moves; these roles legitimately have users and are being put BACK where
-- they belong, not moved away) -- same one-time-repair pattern as the 2026-09-03 incident's
-- fix script.
-- ============================================================================
DO $$
BEGIN
  PERFORM set_config('app.allow_role_org_change', 'true', true);

  UPDATE roles SET org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2' -- Bodgit&Scarpa
    WHERE id IN (
      'd95a12e3-9e77-4ed6-a967-0bd150e0612e', -- BG Planner
      '20876bce-09a6-4d9a-86df-0489cab1eb9b', -- BG Admin
      '2ea71373-ad34-48ba-9805-11b7fd3fa232', -- BG Super User
      '38914783-1767-498f-a4e3-6f12c78180aa', -- BG Viewer
      'a3c93211-7f11-4af6-a18e-f6efe045158d'  -- BG Manager
    );

  UPDATE roles SET org_id = 'c98f5ec7-d7e1-4078-82fc-cf0900c2edeb' -- RLS Script Test 1786518151369
    WHERE id = '4fb42831-3fe2-4a63-8292-c5fb40820f17'; -- Admin (RLS test org)
END $$;

-- VERIFICATION -- run after the block above; expect BG* roles under Bodgit&Scarpa,
-- "Admin (RLS test org)" under RLS Script Test, and the 5 standard roles under Tac-Tik.
SELECT o.name AS organization, r.name AS role, r.id AS role_id
FROM roles r JOIN organizations o ON o.id = r.org_id
ORDER BY o.name, r.name;

-- SEPARATE FINDING, NOT ACTED ON HERE -- flagged in this session's chat reply and the
-- backlog doc: audit_log currently holds ~398,000 rows (estimated), including large runs of
-- duplicate entries (e.g. hundreds of identical "move role to organization ... ->
-- Bodgit&Scarpa" rows from 2026-09-01 08:28-08:29 UTC, and a long "Admin <-> Admin2" rename
-- loop dated 2026-08-19). This is large enough that ORDER BY ts on this table now times out
-- (57014). Left untouched pending your decision on how to prune/archive it -- deleting rows
-- wasn't done unilaterally per your standing rule on destructive actions.
