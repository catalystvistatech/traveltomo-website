-- 060_stamp_cards.sql
--
-- Stamp cards: the loyalty loop for restaurants and shops.
--
--   1. The shop prints ONE QR. A traveler scans it in the app on each visit;
--      that identifies the card and checks they are physically at the shop.
--   2. By default a staff member then types the card's 4-digit stamp code on
--      the traveler's phone and picks 1-3 stamps (bigger orders), so every
--      stamp is tied to a real purchase with no extra hardware. Shops can
--      instead let travelers stamp on their own (scan only).
--   3. A full card becomes a freebie with a claim code (TT-SC-XXXXXX) the shop
--      redeems; the card starts over. Freebies can expire.
--
-- Why this design (Oct 2026 research): customer self-scan of a counter QR is
-- the highest-fraud setup because the QR can be photographed and reused, so
-- loyalty platforms have staff confirm each stamp, rotate codes and enforce
-- a delay between stamps. Endowed progress (Nunes & Dreze 2006): cards that
-- start with a stamp already filled are completed far more often, especially
-- when the head start has a reason — hence the "welcome bonus" stamp.
--
-- Tables
--   stamp_cards          one per offer; QR secret, method, staff code, rules
--   stamp_card_stamps    one row per stamp (kind = visit | welcome)
--   stamp_card_rewards   one row per completed card (the freebie)
--   stamp_pin_failures   wrong staff-code attempts (brute-force lockout)
--
-- All writes go through public.collect_stamp() and the /v1 API (service
-- role). Travelers have NO direct read access to stamp_cards (it holds the
-- QR secret and the staff code); they read their own stamps/rewards only.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.stamp_cards (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id          UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title                TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  stamps_required      INTEGER NOT NULL DEFAULT 6 CHECK (stamps_required BETWEEN 2 AND 20),
  reward_title         TEXT NOT NULL CHECK (char_length(reward_title) BETWEEN 3 AND 100),
  reward_description   TEXT,
  -- Printed in the QR. Rotating it invalidates old posters.
  qr_code_value        TEXT NOT NULL UNIQUE,
  -- staff_pin: staff types the 4-digit code on the traveler's phone.
  -- self_scan: scanning the QR alone gives the stamp.
  stamp_method         TEXT NOT NULL DEFAULT 'staff_pin' CHECK (stamp_method IN ('staff_pin', 'self_scan')),
  staff_pin            TEXT CHECK (staff_pin ~ '^[0-9]{4}$'),
  -- Staff can give up to this many stamps in one visit (staff_pin only).
  max_stamps_per_visit INTEGER NOT NULL DEFAULT 3 CHECK (max_stamps_per_visit BETWEEN 1 AND 5),
  -- Extra stamps on a traveler's first visit (endowed progress).
  welcome_bonus        INTEGER NOT NULL DEFAULT 1 CHECK (welcome_bonus BETWEEN 0 AND 3),
  -- Freebies expire this many days after they're earned (NULL = never).
  reward_valid_days    INTEGER CHECK (reward_valid_days IS NULL OR reward_valid_days BETWEEN 1 AND 365),
  -- Minimum hours between visits for the same traveler (0 = no limit).
  cooldown_hours       INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_hours BETWEEN 0 AND 168),
  -- Traveler must be within this distance of the business.
  max_distance_m       INTEGER NOT NULL DEFAULT 250 CHECK (max_distance_m BETWEEN 50 AND 2000),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  starts_at            TIMESTAMPTZ,
  ends_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (stamp_method = 'self_scan' OR staff_pin IS NOT NULL)
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
  expires_at   TIMESTAMPTZ,
  redeemed_at  TIMESTAMPTZ,
  redeemed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stamp_card_rewards_user ON public.stamp_card_rewards (user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_stamp_card_rewards_card ON public.stamp_card_rewards (card_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_stamp_card_rewards_redeemed_by ON public.stamp_card_rewards (redeemed_by);

CREATE TABLE IF NOT EXISTS public.stamp_card_stamps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id    UUID NOT NULL REFERENCES public.stamp_cards(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'visit' CHECK (kind IN ('visit', 'welcome')),
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
CREATE INDEX IF NOT EXISTS idx_stamp_card_stamps_reward ON public.stamp_card_stamps (reward_id);

CREATE TABLE IF NOT EXISTS public.stamp_pin_failures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id    UUID NOT NULL REFERENCES public.stamp_cards(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stamp_pin_failures_recent
  ON public.stamp_pin_failures (card_id, user_id, created_at DESC);

-- RLS --------------------------------------------------------------------

ALTER TABLE public.stamp_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_card_stamps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_card_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_pin_failures ENABLE ROW LEVEL SECURITY; -- service role only

DROP POLICY IF EXISTS "Merchants manage own stamp cards" ON public.stamp_cards;
CREATE POLICY "Merchants manage own stamp cards"
  ON public.stamp_cards FOR ALL TO authenticated
  USING (merchant_id = (SELECT auth.uid()))
  WITH CHECK (merchant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff manage all stamp cards" ON public.stamp_cards;
CREATE POLICY "Staff manage all stamp cards"
  ON public.stamp_cards FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','superadmin'))
  WITH CHECK (public.current_user_role() IN ('admin','superadmin'));

-- Earlier drafts let any signed-in user read active cards, which exposed
-- every QR secret and staff code. The /v1 API reads cards server-side.
DROP POLICY IF EXISTS "Travelers read active stamp cards" ON public.stamp_cards;

DROP POLICY IF EXISTS "Travelers read own stamps" ON public.stamp_card_stamps;
CREATE POLICY "Travelers read own stamps"
  ON public.stamp_card_stamps FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Merchants read stamps on own cards" ON public.stamp_card_stamps;
CREATE POLICY "Merchants read stamps on own cards"
  ON public.stamp_card_stamps FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stamp_cards c
            WHERE c.id = card_id
              AND (c.merchant_id = (SELECT auth.uid())
                   OR public.current_user_role() IN ('admin','superadmin')))
  );

DROP POLICY IF EXISTS "Travelers read own stamp rewards" ON public.stamp_card_rewards;
CREATE POLICY "Travelers read own stamp rewards"
  ON public.stamp_card_rewards FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Merchants read rewards on own cards" ON public.stamp_card_rewards;
CREATE POLICY "Merchants read rewards on own cards"
  ON public.stamp_card_rewards FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stamp_cards c
            WHERE c.id = card_id
              AND (c.merchant_id = (SELECT auth.uid())
                   OR public.current_user_role() IN ('admin','superadmin')))
  );

-- collect_stamp ------------------------------------------------------------
--
-- The single place every stamping rule lives. Returns JSON:
--   { ok: true, stamps, required, added, bonus, rewards: [{id, claim_code,
--     reward_title, expires_at}] }
--   { ok: false, error: 'not_found' | 'inactive' | 'not_started' | 'ended'
--     | 'too_far' | 'location_required' | 'cooldown' | 'pin_required'
--     | 'wrong_pin' | 'pin_locked', retry_at?, distance_m?, attempts_left? }
-- A per-(card,user) advisory lock makes a double-tap award once, not twice.

DROP FUNCTION IF EXISTS public.collect_stamp(TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.collect_stamp(
  p_qr_code   TEXT,
  p_user_id   UUID,
  p_latitude  DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_pin       TEXT DEFAULT NULL,
  p_count     INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card      public.stamp_cards%ROWTYPE;
  v_biz_lat   DOUBLE PRECISION;
  v_biz_lng   DOUBLE PRECISION;
  v_dist      DOUBLE PRECISION;
  v_last      TIMESTAMPTZ;
  v_failures  INTEGER;
  v_count     INTEGER := 1;
  v_bonus     INTEGER := 0;
  v_open      INTEGER;
  v_reward    public.stamp_card_rewards%ROWTYPE;
  v_rewards   JSONB := '[]'::jsonb;
  v_code      TEXT;
  v_attempt   INTEGER;
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

  -- Staff confirmation: the 4-digit code, with a lockout after 5 wrong tries
  -- in 15 minutes so it can't be guessed (10,000 combinations).
  IF v_card.stamp_method = 'staff_pin' THEN
    IF p_pin IS NULL OR p_pin = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'pin_required',
        'max_stamps_per_visit', v_card.max_stamps_per_visit);
    END IF;
    SELECT count(*) INTO v_failures
      FROM public.stamp_pin_failures
     WHERE card_id = v_card.id AND user_id = p_user_id
       AND created_at > now() - interval '15 minutes';
    IF v_failures >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'pin_locked',
        'retry_at', (SELECT max(created_at) + interval '15 minutes' FROM public.stamp_pin_failures
                      WHERE card_id = v_card.id AND user_id = p_user_id));
    END IF;
    IF p_pin <> v_card.staff_pin THEN
      INSERT INTO public.stamp_pin_failures (card_id, user_id) VALUES (v_card.id, p_user_id);
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', 4 - v_failures);
    END IF;
    v_count := greatest(1, least(coalesce(p_count, 1), v_card.max_stamps_per_visit));
  END IF;

  SELECT max(stamped_at) INTO v_last
    FROM public.stamp_card_stamps
   WHERE card_id = v_card.id AND user_id = p_user_id AND kind = 'visit';
  IF v_last IS NOT NULL AND v_card.cooldown_hours > 0
     AND now() < v_last + make_interval(hours => v_card.cooldown_hours) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cooldown',
      'retry_at', v_last + make_interval(hours => v_card.cooldown_hours));
  END IF;

  -- First ever visit to this card: welcome bonus (endowed progress).
  IF v_last IS NULL THEN
    v_bonus := v_card.welcome_bonus;
  END IF;

  INSERT INTO public.stamp_card_stamps (card_id, user_id, kind, latitude, longitude)
  SELECT v_card.id, p_user_id, 'visit', p_latitude, p_longitude FROM generate_series(1, v_count);
  IF v_bonus > 0 THEN
    INSERT INTO public.stamp_card_stamps (card_id, user_id, kind, latitude, longitude)
    SELECT v_card.id, p_user_id, 'welcome', p_latitude, p_longitude FROM generate_series(1, v_bonus);
  END IF;

  -- Every full card becomes a freebie; extra stamps carry over.
  LOOP
    SELECT count(*) INTO v_open
      FROM public.stamp_card_stamps
     WHERE card_id = v_card.id AND user_id = p_user_id AND reward_id IS NULL;
    EXIT WHEN v_open < v_card.stamps_required;

    v_attempt := 0;
    LOOP
      v_attempt := v_attempt + 1;
      v_code := 'TT-SC-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
      BEGIN
        INSERT INTO public.stamp_card_rewards (card_id, user_id, claim_code, reward_title, expires_at)
        VALUES (v_card.id, p_user_id, v_code, v_card.reward_title,
                CASE WHEN v_card.reward_valid_days IS NULL THEN NULL
                     ELSE now() + make_interval(days => v_card.reward_valid_days) END)
        RETURNING * INTO v_reward;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt >= 5 THEN RAISE; END IF;
      END;
    END LOOP;

    UPDATE public.stamp_card_stamps
       SET reward_id = v_reward.id
     WHERE id IN (SELECT id FROM public.stamp_card_stamps
                   WHERE card_id = v_card.id AND user_id = p_user_id AND reward_id IS NULL
                   ORDER BY stamped_at, id
                   LIMIT v_card.stamps_required);

    v_rewards := v_rewards || jsonb_build_object('id', v_reward.id, 'claim_code', v_reward.claim_code,
      'reward_title', v_reward.reward_title, 'expires_at', v_reward.expires_at);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'stamps', v_open, 'required', v_card.stamps_required,
    'added', v_count, 'bonus', v_bonus, 'rewards', v_rewards);
END;
$$;

REVOKE ALL ON FUNCTION public.collect_stamp(TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_stamp(TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER) TO service_role;
