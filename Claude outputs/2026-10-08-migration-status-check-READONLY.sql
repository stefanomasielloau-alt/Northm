-- 2026-10-08 -- North: which migrations have ALREADY been applied?  (READ-ONLY -- changes nothing)
-- Run the whole thing in Supabase SQL Editor. It is a single SELECT: one row per migration file.
--   status = APPLIED  -> every table / column / function it creates is present. Skip that file.
--   status = PARTIAL  -> some objects present, some not. Run the file (they are written to be re-runnable) and tell me.
--   status = MISSING  -> nothing found. Run the file.
--   status = CHECK    -> data-only / policy-only file: the "missing" column explains what was found.
-- "missing_objects" lists exactly what was not found.
-- Limits: this checks that the schema objects exist, not that their content/policies are exactly right, and it cannot
-- prove a data-only file ran (those are checked by their visible effect, as noted). Run order if you must run several:
-- oldest file date first; the 2026-10-08 voice file is independent of all the others.

WITH checks(file, kind, obj, col) AS (VALUES
  -- 2026-09-07 / 09-08 / 09-09 -----------------------------------------------------------------
  ('2026-09-07-item36-licensing-mvp-migration','table','org_plans',NULL),
  ('2026-09-07-item36-licensing-mvp-migration','table','org_plan_invoices',NULL),
  ('2026-09-07-item38-platform-admin-l1-migration','table','platform_admin_grants',NULL),
  ('2026-09-07-item38-platform-admin-l1-migration','function','platform_admin_level',NULL),
  ('2026-09-08-item11-campaign-execution-status-migration','table','campaign_execution_status',NULL),
  ('2026-09-08-item11-campaign-execution-status-migration','column','campaigns','updated_at'),
  ('2026-09-08-item11-campaign-execution-status-migration','function','set_campaigns_updated_at',NULL),
  ('2026-09-08-item11-campaign-execution-status-migration','trigger','trg_campaigns_set_updated_at',NULL),
  ('2026-09-08-item41-partners-pod-contacts-migration','column','partners','pod_id'),
  ('2026-09-08-item41-partners-pod-contacts-migration','column','partners','acv_target'),
  ('2026-09-08-item41-partners-pod-contacts-migration','column','partners','contact_terms'),
  ('2026-09-08-item41-partners-pod-contacts-migration','column','org_settings','partner_type_presets'),
  ('2026-09-08-item5-auto-seed-new-org-trigger','function','seed_new_organization',NULL),
  ('2026-09-08-item5-auto-seed-new-org-trigger','trigger','trg_seed_new_organization',NULL),
  ('2026-09-08-item6-multi-org-membership-and-switcher','table','profile_orgs',NULL),
  ('2026-09-08-item6-multi-org-membership-and-switcher','function','switch_active_org',NULL),
  ('2026-09-08-item6-multi-org-membership-and-switcher','function','add_profile_to_org',NULL),
  ('2026-09-08-item6-multi-org-membership-and-switcher','function','remove_profile_from_org',NULL),
  ('2026-09-09-item41-deal-partner-commission-migration','column','augur_deals','partner_id'),
  ('2026-09-09-item41-deal-partner-commission-migration','column','augur_deals','commission_pct'),
  ('2026-09-09-item45-assets-event-link-and-tag-presets-migration','column','assets','event_id'),
  ('2026-09-09-item45-assets-event-link-and-tag-presets-migration','column','org_settings','asset_tag_presets'),
  ('2026-09-09-item50-board-report-sheet-id-migration','column','org_settings','board_report_sheet_id'),
  ('2026-09-09-item56-manual-reseed-and-archive-migration','column','regions','tracking_ref'),
  ('2026-09-09-item56-manual-reseed-and-archive-migration','column','cost_buckets','tracking_ref'),
  ('2026-09-09-item56-manual-reseed-and-archive-migration','table','archived_seed_rows',NULL),
  ('2026-09-09-item56-manual-reseed-and-archive-migration','function','seed_organization_starter_kit',NULL),
  ('2026-09-09-item56-manual-reseed-and-archive-migration','function','admin_reseed_organization',NULL),
  ('2026-09-09-item56-manual-reseed-and-archive-migration','function','archive_seed_data',NULL),
  -- 2026-09-22 ---------------------------------------------------------------------------------
  ('2026-09-22-migration-ordo-gap3-region-streams','table','region_streams',NULL),
  -- 2026-09-24 ---------------------------------------------------------------------------------
  ('2026-09-24-migration-custom-widgets-table','table','custom_widgets',NULL),
  ('2026-09-24-migration-custom-widgets-add-body-column','column','custom_widgets','body'),
  ('2026-09-24-migration-custom-widgets-add-webhook-columns','column','custom_widgets','webhook_token'),
  ('2026-09-24-migration-custom-widgets-add-webhook-columns','column','custom_widgets','latest_payload'),
  -- 2026-09-28 ---------------------------------------------------------------------------------
  ('2026-09-28-migration-eventus-brief-notes-templates','column','eventus_events','brief_html'),
  ('2026-09-28-migration-eventus-brief-notes-templates','column','eventus_speakers','notes'),
  ('2026-09-28-migration-eventus-brief-notes-templates','column','eventus_checklist','notes'),
  ('2026-09-28-migration-eventus-brief-notes-templates','column','eventus_cost_lines','notes'),
  ('2026-09-28-migration-eventus-brief-notes-templates','column','eventus_event_venues','notes'),
  ('2026-09-28-migration-eventus-brief-notes-templates','table','eventus_checklist_templates',NULL),
  ('2026-09-28-migration-prospectus-references-details-and-deal-link','column','prospectus_references','details'),
  ('2026-09-28-migration-prospectus-references-details-and-deal-link','column','asset_references','deal_id'),
  -- 2026-09-29 ---------------------------------------------------------------------------------
  ('2026-09-29-migration-schema-workflows-flow-column','column','schema_workflows','flow'),
  ('2026-09-29-migration-flows-runtime','table','automation_bundles',NULL),
  ('2026-09-29-migration-flows-runtime','table','system_triggers',NULL),
  ('2026-09-29-migration-flows-runtime','table','flow_watches',NULL),
  ('2026-09-29-migration-flows-runtime','table','flow_events',NULL),
  ('2026-09-29-migration-flows-runtime','table','flow_runs',NULL),
  ('2026-09-29-migration-flows-runtime','table','flow_run_steps',NULL),
  ('2026-09-29-migration-flows-runtime','table','flow_waits',NULL),
  ('2026-09-29-migration-flows-runtime','table','flow_approvals',NULL),
  ('2026-09-29-migration-flows-runtime','function','flow_capture_change',NULL),
  ('2026-09-29-migration-ai-choice-policy','column','llm_providers','approved'),
  ('2026-09-29-migration-ai-choice-policy','column','llm_providers','web_url'),
  ('2026-09-29-migration-ai-choice-policy','table','org_ai_policy',NULL),
  ('2026-09-29-migration-ai-choice-policy','table','user_ai_prefs',NULL),
  -- 2026-10-06 / 10-07 -------------------------------------------------------------------------
  ('2026-10-06-migration-augur-deal-notes-and-reference-done','table','augur_deal_notes',NULL),
  ('2026-10-06-migration-zapier-api-keys','table','api_keys',NULL),
  ('2026-10-06-migration-augur-scoring-factors-behavior-config','column','augur_scoring_factors','behavior_config'),
  ('2026-10-07-migration-augur-deals-add-confidence-level','column','augur_deals','confidence_level'),
  ('2026-10-07-migration-budget-line-items','table','budget_line_categories',NULL),
  ('2026-10-07-migration-budget-line-items','table','budget_line_items',NULL),
  ('2026-10-07-migration-partners-build','column','partners','default_commission_pct'),
  ('2026-10-07-migration-partners-build','column','augur_deals','attribution_source'),
  ('2026-10-07-migration-partners-build','column','augur_deals','attribution_credited_to_partner_id'),
  ('2026-10-07-migration-partners-build','column','augur_deals','licensing_currency'),
  ('2026-10-07-migration-partners-build','column','augur_deals','licensing_mode'),
  ('2026-10-07-migration-partners-build','column','augur_deals','licensing_locked_rate'),
  ('2026-10-07-migration-partners-build','column','augur_deals','licensing_locked_base_aud'),
  ('2026-10-07-migration-partners-build','column','augur_deals','licensing_signed_at'),
  -- 2026-10-08 (new today) ---------------------------------------------------------------------
  ('2026-10-08-migration-voice-provider','table','voice_providers',NULL),
  ('2026-10-08-migration-voice-provider','table','voice_provider_secrets',NULL),
  -- Policy / data-only files: checked by their visible effect --------------------------------
  ('CHECK 2026-09-10-super-admin-rls-v7 + 2026-10-06-item73 (bypass policies gone)','bypass','*_super_admin_all',NULL),
  ('CHECK 2026-09-22-migration-stream-segment-dedup-cleanup (no duplicate names left)','dup','streams/segments',NULL)
),
res AS (
  SELECT file, kind, obj, col,
    CASE kind
      WHEN 'table'    THEN to_regclass('public.'||obj) IS NOT NULL
      WHEN 'column'   THEN EXISTS (SELECT 1 FROM information_schema.columns c
                                   WHERE c.table_schema='public' AND c.table_name=obj AND c.column_name=col)
      WHEN 'function' THEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                                   WHERE n.nspname='public' AND p.proname=obj)
      WHEN 'trigger'  THEN EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname=obj AND NOT t.tgisinternal)
      WHEN 'bypass'   THEN NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname LIKE '%\_super\_admin\_all')
      WHEN 'dup'      THEN NOT EXISTS (SELECT 1 FROM public.streams  GROUP BY org_id, lower(name) HAVING count(*) > 1)
                       AND NOT EXISTS (SELECT 1 FROM public.segments GROUP BY org_id, lower(name) HAVING count(*) > 1)
    END AS ok
  FROM checks
)
SELECT file AS migration_file,
       CASE WHEN bool_and(ok)    THEN 'APPLIED'
            WHEN NOT bool_or(ok) THEN 'MISSING'
            ELSE 'PARTIAL' END AS status,
       count(*) FILTER (WHERE ok) || ' / ' || count(*) AS found,
       coalesce(string_agg(
         CASE WHEN ok THEN NULL
              WHEN kind='column' THEN obj||'.'||col||' (column)'
              WHEN kind='bypass' THEN 'bypass policies still present: ' ||
                   (SELECT string_agg(tablename||'.'||policyname, ', ') FROM pg_policies
                     WHERE schemaname='public' AND policyname LIKE '%\_super\_admin\_all')
              WHEN kind='dup'    THEN 'duplicate stream/segment names still exist'
              ELSE obj||' ('||kind||')' END, ', '), '') AS missing_objects
FROM res
GROUP BY file
ORDER BY (file LIKE 'CHECK%'), file;
