-- 2026-10-13 22:55+ -- Led by pre-fill (Tac-Tik), done in the live app at Stef's request ("Yes just prefill").
-- Before: led_by was NULL on all 12 Tac-Tik campaigns (read from the database just before the change).
-- Mapping used (from each campaign's activity / route):
--   Partner route or "Partner" activity      -> Partner-led        (Partner Co-Sell Q3, RLS TEST CAMPAIGN)
--   Outbound route or SDR/BDR activity       -> BDR-sourced        (SDR Outbound Wave 3, Japan Key Account ABM)
--   BDM Self-gen activity                    -> Sales-sourced (self-gen)  (none)
--   everything else (Inbound)                -> Marketing-sourced  (the other 8)
-- UNDO (puts all 12 back to blank -- only run if you want the pre-fill removed):
UPDATE public.campaigns SET led_by = NULL
 WHERE org_id = '6373bb04-fc25-4a72-b43b-ccd8bb110cda'
   AND id IN ('d1a94b48-e5a8-4af3-90d0-90fe144eed85','bcc1b89a-6e96-491d-af4a-84d2d155d46e','49cfea4c-340b-411e-b892-7cc6e36d2a6e','a3f56859-6e34-4cdc-aa99-008e8e743f02','eb5f5a37-34d6-48d3-9d26-3b6c46408572','f8b5a3e8-063c-4682-be12-85c3187bdd9a','6b3b9b79-9b9c-43ca-b822-9f6cbdf35a25','2dbddbf9-c77d-49f4-9d6f-ec8d3bcb7a31','ddc785b3-a317-415d-8e5d-2d28935ce7d0','16571a14-6fb7-41cb-b5b9-a757d4d5d452','8f8c9d1d-fad9-44e6-83dd-4bd66c88007c','3deb98e0-d9c8-4f3d-8fa6-7585347bfcff');
