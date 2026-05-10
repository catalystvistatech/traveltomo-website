-- 013_travel_challenge_business_id.sql
-- Allow merchants to associate a travel challenge with a specific business.
-- Nullable so existing rows are unaffected.

ALTER TABLE public.travel_challenges
  ADD COLUMN IF NOT EXISTS business_id UUID
    REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_travel_challenges_business_id
  ON public.travel_challenges (business_id);
