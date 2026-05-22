-- 020_big_reward_redemption.sql
--
-- Adds a redemption surface for the BIG REWARD a player wins after
-- completing every stop in a travel-challenge set. Without this the
-- merchant has no way to verify the win when the traveler walks into
-- their shop holding the celebration QR.
--
-- Columns live on `travel_challenge_progress` because that is already
-- the per-user-per-quest aggregate. One claim code per finished quest;
-- the unique index makes the QR scan a single PostgREST lookup.

ALTER TABLE public.travel_challenge_progress
  ADD COLUMN IF NOT EXISTS big_reward_claim_code TEXT,
  ADD COLUMN IF NOT EXISTS big_reward_redeemed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS big_reward_redeemed_by UUID REFERENCES public.profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_progress_big_reward_code
  ON public.travel_challenge_progress (big_reward_claim_code)
  WHERE big_reward_claim_code IS NOT NULL;

-- Merchants must be able to read a finished progress row when a
-- traveler hands them a claim code. Without this RLS would block the
-- merchant SELECT because the row is owned by the player.
DROP POLICY IF EXISTS "Merchants read big-reward progress for own travel challenges"
  ON public.travel_challenge_progress;
CREATE POLICY "Merchants read big-reward progress for own travel challenges"
  ON public.travel_challenge_progress FOR SELECT
  TO authenticated
  USING (
    travel_challenge_id IN (
      SELECT id FROM public.travel_challenges WHERE merchant_id = auth.uid()
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin')
  );

-- And update so a merchant can mark the big reward redeemed.
DROP POLICY IF EXISTS "Merchants redeem big-reward for own travel challenges"
  ON public.travel_challenge_progress;
CREATE POLICY "Merchants redeem big-reward for own travel challenges"
  ON public.travel_challenge_progress FOR UPDATE
  TO authenticated
  USING (
    travel_challenge_id IN (
      SELECT id FROM public.travel_challenges WHERE merchant_id = auth.uid()
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin')
  )
  WITH CHECK (
    travel_challenge_id IN (
      SELECT id FROM public.travel_challenges WHERE merchant_id = auth.uid()
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin')
  );
