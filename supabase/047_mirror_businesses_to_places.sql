-- 047_mirror_businesses_to_places.sql
--
-- Approved merchant businesses never appeared on the traveler Home feed:
-- the Trending / Nearby cards come exclusively from Google Places results
-- mirrored into `places`, so a newly registered merchant was only visible
-- if Google's nearby search happened to return their venue (reported with
-- Palo Verde Resort, Angeles: approved + promoted + live challenges, but
-- absent from Home because it was never mirrored as a place).
--
-- This migration makes every APPROVED business a first-class place:
--   1. `places.business_id` provenance column (+ partial unique index) so a
--      business-mirrored row can be found and updated even when the business
--      has no google_place_id.
--   2. sync_business_place(): mirrors an approved business into `places`,
--      merging with the existing Google-mirrored row when the business is
--      pinned to a Google POI (same google_place_id) so we never create a
--      duplicate card for the same venue. Mirrored rows are `prewarmed` so
--      the 24h places-cache TTL never evicts them.
--   3. Trigger on `businesses` for INSERT and the relevant UPDATEs (fires on
--      admin approval, coordinate/name changes, Google pin changes).
--   4. Backfill for already-approved businesses.
--
-- Mirrored places surface in Nearby (distance-ranked, same as any POI) and
-- get the live-challenge red dot via the existing google_place_id +
-- proximity matching in annotateHasLiveChallenges. Promotion still gates the
-- dice-roll recommendations, not POI presence. Safe to re-run.

-- 1. Provenance column.
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_places_business_unique
  ON public.places (business_id)
  WHERE business_id IS NOT NULL;

-- 2. Mirror routine.
CREATE OR REPLACE FUNCTION public.sync_business_place()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_id UUID;
BEGIN
  -- Only approved businesses with usable coordinates become places.
  IF NEW.verification_status <> 'approved'
     OR NEW.latitude IS NULL
     OR NEW.longitude IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prefer merging with the Google-mirrored row for the same POI; fall back
  -- to a row previously mirrored from this business.
  SELECT p.id INTO existing_id
  FROM public.places p
  WHERE (NEW.google_place_id IS NOT NULL AND p.google_place_id = NEW.google_place_id)
     OR p.business_id = NEW.id
  ORDER BY (p.google_place_id = NEW.google_place_id) DESC NULLS LAST
  LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.places
      (name, description, latitude, longitude, category, image_url, city,
       google_place_id, business_id, is_active, prewarmed, refresh_source, refreshed_at)
    VALUES
      (NEW.name, NEW.description, NEW.latitude, NEW.longitude,
       NEW.establishment_type::text, NEW.logo_url, NEW.city,
       NEW.google_place_id, NEW.id, true, true, 'manual', now());
  ELSE
    -- Claim the row and keep it alive in the cache pool. Only fill blanks;
    -- richer Google metadata (rating, imagery) is never clobbered.
    UPDATE public.places p
       SET business_id  = NEW.id,
           is_active    = true,
           prewarmed    = true,
           category     = COALESCE(p.category, NEW.establishment_type::text),
           image_url    = COALESCE(p.image_url, NEW.logo_url),
           city         = COALESCE(p.city, NEW.city),
           description  = COALESCE(p.description, NEW.description),
           refreshed_at = now()
     WHERE p.id = existing_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger.
DROP TRIGGER IF EXISTS trg_sync_business_place ON public.businesses;
CREATE TRIGGER trg_sync_business_place
AFTER INSERT OR UPDATE OF verification_status, latitude, longitude, name, google_place_id
ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.sync_business_place();

-- 4. Backfill: fire the trigger for every already-approved business.
--    (UPDATE OF name fires even when the value is unchanged.)
UPDATE public.businesses SET name = name WHERE verification_status = 'approved';
