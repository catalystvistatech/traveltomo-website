-- Library Rewards
--
-- Merchants now keep a re-usable library of rewards that can be picked
-- as the BIG REWARD of a travel challenge, instead of being forced to
-- retype the title/description/discount every time. A library reward
-- lives in the same `rewards` table but with `challenge_id IS NULL`.
--
-- Existing rewards (one-per-challenge) keep their non-null FK and are
-- untouched.

ALTER TABLE public.rewards
  ALTER COLUMN challenge_id DROP NOT NULL;

COMMENT ON COLUMN public.rewards.challenge_id IS
  'NULL means this is a library reward owned by merchant_id that can be picked as a travel challenge big reward. Non-NULL means it is tied 1:1 to a specific challenge stop.';

-- Helps the new "library rewards picker" filter quickly.
CREATE INDEX IF NOT EXISTS idx_rewards_library_per_merchant
  ON public.rewards (merchant_id, created_at DESC)
  WHERE challenge_id IS NULL;
