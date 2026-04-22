-- ============================================================
-- TravelTomo: Superadmin + Manual Merchant Verification
-- ============================================================

-- 1) Expand role model
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'merchant', 'admin', 'superadmin'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS merchant_request_status TEXT NOT NULL DEFAULT 'none'
    CHECK (merchant_request_status IN ('none', 'pending', 'approved', 'rejected', 'suspended')),
  ADD COLUMN IF NOT EXISTS merchant_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merchant_reviewed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS merchant_review_notes TEXT;

-- 2) Ensure newly registered merchant applicants are marked pending
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_role TEXT;
  normalized_role TEXT;
  merchant_status TEXT;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'requested_role', 'user');
  normalized_role := CASE WHEN requested_role = 'merchant' THEN 'merchant' ELSE 'user' END;
  merchant_status := CASE WHEN normalized_role = 'merchant' THEN 'pending' ELSE 'none' END;

  INSERT INTO public.profiles (id, display_name, avatar_url, role, merchant_request_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    normalized_role,
    merchant_status
  );

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', normalized_role)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- 3) Sync role to app_metadata (supports superadmin)
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

-- 4) Replace policies to include superadmin and approved merchant checks
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS "Admins can view all businesses" ON public.businesses;
CREATE POLICY "Admins can view all businesses"
  ON public.businesses FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS "Merchants can manage own business" ON public.businesses;
CREATE POLICY "Merchants can manage own business"
  ON public.businesses FOR ALL
  TO authenticated
  USING (
    merchant_id = auth.uid()
    AND (auth.jwt()->'app_metadata'->>'role') IN ('merchant', 'admin', 'superadmin')
  )
  WITH CHECK (
    merchant_id = auth.uid()
    AND (auth.jwt()->'app_metadata'->>'role') IN ('merchant', 'admin', 'superadmin')
  );

DROP POLICY IF EXISTS "Admins can manage all places" ON public.places;
CREATE POLICY "Admins can manage all places"
  ON public.places FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS "Merchants can insert places" ON public.places;
CREATE POLICY "Merchants can insert places"
  ON public.places FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('merchant', 'admin', 'superadmin'));

DROP POLICY IF EXISTS "Merchants can manage own challenges" ON public.challenges;
CREATE POLICY "Merchants can manage own challenges"
  ON public.challenges FOR ALL
  TO authenticated
  USING (
    merchant_id = auth.uid()
    AND (auth.jwt()->'app_metadata'->>'role') IN ('merchant', 'admin', 'superadmin')
  )
  WITH CHECK (
    merchant_id = auth.uid()
    AND (auth.jwt()->'app_metadata'->>'role') IN ('merchant', 'admin', 'superadmin')
  );

DROP POLICY IF EXISTS "Admins can manage all challenges" ON public.challenges;
CREATE POLICY "Admins can manage all challenges"
  ON public.challenges FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS "Admins can view all rewards" ON public.rewards;
CREATE POLICY "Admins can view all rewards"
  ON public.rewards FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS "Admins can view all completions" ON public.challenge_completions;
CREATE POLICY "Admins can view all completions"
  ON public.challenge_completions FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS "Admins can view all redemptions" ON public.reward_redemptions;
CREATE POLICY "Admins can view all redemptions"
  ON public.reward_redemptions FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));
