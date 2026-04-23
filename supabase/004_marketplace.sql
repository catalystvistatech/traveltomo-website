-- ============================================================
-- TravelTomo: Marketplace Mechanics
-- * Challenge Templates (admin) that merchants can clone
-- * Travel Challenges (parent groups) + Challenges (items)
-- * Business verification, hours, service area
-- * Merchant subscriptions (paid promotion)
-- * Merchant-verified completions
-- * Skip tokens (3 per 4h + ad-grant overflow)
-- ============================================================

-- 1. Profiles extensions -----------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_skip_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS preferred_establishment_types TEXT[] NOT NULL DEFAULT '{}';

-- 2. Establishment type + business verification enums ------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'establishment_type') THEN
    CREATE TYPE public.establishment_type AS ENUM (
      'restaurant','cafe','hotel','motel','adventure','bar','shop','spa','other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_verification_status') THEN
    CREATE TYPE public.business_verification_status AS ENUM (
      'unsubmitted','pending','approved','rejected','suspended'
    );
  END IF;
END$$;

-- 3. Businesses extensions ---------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS establishment_type public.establishment_type,
  ADD COLUMN IF NOT EXISTS verification_status public.business_verification_status NOT NULL DEFAULT 'unsubmitted',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS service_radius_meters INTEGER NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Manila';

