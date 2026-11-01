-- 061_expire_quests_manila_time.sql
--
-- Quest dates are Philippine calendar dates, but expire_quests() compared
-- them with the UTC date, so a quest "ending Jun 30" stayed live until
-- ~08:07 PHT on Jul 1. This re-creates the function (same logic as 046)
-- with "today" computed as the Asia/Manila date. (Expired stops keep
-- completed_at NULL on purpose — claims and the traveler wallet treat
-- completed_at as "submitted" — so the complete/abandon routes instead
-- require player_status = 'ongoing'.)
-- The /v1 routes now enforce the same window on every request
-- (src/lib/quest-dates.ts); this job just tidies the rows. Safe to re-run.

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
      AND date_range_end < (now() AT TIME ZONE 'Asia/Manila')::date;

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
            AND tc.date_range_end < (now() AT TIME ZONE 'Asia/Manila')::date
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
