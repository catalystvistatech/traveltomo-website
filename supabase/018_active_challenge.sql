-- 018_active_challenge.sql
--
-- Lets `challenge_completions` represent the full accepted -> verified
-- lifecycle. Prior to this migration `completed_at` was NOT NULL with
-- a default of `now()`, which meant the `/v1/challenges/:id/accept`
-- endpoint (which inserts with `completed_at: null`) silently failed
-- under RLS — accepting a challenge never actually wrote a row.
--
-- After this migration:
--   - `accepted_at` records when the user accepted the challenge.
--   - `completed_at` is nullable; it stays NULL while the challenge is
--     in progress and is set when the user submits proof at the stop.
--
-- An index supports the new `/v1/me/active-challenge` lookup
-- (one in-progress row per user). All clients (iOS / web admin /
-- future Android) read the same shape via Supabase.

ALTER TABLE public.challenge_completions
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Drop the legacy NOT NULL on completed_at so pending acceptances can
-- live without a completion timestamp.
ALTER TABLE public.challenge_completions
  ALTER COLUMN completed_at DROP NOT NULL,
  ALTER COLUMN completed_at DROP DEFAULT;

-- Backfill `accepted_at` for any historical rows that already had a
-- completion timestamp (acceptance and completion happened together
-- under the old single-shot flow).
UPDATE public.challenge_completions
   SET accepted_at = completed_at
 WHERE accepted_at IS NULL
   AND completed_at IS NOT NULL;

-- Active-challenge fast path: most users will have zero or one row
-- with `completed_at IS NULL`, so a partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS idx_completions_active
  ON public.challenge_completions (user_id, accepted_at DESC)
  WHERE completed_at IS NULL;