CREATE INDEX IF NOT EXISTS idx_businesses_location ON public.businesses(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_businesses_verification ON public.businesses(verification_status);

-- 4. Merchant subscriptions (promotion) --------------------------

CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier        TEXT NOT NULL CHECK (tier IN ('basic','featured','premium')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'PHP',
  external_ref TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_subs_merchant ON public.merchant_subscriptions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_subs_active ON public.merchant_subscriptions(status, ends_at);

ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants read own subscriptions" ON public.merchant_subscriptions;
CREATE POLICY "Merchants read own subscriptions"
  ON public.merchant_subscriptions FOR SELECT
  TO authenticated
  USING (
    merchant_id = auth.uid()
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin')
  );

DROP POLICY IF EXISTS "Merchants start own subscriptions" ON public.merchant_subscriptions;
CREATE POLICY "Merchants start own subscriptions"
  ON public.merchant_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    merchant_id = auth.uid()
    AND (auth.jwt()->'app_metadata'->>'role') IN ('merchant','admin','superadmin')
  );

DROP POLICY IF EXISTS "Merchants cancel own subscriptions" ON public.merchant_subscriptions;
CREATE POLICY "Merchants cancel own subscriptions"
  ON public.merchant_subscriptions FOR UPDATE
  TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all subscriptions" ON public.merchant_subscriptions;
CREATE POLICY "Admins manage all subscriptions"
  ON public.merchant_subscriptions FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'));

-- 5. Challenge templates (admin-made) ----------------------------

CREATE TABLE IF NOT EXISTS public.challenge_templates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by               UUID NOT NULL REFERENCES public.profiles(id),
  title                    TEXT NOT NULL,
  description              TEXT NOT NULL,
  instructions             TEXT,
  establishment_type       public.establishment_type,
  suggested_xp             INTEGER NOT NULL DEFAULT 50,
  suggested_radius_meters  INTEGER NOT NULL DEFAULT 50,
  verification_type        TEXT CHECK (verification_type IN ('gps','qr_scan','photo_upload','quiz_answer')),
  quiz_question            TEXT,
  quiz_choices             JSONB,
  quiz_answer              TEXT,
  cover_url                TEXT,
  is_published             BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_type ON public.challenge_templates(establishment_type);

ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read published templates" ON public.challenge_templates;
CREATE POLICY "Authenticated read published templates"
  ON public.challenge_templates FOR SELECT
  TO authenticated
  USING (is_published = true OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'));

DROP POLICY IF EXISTS "Admins manage templates" ON public.challenge_templates;
CREATE POLICY "Admins manage templates"
  ON public.challenge_templates FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'));

-- 6. Travel Challenges (parent container) -----------------------

CREATE TABLE IF NOT EXISTS public.travel_challenges (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id               UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  description               TEXT,
  cover_url                 TEXT,
  status                    TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','approved','live','paused','archived','rejected')),
  completion_mode           TEXT NOT NULL DEFAULT 'any'
    CHECK (completion_mode IN ('any','all')),
  date_range_start          DATE,
  date_range_end            DATE,
  max_total_completions     INTEGER,
  current_total_completions INTEGER NOT NULL DEFAULT 0,
  big_reward_title          TEXT,
  big_reward_description    TEXT,
  big_reward_discount_type  TEXT CHECK (big_reward_discount_type IN ('percentage','fixed','freebie')),
  big_reward_discount_value NUMERIC,
  admin_notes               TEXT,
  submitted_at              TIMESTAMPTZ,
  approved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_challenges_merchant ON public.travel_challenges(merchant_id);
CREATE INDEX IF NOT EXISTS idx_travel_challenges_status ON public.travel_challenges(status);
CREATE INDEX IF NOT EXISTS idx_travel_challenges_business ON public.travel_challenges(business_id);

ALTER TABLE public.travel_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants manage own travel challenges" ON public.travel_challenges;
CREATE POLICY "Merchants manage own travel challenges"
  ON public.travel_challenges FOR ALL
  TO authenticated
  USING (
    merchant_id = auth.uid()
    AND (auth.jwt()->'app_metadata'->>'role') IN ('merchant','admin','superadmin')
  )
  WITH CHECK (
    merchant_id = auth.uid()
    AND (auth.jwt()->'app_metadata'->>'role') IN ('merchant','admin','superadmin')
  );

DROP POLICY IF EXISTS "Admins manage travel challenges" ON public.travel_challenges;
CREATE POLICY "Admins manage travel challenges"
  ON public.travel_challenges FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'));

DROP POLICY IF EXISTS "Authenticated read live travel challenges" ON public.travel_challenges;
CREATE POLICY "Authenticated read live travel challenges"
  ON public.travel_challenges FOR SELECT
  TO authenticated
  USING (status = 'live');

-- 7. Challenges extensions ---------------------------------------

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS travel_challenge_id UUID REFERENCES public.travel_challenges(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.challenge_templates(id),
  ADD COLUMN IF NOT EXISTS establishment_type public.establishment_type,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS time_of_day_start TIME,
  ADD COLUMN IF NOT EXISTS time_of_day_end TIME,
  ADD COLUMN IF NOT EXISTS days_of_week SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::SMALLINT[],
  ADD COLUMN IF NOT EXISTS max_completions INTEGER,
  ADD COLUMN IF NOT EXISTS current_completions INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_challenges_travel ON public.challenges(travel_challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenges_estab ON public.challenges(establishment_type);
CREATE INDEX IF NOT EXISTS idx_challenges_location ON public.challenges(latitude, longitude);

-- 8. Completions extensions + merchant verify --------------------

ALTER TABLE public.challenge_completions
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected')),
  ADD COLUMN IF NOT EXISTS verification_code TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reward_released BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_completions_code
  ON public.challenge_completions(verification_code)
  WHERE verification_code IS NOT NULL;

DROP POLICY IF EXISTS "Merchants can update completions for their challenges"
  ON public.challenge_completions;
CREATE POLICY "Merchants can update completions for their challenges"
  ON public.challenge_completions FOR UPDATE
  TO authenticated
  USING (
    challenge_id IN (SELECT id FROM public.challenges WHERE merchant_id = auth.uid())
  )
  WITH CHECK (
    challenge_id IN (SELECT id FROM public.challenges WHERE merchant_id = auth.uid())
  );

-- 9. Skip token RPCs --------------------------------------------

CREATE OR REPLACE FUNCTION public.refill_free_skips_if_due(p_user UUID)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p public.profiles;
  refill_interval INTERVAL := INTERVAL '4 hours';
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
      'refill_at',         p.last_skip_refill_at + INTERVAL '4 hours'
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
      'refill_at',         p.last_skip_refill_at + INTERVAL '4 hours'
    );
  END IF;

  RETURN jsonb_build_object(
    'consumed',          false,
    'source',            null,
    'free_remaining',    0,
    'extra_remaining',   p.extra_skips,
    'refill_at',         p.last_skip_refill_at + INTERVAL '4 hours'
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
    'refill_at',       p.last_skip_refill_at + INTERVAL '4 hours'
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
  ref_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('free_remaining', 0, 'extra_remaining', 0, 'refill_at', null);
  END IF;
  IF p.last_skip_refill_at + INTERVAL '4 hours' <= now() THEN
    -- virtually refilled
    RETURN jsonb_build_object(
      'free_remaining',  3,
      'extra_remaining', p.extra_skips,
      'refill_at',       now() + INTERVAL '4 hours'
    );
  END IF;
  RETURN jsonb_build_object(
    'free_remaining',  3 - p.free_skips_used,
    'extra_remaining', p.extra_skips,
    'refill_at',       p.last_skip_refill_at + INTERVAL '4 hours'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refill_free_skips_if_due(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_skip_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_skip_from_ad(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.skip_token_status(UUID) TO authenticated;

-- 10. Helpers: open-now + active-promotion ---------------------

CREATE OR REPLACE FUNCTION public.merchant_is_open_now(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  b RECORD;
  local_now TIMESTAMP;
  dow TEXT;
  rec JSONB;
  open_t TIME;
  close_t TIME;
  now_time TIME;
BEGIN
  SELECT hours, timezone INTO b FROM public.businesses WHERE id = p_business_id;
  IF NOT FOUND THEN RETURN false; END IF;
  local_now := (now() AT TIME ZONE COALESCE(b.timezone, 'UTC'));
  dow := LOWER(TRIM(TO_CHAR(local_now, 'FMDay')));
  rec := b.hours->dow;
  IF rec IS NULL OR COALESCE((rec->>'closed')::BOOLEAN, false) THEN
    RETURN false;
  END IF;
  open_t  := NULLIF(rec->>'open','')::TIME;
  close_t := NULLIF(rec->>'close','')::TIME;
  now_time := local_now::TIME;
  IF open_t IS NULL OR close_t IS NULL THEN RETURN false; END IF;
  IF close_t > open_t THEN
    RETURN now_time >= open_t AND now_time < close_t;
  ELSE
    RETURN now_time >= open_t OR now_time < close_t;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_is_open_now(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.merchant_has_active_promotion(p_merchant UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.merchant_subscriptions
     WHERE merchant_id = p_merchant
       AND status = 'active'
       AND starts_at <= now()
       AND ends_at   > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.merchant_has_active_promotion(UUID) TO anon, authenticated;

-- 11. Updated-at triggers ---------------------------------------

DROP TRIGGER IF EXISTS set_travel_challenges_updated_at ON public.travel_challenges;
CREATE TRIGGER set_travel_challenges_updated_at
  BEFORE UPDATE ON public.travel_challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_challenge_templates_updated_at ON public.challenge_templates;
CREATE TRIGGER set_challenge_templates_updated_at
  BEFORE UPDATE ON public.challenge_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 12. Recommendations view --------------------------------------
--
-- Public view exposing only fully-verified, live challenges from
-- currently-open merchants. Promoted merchants surface first.
--
DROP VIEW IF EXISTS public.recommended_challenges CASCADE;
CREATE VIEW public.recommended_challenges
WITH (security_invoker = on)
AS
  SELECT
    c.id,
    c.merchant_id,
    c.travel_challenge_id,
    c.title,
    c.description,
    c.instructions,
    c.type,
    c.verification_type,
    c.xp_reward,
    c.radius_meters,
    c.latitude,
    c.longitude,
    c.establishment_type,
    c.time_of_day_start,
    c.time_of_day_end,
    c.days_of_week,
    c.max_completions,
    c.current_completions,
    b.id          AS business_id,
    b.name        AS business_name,
    b.latitude    AS business_latitude,
    b.longitude   AS business_longitude,
    b.establishment_type AS business_establishment_type,
    b.service_radius_meters,
    public.merchant_is_open_now(b.id) AS is_open_now,
    public.merchant_has_active_promotion(c.merchant_id) AS is_promoted
  FROM public.challenges c
  JOIN public.businesses b ON b.merchant_id = c.merchant_id
  WHERE c.status = 'live'
    AND b.verification_status = 'approved'
    AND (c.max_completions IS NULL OR c.current_completions < c.max_completions);

GRANT SELECT ON public.recommended_challenges TO anon, authenticated;
