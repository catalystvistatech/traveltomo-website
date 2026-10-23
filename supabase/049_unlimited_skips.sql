-- 049_unlimited_skips.sql
--
-- Honor the traveler Unlimited pass ("Skip freely. Play without limits.")
-- in the skip-budget functions. Subscribers (profiles.is_unlimited, now set
-- by the StoreKit entitlement sync at /v1/me/entitlement � previously only
-- by the Stripe webhook) skip without consuming any budget:
--
--   1. consume_quest_skip: returns consumed=true / requires_ad=false without
--      incrementing the per-quest counter, so quest re-rolls are free and
--      never fall into the side-ad UX.
--   2. consume_skip_token: same for the global nearby Roll/Route pool.
--
-- Non-subscribers keep the exact existing behavior. Safe to re-run.

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
  unlimited BOOLEAN;
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

  -- Unlimited pass: free re-rolls, budget untouched, never ad-gated.
  SELECT COALESCE(is_unlimited, false) INTO unlimited
    FROM public.profiles WHERE id = p_user;
  IF unlimited THEN
    RETURN jsonb_build_object(
      'consumed',     true,
      'requires_ad',  false,
      'skips_used',   row.skips_used,
      'skips_limit',  row.skips_limit
    );
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

CREATE OR REPLACE FUNCTION public.consume_skip_token(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p public.profiles;
  max_free INTEGER := 3;
  remaining_free INTEGER;
BEGIN
  p := public.refill_free_skips_if_due(p_user);

  -- Unlimited pass: consume nothing, never ad-gated.
  IF COALESCE(p.is_unlimited, false) THEN
    RETURN jsonb_build_object(
      'consumed',          true,
      'source',            'unlimited',
      'free_remaining',    max_free - p.free_skips_used,
      'extra_remaining',   p.extra_skips,
      'refill_at',         p.last_skip_refill_at + INTERVAL '3 hours'
    );
  END IF;

  IF p.extra_skips > 0 THEN
    UPDATE public.profiles SET extra_skips = extra_skips - 1 WHERE id = p_user;
    RETURN jsonb_build_object(
      'consumed',          true,
      'source',            'extra',
      'free_remaining',    max_free - p.free_skips_used,
      'extra_remaining',   p.extra_skips - 1,
      'refill_at',         p.last_skip_refill_at + INTERVAL '3 hours'
    );
  END IF;

  remaining_free := max_free - p.free_skips_used;
  IF remaining_free > 0 THEN
    UPDATE public.profiles SET free_skips_used = free_skips_used + 1 WHERE id = p_user;
    RETURN jsonb_build_object(
      'consumed',          true,
      'source',            'free',
      'free_remaining',    remaining_free - 1,
      'extra_remaining',   p.extra_skips,
      'refill_at',         p.last_skip_refill_at + INTERVAL '3 hours'
    );
  END IF;

  RETURN jsonb_build_object(
    'consumed',          false,
    'source',            null,
    'free_remaining',    0,
    'extra_remaining',   p.extra_skips,
    'refill_at',         p.last_skip_refill_at + INTERVAL '3 hours'
  );
END;
$$;
