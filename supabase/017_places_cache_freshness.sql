-- 017_places_cache_freshness.sql
--
-- Adds the freshness columns required to use `public.places` as a
-- proper write-through cache for the Google Places API.
--
-- Before this migration `/v1/places` re-hit Google on every request
-- regardless of how recently we had mirrored the same area: there was
-- no way to tell which rows were stale vs fresh, so the route always
-- paid the Enterprise+Atmosphere SKU (~$47 per 1k calls).
--
-- After this migration the route can:
--   1. Check `places.refreshed_at` for the bounding box around the
--      caller's coordinates.
--   2. If enough rows are fresh (within `places_cache_ttl_hours`),
--      serve them straight from Postgres and skip Google entirely.
--   3. Pre-warmed rows (`prewarmed = true`) never expire so admins
--      can one-time-import known POIs for launch markets (Angeles
--      City, Boracay) and keep them permanent.
--
-- Existing rows backfill to `refreshed_at = now()` so the first request
-- after deploy doesn't immediately re-hit Google for everything.

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS prewarmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refresh_source TEXT;

COMMENT ON COLUMN public.places.refreshed_at IS
  'When this row was last refreshed from Google. Used by /v1/places to '
  'decide whether to serve from cache or re-hit the Places API.';

COMMENT ON COLUMN public.places.prewarmed IS
  'When true, the row was seeded by the prewarm-places admin script '
  'and is treated as never-stale by the cache lookup. Refresh via the '
  'same script when you want updated metadata.';

COMMENT ON COLUMN public.places.refresh_source IS
  'How this row was populated: google_nearby | google_search_text | '
  'prewarmed | manual. Useful for debugging cache behaviour.';

-- The cache lookup filters by (latitude, longitude) bounding box and
-- by `refreshed_at`. A composite index keeps that hot.
CREATE INDEX IF NOT EXISTS idx_places_lat_lng_refreshed
  ON public.places (latitude, longitude, refreshed_at DESC)
  WHERE is_active = true;

-- Separate index for the "find all stale rows" maintenance query so
-- cron jobs can clean up cleanly without scanning the location-sorted
-- index.
CREATE INDEX IF NOT EXISTS idx_places_refreshed_at
  ON public.places (refreshed_at DESC);

-- Mark all existing rows as fresh-as-of-now so we don't accidentally
-- hammer Google trying to re-hydrate everything the first time the
-- new route deploys.
UPDATE public.places SET refreshed_at = now() WHERE refreshed_at IS NULL;
