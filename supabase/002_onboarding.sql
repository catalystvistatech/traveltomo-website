-- ============================================================
-- TravelTomo: Onboarding columns for profiles
-- Adds fields to track onboarding completion and user preferences
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS traveler_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avatar_index INTEGER,
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS is_over_18 BOOLEAN,
  ADD COLUMN IF NOT EXISTS preferred_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stay_duration TEXT,
  ADD COLUMN IF NOT EXISTS selected_plan TEXT,
  ADD COLUMN IF NOT EXISTS permissions_location BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions_notifications BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions_camera BOOLEAN DEFAULT false;
