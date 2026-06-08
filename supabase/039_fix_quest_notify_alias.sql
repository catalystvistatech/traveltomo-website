-- 039_fix_quest_notify_alias.sql
--
-- Bugfix: notify_nearby_travelers_of_quest() named both its RECORD variable
-- and the travel_challenges table alias `tc`, so `SELECT tc.id ... INTO tc
-- FROM travel_challenges tc` resolved `tc.id` to the *unassigned* record
-- ("record tc is not assigned yet"). This made the status-change trigger
-- throw whenever a quest transitioned to 'live' (i.e. publishing).
--
-- Fix: alias the table as `t` so the select list reads from the table and
-- INTO writes the record. Behaviour is otherwise unchanged. Safe to re-run.

CREATE OR REPLACE FUNCTION public.notify_nearby_travelers_of_quest(p_travel_challenge_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  tc RECORD;
  biz_lat DOUBLE PRECISION;
  biz_lng DOUBLE PRECISION;
  radius_m INTEGER;
  inserted_count INTEGER;
BEGIN
  SELECT
    t.id,
    t.title,
    t.big_reward_title,
    b.latitude,
    b.longitude,
    COALESCE(b.service_radius_meters, 2000) AS service_radius,
    b.name AS business_name
  INTO tc
  FROM public.travel_challenges t
  LEFT JOIN public.businesses b ON b.id = t.business_id
  WHERE t.id = p_travel_challenge_id
    AND t.status = 'live';

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  biz_lat := tc.latitude;
  biz_lng := tc.longitude;
  radius_m := tc.service_radius;

  IF biz_lat IS NULL OR biz_lng IS NULL THEN
    RETURN 0;
  END IF;

  radius_m := LEAST(radius_m, 30000);

  WITH eligible AS (
    SELECT p.id AS user_id
      FROM public.profiles p
     WHERE p.last_known_latitude  IS NOT NULL
       AND p.last_known_longitude IS NOT NULL
       AND p.banned_at IS NULL
       AND p.last_location_at > now() - INTERVAL '7 days'
       AND public.distance_meters(
             biz_lat, biz_lng,
             p.last_known_latitude, p.last_known_longitude
           ) <= radius_m
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, kind, title, body, icon, deeplink, metadata)
    SELECT
      e.user_id,
      'challenge_unlocked',
      COALESCE('New quest: ' || tc.title, 'New quest nearby'),
      CASE
        WHEN tc.big_reward_title IS NOT NULL
          THEN 'Win ' || tc.big_reward_title || COALESCE(' at ' || tc.business_name, '') || '.'
        ELSE 'A new quest just dropped near you.'
      END,
      'flag.checkered',
      'traveltomo://quest/' || tc.id,
      jsonb_build_object(
        'travel_challenge_id', tc.id,
        'business_name', tc.business_name
      )
    FROM eligible e
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_count FROM inserted;

  RETURN inserted_count;
END;
$function$;
