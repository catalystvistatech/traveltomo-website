-- 051_award_xp_on_verify.sql
--
-- Close the XP loop for Game Level Readiness. profiles.xp existed and the
-- clients render levels from it (Home avatar badge: 100 XP per level), but
-- NOTHING ever incremented it -- every verification path (QR scan route,
-- dashboard verify action) only flipped statuses, so every traveler was
-- stuck at Level 1 with 0 XP.
--
--   1. award_challenge_xp(): AFTER UPDATE trigger on challenge_completions
--      adds the challenge's xp_reward to the player's profile exactly once,
--      on the transition INTO verification_status='verified'. Trigger-level
--      enforcement covers both verification paths and any future one.
--   2. Backfill: recompute lifetime XP from already-verified completions.
--
-- Safe to re-run (trigger recreated; backfill recomputes from source).

CREATE OR REPLACE FUNCTION public.award_challenge_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.verification_status = 'verified'
     AND OLD.verification_status IS DISTINCT FROM 'verified' THEN
    UPDATE public.profiles p
       SET xp = COALESCE(p.xp, 0) + COALESCE(
             (SELECT c.xp_reward FROM public.challenges c WHERE c.id = NEW.challenge_id),
             0
           )
     WHERE p.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_challenge_xp ON public.challenge_completions;
CREATE TRIGGER trg_award_challenge_xp
AFTER UPDATE OF verification_status ON public.challenge_completions
FOR EACH ROW EXECUTE FUNCTION public.award_challenge_xp();

-- Backfill lifetime XP from history (nothing was ever awarded before).
UPDATE public.profiles p
   SET xp = sub.total
  FROM (
    SELECT cc.user_id, SUM(COALESCE(c.xp_reward, 0)) AS total
      FROM public.challenge_completions cc
      JOIN public.challenges c ON c.id = cc.challenge_id
     WHERE cc.verification_status = 'verified'
     GROUP BY cc.user_id
  ) sub
 WHERE p.id = sub.user_id;
