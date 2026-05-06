-- ============================================================
-- TravelTomo: Add duration_minutes to challenges
-- GPS-based challenges track how long the user must stay at the location.
-- ============================================================

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
