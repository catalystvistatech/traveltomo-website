-- 028_nearby_challenge_notifications.sql
--
-- Adds "new challenge nearby" push notifications:
--
--   1. Track each user's last-known location on `profiles`. iOS already
--      sends lat/lng on every /v1/recommendations call so we'll persist
--      it there without any extra round-trip.
--   2. On INSERT or UPDATE of `travel_challenges` to status='live',
--      fan out a `challenge_unlocked` notification to every user
--      whose last-known location falls inside the merchant business's
--      service radius.
--
-- The iOS Notifications screen already renders the `challenge_unlocked`
-- kind with the right icon (flag.checkered) and the deeplink field
-- carries the travel_challenge id so tapping the row jumps the user
-- straight into the quest preview.

-- 1. Last-known location columns -------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_known_latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_known_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_location_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_location
  ON public.profiles (last_known_latitude, last_known_longitude)
  WHERE last_known_latitude IS NOT NULL
    AND last_known_longitude IS NOT NULL;

-- 2. RPC the website calls from /v1/recommendations to bump location.
--    Cheap UPSERT-style update so the recommendations route doesn't
--    have to do a SELECT-then-UPDATE; also avoids touching `updated_at`
--    on the rest of the profile so the row stays warm for other reads.

CREATE OR REPLACE FUNCTION public.touch_user_location(
  p_user UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET last_known_latitude  = p_lat,
         last_known_longitude = p_lng,
         last_location_at     = now()
   WHERE id = p_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_user_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_user_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- 3. Haversine distance helper for the trigger fan-out. Keeping it
--    simple (no PostGIS dependency) - good enough for ~20-30 km
--    bounding checks at the latitudes we operate in (PH).

CREATE OR REPLACE FUNCTION public.distance_meters(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  r CONSTANT DOUBLE PRECISION := 6371000;
  d_lat DOUBLE PRECISION;
  d_lng DOUBLE PRECISION;
  a DOUBLE PRECISION;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;
  d_lat := radians(lat2 - lat1);
  d_lng := radians(lng2 - lng1);
  a := sin(d_lat / 2) ^ 2
     + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ^ 2;
  RETURN 2 * r * asin(least(1, sqrt(a)));
END;
$$;

-- 4. Fan-out function. Called from the trigger below when a travel
--    challenge transitions into the `live` status.

CREATE OR REPLACE FUNCTION public.notify_nearby_travelers_of_quest(
  p_travel_challenge_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tc RECORD;
  biz_lat DOUBLE PRECISION;
  biz_lng DOUBLE PRECISION;
  radius_m INTEGER;
  inserted_count INTEGER;
BEGIN
  SELECT
    tc.id,
    tc.title,
    tc.big_reward_title,
    b.latitude,
    b.longitude,
    COALESCE(b.service_radius_meters, 2000) AS service_radius,
    b.name AS business_name
  INTO tc
  FROM public.travel_challenges tc
  LEFT JOIN public.businesses b ON b.id = tc.business_id
  WHERE tc.id = p_travel_challenge_id
    AND tc.status = 'live';

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  biz_lat := tc.latitude;
  biz_lng := tc.longitude;
  radius_m := tc.service_radius;

  IF biz_lat IS NULL OR biz_lng IS NULL THEN
    -- No business pin = no proximity check possible. Skip rather
    -- than notify the entire user base.
    RETURN 0;
  END IF;

  -- Cap the radius so a misconfigured 100 km business doesn't spam
  -- every traveler in the country.
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
$$;

REVOKE EXECUTE ON FUNCTION public.notify_nearby_travelers_of_quest(UUID) FROM PUBLIC, anon, authenticated;

-- 5. Trigger: only fire when a travel challenge transitions to `live`
--    (INSERT with status='live' OR UPDATE that flips status into
--    'live'). Same row going live multiple times via status flips
--    would re-notify, which is fine - merchants very rarely
--    pause/resume.

CREATE OR REPLACE FUNCTION public.handle_travel_challenge_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'live' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'live') THEN
    PERFORM public.notify_nearby_travelers_of_quest(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS travel_challenges_notify_live ON public.travel_challenges;
CREATE TRIGGER travel_challenges_notify_live
  AFTER INSERT OR UPDATE OF status ON public.travel_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_travel_challenge_status_change();
