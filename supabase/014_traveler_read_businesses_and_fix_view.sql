-- 014_traveler_read_businesses_and_fix_view.sql
--
-- (1) Allow any authenticated user (traveler) to read APPROVED businesses.
--     Without this, the /v1/travel-challenges endpoint's join from
--     travel_challenges -> businesses returns NULL for travelers, which
--     causes the distance filter to drop every result.
--
-- (2) Rebuild recommended_challenges view so each challenge row appears
--     exactly once. Previously the view joined on merchant_id which
--     duplicated every challenge per business once multi-business support
--     was added. The new join prefers the travel-challenge's assigned
--     business; falls back to the merchant's first approved business
--     otherwise.

-- (1) Public read on approved businesses
DROP POLICY IF EXISTS "Travelers read approved businesses" ON public.businesses;
CREATE POLICY "Travelers read approved businesses"
  ON public.businesses FOR SELECT
  TO authenticated
  USING (verification_status = 'approved');

-- (2) Rebuild view
DROP VIEW IF EXISTS public.recommended_challenges;
CREATE VIEW public.recommended_challenges
WITH (security_invoker = false) AS
SELECT
  c.id,
  c.merchant_id,
  c.travel_challenge_id,
  c.title,
  c.description,
  c.instructions,
  c.type,
  c.verification_type,
  c.xp_reward,
  c.radius_meters,
  c.latitude,
  c.longitude,
  c.establishment_type,
  c.time_of_day_start,
  c.time_of_day_end,
  c.days_of_week,
  c.max_completions,
  c.current_completions,
  c.duration_minutes,
  b.id AS business_id,
  b.name AS business_name,
  b.latitude AS business_latitude,
  b.longitude AS business_longitude,
  b.establishment_type AS business_establishment_type,
  b.service_radius_meters,
  public.merchant_is_open_now(b.id) AS is_open_now,
  public.merchant_has_active_promotion(c.merchant_id) AS is_promoted
FROM public.challenges c
LEFT JOIN public.travel_challenges tc ON tc.id = c.travel_challenge_id
LEFT JOIN LATERAL (
  SELECT bb.*
  FROM public.businesses bb
  WHERE bb.merchant_id = c.merchant_id
    AND bb.verification_status = 'approved'
    AND (tc.business_id IS NULL OR bb.id = tc.business_id)
  ORDER BY (CASE WHEN tc.business_id IS NOT NULL AND bb.id = tc.business_id THEN 0 ELSE 1 END), bb.created_at
  LIMIT 1
) b ON true
WHERE c.status = 'live'
  AND b.verification_status = 'approved'
  AND (c.max_completions IS NULL OR c.current_completions < c.max_completions);

GRANT SELECT ON public.recommended_challenges TO authenticated, anon;
