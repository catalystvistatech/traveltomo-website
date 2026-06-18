-- 046_expire_quests_retroactive.sql
--
-- Make quest expiry fully retroactive: once a quest's campaign window has
-- ended (today > date_range_end), not only the quest but EVERY traveler who
-- joined/started it must be expired so nobody can keep playing a dead quest.
--
-- This replaces expire_quests() (originally migration 038) to also:
--   1. Expire quests in more states past their end date (live/approved/paused).
--   2. Expire active player sessions whose quest window has ended (not just
--      sessions whose quest is no longer live/approved).
--   3. Expire the in-flight per-stop completions (player_status='ongoing')
--      tied to those now-expired sessions, so a traveler caught mid-stop is
--      fully stopped rather than able to keep verifying. Submitted/claimed
--      stops are left untouched (those are legitimate, already-earned state).
--
-- Read paths already respect this: loadActiveTravelProgress() only returns
-- status='active' sessions and derivePlayerStopStatus() maps an 'expired'
-- completion to "expired", so Home "Continue" and the accept flow drop the
-- quest the moment these rows flip. Hourly cron + lazy API checks remain.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.expire_quests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 1. Campaigns past their (inclusive) end date -> expired.
  UPDATE public.travel_challenges
    SET status = 'expired', updated_at = now()
    WHERE status IN ('live','approved','paused')
      AND date_range_end IS NOT NULL
      AND date_range_end < (now() AT TIME ZONE 'utc')::date;

  -- 2. Expire active player sessions when their own deadline passed, the
  --    quest is no longer playable, or the quest's window has ended.
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
        OR EXISTS (
          SELECT 1 FROM public.travel_challenges tc
          WHERE tc.id = p.travel_challenge_id
            AND tc.date_range_end IS NOT NULL
            AND tc.date_range_end < (now() AT TIME ZONE 'utc')::date
        )
      );

  -- 3. Expire in-flight per-stop completions for sessions that just expired
  --    so a mid-stop traveler can't keep verifying after the quest ended.
  UPDATE public.challenge_completions c
    SET player_status = 'expired'
    WHERE c.player_status = 'ongoing'
      AND c.travel_challenge_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.travel_challenge_progress p
        WHERE p.id = c.travel_challenge_progress_id
          AND p.status = 'expired'
      );
END;
$$;

-- Run once now to expire anything already past its window retroactively.
SELECT public.expire_quests();
