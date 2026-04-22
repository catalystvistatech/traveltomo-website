-- ============================================================
-- TravelTomo: Full Database Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. PROFILES (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'merchant', 'admin')),
  display_name TEXT,
  avatar_url  TEXT,
  stay_start  DATE,
  stay_end    DATE,
  xp          INTEGER NOT NULL DEFAULT 0,
  free_skips_used INTEGER NOT NULL DEFAULT 0,
  extra_skips INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- 2. AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'user'
  );
  -- Set default app_metadata role
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "user"}'::jsonb
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. SYNC ROLE TO APP_METADATA (so RLS can use auth.jwt())
CREATE OR REPLACE FUNCTION public.sync_role_to_app_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_role_change ON public.profiles;
CREATE TRIGGER on_profile_role_change
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_role_to_app_metadata();

-- 4. BUSINESSES
CREATE TABLE IF NOT EXISTS public.businesses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  address       TEXT,
  city          TEXT DEFAULT 'Angeles City',
  category      TEXT,
  logo_url      TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website       TEXT,
  is_verified   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can manage own business"
  ON public.businesses FOR ALL
  TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Admins can view all businesses"
  ON public.businesses FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE INDEX idx_businesses_merchant ON public.businesses(merchant_id);

-- 5. PLACES
CREATE TABLE IF NOT EXISTS public.places (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  description         TEXT,
  latitude            DOUBLE PRECISION NOT NULL,
  longitude           DOUBLE PRECISION NOT NULL,
  category            TEXT,
  image_url           TEXT,
  city                TEXT DEFAULT 'Angeles City',
  google_place_id     TEXT UNIQUE,
  rating              NUMERIC(2,1),
  user_ratings_total  INTEGER DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active places"
  ON public.places FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage all places"
  ON public.places FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Merchants can insert places"
  ON public.places FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('merchant', 'admin'));

CREATE INDEX idx_places_city ON public.places(city);
CREATE INDEX idx_places_google ON public.places(google_place_id);

-- 6. CHALLENGES
CREATE TABLE IF NOT EXISTS public.challenges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  place_id          UUID REFERENCES public.places(id),
  title             TEXT NOT NULL,
  description       TEXT,
  instructions      TEXT,
  type              TEXT NOT NULL CHECK (type IN ('checkin', 'photo', 'qr', 'quiz')),
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'live', 'paused')),
  verification_type TEXT CHECK (verification_type IN ('gps', 'qr_scan', 'photo_upload', 'quiz_answer')),
  quiz_question     TEXT,
  quiz_choices      JSONB,
  quiz_answer       TEXT,
  qr_code_value     TEXT UNIQUE,
  xp_reward         INTEGER NOT NULL DEFAULT 50,
  radius_meters     INTEGER NOT NULL DEFAULT 50,
  admin_notes       TEXT,
  submitted_at      TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can manage own challenges"
  ON public.challenges FOR ALL
  TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Admins can manage all challenges"
  ON public.challenges FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "App users can read live challenges"
  ON public.challenges FOR SELECT
  TO authenticated
  USING (status = 'live');

CREATE INDEX idx_challenges_merchant ON public.challenges(merchant_id);
CREATE INDEX idx_challenges_status ON public.challenges(status);
CREATE INDEX idx_challenges_place ON public.challenges(place_id);

-- 7. REWARDS
CREATE TABLE IF NOT EXISTS public.rewards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id        UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  merchant_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'freebie')),
  discount_value      NUMERIC,
  qr_code_value       TEXT UNIQUE,
  max_redemptions     INTEGER,
  current_redemptions INTEGER NOT NULL DEFAULT 0,
  expires_at          TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can manage own rewards"
  ON public.rewards FOR ALL
  TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Admins can view all rewards"
  ON public.rewards FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "App users can read active rewards"
  ON public.rewards FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE INDEX idx_rewards_challenge ON public.rewards(challenge_id);
CREATE INDEX idx_rewards_merchant ON public.rewards(merchant_id);

-- 8. CHALLENGE COMPLETIONS
CREATE TABLE IF NOT EXISTS public.challenge_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id  UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  proof_type    TEXT,
  proof_url     TEXT,
  gps_latitude  DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  xp_earned     INTEGER NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own completions"
  ON public.challenge_completions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own completions"
  ON public.challenge_completions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Merchants can view completions for their challenges"
  ON public.challenge_completions FOR SELECT
  TO authenticated
  USING (
    challenge_id IN (
      SELECT id FROM public.challenges WHERE merchant_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all completions"
  ON public.challenge_completions FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE INDEX idx_completions_user ON public.challenge_completions(user_id);
CREATE INDEX idx_completions_challenge ON public.challenge_completions(challenge_id);

-- 9. REWARD REDEMPTIONS
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id   UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, reward_id)
);

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own redemptions"
  ON public.reward_redemptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own redemptions"
  ON public.reward_redemptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Merchants can view redemptions for their rewards"
  ON public.reward_redemptions FOR SELECT
  TO authenticated
  USING (
    reward_id IN (
      SELECT id FROM public.rewards WHERE merchant_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all redemptions"
  ON public.reward_redemptions FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE INDEX idx_redemptions_user ON public.reward_redemptions(user_id);
CREATE INDEX idx_redemptions_reward ON public.reward_redemptions(reward_id);

-- 10. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_challenges_updated_at
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
