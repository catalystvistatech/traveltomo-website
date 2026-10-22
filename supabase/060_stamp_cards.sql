-- 060_stamp_cards.sql
--
-- Stamp cards: the loyalty loop for restaurants.
--
--   Resto prints ONE QR (its stamp card). A traveler scans it with the app on
--   each visit and collects a stamp. When the card is full the traveler gets
--   a freebie with a claim code (TT-SC-XXXXXX), which the resto verifies the
--   same way as quest rewards. The card then starts over.
--
-- Tables
--   stamp_cards         one per business offer; holds the printed QR secret
--   stamp_card_stamps   one row per collected stamp
--   stamp_card_rewards  one row per completed card (the freebie)
--
-- Writes to stamps/rewards happen ONLY through public.collect_stamp() and the
-- /v1 API (service role). Travelers can read their own rows; merchants can
-- read rows for their own cards. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.stamp_cards (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id        UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title              TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  stamps_required    INTEGER NOT NULL DEFAULT 6 CHECK (stamps_required BETWEEN 2 AND 20),
  reward_title       TEXT NOT NULL CHECK (char_length(reward_title) BETWEEN 3 AND 100),
  reward_description TEXT,
  -- Printed in the QR. Rotating it invalidates old posters.
  qr_code_value      TEXT NOT NULL UNIQUE,
  -- One stamp per traveler per card per this many hours (≈ once per visit).
  cooldown_hours     INTEGER NOT NULL DEFAULT 12 CHECK (cooldown_hours BETWEEN 0 AND 168),
  -- Traveler must be within this distance of the business to collect.
  max_distance_m     INTEGER NOT NULL DEFAULT 250 CHECK (max_distance_m BETWEEN 50 AND 2000),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_stamp_cards_merchant ON public.stamp_cards (merchant_id);
CREATE INDEX IF NOT EXISTS idx_stamp_cards_business ON public.stamp_cards (business_id);

CREATE TABLE IF NOT EXISTS public.stamp_card_rewards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id      UUID NOT NULL REFERENCES public.stamp_cards(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claim_code   TEXT NOT NULL UNIQUE,
  reward_title TEXT NOT NULL,
  earned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at  TIMESTAMPTZ,
  redeemed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stamp_card_rewards_user ON public.stamp_card_rewards (user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_stamp_card_rewards_card ON public.stamp_card_rewards (card_id, earned_at DESC);

CREATE TABLE IF NOT EXISTS public.stamp_card_stamps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id    UUID NOT NULL REFERENCES public.stamp_cards(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stamped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude   DOUBLE PRECISION,
  longitude  DOUBLE PRECISION,
  -- Set when this stamp was spent on a completed card. NULL = still counting.
  reward_id  UUID REFERENCES public.stamp_card_rewards(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stamp_card_stamps_progress
  ON public.stamp_card_stamps (card_id, user_id, stamped_at DESC);
CREATE INDEX IF NOT EXISTS idx_stamp_card_stamps_open
  ON public.stamp_card_stamps (card_id, user_id) WHERE reward_id IS NULL;

-- RLS --------------------------------------------------------------------

ALTER TABLE public.stamp_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_card_stamps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_card_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants manage own stamp cards" ON public.stamp_cards;
CREATE POLICY "Merchants manage own stamp cards"
  ON public.stamp_cards FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Staff manage all stamp cards" ON public.stamp_cards;
CREATE POLICY "Staff manage all stamp cards"
  ON public.stamp_cards FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','superadmin'))
  WITH CHECK (public.current_user_role() IN ('admin','superadmin'));

DROP POLICY IF EXISTS "Travelers read active stamp cards" ON public.stamp_cards;
CREATE POLICY "Travelers read active stamp cards"
  ON public.stamp_cards FOR SELECT TO authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Travelers read own stamps" ON public.stamp_card_stamps;
CREATE POLICY "Travelers read own stamps"
  ON public.stamp_card_stamps FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Merchants read stamps on own cards" ON public.stamp_card_stamps;
CREATE POLICY "Merchants read stamps on own cards"
  ON public.stamp_card_stamps FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stamp_cards c
            WHERE c.id = card_id
              AND (c.merchant_id = auth.uid()
                   OR public.current_user_role() IN ('admin','superadmin')))
  );

DROP POLICY IF EXISTS "Travelers read own stamp rewards" ON public.stamp_card_rewards;
CREATE POLICY "Travelers read own stamp rewards"
  ON public.stamp_card_rewards FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Merchants read rewards on own cards" ON public.stamp_card_rewards;
CREATE POLICY "Merchants read rewards on own cards"
  ON public.stamp_card_rewards FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stamp_cards c
            WHERE c.id = card_id
              AND (c.merchant_id = auth.uid()
                   OR public.current_user_role() IN ('admin','superadmin')))
  );

-- collect_stamp ------------------------------------------------------------
--
-- The single place every stamping rule lives. Returns JSON:
--   { ok: true,  stamps, required, reward: {id, claim_code, reward_title} | null }
--   { ok: false, error: 'not_found'|'inactive'|'not_started'|'ended'
--                       |'too_far'|'location_required'|'cooldown',
--     retry_at?: timestamptz, distance_m?: int }
-- A per-(card,user) advisory lock makes a double-tap award one stamp, not two.

CREATE OR REPLACE FUNCTION public.collect_stamp(
  p_qr_code  TEXT,
  p_user_id  UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card     public.stamp_cards%ROWTYPE;
  v_biz_lat  DOUBLE PRECISION;
  v_biz_lng  DOUBLE PRECISION;
  v_dist     DOUBLE PRECISION;
  v_last     TIMESTAMPTZ;
  v_count    INTEGER;
  v_reward   public.stamp_card_rewards%ROWTYPE;
  v_code     TEXT;
  v_attempt  INTEGER := 0;
BEGIN
  SELECT * INTO v_card FROM public.stamp_cards WHERE qr_code_value = p_qr_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_card.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'inactive');
  END IF;
  IF v_card.starts_at IS NOT NULL AND now() < v_card.starts_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_started');
  END IF;
  IF v_card.ends_at IS NOT NULL AND now() >= v_card.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ended');
  END IF;

  -- Location: a printed QR can be photographed and shared, so the traveler
  -- has to actually be at the business.
  SELECT latitude, longitude INTO v_biz_lat, v_biz_lng
    FROM public.businesses WHERE id = v_card.business_id;
  IF v_biz_lat IS NOT NULL AND v_biz_lng IS NOT NULL THEN
    IF p_latitude IS NULL OR p_longitude IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'location_required');
    END IF;
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_latitude - v_biz_lat) / 2), 2) +
      cos(radians(v_biz_lat)) * cos(radians(p_latitude)) *
      power(sin(radians(p_longitude - v_biz_lng) / 2), 2)));
    IF v_dist > v_card.max_distance_m THEN
      RETURN jsonb_build_object('ok', false, 'error', 'too_far', 'distance_m', round(v_dist));
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_card.id::text || ':' || p_user_id::text, 0));

  SELECT max(stamped_at) INTO v_last
    FROM public.stamp_card_stamps
   WHERE card_id = v_card.id AND user_id = p_user_id;
  IF v_last IS NOT NULL AND v_card.cooldown_hours > 0
     AND now() < v_last + make_interval(hours => v_card.cooldown_hours) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cooldown',
      'retry_at', v_last + make_interval(hours => v_card.cooldown_hours));
  END IF;

  INSERT INTO public.stamp_card_stamps (card_id, user_id, latitude, longitude)
  VALUES (v_card.id, p_user_id, p_latitude, p_longitude);

  SELECT count(*) INTO v_count
    FROM public.stamp_card_stamps
   WHERE card_id = v_card.id AND user_id = p_user_id AND reward_id IS NULL;

  IF v_count >= v_card.stamps_required THEN
    LOOP
      v_attempt := v_attempt + 1;
      v_code := 'TT-SC-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
      BEGIN
        INSERT INTO public.stamp_card_rewards (card_id, user_id, claim_code, reward_title)
        VALUES (v_card.id, p_user_id, v_code, v_card.reward_title)
        RETURNING * INTO v_reward;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt >= 5 THEN RAISE; END IF;
      END;
    END LOOP;

    UPDATE public.stamp_card_stamps
       SET reward_id = v_reward.id
     WHERE card_id = v_card.id AND user_id = p_user_id AND reward_id IS NULL;

    RETURN jsonb_build_object(
      'ok', true, 'stamps', v_card.stamps_required, 'required', v_card.stamps_required,
      'reward', jsonb_build_object('id', v_reward.id, 'claim_code', v_reward.claim_code,
                                   'reward_title', v_reward.reward_title));
  END IF;

  RETURN jsonb_build_object('ok', true, 'stamps', v_count,
                            'required', v_card.stamps_required, 'reward', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.collect_stamp(TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collect_stamp(TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_stamp(TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;
