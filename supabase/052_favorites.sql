-- 052_favorites.sql
--
-- Traveler "saved places" (the heart button in the app). A favorite points at
-- a place in the catalog, not a challenge: places are durable, so a Saved
-- list stays meaningful over time (challenges expire/complete). Rows are
-- owned by the traveler and auto-clean when either the user or the place is
-- deleted.
--
-- One row per (user, place). RLS is the security boundary: a traveler can
-- only see and mutate their own favorites. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  place_id   UUID NOT NULL REFERENCES public.places(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, place_id)
);

-- Newest-first listing per user.
CREATE INDEX IF NOT EXISTS favorites_user_created_idx
  ON public.favorites (user_id, created_at DESC);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own favorites" ON public.favorites;
CREATE POLICY "Users manage own favorites"
  ON public.favorites FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
