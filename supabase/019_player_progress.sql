-- 019_player_progress.sql
--
-- Player-centric lifecycle for travel-challenge stacks:
--   - travel_challenge_progress: one active session per user per set
--   - challenge_completions.player_status: per-stop traveler state
--   - skip token refill interval 4h -> 3h (product spec)
--
-- Merchant publish statuses on travel_challenges / challenges are unchanged.

-- -----------------------------------------------------------------
-- 1. Travel-challenge player sessions
-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.travel_challenge_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  travel_challenge_id UUID NOT NULL REFERENCES public.travel_challenges(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','expired','abandoned')),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_progress_one_active
  ON public.travel_challenge_progress (user_id, travel_challenge_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_travel_progress_user
  ON public.travel_challenge_progress (user_id, status);

ALTER TABLE public.travel_challenge_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own travel progress" ON public.travel_challenge_progress;
CREATE POLICY "Users read own travel progress"
  ON public.travel_challenge_progress FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin')
  );

DROP POLICY IF EXISTS "Users manage own travel progress" ON public.travel_challenge_progress;
CREATE POLICY "Users manage own travel progress"
  ON public.travel_challenge_progress FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own travel progress" ON public.travel_challenge_progress;
CREATE POLICY "Users update own travel progress"
  ON public.travel_challenge_progress FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------
-- 2. Per-stop player status on completions
-- -----------------------------------------------------------------

ALTER TABLE public.challenge_completions
  ADD COLUMN IF NOT EXISTS player_status TEXT NOT NULL DEFAULT 'ongoing'
    CHECK (player_status IN ('ongoing','submitted','claimed','expired','skipped','forfeited')),
  ADD COLUMN IF NOT EXISTS travel_challenge_progress_id UUID
    REFERENCES public.travel_challenge_progress(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_completions_travel_progress
  ON public.challenge_completions (travel_challenge_progress_id);

CREATE INDEX IF NOT EXISTS idx_completions_player_status
  ON public.challenge_completions (user_id, challenge_id, player_status);

-- Backfill: rows with proof already submitted.
UPDATE public.challenge_completions
   SET player_status = 'submitted'
 WHERE completed_at IS NOT NULL
   AND verification_status = 'pending'
   AND player_status = 'ongoing';

UPDATE public.challenge_completions
   SET player_status = 'claimed'
 WHERE verification_status = 'verified'
   AND player_status IN ('ongoing', 'submitted');

-- -----------------------------------------------------------------
-- 3. Skip token refill: 4 hours -> 3 hours
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refill_free_skips_if_due(p_user UUID)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p public.profiles;
  refill_interval INTERVAL := INTERVAL '3 hours';
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF p.last_skip_refill_at + refill_interval <= now() THEN
    UPDATE public.profiles
       SET free_skips_used = 0,
           last_skip_refill_at = now()
     WHERE id = p_user
     RETURNING * INTO p;
  END IF;
  RETURN p;
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

CREATE OR REPLACE FUNCTION public.grant_skip_from_ad(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p public.profiles;
BEGIN
  p := public.refill_free_skips_if_due(p_user);
  UPDATE public.profiles SET extra_skips = extra_skips + 1
   WHERE id = p_user RETURNING * INTO p;
  RETURN jsonb_build_object(
    'extra_remaining', p.extra_skips,
    'free_remaining',  3 - p.free_skips_used,
    'refill_at',       p.last_skip_refill_at + INTERVAL '3 hours'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_token_status(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  p public.profiles;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('free_remaining', 0, 'extra_remaining', 0, 'refill_at', null);
  END IF;
  IF p.last_skip_refill_at + INTERVAL '3 hours' <= now() THEN
    RETURN jsonb_build_object(
      'free_remaining',  3,
      'extra_remaining', p.extra_skips,
      'refill_at',       now() + INTERVAL '3 hours'
    );
  END IF;
  RETURN jsonb_build_object(
    'free_remaining',  3 - p.free_skips_used,
    'extra_remaining', p.extra_skips,
    'refill_at',       p.last_skip_refill_at + INTERVAL '3 hours'
  );
END;
$$;
