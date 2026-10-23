-- Backfill preferred_establishment_types from onboarding interests
--
-- Onboarding collects interest themes ("Food Stops", "Nightlife", ...)
-- into profiles.preferred_categories, but the Home/Map feed filters on
-- profiles.preferred_establishment_types (restaurant, cafe, ...). The
-- two vocabularies were never connected, so onboarding preferences were
-- dead data and the feed was never personalized.
--
-- The iOS onboarding now derives + persists preferred_establishment_types
-- going forward. This migration backfills existing accounts that already
-- onboarded: it maps each saved interest theme to establishment types
-- using the SAME mapping the app uses (EstablishmentType.fromInterest),
-- and only fills rows whose preferred_establishment_types is still empty
-- (never overwrites a user's explicit choice).
--
-- Mapping (must stay in sync with EstablishmentType.fromInterest in iOS):
--   Food Stops        -> restaurant, cafe
--   Extreme Adventure -> adventure
--   Hot and Famous    -> landmark, entertainment
--   Instagram Worthy  -> landmark
--   Nightlife         -> entertainment
--   Cheap             -> (none; price preference, not a type)

WITH mapped AS (
  SELECT
    p.id,
    ARRAY(
      SELECT DISTINCT t
      FROM unnest(p.preferred_categories) AS cat
      CROSS JOIN LATERAL (
        SELECT unnest(
          CASE lower(cat)
            WHEN 'food stops'        THEN ARRAY['restaurant','cafe']
            WHEN 'extreme adventure' THEN ARRAY['adventure']
            WHEN 'hot and famous'    THEN ARRAY['landmark','entertainment']
            WHEN 'instagram worthy'  THEN ARRAY['landmark']
            WHEN 'nightlife'         THEN ARRAY['entertainment']
            ELSE ARRAY[]::text[]
          END
        ) AS t
      ) AS expanded
    ) AS derived_types
  FROM public.profiles p
  WHERE p.preferred_categories IS NOT NULL
    AND array_length(p.preferred_categories, 1) > 0
    AND (
      p.preferred_establishment_types IS NULL
      OR array_length(p.preferred_establishment_types, 1) IS NULL
    )
)
UPDATE public.profiles p
SET preferred_establishment_types = mapped.derived_types
FROM mapped
WHERE p.id = mapped.id
  AND array_length(mapped.derived_types, 1) > 0;
