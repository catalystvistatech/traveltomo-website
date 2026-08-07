-- 029_backfill_nearby_quest_notifications.sql
--
-- Migration 028 set up a trigger that fans out `challenge_unlocked`
-- notifications when a travel challenge transitions to `live`. That
-- handles every new quest from now on, but ALREADY-live quests never
-- generated notifications (the transition was in the past, before
-- the trigger existed).
--
-- This migration adds a per-user sweep that, on each location refresh,
-- looks for any live travel_challenge inside the user's radius that
-- the user has NEVER been notified about, and creates a notification.
-- /v1/recommendations now calls this RPC alongside `touch_user_location`
-- so the moment a user opens Home (or wanders into a new merchant's
-- service area), they pick up the existing in-range quests.

CREATE OR REPLACE FUNCTION public.notify_user_of_unseen_nearby_quests(
  p_user UUID,
  p_lat  DOUBLE PRECISION,
  p_lng  DOUBLE PRECISION
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  IF p_user IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
    RETURN 0;
  END IF;

  WITH eligible AS (
    SELECT
      tc.id                          AS travel_challenge_id,
      tc.title,
      tc.big_reward_title,
      b.name                         AS business_name,
      b.latitude                     AS biz_lat,
      b.longitude                    AS biz_lng,
      LEAST(COALESCE(b.service_radius_meters, 2000), 30000) AS radius_m
    FROM public.travel_challenges tc
    JOIN public.businesses        b ON b.id = tc.business_id
    WHERE tc.status = 'live'
      AND b.latitude  IS NOT NULL
      AND b.longitude IS NOT NULL
  ),
  in_range AS (
    SELECT *
      FROM eligible
     WHERE public.distance_meters(biz_lat, biz_lng, p_lat, p_lng) <= radius_m
  ),
  unseen AS (
    SELECT ir.*
      FROM in_range ir
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.notifications n
        WHERE n.user_id = p_user
          AND n.kind = 'challenge_unlocked'
          AND (n.metadata->>'travel_challenge_id')::uuid = ir.travel_challenge_id
     )
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, kind, title, body, icon, deeplink, metadata)
    SELECT
      p_user,
      'challenge_unlocked',
      'New quest: ' || u.title,
      CASE
        WHEN u.big_reward_title IS NOT NULL
          THEN 'Win ' || u.big_reward_title || COALESCE(' at ' || u.business_name, '') || '.'
        ELSE 'A new quest is open near you.'
      END,
      'flag.checkered',
      'traveltomo://quest/' || u.travel_challenge_id,
      jsonb_build_object(
        'travel_challenge_id', u.travel_challenge_id,
        'business_name', u.business_name
      )
    FROM unseen u
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_count FROM inserted;

  RETURN inserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user_of_unseen_nearby_quests(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_user_of_unseen_nearby_quests(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;
