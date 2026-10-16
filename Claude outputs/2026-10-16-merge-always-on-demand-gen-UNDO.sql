-- 2026-10-16 UNDO for the "Always-on Demand Gen" duplicate-programme merge (Tac-Tik), done in the app by Claude at Stef's request.
-- What was changed (before values):
--   campaigns bcc1b89a-6e96-491d-af4a-84d2d155d46e (SDR Outbound Wave 3): programme_id 454a9a8f-2f90-4e36-b806-667a79e27225 -> 1cbb539e-05e1-49a7-aecb-fc210ed77973
--   programmes 454a9a8f-2f90-4e36-b806-667a79e27225: name 'Always-on Demand Gen', status 'Active', notes '' -> archived + renamed
--   relationship_views aacc5423-09b6-4e00-9ac2-c1069d849abe ("Always-on Demand Gen map"): view.focus programme:454a9a8f... -> programme:1cbb539e...
UPDATE public.campaigns SET programme_id = '454a9a8f-2f90-4e36-b806-667a79e27225' WHERE id = 'bcc1b89a-6e96-491d-af4a-84d2d155d46e';
UPDATE public.programmes SET name = 'Always-on Demand Gen', status = 'Active', notes = '' WHERE id = '454a9a8f-2f90-4e36-b806-667a79e27225';
UPDATE public.relationship_views SET view = jsonb_set(view, '{focus}', '"programme:454a9a8f-2f90-4e36-b806-667a79e27225"') WHERE id = 'aacc5423-09b6-4e00-9ac2-c1069d849abe';
