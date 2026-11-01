-- 054_sync_business_place_location.sql
--
-- BUG: a merchant's mirrored `places` row keeps its ORIGINAL coordinates
-- forever. `sync_business_place()` copies latitude/longitude/google_place_id
-- on INSERT, but its UPDATE branch only touches business_id, is_active,
-- prewarmed, category, image_url, city, description and refreshed_at. So when
-- a merchant fixes their pin (or adds a Google listing) after the place row
-- already exists, the mirror silently keeps the stale location.
--
-- Observed in production: "Central Town Badminton Court" sat 1.9 km from its
-- real location, and its place row had google_place_id NULL even though the
-- business had one — which also blocked photo hydration
-- (`hydrateMissingPlacePhotos` requires google_place_id IS NOT NULL), leaving
-- the venue with no image anywhere in the app.
--
-- FIX: sync location + google_place_id on UPDATE too, but ONLY when the place
-- row is unambiguously this business's mirror:
--
--     p.google_place_id IS NULL  OR  p.google_place_id = NEW.google_place_id
--
-- That guard matters. `places.business_id` is not guaranteed to point at a
-- row describing the same venue (production currently has a business whose
-- business_id points at a place for an entirely different Google listing in
-- another city). Without the guard, syncing coordinates would teleport that
-- unrelated place onto the business's pin. Rows carrying a DIFFERENT
-- google_place_id are therefore left untouched.
--
-- google_place_id is only ever filled in, never cleared, so a merchant
-- blanking their field can't wipe a good id off the place.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.sync_business_place()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  existing_id UUID;
BEGIN
  IF NEW.verification_status <> 'approved'
     OR NEW.latitude IS NULL
     OR NEW.longitude IS NULL THEN
    RETURN NEW;
  END IF;

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
    UPDATE public.places p
       SET business_id  = NEW.id,
           is_active    = true,
           prewarmed    = true,
           category     = COALESCE(p.category, NEW.establishment_type::text),
           image_url    = COALESCE(p.image_url, NEW.logo_url),
           city         = COALESCE(p.city, NEW.city),
           description  = COALESCE(p.description, NEW.description),
           -- Keep the mirror on the merchant's current pin. Guarded so a
           -- place describing a different Google venue is never moved.
           latitude     = CASE
                            WHEN p.google_place_id IS NULL
                              OR p.google_place_id = NEW.google_place_id
                            THEN NEW.latitude ELSE p.latitude END,
           longitude    = CASE
                            WHEN p.google_place_id IS NULL
                              OR p.google_place_id = NEW.google_place_id
                            THEN NEW.longitude ELSE p.longitude END,
           -- Fill in, never clear: unblocks photo hydration for merchants who
           -- add their Google listing after the place row already existed.
           google_place_id = COALESCE(p.google_place_id, NEW.google_place_id),
           refreshed_at = now()
     WHERE p.id = existing_id;
  END IF;

  RETURN NEW;
END;
$function$;
