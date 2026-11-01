-- 064_quest_must_end.sql
--
-- Every live quest must be able to end: a last day (date_range_end), a
-- winner cap (max_total_completions), or both — so a business is never
-- stuck honoring a promo forever. The dashboard and server actions enforce
-- the same rule (questHasEnd in src/lib/quest-window.ts).
--
-- The winner cap existed but nothing counted toward it:
-- current_total_completions was never incremented, so a capped quest never
-- filled. A trigger now counts each traveler who finishes every stop and
-- ends the quest (status 'expired') when the last winner spot is taken.
-- The quest row is locked while counting, so two travelers finishing at
-- once can't both take the last spot; whoever is late gets an expired
-- session instead of a big reward. A winner can still claim their big
-- reward after the quest ends (the claim checks only their own progress).
--
-- The constraint is NOT VALID: quests already live without an end are left
-- alone until they are next edited, which must then add an end date or cap.
-- Paused/expired/draft/deleted quests are exempt (drafts get the rule when
-- they're published). Safe to re-run.

-- 1. Count finishers and fill the winner cap ----------------------------------

CREATE OR REPLACE FUNCTION public.count_quest_winner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cap integer;
  winners integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT max_total_completions, current_total_completions
    INTO cap, winners
    FROM public.travel_challenges
    WHERE id = NEW.travel_challenge_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF cap IS NOT NULL AND winners >= cap THEN
    -- Every winner spot is already taken.
    NEW.status := 'expired';
    NEW.completed_at := NULL;
    RETURN NEW;
  END IF;

  UPDATE public.travel_challenges
    SET current_total_completions = winners + 1,
        status = CASE WHEN cap IS NOT NULL AND winners + 1 >= cap
                      THEN 'expired' ELSE status END,
        updated_at = now()
    WHERE id = NEW.travel_challenge_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.count_quest_winner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS travel_challenge_progress_count_winner ON public.travel_challenge_progress;
CREATE TRIGGER travel_challenge_progress_count_winner
  BEFORE INSERT OR UPDATE OF status ON public.travel_challenge_progress
  FOR EACH ROW EXECUTE FUNCTION public.count_quest_winner();

-- Backfill from finishers recorded before the trigger existed.
UPDATE public.travel_challenges tc
  SET current_total_completions = sub.n
  FROM (
    SELECT travel_challenge_id, count(*)::int AS n
    FROM public.travel_challenge_progress
    WHERE status = 'completed'
    GROUP BY travel_challenge_id
  ) sub
  WHERE sub.travel_challenge_id = tc.id
    AND tc.current_total_completions IS DISTINCT FROM sub.n;

-- 2. A live quest must have an end --------------------------------------------

ALTER TABLE public.travel_challenges
  DROP CONSTRAINT IF EXISTS travel_challenges_must_end;
ALTER TABLE public.travel_challenges
  ADD CONSTRAINT travel_challenges_must_end CHECK (
    status <> 'live'
    OR deleted_at IS NOT NULL
    OR date_range_end IS NOT NULL
    OR coalesce(max_total_completions, 0) > 0
  ) NOT VALID;
