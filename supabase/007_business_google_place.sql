-- 007: Allow merchants to pin their business to a Google Place.
--
-- The app's home feed (Nearby / Trending Destinations) is backed by
-- Google Places. When a merchant links their business to a
-- `google_place_id` the `/v1/places/:id` detail view can surface that
-- merchant's challenges below the place details - which is the
-- "clicking these things would have details and below would have
-- travel challenges" flow the product requires.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

CREATE INDEX IF NOT EXISTS idx_businesses_google_place
  ON public.businesses(google_place_id);

COMMENT ON COLUMN public.businesses.google_place_id IS
  'Optional Google Places place_id the merchant has claimed for this business. Used by /v1/places/:id to list challenges tied to a specific Google Place.';
