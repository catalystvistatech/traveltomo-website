-- 065_quest_progress_server_writes.sql
--
-- Travelers could finish a quest without visiting it. The app's anon key is
-- public, and RLS let a signed-in traveler write their own rows directly
-- through /rest/v1:
--   * travel_challenge_progress: "Users update own travel progress" only
--     checked user_id, so a PATCH of status='completed' unlocked the big
--     reward (and, with 064, took a winner spot).
--   * challenge_completions: "Users can update own active completions" and
--     "Users can insert own completions" only checked user_id, so a traveler
--     could mark a stop verified/claimed without the merchant.
--
-- Every traveler write now goes through the /v1 routes, which authenticate
-- the user and then write with the service role (accept, start, complete,
-- abandon, quit, big-reward). So travelers keep READ access only.
--
-- Merchants keep "Merchants can update completions for their challenges":
-- the Approve Visits page verifies/rejects with the merchant's session.
-- "Merchants redeem big-reward for own travel challenges" is dropped: every
-- big-reward redemption already writes with the service role, and the policy
-- let a merchant mark any traveler's quest finished.
--
-- Merchant self-play was blocked by the completions INSERT policy; the
-- accept route now enforces that itself.

DROP POLICY IF EXISTS "Users manage own travel progress" ON public.travel_challenge_progress;
DROP POLICY IF EXISTS "Users update own travel progress" ON public.travel_challenge_progress;
DROP POLICY IF EXISTS "Merchants redeem big-reward for own travel challenges" ON public.travel_challenge_progress;

DROP POLICY IF EXISTS "Users can insert own completions" ON public.challenge_completions;
DROP POLICY IF EXISTS "Users can update own active completions" ON public.challenge_completions;
