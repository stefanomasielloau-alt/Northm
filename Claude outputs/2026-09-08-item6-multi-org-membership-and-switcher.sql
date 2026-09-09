-- 2026-09-08 (backlog item 6): genuine multi-org membership + an org
-- switcher usable in every North module.
--
-- Investigated first, per Stef's standing "investigate before building"
-- instruction: confirmed NOTHING like this already existed. Every one of
-- the 9 module files (+ index.html) independently resolves _orgId from a
-- single profiles.org_id column at load, with no join table, no switcher
-- UI, and no membership concept at all. `roles.org_id` (the thing that
-- had its own corruption-bug saga this project) is a per-org ROLE
-- DEFINITION table (Manager/Admin/Viewer etc, config flags per org), not
-- a user-membership table -- unrelated to this despite the similar name.
--
-- Design, chosen to touch every module file identically rather than
-- differently (Stef's explicit complaint about "halfway" work that
-- breaks): profiles.org_id keeps its existing meaning ("this profile's
-- CURRENTLY ACTIVE org") so all 10 files' existing `_orgId = prof.org_id`
-- lines keep working completely unchanged -- multi-org membership is
-- purely ADDITIVE. Switching org calls switch_active_org() below (which
-- flips profiles.org_id + profiles.role_id together, atomically, and
-- refuses to switch you into an org you don't belong to), then the page
-- reloads -- at which point every module's already-existing profile
-- fetch just naturally picks up the new org. No per-module data-loading
-- logic needed to change at all.

CREATE TABLE IF NOT EXISTS profile_orgs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id     UUID REFERENCES roles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, org_id)
);

CREATE INDEX IF NOT EXISTS profile_orgs_profile_idx ON profile_orgs (profile_id);
CREATE INDEX IF NOT EXISTS profile_orgs_org_idx ON profile_orgs (org_id);

-- Backfill: every existing profile becomes a member of the one org they
-- already belong to today, carrying their current role across. Idempotent
-- (safe to re-run) via the UNIQUE(profile_id, org_id) + ON CONFLICT guard.
INSERT INTO profile_orgs (profile_id, org_id, role_id)
SELECT id, org_id, role_id FROM profiles WHERE org_id IS NOT NULL
ON CONFLICT (profile_id, org_id) DO NOTHING;

ALTER TABLE profile_orgs ENABLE ROW LEVEL SECURITY;

-- A person sees only their own membership rows; a platform admin (L0/L1,
-- from platform_admin_level() -- item 38, 2026-09-07) sees/manages all,
-- needed for the Norma "org memberships" admin panel this migration's
-- companion frontend change adds.
DROP POLICY IF EXISTS profile_orgs_visibility ON profile_orgs;
CREATE POLICY profile_orgs_visibility ON profile_orgs
  USING (profile_id = auth.uid() OR platform_admin_level() IS NOT NULL)
  WITH CHECK (profile_id = auth.uid() OR platform_admin_level() IS NOT NULL);

-- Switches the CALLER's own active org. SECURITY DEFINER so it can update
-- profiles (normally locked down by its own RLS) but only after proving,
-- inside the function body, that the caller already has a profile_orgs
-- row for the target org -- it can never be used to hop into an org you
-- aren't a member of.
CREATE OR REPLACE FUNCTION switch_active_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  SELECT role_id INTO v_role_id FROM profile_orgs
    WHERE profile_id = auth.uid() AND org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of that organization';
  END IF;
  UPDATE profiles SET org_id = p_org_id, role_id = v_role_id WHERE id = auth.uid();
END;
$$;

-- Platform-admin-only: grants an existing profile membership in another
-- org (with a role FROM THAT ORG's own roles table -- roles don't cross
-- orgs, same as everywhere else in this schema). Backs Norma's new "Org
-- memberships" panel. Does NOT touch the target profile's currently
-- active org -- they keep working in whichever org they're in today
-- until they use the switcher themselves.
CREATE OR REPLACE FUNCTION add_profile_to_org(p_profile_id uuid, p_org_id uuid, p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'platform admin required';
  END IF;
  IF p_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM roles WHERE id = p_role_id AND org_id = p_org_id) THEN
    RAISE EXCEPTION 'role does not belong to that organization';
  END IF;
  INSERT INTO profile_orgs (profile_id, org_id, role_id) VALUES (p_profile_id, p_org_id, p_role_id)
  ON CONFLICT (profile_id, org_id) DO UPDATE SET role_id = EXCLUDED.role_id;
END;
$$;

-- Platform-admin-only: removes a membership. Refuses to remove someone's
-- LAST remaining org membership -- that would leave a profile with no
-- org at all, which every module's code assumes never happens.
CREATE OR REPLACE FUNCTION remove_profile_from_org(p_profile_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'platform admin required';
  END IF;
  SELECT count(*) INTO v_count FROM profile_orgs WHERE profile_id = p_profile_id;
  IF v_count <= 1 THEN
    RAISE EXCEPTION 'cannot remove a profile''s last remaining organization';
  END IF;
  DELETE FROM profile_orgs WHERE profile_id = p_profile_id AND org_id = p_org_id;
  -- If we just removed their currently-active org, fall back to whichever
  -- membership is left so they aren't stranded pointing at an org they can
  -- no longer see.
  UPDATE profiles SET org_id = (SELECT org_id FROM profile_orgs WHERE profile_id = p_profile_id LIMIT 1),
                       role_id = (SELECT role_id FROM profile_orgs WHERE profile_id = p_profile_id LIMIT 1)
  WHERE id = p_profile_id AND org_id = p_org_id;
END;
$$;

-- Note: seed_new_organization() (item 5, this same session) only seeds
-- North's business data (regions/campaigns/etc) -- it never creates
-- profile_orgs rows, since a brand-new org has no profiles yet. A
-- person's FIRST membership row is created the normal way (invite-code
-- redemption at signup, which already sets profiles.org_id) -- this
-- migration's ON CONFLICT-guarded backfill above covers that case too,
-- so nothing further is needed there.
