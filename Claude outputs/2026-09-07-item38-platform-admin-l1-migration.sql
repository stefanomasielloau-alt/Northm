-- Item 38 -- Role hierarchy: L1 "additional North Admin" tier, 2026-09-07
--
-- Scope of THIS migration: only the L1 piece (the literal headline ask -- "we need
-- ability for additional North Admins"), built additively alongside the existing
-- is_platform_admin() function, which is NOT modified or touched -- I don't have its
-- definition in this repo (it predates this session's SQL-file convention) and won't
-- risk breaking it. L2-L6 already exist as North's/Hub's existing per-org role tiers;
-- the Reporting-vs-Viewer fold and the full role-preview dropdown UX are follow-on work,
-- not in this migration.
--
-- Design, per your confirmed recommendation ("go with recommendation"): L1 = full
-- Super Admin MINUS org-creation and billing/licensing administration. So:
--   - A NEW function, platform_admin_level(), returns 'L0' for a genuine existing
--     Super Admin (is_platform_admin() = true, unchanged), 'L1' for anyone with an
--     active grant in the new table below, or NULL otherwise.
--   - The app now treats CFG.isSuperAdmin (and Ordo's CFG.isPlatformAdmin) as true for
--     BOTH L0 and L1 -- extending everything that flag currently gates (config/publish/
--     view-as-anyone/cross-org visibility) to L1 too, with zero other code changes.
--   - A NEW, narrower CFG.isFullSuperAdmin (true only for L0) now gates org creation,
--     and will gate the Licensing admin panel once built (item 36).
--
-- Safe to run any time: pure addition, no existing table or function touched.

CREATE TABLE IF NOT EXISTS platform_admin_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id),
  granted_by  uuid REFERENCES profiles(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  note        text NOT NULL DEFAULT '',
  UNIQUE(profile_id)
);

ALTER TABLE platform_admin_grants ENABLE ROW LEVEL SECURITY;

-- Only a genuine L0 Super Admin can see or manage the L1 grant list.
DROP POLICY IF EXISTS platform_admin_grants_l0_only ON platform_admin_grants;
CREATE POLICY platform_admin_grants_l0_only ON platform_admin_grants
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE OR REPLACE FUNCTION platform_admin_level()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN is_platform_admin() THEN 'L0'
    WHEN EXISTS (SELECT 1 FROM platform_admin_grants g WHERE g.profile_id = auth.uid()) THEN 'L1'
    ELSE NULL
  END;
$$;

-- Callable by any signed-in user (needs to know their OWN level); SECURITY DEFINER lets
-- it read platform_admin_grants even though that table's RLS would otherwise block a
-- non-L0 user from seeing it directly -- the function only ever reveals the CALLER's own
-- level, never the list.
GRANT EXECUTE ON FUNCTION platform_admin_level() TO authenticated;

-- Verification -- run as yourself in Supabase's SQL editor; should return 'L0' for you.
SELECT platform_admin_level();
