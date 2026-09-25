-- 037_clear_merchant_self_play.sql
--
-- One-off cleanup: remove progress a merchant accrued by playing their OWN
-- quest (conflict of interest). Migration 035-era RLS blocks NEW self-plays,
-- but pre-existing rows remained. A self-play is any completion / progress
-- row whose player (user_id) owns the challenge (challenges.merchant_id).
--
-- Delete completions before progress to respect the
-- challenge_completions.travel_challenge_progress_id FK. Safe to re-run.

DELETE FROM public.challenge_completions cc
USING public.challenges c
WHERE c.id = cc.challenge_id
  AND cc.user_id = c.merchant_id;

DELETE FROM public.travel_challenge_progress p
WHERE EXISTS (
  SELECT 1 FROM public.challenges c
  WHERE c.travel_challenge_id = p.travel_challenge_id
    AND c.merchant_id = p.user_id
);
