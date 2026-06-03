-- Block merchants from playing their own challenges (conflict of interest)
--
-- A merchant could otherwise accept + complete their own quest stops to
-- claim their own big reward, farm XP, or inflate completion counts.
-- Per the platform rule (security lives in the DB, not the client), the
-- real boundary is an RLS check on challenge_completions INSERT: a user
-- may only create a completion for a challenge they do NOT own.
--
-- The API layer additionally hides own quests from the player surfaces
-- and returns a friendly error on accept, but THIS is the enforcement
-- that holds for every client (iOS, web, future Android).

DROP POLICY IF EXISTS "Users can insert own completions" ON public.challenge_completions;

CREATE POLICY "Users can insert own completions"
  ON public.challenge_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.challenges c
      WHERE c.id = challenge_id
        AND c.merchant_id = auth.uid()
    )
  );

-- Backs the NOT EXISTS lookup above and the API-side merchant filters.
CREATE INDEX IF NOT EXISTS idx_challenges_merchant
  ON public.challenges (merchant_id);
