-- 038_quest_expiry_cron.sql
--
-- Time-boxed quests. travel_challenges already carry date_range_start /
-- date_range_end (the campaign window). This migration:
--   1. Adds an 'expired' status for quests past their end date.
--   2. expire_quests(): flips past-window live quests to 'expired' and
--      expires any active player session whose quest is no longer playable
--      (or whose own expires_at passed) so it can't be continued / re-entered.
--   3. Schedules expire_quests() hourly via pg_cron.
--
-- Lazy enforcement still lives in the API (accept route rejects out-of-window
-- quests) so there is no gap between cron runs. Safe to re-run.

-- 1. Allow the 'expired' terminal status.
ALTER TABLE public.travel_challenges DROP CONSTRAINT IF EXISTS travel_challenges_status_check;
ALTER TABLE public.travel_challenges
  ADD CONSTRAINT travel_challenges_status_check
  CHECK (status IN (
    'draft','pending_review','approved','live','paused','archived','rejected','expired'
  ));

-- 2. Expiry routine.
CREATE OR REPLACE FUNCTION public.expire_quests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Campaigns past their (inclusive) end date.
  UPDATE public.travel_challenges
    SET status = 'expired', updated_at = now()
    WHERE status IN ('live','approved')
      AND date_range_end IS NOT NULL
      AND date_range_end < (now() AT TIME ZONE 'utc')::date;

  -- Player sessions whose own deadline passed, or whose quest is no longer
  -- playable -> expire so the Home banner / accept flow won't resume them.
  UPDATE public.travel_challenge_progress p
    SET status = 'expired', updated_at = now()
    WHERE p.status = 'active'
      AND (
        (p.expires_at IS NOT NULL AND p.expires_at < now())
        OR NOT EXISTS (
          SELECT 1 FROM public.travel_challenges tc
          WHERE tc.id = p.travel_challenge_id
            AND tc.status IN ('live','approved')
        )
      );
END;
$$;

-- 3. Schedule hourly.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-quests-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL; -- no existing job
END $$;

SELECT cron.schedule('expire-quests-hourly', '7 * * * *', 'SELECT public.expire_quests();');

-- Run once now to expire anything already past.
SELECT public.expire_quests();
