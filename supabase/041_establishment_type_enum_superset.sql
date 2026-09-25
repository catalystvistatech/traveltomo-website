-- 041_establishment_type_enum_superset.sql
--
-- `establishment_type` is a Postgres ENUM (restaurant, cafe, hotel, motel,
-- adventure, bar, shop, spa, other). The iOS Home/map filters use a wider
-- vocabulary (landmark, shopping, entertainment, animal_themed), and the
-- merchant form now offers Animal-Themed. /v1/recommendations filters with
-- `.in("establishment_type", types)`, which casts those values to the enum
-- and 500'd ("invalid input value for enum establishment_type: entertainment")
-- whenever a traveler selected one of the missing values.
--
-- Make the enum a superset of every value the app uses so the filter is
-- valid (and correctly returns the matching, possibly-empty set instead of
-- crashing). ADD VALUE IF NOT EXISTS is idempotent and additive. Safe to
-- re-run.

ALTER TYPE public.establishment_type ADD VALUE IF NOT EXISTS 'landmark';
ALTER TYPE public.establishment_type ADD VALUE IF NOT EXISTS 'shopping';
ALTER TYPE public.establishment_type ADD VALUE IF NOT EXISTS 'entertainment';
ALTER TYPE public.establishment_type ADD VALUE IF NOT EXISTS 'animal_themed';
