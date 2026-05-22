-- 021_quest_skips.sql
--
-- Per-quest skip counter on `travel_challenge_progress`. The product
-- spec is "3 free skips per quest; after that, small side ads appear
-- non-intrusively while the player keeps playing." We track the count
-- on the active progress row so the budget resets the next time the
-- user starts the same quest (a fresh row gets created).
--
-- The global free-skip pool in `profiles` stays for non-quest contexts
-- (nearby Roll/Route browse), so this is additive, not a replacement.

ALTER TABLE public.travel_challenge_progress
  ADD COLUMN IF NOT EXISTS skips_used INTEGER NOT NULL DEFAULT 0;

-- Per-quest free skip budget. Centralized so admin tweaks don't require
-- an app redeploy.
ALTER TABLE public.travel_challenge_progress
  ADD COLUMN IF NOT EXISTS skips_limit INTEGER NOT NULL DEFAULT 3;

-- consume_quest_skip(p_user, p_progress_id) returns whether the skip was
-- accepted plus enough state for iOS to flip into the "side ads" UX.
CREATE OR REPLACE FUNCTION public.consume_quest_skip(
  p_user UUID,
  p_progress_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.travel_challenge_progress;
BEGIN
  SELECT * INTO row
    FROM public.travel_challenge_progress
   WHERE id = p_progress_id
     AND user_id = p_user
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'progress not found';
  END IF;
  IF row.status <> 'active' THEN
    RAISE EXCEPTION 'progress not active';
  END IF;

  IF row.skips_used >= row.skips_limit THEN
    RETURN jsonb_build_object(
      'consumed',     false,
      'requires_ad',  true,
      'skips_used',   row.skips_used,
      'skips_limit',  row.skips_limit
    );
  END IF;

  UPDATE public.travel_challenge_progress
     SET skips_used = skips_used + 1,
         updated_at = now()
   WHERE id = p_progress_id
   RETURNING * INTO row;

  RETURN jsonb_build_object(
    'consumed',     true,
    'requires_ad',  (row.skips_used >= row.skips_limit),
    'skips_used',   row.skips_used,
    'skips_limit',  row.skips_limit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_quest_skip(UUID, UUID) TO authenticated;
